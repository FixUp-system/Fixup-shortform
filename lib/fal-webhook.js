// fal 웹훅이 **진짜 fal 이 보낸 것인가**를 가린다.
//
// ★★★ 이 문은 로그인 벽 **밖**에 있어야 한다. fal 문서가 못 박기 때문이다:
//   *"Redirects are not followed. If your endpoint responds with a 3xx status code,
//    the delivery is treated as a permanent failure and is not retried."*
//   우리 middleware 는 미인증 요청을 307 로 /login 에 튕긴다 — 그러니 `PUBLIC_PATHS` 에
//   넣지 않으면 **한 번 튕기고 영영 재시도가 없다**(09-10 에 표지 정적 파일이 같은 자리에서
//   307 을 맞았다). 그래서 자물쇠가 로그인이 아니라 **서명**이다.
//
// ★★ 그리고 이 검증만으로 문을 지키지 않는다 — 라우트가 **페이로드를 안 믿는다**.
//   여기서 하는 일은 "fal 이 보냈나"까지이고, 무엇이 끝났는지는 우리가 fal 에 다시 묻는다
//   (app/api/fal/webhook/route.js 머리말). 그래서 이 검증이 뚫려도 할 수 있는 일이
//   "이미 우리 것인 편을 한 번 더 걷게 하는 것"뿐이다.
//
// 검증할 메시지는 **줄바꿈으로 이어 붙인 넷**이다(fal 문서 그대로):
//   request-id · user-id · timestamp · **본문의 SHA-256 을 16진수로**
import { createHash, createPublicKey, verify as edVerify } from "node:crypto";

const JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
// 문서 권고 그대로 — 시계 차이와 회선 지연을 흡수하되 그 이상은 재생 공격으로 본다.
const LEEWAY_SECONDS = 300;
// 문서 권고: "cache JWKS for up to 24 hours". 웹훅마다 받아 오면 그것이 곧 지연이다.
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;

// 모듈 기본 캐시. 부르는 쪽이 자기 것을 줄 수 있다(판이 그렇게 쓴다) — 테스트 전용 코드를
// 이 파일에 두지 않으려는 것이다.
const defaultCache = {};

async function publicKeys({ fetchImpl, cache, now, jwksUrl }) {
  if (cache.keys?.length && now() - (cache.at || 0) < JWKS_TTL_MS) return cache.keys;
  const res = await fetchImpl(jwksUrl).catch(() => null);
  if (!res?.ok) return null;                    // ★ 모르면 **닫는다** — 열리는 쪽이면 안 된다
  const body = await res.json().catch(() => null);
  const keys = (body?.keys || [])
    .map((k) => { try { return createPublicKey({ key: k, format: "jwk" }); } catch { return null; } })
    .filter(Boolean);
  if (!keys.length) return null;
  cache.keys = keys;
  cache.at = now();
  return keys;
}

export async function verifyFalWebhook({
  headers,
  body,
  now = Date.now,
  fetchImpl = fetch,
  cache = defaultCache,
  jwksUrl = JWKS_URL,
} = {}) {
  const get = (n) => (typeof headers?.get === "function" ? headers.get(n) : headers?.[n]) || "";
  const id = get("x-fal-webhook-request-id");
  const user = get("x-fal-webhook-user-id");
  const ts = get("x-fal-webhook-timestamp");
  const sig = get("x-fal-webhook-signature");
  // ★ 하나라도 없으면 닫는다. 넷이 다 있어야 서명이 무엇을 덮는지가 정해진다.
  if (!id || !user || !ts || !sig) return false;

  const skew = Math.abs(now() / 1000 - Number(ts));
  if (!Number.isFinite(skew) || skew > LEEWAY_SECONDS) return false;

  const keys = await publicKeys({ fetchImpl, cache, now, jwksUrl });
  if (!keys) return false;

  // ★ 본문은 **받은 그대로** 해싱해야 한다. 파싱했다 다시 문자열로 만들면 공백 하나에
  //   해시가 달라져 전부 거부된다(라우트가 req.text() 를 그대로 넘긴다).
  const message = Buffer.from(
    [id, user, String(ts), createHash("sha256").update(body ?? "").digest("hex")].join("\n"),
    "utf8",
  );

  let signature;
  try { signature = Buffer.from(sig, "hex"); } catch { return false; }
  if (!signature.length) return false;

  // ★ 키를 여러 개 준다 — fal 이 키를 돌릴 때 옛 키와 새 키가 함께 있는 구간이 있다.
  return keys.some((k) => { try { return edVerify(null, message, k, signature); } catch { return false; } });
}

// 접수할 때 큐 주소에 실어 보낼 **우리 웹훅 주소**.
//
// ★★★ 프로덕션 주소를 모르면 **null 을 준다 — 안 붙인다.** 로컬 주소를 실어 보내면 fal 이
//   닿지 못한 채 **최대 31번** 재시도하고, 그 회차가 전부 헛걸음이 된다. 개발에서는
//   웹훅 없이 돌고(화면 폴링이 걷는다), 프로덕션에서만 걸린다.
// ★ `p`(어느 편인가)가 이 주소의 핵심이다 — 접수증이 문서에 적히기 전에 함수가 죽어도
//   fal 이 이 값을 들고 우리를 부른다. 크론은 그 경우를 못 찾는다(찾을 접수증이 없다).
export function falWebhookUrl(projectId, { base = publicBase() } = {}) {
  if (!base || !projectId) return null;
  return `${String(base).replace(/\/+$/, "")}/api/fal/webhook?p=${encodeURIComponent(projectId)}`;
}

function publicBase() {
  if (process.env.SHOTFORM_PUBLIC_URL) return process.env.SHOTFORM_PUBLIC_URL;
  // Vercel 이 프로덕션 배포에 넣어 주는 값 — 별칭 도메인이다.
  const v = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return v ? `https://${v}` : "";
}
