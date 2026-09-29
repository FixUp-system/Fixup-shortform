// **판을 그릴 때도 어느 첨부가 무엇인지 말한다** (2026-09-22 사장님 지시).
//
// ★★★ 왜. 판 지문은 첨부를 "the real subject"(진짜 대상)라고만 불렀다 — 로고와 제품이
//   함께 붙으면 무엇이 무엇인지 모른다. 판에 그려진 로고가 곧 영상의 출발점이라
//   (lib/reel/pipeline.js 가 판을 참조로 보낸다) 여기서 뭉개지면 뒤에서 되돌릴 수 없다.
// ★ 통짜 굽기 지문과 **같은 문구 조각**을 쓴다(lib/photos.js 의 attachedRoleLines) —
//   두 벌이 되면 한쪽만 고쳐지는 날이 온다.
import { describe, it, expect } from "vitest";
import { buildStoryboardPrompt } from "../lib/reel/panels.js";

const GRID = { rows: 2, cols: 2 };
const LOGO = "11111111-1111-4111-8111-111111111111";
const PROD = "22222222-2222-4222-8222-222222222222";
const project = {
  settings: { i2v_model: "seedance-2.0" },
  material: {
    photos: [
      { id: LOGO, role: "logo", url: "/api/uploads/logo.png" },
      { id: PROD, role: "product", url: "/api/uploads/prod.png" },
    ],
  },
  cuts: [{ idx: 0, shows: "a bottle on a table" }],
};
const cuts = project.cuts;
const prompt = (refs) => buildStoryboardPrompt(project, cuts, GRID, "", refs);

describe("판 지문 — 첨부 라벨", () => {
  it("★★★ 사진마다 번호와 종류를 말한다 — 순서는 실리는 순서 그대로다", () => {
    const out = prompt([{ photo_id: LOGO, key: "logo.png" }, { photo_id: PROD, key: "prod.png" }]);
    expect(out).toMatch(/Attached reference image 1 is the brand logo/);
    expect(out).toMatch(/Attached reference image 2 is the subject/);
  });

  it("★★ 아바타(사진이 아닌 참조)는 사람이라고 말한다 — 번호가 밀리면 안 된다", () => {
    const out = prompt([{ photo_id: PROD, key: "prod.png" }, { kind: "person", source: "avatar", key: "a1.png" }]);
    expect(out).toMatch(/Attached reference image 1 is the subject/);
    expect(out).toMatch(/Attached reference image 2 is the person/);
  });

  it("★★ 종류를 모르는 참조도 번호를 차지한다 — 뒤 번호가 실제 자리와 어긋나면 안 된다", () => {
    const out = prompt([{ key: "unknown.png" }, { photo_id: LOGO, key: "logo.png" }]);
    expect(out).toMatch(/Attached reference image 2 is the brand logo/);
    expect(out).not.toMatch(/Attached reference image 1 is/);
  });

  it("★★ 예전 문장도 남는다 — '판마다 같게 그려라'가 이 갈래의 핵심이다", () => {
    const out = prompt([{ photo_id: PROD, key: "prod.png" }]);
    expect(out).toMatch(/keep it identical in every panel/);
  });

  it("★ 첨부가 없으면 라벨도 없다 — 없는 그림을 가리키지 않는다", () => {
    expect(prompt([])).not.toMatch(/Attached reference image/);
  });
});
