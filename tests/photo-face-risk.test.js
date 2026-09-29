// **사진을 "무엇인가"(설명)와 "보내도 되는가"(정책)로 갈라 본다** (2026-09-29).
//
// ★★★ 왜 생겼나. 프로덕션 편 `1c979787`(강아지 · 15초 · 720p)에서 **올린 사진 네 장이
//   영상 모델에 한 장도 안 갔다.** 네 장 다 `role: "person"`(＋인물 말고 담을 칸이 없었다)
//   이라, 초상 정책 방어(lib/reel/oneshot.js 의 oneShotRefPhotos, 2026-09-04)가 전부
//   걸러 냈다. 그래서 영상 모델이 받은 그림은 **스토리보드 판 한 장뿐**이었고
//   (첫 프레임도 없다 — imageUrl: null), 강아지가 **두 번 재생성**됐다.
//   증상: "실사로 골랐는데 3D 같다" · "판의 강아지와 영상 속 강아지가 다르다".
//   ★ 사진 판정은 네 장 모두 `vision.person === false` 로 **맞게** 답했다 — 라벨이 이겼다.
//
// ★★ 그리고 반대 방향 구멍이 하나 더 있다. `vision.person` 은 *"주인공이 사람인가"* 를
//   묻는 값이라 **배경 행인은 false** 다(lib/vlm.js 의 지문: "멀리 지나가는 행인이나
//   뒷모습만 있으면 false"). 그런데 fal 은 **배경 얼굴에도 거절**을 낸다 — 이 저장소가
//   lib/reel/face-grid.js 에서 이미 밟은 함정이다("옛 지문의 clearly visible 은 배경의
//   작은 얼굴을 건너뛰었는데, 거절을 부른 것이 바로 그 얼굴이었다").
//
// ★ 그래서 **질문이 둘인데 함수가 하나**였다:
//     설명 축 = isPersonPhoto — "이 사진의 주인공이 사람인가" (화면 ＋인물, 모델 지문)
//     정책 축 = hasFaceRisk  — "fal 이 거절할 얼굴이 있는가" (참조로 보낼까 말까)
//   이 파일은 **정책 축**을 못 박는다. 설명 축은 tests/photo-roles.test.js 가 쥔다.
import { describe, it, expect } from "vitest";
import { hasFaceRisk, isPersonPhoto } from "../lib/photos.js";
import { oneShotRefPhotos, oneShotDroppedPhotos } from "../lib/reel/oneshot.js";

const photo = (id, extra = {}) => ({ id, url: `/api/uploads/${id}.jpg`, ...extra });

describe("정책 축 — fal 이 거절할 얼굴이 있는가", () => {
  it("★★★ 사진 판정이 '사람 아님'이라고 했으면 ＋인물 라벨보다 그 말을 믿는다", () => {
    // 강아지 편 `1c979787` 이 정확히 이 모양이었다 — 네 장 다 이랬다.
    const dog = photo("dog", { role: "person", vision: { person: false, any_face: false } });
    expect(hasFaceRisk(dog)).toBe(false);
  });

  it("★★ 배경에만 얼굴이 있어도 위험이다 — 주인공이 아니어도 fal 은 거절한다", () => {
    const shelf = photo("shelf", { role: "product", vision: { person: false, any_face: true } });
    expect(hasFaceRisk(shelf)).toBe(true);
    // 설명 축은 여전히 "주인공은 사람 아님"이다 — 두 축이 다른 답을 낸다는 것이 요점이다.
    expect(isPersonPhoto(shelf)).toBe(false);
  });

  it("주인공이 사람이면 위험이다", () => {
    expect(hasFaceRisk(photo("me", { role: "person", vision: { person: true, any_face: true } }))).toBe(true);
  });

  it("★ 아직 안 읽은 사진은 라벨을 믿는다 — 모르면 안전한 쪽이다", () => {
    expect(hasFaceRisk(photo("p", { role: "person" }))).toBe(true);
    expect(hasFaceRisk(photo("p", { role: "product" }))).toBe(false);
  });

  it("★ 옛 사진(any_face 를 안 물어본 판정)도 person 만으로 판정된다", () => {
    // any_face 가 생기기 전 문서다. person:false 면 그때도 안 보내던 이유가 없다.
    expect(hasFaceRisk(photo("old", { role: "product", vision: { person: false } }))).toBe(false);
    expect(hasFaceRisk(photo("old", { role: "product", vision: { person: true } }))).toBe(true);
  });
});

describe("통짜 굽기가 이 판정을 쓴다", () => {
  const proj = (photos) => ({ material: { photos } });

  it("★★★ ＋인물로 올린 강아지 사진이 영상 모델에 간다 — 이 버그가 이 파일을 만들었다", () => {
    const p = proj([
      photo("dog1", { role: "person", vision: { person: false, any_face: false } }),
      photo("dog2", { role: "person", vision: { person: false, any_face: false } }),
    ]);
    expect(oneShotRefPhotos(p).map((x) => x.id)).toEqual(["dog1", "dog2"]);
  });

  it("사람 사진은 여전히 안 간다 — 09-04 방어는 그대로다", () => {
    const p = proj([
      photo("face", { role: "person", vision: { person: true, any_face: true } }),
      photo("box", { role: "product", vision: { person: false, any_face: false } }),
    ]);
    expect(oneShotRefPhotos(p).map((x) => x.id)).toEqual(["box"]);
  });

  it("★★ 빠진 사진을 이유와 함께 돌려준다 — 조용히 버리지 않는다", () => {
    // 비율 초과 사진은 **버리지 않고 여백을 넣어** 맞춘다(lib/reel/pipeline.js). 그래서
    // 조용히 사라지는 유일한 길이 이 얼굴 판정이었고, 화면에 아무 말도 없었다.
    const p = proj([
      photo("face", { role: "person", vision: { person: true, any_face: true } }),
      photo("box", { role: "product", vision: { person: false, any_face: false } }),
    ]);
    const dropped = oneShotDroppedPhotos(p);
    expect(dropped.map((x) => x.id)).toEqual(["face"]);
  });

  it("빠진 것이 없으면 빈 배열이다", () => {
    const p = proj([photo("box", { role: "product", vision: { person: false, any_face: false } })]);
    expect(oneShotDroppedPhotos(p)).toEqual([]);
  });
});
