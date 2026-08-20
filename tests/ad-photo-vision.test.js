// 광고·film 이 사진에서 읽은 값을 시나리오 지문까지 나르는가.
//
// ★★ 2026-08-19: **film 은 사진을 한 번도 안 읽었다.** 라우트 주석은 "이 경로는 사진을
//   그림 만들기에서 참조 바이트로 직접 넘기므로 글자를 받아쓰는 우회가 필요 없다"였는데,
//   실측이 그 판단을 뒤집었다:
//     · 시나리오가 사진을 못 봐서 shows 에 제품의 글자("Giants")도 색도 크기도 없었다
//     · **굽기(r2v)에는 사장님 사진이 아예 안 간다** — films[].images(우리가 만든 그림)만
//       참조로 간다. 영상 단계에서 원본 사진이 없다
//   즉 사진의 정보가 **그림에만** 닿고 시나리오·영상에는 안 갔다.
//
// ★ 광고는 lettering 만 실었다. 단계별은 what(색)·scale(크기)도 쓴다 — 셋 다 싣는다.
//   실측 근거는 lib/scenario.js 주석에 있다("라벤더 토끼인데 크림색 토끼가 나왔다").
import { describe, it, expect, vi } from "vitest";
import { buildScenarioMessages, readPhotoVision } from "../lib/ad/scenario.js";

const settings = { seconds: 15, aspect_ratio: "9:16", narration_lang: "ko", format: "hero", style: "photo", mood: "bright" };
const photo = (vision) => ({ id: "p1", url: "/api/uploads/a.jpg", ...(vision ? { vision } : {}) });
const msg = (photos) => buildScenarioMessages({ settings, material: { text: "소재", photos } }).messages[0].content;

describe("사진에서 읽은 값이 지문에 실린다", () => {
  it("★ 인쇄된 글자를 철자 그대로 싣는다", () => {
    expect(msg([photo({ lettering: "Giants" })])).toContain("Giants");
  });

  it("★ 무엇이 보이는지(색 포함)를 싣는다 — 색을 빼면 모델이 색을 지어낸다", () => {
    expect(msg([photo({ what: "가방에 달린 분홍 토끼 인형" })])).toContain("분홍 토끼 인형");
  });

  it("★ 크기를 싣는다 — 크기를 모르면 제품이 컷마다 다른 크기로 나온다", () => {
    expect(msg([photo({ scale: "손바닥 절반 크기" })])).toContain("손바닥 절반");
  });

  // ★ 판정을 바꿨다(2026-08-19). 이제 **사진 유무가 규칙을 가른다** — 사진이 있으면
  //   "생김새를 다시 적지 마라"(사진이 이긴다), 없으면 "부위 위치를 적어라"(글이 유일한
  //   재료다). 그래서 사진 1장과 0장의 지문은 원래 달라야 한다.
  //   여기서 지켜야 하는 것은 **vision 을 못 읽은 사진이 지문을 흔들지 않는 것**이다.
  it("★ 읽은 값이 없으면 vision 줄이 안 붙는다 — 옛 프로젝트가 안 흔들린다", () => {
    const blind = msg([photo(null)]);
    expect(blind).toBe(msg([photo(null)]));
    for (const marker of ["에 적힌 글자", "에 보이는 것", "의 크기"]) {
      expect(blind).not.toContain(marker);
    }
  });
});

describe("readPhotoVision — 광고와 film 이 같은 함수를 쓴다", () => {
  const project = (photos) => ({ id: "p", material: { text: "t", photos } });

  it("★ 아직 안 본 사진만 읽는다 — 다시 쓰기를 눌러도 사진값이 다시 안 든다", async () => {
    const describePhoto = vi.fn(async () => ({ what: "분홍 토끼", lettering: "Giants" }));
    const readRefBytes = async () => Buffer.from("x");
    const p = project([photo({ what: "이미 읽음" }), photo(null)]);
    await readPhotoVision(p, { describePhoto, readRefBytes });
    expect(describePhoto).toHaveBeenCalledTimes(1);
  });

  it("★ 읽은 값을 사진에 붙여 돌려준다", async () => {
    const describePhoto = async () => ({ what: "분홍 토끼", lettering: "Giants" });
    const readRefBytes = async () => Buffer.from("x");
    const out = await readPhotoVision(project([photo(null)]), { describePhoto, readRefBytes });
    expect(out.material.photos[0].vision.lettering).toBe("Giants");
  });

  it("★ 아무것도 못 읽으면 **같은 객체**를 돌려준다 — 문서를 헛되이 안 바꾼다", async () => {
    const describePhoto = async () => ({ person: false, what: "", lettering: "" });
    const readRefBytes = async () => Buffer.from("x");
    const p = project([photo(null)]);
    expect(await readPhotoVision(p, { describePhoto, readRefBytes })).toBe(p);
  });

  it("★ 바이트를 못 읽으면 그 사진은 건너뛴다 — 사진 하나 때문에 시나리오를 못 만들 이유가 없다", async () => {
    const describePhoto = vi.fn(async () => ({ what: "x" }));
    const readRefBytes = async () => null;
    await readPhotoVision(project([photo(null)]), { describePhoto, readRefBytes });
    expect(describePhoto).not.toHaveBeenCalled();
  });

  it("사진이 없으면 그대로 돌려준다", async () => {
    const p = project([]);
    expect(await readPhotoVision(p, {})).toBe(p);
  });
});
