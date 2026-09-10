// 서명 URL 재사용 — **전송(egress)을 아끼는 한 자리** (2026-09-07).
//
// ★ 왜 생겼나. Supabase 가 `exceed_egress_quota` 로 프로젝트를 통째로 막았다(402).
//   그날 라이브에서 로그인도 보관함도 죽었다. 원인을 되짚으니 절감 장치가 **하나도 돌고
//   있지 않았다**:
//     · 완성본은 302 로 넘기는데 그 응답에는 ETag 가 없고 `no-store` 다 → 브라우저에게
//       되돌려 보낼 ETag 가 없으니 라우트의 304 갈래는 **프로덕션에서 영원히 안 탄다.**
//     · 게다가 서명을 요청마다 새로 만들어 **주소가 매번 달라졌다** → 브라우저 캐시도,
//       Storage 앞단 CDN 도 전부 빗나간다.
//   그래서 같은 영상을 열 번 보면 8~13MB 가 열 번 나갔다.
//
// ★ 고치는 자리는 주소다. **같은 내용이면 같은 주소**를 준다. 그러면 브라우저가 이미 받아
//   둔 것을 그대로 쓰고(Storage 객체는 max-age 를 달고 나온다), CDN 도 사람 사이에서 먹는다.
//
// ★ 무효화는 **내용 버전(ts)** 이 한다 — 키에 ts 를 넣는다. 다시 구우면 pipeline 이 ts 를
//   갱신하므로 키가 달라지고, 새 주소가 나가 옛 영상이 안 붙잡힌다. 파일 이름(`<id>.mp4`)은
//   덮어쓰기라 이름만으로는 갱신을 알릴 수 없다 — 라우트의 ETag 가 ts 를 쓰는 것과 같은 이유다.
//
// ★ **버전을 모르면 캐시하지 않는다.** ts 없는 옛 문서는 무효화할 방법이 없으니, 전송을 더
//   쓰더라도 옛 영상을 보여주지 않는 쪽으로 떨어진다(이 저장소의 기본 방향).
//
// ★ 서버리스라 이 표는 **함수 인스턴스마다** 산다. 그래서 절감이 0 이 되는 경우는 없고
//   (따뜻한 인스턴스가 재사용된다) 틀리는 경우도 없다 — 키가 내용을 담고 있어서다.

// ★ 2026-09-10 — **문 앞이 그대로였다.** 위 재사용을 넣고도 라우트의 302 가
//   `private, no-store` 라, 브라우저는 같은 영상을 볼 때마다(그리고 `<video>` 가 되감기·
//   이어보기로 다시 물을 때마다) **이 문을 다시 두드렸다.** 두드리는 순간 찬 인스턴스에
//   닿으면 주소가 갈리고, 그러면 이미 받아 둔 3~13MB 가 통째로 헛것이 된다.
//   그래서 이 표가 주소만 주지 않고 **브라우저에게 허락할 초(maxAge)** 까지 함께 준다 —
//   라우트가 그 값을 302 의 max-age 로 싣는다.
//
// ★ 값을 여기서 내는 이유: 남은 수명을 아는 곳이 여기뿐이다. 라우트가 상수로 적으면
//   "표가 29분째 물고 있던 주소"에 30분짜리 캐시를 얹어 **만료된 주소를 물고 있는**
//   상태가 만들어진다(영상이 안 열린다 — 이 장치의 유일한 위험이 그것이다).
//
// ★ **만료를 경계로 반올림해 인스턴스끼리 같은 주소를 내는 길은 막혀 있다**(2026-09-10 확인).
//   Supabase 에 넘길 수 있는 것은 `expiresIn`(상대 초) 하나이고, 토큰의 exp 도 iat 도
//   **서버가 자기 시계로 찍는다**(node_modules/@supabase/storage-js 의 createSignedUrl 이
//   `{ expiresIn }` 만 POST 한다 — 확인함). 같은 초에 두 인스턴스가 불러도 토큰이 같다는
//   보장이 없으니, 주소를 맞추는 것이 아니라 **다시 안 묻게 하는 것**(위 max-age)이 이
//   자리에서 할 수 있는 전부다. 뒤집으려면 발급한 주소를 공유 저장소(문서·DB)에 적어야 하고,
//   그건 lib/store 쪽 일이다.

