// 화면 계약 — 이 저장소에는 컴포넌트 렌더 인프라가 없어 **소스에서 잰다.**
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const read = (p) => readFileSync(p, "utf8");
// ★★ 2026-08-21 리뷰 A3 — 주석을 걷어낸 소스만 재는 자리가 있다. 아래 "굽기 전이라는
//   것을 사장님에게 말한다" 단정이 원래는 raw 소스를 그대로 재서 **머리말 주석**의
//   "값이 들지" 한 마디에 맞았다 — 그러면 화면 문구를 통째로 지워도 그린이었다
//   (2026-08-21 실제로 그랬다, 이 파일이 부르는 브리프의 정규식이 원인이었다).
//   tests/step-doc-gate.test.js 가 이미 쓰는 것과 같은 정규식으로 주석을 걷어낸다.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const layout = read("app/reel/[id]/layout.js");
const prompts = read("app/reel/[id]/prompts/page.js");
const SCREENS = [
  // ★★ 2026-08-21 리뷰 A5 — 처음엔 이 배열에 여섯(단계 화면)만 있었다. new/page.js 는
  //   레이아웃 밖(프로젝트가 아직 없다)이라 빠졌는데, 그래서 setInterval 그물이 그
  //   화면만 안 덮었다 — CLAUDE.md 가 경고하는 "화면을 새로 더하면 어디에도 안 걸린다"
  //   패턴이 여기서도 났다. new 화면도 폴링을 안 쓰지만(만들기 한 번뿐이다) 그물에
  //   들어 있어야 나중에 실수로 setInterval 을 넣어도 잡힌다.
  ["new", read("app/reel/new/page.js")],
  ["briefing", read("app/reel/[id]/briefing/page.js")],
  ["scenario", read("app/reel/[id]/scenario/page.js")],
  ["images", read("app/reel/[id]/images/page.js")],
  ["prompts", prompts],
  ["video", read("app/reel/[id]/video/page.js")],
  ["done", read("app/reel/[id]/done/page.js")],
];

describe("폴링은 한 벌이다", () => {
  for (const [name, src] of SCREENS) {
    it(`${name} 은 setInterval 을 스스로 돌리지 않는다`, () => {
      expect(src).not.toContain("setInterval");
    });
  }
});

describe("단계 표는 하나다", () => {
  it("레이아웃이 표를 읽는다", () => {
    expect(layout).toContain("REEL_STEPS");
  });

  for (const [name, src] of SCREENS) {
    it(`${name} 은 단계 목록을 손으로 적지 않는다`, () => {
      // 화면이 자기 단계 배열을 들면 스테퍼와 가드가 갈린다.
      expect(src).not.toMatch(/\[\s*["']material["']\s*,/);
    });
  }
});

describe("영상 프롬프트 화면", () => {
  it("굽기 버튼 판정을 lib 에서 가져온다", () => {
    expect(prompts).toContain("isPromptsReady");
  });

  it("고친 값을 저장하는 문을 부른다", () => {
    expect(prompts).toContain("PATCH");
  });

  // ★★ 2026-08-25 뒤집힘 — 여기에는 "④는 무료라고 화면이 말해야 한다"는 단정이 있었다.
  //   사장님이 값·크레딧을 말하는 문구를 **전부 빼라**고 했다("버튼 옆에 붙는 설명 전부 제거").
  //   값을 말하는 자리는 실제로 돈이 나가는 ⑤영상 하나로 모았다. 그래서 이 단정은 지운다 —
  //   남겨 두면 지시와 정반대인 문구를 테스트가 강제한다.
});

// ────────────────────────────────────────────────────────────────────────
// 2026-08-21 리뷰 A2 — ⑤영상 화면의 굽기 게이트가 프롬프트뿐 아니라 그림까지 본다.
// ────────────────────────────────────────────────────────────────────────
describe("A2 — 굽기 게이트는 그림까지 본다", () => {
  const video = read("app/reel/[id]/video/page.js");

  // ★★ 2026-08-25 — 이름이 canBakeReel 로 넓어졌다(lib/reel/oneshot.js). 굽기 갈래가
  //   둘이 되면서(통짜 15초 이하 · 컷별) 게이트도 갈래를 봐야 하는데, **컷별 갈래에서는
  //   canBakeReelClips 를 글자 그대로 부른다** — A2 가 지키려던 것(프롬프트뿐 아니라
  //   그림까지 본다)은 그대로다. tests/reel-oneshot.test.js 가 그 위임을 값으로 잰다.
  it("video 화면이 canBakeReel 을 부른다 — isPromptsReady 하나만 보지 않는다", () => {
    expect(video).toContain("canBakeReel");
  });
});

// ────────────────────────────────────────────────────────────────────────
// 2026-08-21 리뷰 A1 — reel 이 사장님에게 존재한다: 사이드바 진입점 + 보관함 상세.
// ────────────────────────────────────────────────────────────────────────
describe("A1 — reel 이 사장님에게 존재한다", () => {
  const sidebar = read("components/Sidebar.jsx");
  const archive = read("app/archive/[id]/page.js");

  it("사이드바에 reel 진입 링크가 있다", () => {
    expect(sidebar).toContain("/reel/new");
  });

  it("보관함 상세가 reel 문서를 읽는 문을 두드린다", () => {
    expect(archive).toContain("/api/reel/${id}");
  });

  it("보관함 상세가 reel 문서면 /reel/<id>/... 로 이어서 작업한다", () => {
    expect(archive).toContain("reelStepHref");
  });
});

// ────────────────────────────────────────────────────────────────────────
// Task 12b (Ruling 14) — 화질을 사장님이 고른다. 480p 와 720p 는 값이 2배(15초
// 40 대 80 크레딧)라 안 보여 주면 사장님이 모르고 비싼 쪽을 고른다.
// ────────────────────────────────────────────────────────────────────────
describe("화질 고르기", () => {
  const nw = read("app/reel/new/page.js");

  it("고르는 칸이 있다", () => {
    expect(nw).toMatch(/resolution/);
  });

  it("고른 조합의 값을 보여 준다 — 480p 와 720p 는 2배 차이다", () => {
    expect(nw).toContain("videoPrice");
    expect(nw).toContain("priceLabel");
  });

  it("광고 가격표를 쓰지 않는다", () => {
    expect(nw).not.toContain("adVideoPrice");
  });
});

describe("①입력 — 시작 버튼", () => {
  // ★ "무료" 배지를 뗄다(2026-08-25 사장님 지시).
  //   이 단계가 실제로 공짜인 것은 맞지만, 시작 버튼에 값 배지를 달면
  //   그 뒤 단계들까지 공짜인 것처럼 읽힌다 — 돈이 나가는 곳은 ④그림·⑤영상이다.
  // ★ 줄로 안 가르고 **주변 문자열**로 재다 — heredoc 에서 역슬래시가 먹혀
  //   개행 리터럴이 깨진다(CLAUDE.md 경고. 이번에 세 번 밟았다).
  it("시작하기에 무료 배지가 없다", () => {
    const src = stripComments(read("app/reel/new/page.js"));
    const at = src.indexOf("시작하기");
    expect(at, "시작하기를 못 찾았다").toBeGreaterThan(-1);
    expect(src.slice(at, at + 140)).not.toContain("무료");
  });
});
