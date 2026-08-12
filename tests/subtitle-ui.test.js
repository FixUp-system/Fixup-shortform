// ⑥완성 화면의 자막 조절 — 소스를 직접 훑는다.
// 이 저장소에는 화면 단위 테스트가 없고(tests/staleness-ui.test.js·credits-ui.test.js 가 선례),
// 이 기능의 실패 모드는 "화면이 값을 손으로 다시 적는 것"이라 소스에서 잡힌다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/create/[id]/done/page.js", "utf8");

describe("⑥완성 — 자막 조절", () => {
  // ★ 필드 이름은 **camelCase 다**(render.rawUrl). 문서가 대체로 snake_case 라 `raw_url` 로
  // 적기 쉬운데 그런 필드는 없고, 그러면 화면이 **항상** 옛 프로젝트 갈래로 떨어져 조절 UI 가
  // 아무에게도 안 보인다 — 조용히 실패한다. 그래서 둘 중 하나가 아니라 rawUrl 만 재고,
  // raw_url 은 아예 금지한다.
  it("원본을 재생한다 — 자막 구운 것 위에 미리보기를 얹지 않는다", () => {
    expect(src).toMatch(/rawUrl/);
    expect(src, "render.raw_url 은 없는 필드다 — 이름은 render.rawUrl 이다")
      .not.toMatch(/render\??\.\??raw_url|["']raw_url["']/);
  });

  it("가격표·설정을 화면이 손으로 적지 않는다", () => {
    expect(src).toMatch(/SUBTITLE_FONTS/);
    expect(src).toMatch(/DEFAULT_SUBTITLE|normalizeSubtitle/);
  });

  it("외곽선을 화면이 스스로 정하지 않는다 — 같은 규칙을 쓴다", () => {
    expect(src).toMatch(/outlineFor/);
  });

  it("드래그로 위치를 옮긴다", () => {
    expect(src).toMatch(/onPointerDown|onPointerMove/);
  });

  it("적용하면 다시 굽는다", () => {
    expect(src).toMatch(/subtitle/);
  });
});

describe("⑥완성 — 두 벌이 되지 않게", () => {
  // 폰트 목록·기본값·되돌리기는 lib/subtitles.js 하나에서 온다.
  it("lib/subtitles 에서 가져온다", () => {
    expect(src).toMatch(/from ["'][./]*lib\/subtitles["']/);
  });

  // 폰트 이름을 화면에 박으면 lib 의 목록과 갈린다.
  it("폰트 이름을 화면에 박지 않는다", () => {
    expect(src).not.toMatch(/Black Han Sans|Gowun Dodum|Pretendard/);
  });

  // 크기 범위도 lib 이 쥔다 — 두 벌이면 슬라이더 끝과 저장되는 값이 갈린다.
  it("크기 범위를 화면에 박지 않는다", () => {
    expect(src).toMatch(/min=\{SIZE_MIN\}/);
    expect(src).toMatch(/max=\{SIZE_MAX\}/);
    expect(src).not.toMatch(/min="0\.7"|max="1\.6"/);
  });

  // 화면 밖으로 끌어도 되돌아와야 한다 — 규칙은 lib 의 clampPos 하나다.
  it("드래그 자리를 clampPos 로 되돌린다", () => {
    expect(src).toContain("clampPos");
  });

  // 미리보기 글자 크기가 ffmpeg 와 같은 식에서 나와야 최종과 비슷해진다.
  it("글자 크기를 subtitleStyle 로 잰다", () => {
    expect(src).toContain("subtitleStyle");
  });
});

// settings.subtitle 이 생기는 순간 subtitleHead·toAss 는 옛 subtitle_position 을 통째로
// 무시한다. 그래서 화면이 기본값으로 씨를 뿌리면 "위"에 두었던 자막이 사장님 몰래 아래로
// 내려간다 — 옮긴 적 없는 사람에게는 사고다.
describe("⑥완성 — 옛 위치를 이어받는다", () => {
  it("settings.subtitle 이 없으면 옛 subtitle_position 에서 씨를 뿌린다", () => {
    expect(src).toContain("subtitle_position");
    const at = src.indexOf("function seedSubtitle");
    expect(at, "seedSubtitle 이 없다").toBeGreaterThan(-1);
    const fn = src.slice(at, src.indexOf("\n}", at));
    expect(fn, "씨를 뿌릴 때 옛 위치를 안 본다").toMatch(/posFromLegacyPosition/);
    expect(fn, "초기값도 lib 의 정규화를 지나야 한다").toContain("normalizeSubtitle");
  });

  // 비율(0.12·0.18)은 lib 의 POSITIONS 표에 있다. 화면이 손으로 적으면 표가 바뀔 때 갈린다.
  it("위치 비율을 화면에 박지 않는다 — subtitleStyle 에서 되뽑는다", () => {
    const at = src.indexOf("function posFromLegacyPosition");
    expect(at, "posFromLegacyPosition 이 없다").toBeGreaterThan(-1);
    const fn = src.slice(at, src.indexOf("\n}", at));
    expect(fn, "표에서 파생시키지 않는다").toContain("subtitleStyle");
    expect(fn, "여백 비율을 손으로 적었다").not.toMatch(/0\.12|0\.18|0\.82/);
  });
});

// 위/중간/아래 칩은 자유 위치가 생긴 뒤 무시되는 버튼이 됐었다 — 눌러도 아무 일이
// 안 일어나면 사장님은 "고장 났나"로 읽는다. 지우지 않고 pos 프리셋으로 살렸다.
describe("⑥완성 — 빠른 위치 칩", () => {
  it("칩이 pos 를 세팅한다 — 비율 리터럴을 다시 만들지 않는다", () => {
    const at = src.indexOf("POSITION_PRESETS");
    expect(at, "빠른 위치 프리셋이 없다").toBeGreaterThan(-1);
    const block = src.slice(at, src.indexOf(";", src.indexOf("=", at)));
    expect(block, "프리셋 자리가 posFromLegacyPosition 에서 오지 않는다").toContain("posFromLegacyPosition");
    expect(block, "위치 목록을 화면이 손으로 적었다").toContain("SUBTITLE_POSITIONS");
    expect(src).toMatch(/setSub\(\(s\) => \(\{ \.\.\.s, pos: clampPos\(p\.pos\) \}\)\)/);
  });

  it("켜진 칩을 pos 에서 거꾸로 판정한다 — subtitle_position 을 읽지 않는다", () => {
    expect(src).toMatch(/samePos\(sub\.pos, p\.pos\)/);
    // settings.subtitle_position 은 이제 옛 프로젝트의 씨앗일 뿐이다. 그 밖에서 읽으면
    // 드래그로 옮긴 뒤에도 칩이 켜진 채라 화면이 거짓말을 한다.
    const chipIdx = src.indexOf("POSITION_PRESETS.map");
    expect(chipIdx, "칩을 프리셋 표에서 그리지 않는다").toBeGreaterThan(-1);
    const chipBlock = src.slice(chipIdx, src.indexOf("</div>", chipIdx));
    expect(chipBlock, "칩 켜짐을 subtitle_position 으로 판정한다").not.toContain("subtitle_position");
    expect(src, "옛 위치를 다시 저장하지 않는다").not.toContain("subtitle_position:");
  });
});

describe("⑥완성 — 미리보기 기준점", () => {
  // toAss 는 \pos 를 Alignment 2(하단) 기준으로 쓴다. 화면이 가운데 기준으로 그리면
  // 미리보기와 완성본의 자막 높이가 어긋나고, 줄 수가 바뀔 때마다 덜컹거린다.
  it("pos 는 글자 블록의 아랫변이다", () => {
    expect(src).toContain("translate(-50%, -100%)");
    expect(src, "가운데 기준으로 그리면 완성본과 어긋난다").not.toContain("translate(-50%, -50%)");
  });
});

describe("⑥완성 — 원본이 없는 옛 프로젝트", () => {
  // 자막이 구워진 완성본 위에 미리보기를 얹으면 자막이 둘로 보인다.
  // 그래서 원본이 없으면 조절 UI 자체가 없어야 한다.
  it("원본이 있을 때만 조절 UI 를 그린다", () => {
    const at = src.indexOf("const rawUrl");
    expect(at, "rawUrl 정의가 없다").toBeGreaterThan(-1);
    const line = src.slice(at, src.indexOf(";", at));
    expect(line, "rawUrl 이 render.rawUrl 에서 오지 않는다").toContain("render?.rawUrl");
    // 조절 UI 는 rawUrl 조건 안에서만 렌더된다
    expect(src).toMatch(/\{rawUrl &&/);
  });

  // 숨기기만 하면 사장님은 이 기능이 있는지조차 모른다 — 다시 만들 길을 알려야 한다.
  it("원본이 없으면 다시 만들라고 안내한다", () => {
    expect(src).toMatch(/\{!rawUrl &&/);
    expect(src).toContain("다시 합치기]로 완성본을 한 번 다시 만들어 주세요");
  });

  // 옛 프로젝트는 완성본을 그대로 재생한다(원본이 없으니 재생할 것이 그것뿐이다)
  it("원본이 없으면 완성본을 재생한다", () => {
    expect(src).toContain("src={rawUrl || render.url}");
  });
});