// 만료 직전의 주소를 물려주면 재생 중에 끊긴다. 그 앞에서 새로 발급한다.
const MARGIN_MS = 60_000;
// 브라우저가 302 를 물고 있어도 되는 시간. **남은 서명 수명에서 한 겹 더 뺀다** —
// 표가 이미 MARGIN_MS 를 뺀 값을 들고 있으므로, 브라우저가 마지막 순간에 써도 서명까지
// 최소 2분이 남는다.
const BROWSER_MARGIN_MS = 60_000;
// 그리고 상한을 따로 둔다. 브라우저가 오래 물고 있을수록 전송은 아끼지만, 다시 구운
// 영상이 그만큼 늦게 보인다 — 완성 화면 둘은 주소에 각인(`?v=`)을 달아 그 자리를 피하는데
// **보관함 상세는 안 단다**(app/archive/[id]/page.js). 그래서 "자막이 안 바뀐다"가 다시
// 나지 않을 만큼 짧게, 재생 한 번(되감기·이어보기)을 덮을 만큼은 길게 잡는다.
// 이 상한을 넘겨도 절감은 이어진다 — 따뜻한 인스턴스가 같은 주소를 돌려주면 브라우저가
// 받아 둔 바이트를 그대로 쓴다(Storage 객체는 max-age=3600 을 달고 나온다: putObject 가
// cacheControl 을 안 넘겨 storage-js 기본값 "3600" 으로 올라간다 — 라이브러리에서 확인함).
const MAX_BROWSER_SECONDS = 300;
// 표가 무한정 자라지 않게 막는다. 넘치면 **가장 오래 전에 넣은 것**부터 버린다
// (Map 이 넣은 순서를 지킨다). 캐시가 비면 다시 서명할 뿐이라 틀리지 않는다.
const MAX = 500;

const cache = new Map();

// 테스트가 인스턴스 사이를 흉내 낼 때 쓴다.
export function resetSignedUrlCache() {
  cache.clear();
}

// 남은 수명에서 브라우저 몫을 낸다. 남은 것이 여유보다 적으면 0 = "물고 있지 마라".
function browserMaxAge(expiresAt, t) {
  const left = expiresAt - t - BROWSER_MARGIN_MS;
  if (left <= 0) return 0;
  return Math.min(MAX_BROWSER_SECONDS, Math.floor(left / 1000));
}

// { url, maxAge } 를 준다 — maxAge 는 **브라우저에게 허락할 초**다(0 이면 캐시 금지).
// key 가 없으면(= 무효화할 버전을 모르면) 그냥 새로 서명하고, 캐시도 허락하지 않는다:
// 다시 구웠을 때 옛 영상을 밀어낼 방법이 없기 때문이다(위 "버전을 모르면" 절과 같은 규칙).
export async function cachedSignedUrl(key, ttlSeconds, sign, now = Date.now) {
  if (!key) return { url: await sign(), maxAge: 0 };
  const t = now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > t) return { url: hit.url, maxAge: browserMaxAge(hit.expiresAt, t) };
  const url = await sign();
  // 못 만들었으면 담지 않는다 — 실패를 캐시하면 그 자리가 수명 내내 죽는다.
  if (!url) return { url, maxAge: 0 };
  const expiresAt = t + ttlSeconds * 1000 - MARGIN_MS;
  cache.set(key, { url, expiresAt });
  if (cache.size > MAX) cache.delete(cache.keys().next().value);
  return { url, maxAge: browserMaxAge(expiresAt, t) };
}
