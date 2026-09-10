import { verifyFalWebhook } from "../../../../lib/fal-webhook.js";
import { sweepOneProject } from "../../../../lib/collect-sweep.js";

// ★★★ fal 이 **끝났다고 우리를 부르는 문** (2026-09-10 사장님: "크론 요청을 동적으로
//   사용은 불가능한거야?").
//
// 왜 크론이 아니라 이것인가:
//   · 이 계정은 Hobby 라 1분 크론이 **배포 자체를 거부한다**(09-10 실측). 웹훅은 플랜과 무관하다.
//   · 크론은 "혹시 끝났나"를 1분마다 묻는다(대부분 헛걸음). 웹훅은 **정확히 끝난 그때** 온다.
//   · ★ 그리고 크론이 **못 고치는 구멍**을 막는다 — 접수는 됐는데 문서에 접수증을 적기 전에
//     함수가 죽으면 크론은 찾을 접수증이 없어 영영 못 찾는다(fal 에 요청 목록 API 가 없다).
//     이 주소에 projectId 를 실어 두면 fal 이 그것을 들고 우리를 부른다.
//
// ★★ **페이로드를 믿지 않는다.** 이 문이 하는 일은 "그 편을 지금 걷어라"는 방아쇠뿐이고,
//   무엇이 끝났는지는 이미 있는 수거가 fal 에 **다시 물어** 확인한다(lib/collect-sweep.js).
//   그래서 서명이 뚫려도 할 수 있는 일이 "이미 우리 것인 편을 한 번 더 걷게 하는 것"뿐이고,
//   굽는 것이 아니라 걷는 것이라 **돈이 안 나간다**.
//
// ★★ 로그인 벽 **밖**에 있다(lib/auth/paths.js 의 PUBLIC_PATHS). fal 문서가 못 박기
//   때문이다: *"Redirects are not followed … a 3xx status code … is treated as a permanent
//   failure and is not retried."* 벽 안에 두면 307 로 튕기고 **영영 재시도가 없다**.
//   자물쇠는 로그인이 아니라 **ED25519 서명**이다(lib/fal-webhook.js).
//
// ★ 상한 300초 — 광고는 수거(가볍다) 뒤에 마무리(내려받기·자막·저장)가 붙을 수 있다.
//   ⚠️ fal 은 **첫 응답을 15초** 안에 기다린다(재시도는 120초). 그보다 오래 걸리면 fal 은
//     타임아웃으로 보고 다시 보낸다 — 우리 수거는 멱등이라 그래도 안전하지만, 무거운 일이
//     겹칠 수 있다. 마무리 겹침은 finishAdRender 자신의 임대 잠금이 막는다.
export const maxDuration = 300;

export async function POST(req) {
  // ★ 본문은 **받은 그대로** 검증에 넘긴다. 파싱했다 다시 문자열로 만들면 공백 하나에
  //   SHA-256 이 달라져 전부 거부된다.
  const body = await req.text();

  if (!(await verifyFalWebhook({ headers: req.headers, body }))) {
    return Response.json({ error: "서명이 확인되지 않았어요" }, { status: 401 });
  }

  // 어느 편인가 — 접수할 때 우리가 주소에 실어 보낸 값이다.
  const projectId = new URL(req.url).searchParams.get("p");
  // ★ 할 일이 없어도 **2xx** 다. fal 은 2xx 가 아니면 최대 31번 다시 보낸다 —
  //   우리가 할 일이 없는 요청에 4xx/5xx 를 주면 그 재시도가 전부 헛걸음이 된다.
  if (!projectId) return Response.json({ ok: true, skipped: "가리키는 편이 없어요" });

  // ★ 던지지 않는다 — 여기서 새면 fal 이 31번 다시 보낸다. 수거는 일시 오류면 접수증을
  //   지키므로(09-10 고침), 놓친 것은 다음 방문이나 크론이 이어받는다.
  const out = await sweepOneProject(projectId).catch((e) => ({ error: e?.message }));
  console.log("[fal 웹훅]", projectId, JSON.stringify(out));
  return Response.json({ ok: true, ...out });
}
