// 크레딧 내역의 말과 부호 — 화면과 라우트가 같은 표를 본다.
import { describe, it, expect } from "vitest";
import { ledgerLabel, ledgerDelta } from "../lib/ledger.js";

describe("내역의 말", () => {
  it("무엇에 썼는지를 사장님 말로 적는다", () => {
    expect(ledgerLabel("video")).toBe("영상 만들기");
    expect(ledgerLabel("regen_image")).toBe("이미지 다시 만들기");
    expect(ledgerLabel("regen_clip")).toBe("영상 다시 만들기");
    expect(ledgerLabel("regen_voice")).toBe("목소리 다시 만들기");
    expect(ledgerLabel("grant")).toBe("충전");
  });

  // 되돌려준 것은 종류가 여럿이다(refund · refund_regen_clip …). 사장님에게는 하나다.
  it("돌려준 것은 전부 한 말이다", () => {
    expect(ledgerLabel("refund")).toBe("돌려받음");
    expect(ledgerLabel("refund_regen_clip")).toBe("돌려받음");
    expect(ledgerLabel("refund_regen_image")).toBe("돌려받음");
  });

  // 모르는 종류를 빈칸으로 두면 "무엇에 썼는지 모르는 줄"이 생긴다 — 그것이 가장 나쁘다.
  it("모르는 종류도 말이 되게 적는다", () => {
    expect(ledgerLabel("무언가_새로운_것")).toBe("사용");
    expect(ledgerLabel(undefined)).toBe("사용");
  });
});

describe("내역의 부호 — 잔액이 얼마나 움직였나", () => {
  // 장부는 청구를 양수로 적는다(잔액 = 충전합 − 청구합). 화면은 잔액의 변화를 보여 준다.
  it("청구는 잔액을 깎는다", () => {
    expect(ledgerDelta({ source: "charge", credits: 50 })).toBe(-50);
  });

  // 환불은 청구 장부의 **음수 행**이다 — 그래서 잔액은 늘어난다.
  it("환불은 잔액을 되돌린다", () => {
    expect(ledgerDelta({ source: "charge", credits: -50 })).toBe(50);
  });

  it("충전은 그대로 더한다", () => {
    expect(ledgerDelta({ source: "grant", credits: 500 })).toBe(500);
  });

  // 운영자가 잘못 넣은 것을 거둬가는 정정도 충전 장부의 음수 행이다.
  it("운영자 회수는 깎인 채로 보인다", () => {
    expect(ledgerDelta({ source: "grant", credits: -200 })).toBe(-200);
  });
});
