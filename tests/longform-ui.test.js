// **롱폼 껍데기 — 사이드바 자리와 입력 화면** (2026-09-29, 시험용).
//
// ★ 사장님 지시: "사이드바에 롱폼 섹션을 하나 만들어줘 거기서 따로 진행할게 ·
//   이름은 **테스트용 - 롱폼생성**".
// ★★ 이 회차는 **굽기를 배선하지 않는다.** 구간 분할·닻·TTS 는 설계가 끝난 뒤다.
//   여기서 굳히는 것은 "롱폼이 무엇을 입력으로 받는가"까지다.
//
// 화면 계약은 이 저장소 관례대로 **소스 문자열**로 잰다(렌더 인프라가 없다).
// ⚠️ 주석은 걷어내고 잰다 — 안 그러면 이 파일 머리말의 낱말에 맞아 문구를 지워도 그린이
//   된다(tests/reel-ui.test.js 가 2026-08-21 에 실제로 겪었다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const sidebar = readFileSync("components/Sidebar.jsx", "utf8");
const sidebarCode = stripComments(sidebar);
const newPage = readFileSync("app/longform/new/page.js", "utf8");
const newCode = stripComments(newPage);
const workPage = readFileSync("app/longform/[id]/page.js", "utf8");

describe("사이드바 — 테스트용 롱폼 자리", () => {
  it("★★ 표에 플래그가 있다 — 접을 때 한 글자로 끈다(SIDEBAR_FLOWS 머리말의 규율)", () => {
    expect(sidebarCode).toMatch(/longform:\s*(true|false)/);
  });

  it("★ 이름이 사장님이 정한 그대로다", () => {
    expect(sidebarCode).toMatch(/테스트용 - 롱폼생성/);
  });

  it("★★ 플래그로 감싼다 — 표를 false 로 돌리면 링크가 사라져야 한다", () => {
    // 플래그를 읽지 않고 그리면 접을 방법이 없다. 이름 앞쪽에 가드가 있어야 한다.
    const at = sidebarCode.indexOf("테스트용 - 롱폼생성");
    expect(at).toBeGreaterThan(-1);
    expect(sidebarCode.slice(0, at)).toMatch(/SIDEBAR_FLOWS\.longform\s*&&/);
  });

  it("롱폼 입구로 보낸다", () => {
    expect(sidebarCode).toMatch(/\/longform\/new/);
  });
});

describe("입력 화면", () => {
  it("★★★ 구간 수를 **계산해서** 보여 준다 — 손으로 적으면 굽는 쪽과 갈린다", () => {
    expect(newCode, "순수 계산 모듈을 안 읽는다").toMatch(/segmentCountFor/);
    expect(newCode).toMatch(/lib\/longform\/plan/);
  });

  it("길이 목록도 표에서 읽는다", () => {
    expect(newCode).toMatch(/LONGFORM_LENGTHS/);
  });

  it("★ 화풍·분위기·비율은 기존 표를 그대로 쓴다 — 롱폼용 사본을 만들지 않는다", () => {
    expect(newCode).toMatch(/AD_STYLE_LINES|STYLE_PRESETS/);
    expect(newCode).toMatch(/ASPECTS|aspects/);
  });

  it("★★ setInterval 을 쓰지 않는다 — 폴링은 lib/poll.js 한 벌이다", () => {
    // ⚠️ CLAUDE.md 경고: "화면을 새로 더하면 어디에도 안 걸린다" — 그래서 여기 손으로 넣는다.
    expect(newCode).not.toMatch(/setInterval/);
  });

  it("★★ 단계별 코드를 끌어오지 않는다 — 두 흐름이 섞이면 한쪽을 고칠 때 다른 쪽이 깨진다", () => {
    expect(newCode).not.toMatch(/lib\/reel\//);
  });
});

describe("작업 화면 — 아직 자리표시다", () => {
  it("★ 굽기를 배선하지 않았다는 것을 화면이 말한다 — 빈 화면은 고장으로 읽힌다", () => {
    expect(stripComments(workPage)).toMatch(/아직|준비|설계/);
  });

  it("여기도 setInterval 금지", () => {
    expect(stripComments(workPage)).not.toMatch(/setInterval/);
  });
});
