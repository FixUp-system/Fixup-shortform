import { describe, it, expect } from "vitest";
import { ALL_ERROR_FIELDS, STEP_ERROR_FIELDS, firstError } from "../lib/step-errors.js";

describe("단계별 오류 필드 표", () => {
  it("다섯 단계를 모두 덮는다", () => {
    expect(Object.keys(STEP_ERROR_FIELDS).sort())
      .toEqual(["done", "images", "script", "video", "voice"]);
  });

  // ★ 이 자리가 이번 버그의 회귀 방어다 — 이미지 단계가 images_error 를 본다는 사실.
  it("이미지 단계는 images_error 를 본다", () => {
    expect(STEP_ERROR_FIELDS.images).toContain("images_error");
  });

  it("표에 적힌 필드는 전부 아는 필드다", () => {
    for (const fields of Object.values(STEP_ERROR_FIELDS)) {
      for (const f of fields) expect(ALL_ERROR_FIELDS).toContain(f);
    }
  });

  it("앞엣것이 더 가까운 원인이다 — 둘 다 있으면 앞엣것", () => {
    const status = { images_error: "그림 실패", cuts_error: "컷 실패" };
    expect(firstError(status, "images")).toEqual({ field: "images_error", message: "그림 실패" });
  });

  it("앞엣것이 없으면 뒤엣것", () => {
    expect(firstError({ cuts_error: "컷 실패" }, "images"))
      .toEqual({ field: "cuts_error", message: "컷 실패" });
  });

  it("오류가 없으면 null", () => {
    expect(firstError({ status: "images" }, "images")).toBeNull();
  });

  it("모르는 단계·빈 입력에도 안 던진다", () => {
    expect(firstError({ images_error: "x" }, "무슨단계")).toBeNull();
    expect(firstError(null, "images")).toBeNull();
    expect(firstError(undefined, undefined)).toBeNull();
  });
});
