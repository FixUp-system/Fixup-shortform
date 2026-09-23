// **첨부 사진에 번호와 종류를 붙인다 + 상한 3 → 6** (2026-09-22 사장님 지시).
//
// ★★★ 실측 근거 — 보라 세럼 편 `1dc0a611`(09-22)이 사진 4장(제품3 + 로고)을 올렸는데
//   상한 3에 걸려 **로고가 영상 모델에 아예 안 갔다.** 고르는 기준이 올린 순서라, 로고를
//   마지막에 올린 사장님이 조용히 손해를 봤다. 같은 자료를 로고부터 올린 `3cdc7390`·
//   `b2a50487` 은 로고가 실렸다(대신 제품 한 장이 잘렸다).
// ★★ 종류는 말해 주고 있었지만 **어느 그림이 무엇인지**는 안 말했다("One of the attached
//   images is the brand logo"). 첨부가 늘수록 모델이 짝을 못 짓는다 — 판이 1번, 사진이
//   2번부터라는 순서를 우리가 알고 있으므로(lib/reel/pipeline.js 의 refs) 번호로 짚어 준다.
import { describe, it, expect } from "vitest";
import { ONESHOT_MAX_PHOTO_REFS, oneShotRefPhotos, buildOneShotPrompt } from "../lib/reel/oneshot.js";
import { attachedRoleLines } from "../lib/photos.js";

const P = (role, i) => ({ id: `p${i}`, url: `/api/uploads/p${i}.png`, role });
const many = (roles) => ({ material: { photos: roles.map((r, i) => P(r, i)) } });

describe("상한 — 사진을 몇 장까지 보내나", () => {
  it("★★★ 6장이다(3에서 올렸다) — 모델은 9장까지 받는다", () => {
    expect(ONESHOT_MAX_PHOTO_REFS).toBe(6);
  });

  it("★★★ 제품 셋 + 로고를 올리면 로고까지 다 간다 — 09-22 에 잘리던 조합이다", () => {
    const got = oneShotRefPhotos(many(["product", "product", "product", "logo"]));
    expect(got.map((p) => p.role)).toEqual(["product", "product", "product", "logo"]);
  });

  it("★★ 올린 순서 그대로다 — 우리가 순서를 바꾸면 사장님이 짐작한 것과 달라진다", () => {
    const got = oneShotRefPhotos(many(["logo", "product", "product"]));
    expect(got.map((p) => p.id)).toEqual(["p0", "p1", "p2"]);
  });

  it("★★ 인물은 여전히 안 보낸다 — 초상 정책을 피하는 가장 싼 길이다", () => {
    const got = oneShotRefPhotos(many(["person", "logo", "person", "product"]));
    expect(got.map((p) => p.role)).toEqual(["logo", "product"]);
  });

  it("★ 넘치면 앞에서부터 6장", () => {
    const got = oneShotRefPhotos(many(Array(9).fill("product")));
    expect(got).toHaveLength(6);
  });
});

describe("라벨 — 어느 첨부가 무엇인가", () => {
  it("★★★ 사진마다 번호와 종류를 붙인다", () => {
    const line = attachedRoleLines([P("logo", 0), P("product", 1)], 2);
    expect(line).toMatch(/Attached image 2 is the brand logo/);
    expect(line).toMatch(/Attached image 3 is the product/);
  });

  it("★★★ 같은 종류가 둘이면 **둘 다** 번호를 받는다 — 묶어 말하면 짝을 못 짓는다", () => {
    const line = attachedRoleLines([P("product", 0), P("product", 1)], 2);
    expect(line).toMatch(/Attached image 2 is the product/);
    expect(line).toMatch(/Attached image 3 is the product/);
  });

  it("★★ 종류를 모르는 사진도 번호는 받는다 — 번호가 실제 첨부 자리와 어긋나면 안 된다", () => {
    const line = attachedRoleLines([{ url: "/api/uploads/x.png" }, P("logo", 1)], 2);
    expect(line).toMatch(/Attached image 3 is the brand logo/);
  });

  it("★ 사진이 없으면 빈 문자열 — 없는 그림을 가리키지 않는다", () => {
    expect(attachedRoleLines([], 2)).toBe("");
  });
});

describe("통짜 지문 — 판이 1번이라고 말한다", () => {
  const prompt = (photos) =>
    buildOneShotPrompt({ rows: 2, cols: 2 }, 4, "a film", { photos, narrates: true });

  it("★★★ 판이 첨부 1번이고 사진은 2번부터다(lib/reel/pipeline.js 의 refs 순서)", () => {
    const p = prompt([P("logo", 0), P("product", 1)]);
    expect(p).toMatch(/Attached image 1 is (the )?storyboard/i);
    expect(p).toMatch(/Attached image 2 is the brand logo/);
    expect(p).toMatch(/Attached image 3 is the product/);
  });

  it("★★ 사진이 없으면 번호 문장이 통째로 없다", () => {
    const p = prompt([]);
    expect(p).not.toMatch(/Attached image 2/);
  });
});
