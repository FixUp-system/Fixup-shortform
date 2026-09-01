import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
// 규칙 하나만 떼어 낸다 — 글자 수로 끊으면 옆 규칙까지 넘어가 거짓으로 통과한다
// (오늘 이 저장소에서 그 함정을 여러 번 밟았다).
const rule = (sel) => {
  const at = css.indexOf(`${sel} {`);
  if (at === -1) return "";
  return css.slice(at, css.indexOf("}", at) + 1);
};

// ★★ 밝은 테마에서 썸네일 위 뱃지가 안 보였다(2026-08-20 사장님 지적).
//
// 원인: 배경은 **고정 검정**(rgba(0,0,0,0.6))인데 글자는 var(--ink) 였다. --ink 는
// 테마를 따라가서 어두운 테마에서는 #F5F5F5(밝음)라 보이고, 밝은 테마에서는
// #17121A(거의 검정)라 **검정 위 검정**이 된다.
//
// ★ 사진 위에 얹는 것은 **테마와 무관**하다 — 밑에 깔린 것이 우리 배경이 아니라 사진이다.
//   배경을 고정했으면 글자도 고정해야 한다. 둘 중 하나만 고정한 것이 결함이었다.
describe("썸네일 위 뱃지는 두 테마에서 다 보인다", () => {
  const tag = () => rule(".thumb-tag");

  it("★ 규칙이 실제로 있다 — 못 찾으면 아래 시험들이 빈 문자열을 재고 통과한다", () => {
    expect(tag()).toContain("position: absolute");
  });

  it("★ 글자색이 테마를 따라가지 않는다 — 배경이 고정 검정이기 때문이다", () => {
    expect(tag(), "var(--ink) 는 테마를 따라가서 밝은 테마에서 검정이 된다")
      .not.toMatch(/color:\s*var\(--ink\)/);
  });

  // ⚠️ hex 를 직접 쓰면 안 된다 — 이 저장소는 ":root 밖에 hex 색 리터럴이 없다"를
  //   시험으로 강제한다(tests/design-system.test.js). 그래서 **토큰**을 쓴다.
  it("★ 사진 위 전용 토큰을 쓴다", () => {
    expect(tag()).toMatch(/color:\s*var\(--on-media\)/);
  });

  it("★ 그 토큰은 두 테마에서 같은 값이다 — 다르면 한쪽에서 다시 안 보인다", () => {
    const values = [...css.matchAll(/--on-media:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(values.length, "테마 블록 둘 다에 있어야 한다").toBe(2);
    expect(new Set(values).size, `두 값이 다르다: ${values.join(" vs ")}`).toBe(1);
  });
});

// ★★ 카드 아래 제목과 뱃지가 겹쳐 보였다(같은 지적).
//
// 원인: 제목이 line-clamp: 2 로 **두 줄까지 자라는데** .project-meta 가 align-items:
// center 라, 제목이 두 줄이 되면 그 줄이 세로로 커져 옆 뱃지와 시각적으로 부딪힌다.
describe("카드 아래 제목과 뱃지가 안 겹친다", () => {
  const meta = () => rule(".project-meta");

  it("★ 규칙이 실제로 있다", () => {
    expect(meta()).toContain("display: flex");
  });

  it("★ 가운데 정렬이 아니다 — 제목이 두 줄이 되면 뱃지와 부딪힌다", () => {
    expect(meta()).not.toMatch(/align-items:\s*center/);
  });

  it("★ 위쪽에 맞춘다 — 제목이 몇 줄이든 뱃지는 첫 줄 옆에 선다", () => {
    expect(meta()).toMatch(/align-items:\s*flex-start/);
  });

  it("★ 뱃지는 제 크기를 지킨다 — 눌리면 글자가 두 줄로 찌그러진다(기존 계약)", () => {
    expect(rule(".project-meta .badge")).toMatch(/flex:\s*none/);
  });
});

// ★★ 비용 기록에서 [프롬프트 보기]를 누르면 상태 뱃지가 깨졌다(2026-08-20 사장님 지적).
//
// 원인: .cost-table 은 table-layout 이 자동이라, <details> 가 열려 프롬프트 칸이 넓어지면
// 브라우저가 칸 너비를 다시 나눈다 — 상태 칸이 눌리고 뱃지 글자가 **두 줄로 접힌다.**
//
// ★ 이 저장소는 **같은 결함을 이미 한 번 겪고 고쳤다.** .project-meta .badge 에
//   "배지는 제 크기를 지킨다 — 없으면 '완성'이 '완/성' 두 줄로 찌그러진다(실측)" 이라고
//   적어 두었는데, 표 안의 .st-badge 에는 그 처방을 안 썼다.
describe("상태 뱃지는 칸이 눌려도 안 찌그러진다", () => {
  const rule = (sel) => {
    const at = css.indexOf(`${sel} {`);
    return at === -1 ? "" : css.slice(at, css.indexOf("}", at) + 1);
  };

  it("★ 규칙이 실제로 있다", () => {
    expect(rule(".st-badge")).toContain("font-size");
  });

  it("★ 글자가 두 줄로 안 접힌다", () => {
    expect(rule(".st-badge"), "nowrap 이 없으면 칸이 좁아질 때 접힌다")
      .toMatch(/white-space:\s*nowrap/);
  });

  it("★ 인라인 블록이다 — 순수 인라인이면 위아래 여백이 줄 상자를 안 밀어낸다", () => {
    expect(rule(".st-badge")).toMatch(/display:\s*inline-block/);
  });

  it("★ 상태 칸 자체도 안 눌린다 — 뱃지만 고치면 칸이 글자 폭까지 좁아진다", () => {
    expect(css).toMatch(/\.cost-table td:has\(\.st-badge\)|\.cost-status/);
  });
});

// **보관함에 가로 스크롤이 생겼다** (2026-09-01 브라우저 실측: 805px 화면에서 829px).
//
// ★★★ 넘긴 것은 카드 아래 줄이었다 — 제목 + 종류 배지 + 상태 배지 + [지우기] 가 한 줄에
//   다 안 들어가는데 `.project-meta` 에 줄바꿈이 없었다. 그러면 줄이 안 줄어들고,
//   격자 칸(`minmax(190px, 1fr)`)은 grid 항목의 기본 `min-width: auto` 때문에 그 너비를
//   그대로 받아들여 열이 벌어진다 — 그 결과가 **페이지 전체의 가로 스크롤**이다.
//
// ★ 그래서 **둘 다** 필요하다. 줄바꿈만 열면 칸이 여전히 안 줄고, min-width 만 0 으로
//   두면 줄이 안 접혀 글자가 잘린다.
describe("보관함 카드 — 가로로 안 넘친다", () => {
  it("★★★ 카드 아래 줄이 접힌다", () => {
    expect(rule(".project-meta"), "줄바꿈이 없어 배지·[지우기] 가 옆으로 밀린다")
      .toMatch(/flex-wrap:\s*wrap/);
  });

  it("★★★ 격자 칸이 내용보다 좁아질 수 있다 — grid 항목의 기본값이 auto 다", () => {
    expect(rule(".project-card"), "min-width: 0 이 없어 열이 벌어진다")
      .toMatch(/min-width:\s*0/);
  });
});
