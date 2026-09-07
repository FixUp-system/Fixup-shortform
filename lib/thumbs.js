// 작은 그림을 실제로 만드는 자리 — **서버 전용**(sharp 를 문다).
//
// 이름 규약은 lib/thumb-url.js 에 있다(순수 모듈, 카드도 읽는다). 여기에 그 규약을 다시
// 적으면 둘이 갈라져 "만들었는데 못 찾는" 상태가 된다.
//
// ★ 크기·화질의 근거(실측, sharp w480 webp q72):
//     1024×766  59KB → **8KB(14%)**
//      740×493  25KB → 6KB
//   카드는 화면에서 300~400px 다. 480 은 고해상도 화면에서도 흐리지 않을 만큼만 준 값이고,
//   더 키우면 절감이 그만큼 준다.
// ★ withoutEnlargement — 원본이 480 보다 작으면 **키우지 않는다.** 키우면 용량만 늘고
//   화질은 안 는다.
import sharp from "sharp";

export const THUMB_WIDTH = 480;
export const THUMB_TYPE = "image/webp";

export async function makeThumb(bytes) {
  return sharp(bytes)
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();
}
