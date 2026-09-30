// 구간 참조 목록 — H3 의 reference_image_urls 에 **이 순서로** 실린다.
//   판 → 원본 사진 → 닻 → 직전 구간 마지막 프레임
// 지문의 "Image n" 번호가 이 순서를 가리킨다(segment-prompt.js) — 순서를 바꾸면 번호가
// 거짓말이 된다.
//
// ★ 얼굴 든 사진은 뺀다(hasFaceRisk — 초상 정책). ★★ **빠진 것을 이유와 함께 돌려준다** —
//   조용히 버린 것이 이번 회차 강아지 편(1c979787)의 뿌리였다.
// ★ 자리가 모자라면 직전 프레임부터 버린다 — 이음새(축 2)에는 "경계를 장면 전환에 맞추기"
//   라는 0원 대안이 있고, 인물(축 1, 닻)에는 없다(스펙 「축 1」).
import { hasFaceRisk, photoRole } from "../photos.js";
import { adModel } from "../ad/models.js";

const H3_MAX_REFS = adModel("minimax-h3").refs.max;
// fal 문서(minimax/h3/reference-to-video, 2026-09-30): "first 5 reference images are free
// and each additional image costs $0.08". 코드에 이 값이 사는 다른 자리는 없다.
export const H3_FREE_REFS = 5;
export const H3_EXTRA_REF_USD = 0.08;
// fal 문서: "Images, videos, and audio combined cannot exceed 12 files". 이미지는 따로 9 까지다(위 H3_MAX_REFS).
export const H3_MAX_FILES = 12;

export function segmentRefs({ sheet, photos = [], anchor = null, last = null, voices = [] }) {
  const dropped = [];
  const usable = [];
  for (const p of photos) {
    if (hasFaceRisk(p)) dropped.push({ kind: "photo", id: p.id, reason: "face" });
    else usable.push(p);
  }

  const tail = [];
  if (anchor) tail.push({ kind: "anchor", ...anchor });
  if (last) tail.push({ kind: "last", ...last });

  const room = H3_MAX_REFS - 1; // 판이 한 자리
  while (usable.length + tail.length > room) {
    const i = tail.findIndex((r) => r.kind === "last");
    if (i >= 0) {
      tail.splice(i, 1);
      dropped.push({ kind: "last", reason: "room" });
      continue;
    }
    const p = usable.pop();
    dropped.push({ kind: "photo", id: p.id, reason: "room" });
  }

  const refs = [
    { kind: "sheet", ...sheet },
    ...usable.map((p) => ({
      kind: "photo", id: p.id, url: p.url, bytes: p.bytes, key: p.key,
      roleEn: photoRole(p.role)?.en,
    })),
    ...tail,
  ];
  // 목소리(voice-ref.js) — 이미지와 **따로** 센다: 지문에서 "Audio n" 은 1 부터 따로 번호가 붙는다.
  //   합쳐 12개를 넘으면 목소리를 뒤에서 버린다(이미지 쪽 규칙은 위에서 이미 정해졌다).
  const audios = voices.map((v) => ({ kind: "voice", key: v.key, bytes: v.bytes, url: v.url, seconds: v.seconds }));
  while (refs.length + audios.length > H3_MAX_FILES) {
    const v = audios.pop();
    dropped.push({ kind: "voice", id: v.key, reason: "room" });
  }
  const extraUsd = Math.round(Math.max(0, refs.length - H3_FREE_REFS) * H3_EXTRA_REF_USD * 100) / 100;
  return { refs, audios, dropped, extraUsd };
}
