// ★ 보관함에서 누르면 **만드는 화면**이 아니라 **보는 화면**으로 간다(2026-08-14 사용자 요청).
//
// 지금까지는 카드가 곧장 제작 화면으로 보냈다(/ads/[id]·/create/[id]). 그런데 사장님이
// 보관함에서 하려는 일은 대개 "이게 무슨 영상이었지"를 확인하는 것이다 — 만드는 화면은
// 유료 버튼을 들고 있어서 확인하러 들어갔다가 값이 나가는 문 앞에 서게 된다.
//
// 새 화면은 **제작 정보**를 보여준다: 사장님이 준 자료, 설정(모델·길이·화질·비율·화풍),
// 그리고 영상을 만든 글(광고=시나리오 지시문, 단계별=원고와 컷).
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const DETAIL = "app/archive/[id]/page.js";

describe("보관함 상세 — 라우트가 있다", () => {
  it("새 화면 파일이 있다", () => {
    expect(existsSync(DETAIL), `${DETAIL} 이 없다`).toBe(true);
  });

  it("★ 보관함 카드가 그리로 보낸다 — 제작 화면으로 직행하지 않는다", () => {
    const cards = read("components/ProjectCards.jsx");
    expect(cards, "카드가 아직 /ads·/create 로 직행한다").toMatch(/\/archive\/\$\{p\.id\}/);
  });
});

describe("보관함 상세 — 무엇이 보이나", () => {
  const src = existsSync(DETAIL) ? read(DETAIL) : "";

  it("사장님이 준 자료(입력값)를 그대로 보여준다", () => {
    expect(src).toMatch(/material\??\.text/);
  });

  it("★ 영상을 만든 글을 보여준다 — 광고는 시나리오, 단계별은 원고", () => {
    expect(src, "광고 시나리오를 안 보여준다").toMatch(/scenario/);
    expect(src, "단계별 원고를 안 보여준다").toMatch(/script/);
  });

  it("설정(모델·길이·화질·비율)을 보여준다", () => {
    for (const key of ["seconds", "resolution", "aspect_ratio"]) {
      expect(src, `${key} 를 안 보여준다`).toContain(key);
    }
  });

  it("완성본이 있으면 재생한다", () => {
    expect(src).toMatch(/<video/);
  });

  it("★ 이어서 작업하는 길이 있다 — 보는 것과 고치는 것을 가른다", () => {
    expect(src).toMatch(/이어서 작업/);
    // 종류에 맞는 제작 화면으로 보낸다
    expect(src).toMatch(/\/ads\/\$\{/);
    expect(src).toMatch(/\/create\/\$\{/);
  });

  it("두 종류를 다 받는다 — 광고 문서와 기존 문서의 읽는 문이 다르다", () => {
    expect(src).toMatch(/api\/ads\//);
    expect(src).toMatch(/api\/projects\//);
  });
});
