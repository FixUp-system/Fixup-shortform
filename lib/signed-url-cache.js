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

// 만료 직전의 주소를 물려주면 재생 중에 끊긴다. 그 앞에서 새로 발급한다.
const MARGIN_MS = 60_000;
// 표가 무한정 자라지 않게 막는다. 넘치면 **가장 오래 전에 넣은 것**부터 버린다
// (Map 이 넣은 순서를 지킨다). 캐시가 비면 다시 서명할 뿐이라 틀리지 않는다.
const MAX = 500;

const cache = new Map();

// 테스트가 인스턴스 사이를 흉내 낼 때 쓴다.
export function resetSignedUrlCache() {
  cache.clear();
}

// key 가 없으면(= 무효화할 버전을 모르면) 그냥 새로 서명한다.
export async function cachedSignedUrl(key, ttlSeconds, sign, now = Date.now) {
  if (!key) return sign();
  const t = now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > t) return hit.url;
  const url = await sign();
  // 못 만들었으면 담지 않는다 — 실패를 캐시하면 그 자리가 수명 내내 죽는다.
  if (!url) return url;
  cache.set(key, { url, expiresAt: t + ttlSeconds * 1000 - MARGIN_MS });
  if (cache.size > MAX) cache.delete(cache.keys().next().value);
  return url;
}
