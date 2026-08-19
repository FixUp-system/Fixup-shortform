// "비트"는 사장님께 보일 말이 아니다 (2026-08-19 지적).
//
// beat 는 영상 기획 용어를 음차한 것이고 이 저장소의 **내부 필드명**이다. 화면에 그대로
// 두면 "비트에 가방에 매달려 흔들리는 키링으로 시선을 붙잡는다" 처럼 읽혀, 라벨인지
// 문장의 일부인지도 헷갈린다.
//
// ★ 정답은 이미 화면 안에 있었다 — 빈 칸 안내가 `이 장면이 하는 일` 이라고 우리말로
//   말하고 있다. 라벨만 안 따라왔다.
// ★ 라벨의 길이와 결은 광고 화면을 따른다(전부 두 글자: 대사·음성·조명·음향·동작).
//   그래서 "하는 일"(네 글자)이 아니라 **역할**이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FILES = [
  "app/create/[id]/scenario/page.js",
  "app/ads/[id]/page.js",
  "app/archive/[id]/page.js",
];

describe("장면 라벨 — 내부 용어를 화면에 두지 않는다", () => {
  for (const f of FILES) {
    const raw = readFileSync(f, "utf8");
    // ⚠️ 주석은 걷어내고 판정한다 — 걷어낸 낱말을 주석에 적으면 계약이 통과해 버린다
    //    (이 저장소가 하루에 네 번 밟은 함정이다).
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

    it(`★ ${f} — 화면에 "비트"가 없다`, () => {
      expect(code, "내부 필드명이 사장님 화면에 그대로 있다").not.toContain("비트");
    });

    it(`★ ${f} — 그 자리를 우리말 라벨이 채운다`, () => {
      expect(code, "라벨이 사라지기만 하면 그 칸이 무엇인지 알 수 없다").toContain("역할");
    });
  }

  it("★ 주석의 라벨 목록도 함께 갱신한다 — 낡은 주석이 다음 사람을 속인다", () => {
    const raw = readFileSync("app/create/[id]/scenario/page.js", "utf8");
    const comments = raw.match(/\/\*[\s\S]*?\*\//g)?.join("\n") || "";
    expect(comments, "주석이 아직 '비트·카메라…'로 라벨을 세고 있다")
      .not.toMatch(/비트·카메라/);
  });
});
