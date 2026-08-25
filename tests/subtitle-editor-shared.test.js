// 자막 편집기는 **한 벌이다** — 단계별 ⑥완성과 reel ⑥완성이 같은 컴포넌트를 쓴다.
//
// 왜 소스를 훑는가: 이 저장소에는 화면 단위 테스트가 없고(tests/subtitle-ui.test.js 가
// 선례다), 이 기능의 실패 모드는 "화면이 값을 손으로 다시 적는 것"이라 소스에서 잡힌다.
//
// ★ 이 파일이 재는 것은 **공용화의 계약**이다: ①값은 여전히 lib/subtitles.js 하나에서
//   온다 ②두 화면이 마크업을 각자 들고 있지 않다 ③미리보기는 **자막 없는 영상** 위에만
//   그린다 ④reel 도 고친 자막을 저장하고 다시 합성할 수 있다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const editor = readFileSync("components/SubtitleEditor.jsx", "utf8");
const step = readFileSync("app/create/[id]/done/page.js", "utf8");
const reel = readFileSync("app/reel/[id]/done/page.js", "utf8");
const reelRoute = readFileSync("app/api/reel/[id]/route.js", "utf8");

describe("공용 자막 편집기", () => {
  it("화면이다 — use client 로 시작한다", () => {
    expect(editor.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("값은 lib/subtitles.js 에서 온다 — 컴포넌트가 숫자를 새로 정하지 않는다", () => {
    expect(editor).toMatch(/from ["'][./]*lib\/subtitles["']/);
    for (const name of [
      "normalizeSubtitle", "DEFAULT_SUBTITLE", "SUBTITLE_FONTS", "SUBTITLE_POSITIONS",
      "SIZE_MIN", "SIZE_MAX", "clampPos", "outlineFor", "rimFor", "buildCues",
      "subtitleStyle", "posFromLegacyPosition", "SUBTITLE_LINE_HEIGHT",
    ]) {
      expect(editor, `${name} 을 lib 에서 안 가져온다`).toContain(name);
    }
  });

  it("폰트 이름·크기 범위·여백 비율을 컴포넌트에 박지 않는다", () => {
    expect(editor).not.toMatch(/Black Han Sans|Gowun Dodum|Pretendard/);
    expect(editor).not.toMatch(/min="0\.7"|max="1\.6"/);
    expect(editor, "여백 비율을 손으로 적었다").not.toMatch(/0\.12|0\.18|0\.82/);
  });

  it("비율도 lib/aspects 에서 온다", () => {
    expect(editor).toMatch(/from ["'][./]*lib\/aspects["']/);
    expect(editor).toContain("aspectFor");
  });

  // ★ 미리보기는 자막이 **안 구워진** 영상 위에만 그린다. 구워진 완성본 위에 얹으면
  //   자막이 둘로 보인다 — 공용화하면서 이 사정이 사라지면 두 화면이 함께 깨진다.
  it("자막을 그리는 것은 자막 없는 영상을 틀 때뿐이다", () => {
    expect(editor, "자막 없는 원본 갈래가 없다").toMatch(/rawUrl/);
    const at = editor.indexOf("const showingRaw");
    expect(at, "showingRaw(지금 자막 없는 영상을 트는가) 판정이 없다").toBeGreaterThan(-1);
    const line = editor.slice(at, editor.indexOf(";", at));
    expect(line, "완성본이 있는데도 자막을 그린다").toMatch(/dirty/);
    expect(line).toMatch(/finalSrc/);
    // 그리는 자리(opacity)가 그 판정 하나를 본다
    expect(editor).toMatch(/opacity: showingRaw \? 1 : 0/);
  });

  it("pos 는 글자 블록의 아랫변이다 — ffmpeg 의 \\pos + Alignment 2 와 같은 기준", () => {
    expect(editor).toContain("translate(-50%, -100%)");
    expect(editor).not.toContain("translate(-50%, -50%)");
  });

  it("끌어서 옮기고, 화면 밖은 clampPos 가 되돌린다", () => {
    expect(editor).toMatch(/onPointerDown/);
    expect(editor).toMatch(/onPointerMove/);
    expect(editor).toContain("clampPos");
  });
});

describe("두 화면이 같은 편집기를 쓴다", () => {
  for (const [name, src] of [["단계별 ⑥완성", step], ["reel ⑥완성", reel]]) {
    it(`${name} 이 공용 컴포넌트를 부른다`, () => {
      expect(src).toMatch(/from ["'][^"']*components\/SubtitleEditor["']/);
      expect(src).toMatch(/<SubtitleEditor/);
    });

    it(`${name} 이 조절 UI 를 자기 안에 다시 그리지 않는다`, () => {
      for (const cls of ["sub-slider", "sub-swatch", "sub-select", "subpanel"]) {
        expect(src, `${cls} 마크업이 화면에 남아 있다`).not.toContain(cls);
      }
    });
  }

  // 씨 뿌리기(저장된 설정 → 없으면 옛 위치)도 한 벌이다 — 두 화면이 각자 적으면 갈린다.
  it("초기값 규칙도 공용이다", () => {
    expect(editor).toMatch(/export function seedSubtitle/);
    expect(step).toContain("seedSubtitle");
    expect(reel).toContain("seedSubtitle");
  });
});

describe("reel ⑥완성 — 고친 자막을 저장하고 다시 합성한다", () => {
  it("자막 설정을 reel 전용 문으로 저장한다 — 단계별 문(/api/projects)은 종류 있는 문서를 404 로 막는다", () => {
    expect(reel).toMatch(/fetch\(`\/api\/reel\/\$\{id\}`/);
    expect(reel).toMatch(/"PATCH"/);
    expect(reel, "저장하는 값의 모양이 단계별과 다르다").toMatch(/settings: \{ subtitle/);
    // 단계별 문으로 부르면 404 다 — 주석에서 그 문을 **언급**하는 것은 괜찮다.
    expect(reel, "단계별 흐름의 문을 두드린다").not.toMatch(/fetch\(`\/api\/projects/);
  });

  it("다시 합성하기 전에 고친 자막을 먼저 저장한다 — 안 그러면 옛 자막으로 구워진다", () => {
    const at = reel.indexOf("async function startRender");
    expect(at, "startRender 가 없다").toBeGreaterThan(-1);
    const body = reel.slice(at, reel.indexOf("\n  }", at));
    expect(body, "굽기 전에 저장을 안 한다").toMatch(/await saveSubtitle\(\)/);
    // 굽기 요청은 주석 속 파일 경로가 아니라 **실제 fetch** 로 찾는다
    const bake = body.indexOf("/render`");
    expect(bake, "굽기 요청을 못 찾겠다").toBeGreaterThan(-1);
    expect(body.indexOf("await saveSubtitle()"), "저장이 굽기 요청보다 뒤에 있다").toBeLessThan(bake);
  });

  it("고친 자막이 아직 안 들어갔다고 말해 준다", () => {
    // ★ 2026-08-25 — 버튼 옆 설명을 걷어냈다(값·안쪽 사정을 설명하지 않는다).
    //   남긴 것은 **모르면 고친 것을 잃는** 경고 하나뿐이다.
    expect(reel).toContain("고친 자막은 아래 버튼을 눌러야 영상에 들어가요");
  });

  // 자막 없는 영상이 있어야 미리보기를 얹을 수 있다. reel 은 완성본의 원본이 아직
  // 문서에 안 실리므로(render 라우트가 rawUrl 을 안 남긴다) **클립**을 쓴다 —
  // 클립에는 자막이 안 구워져 있다(자막은 합성에서 굽힌다).
  it("자막 없는 영상은 클립에서 온다", () => {
    expect(reel).toMatch(/rawUrl=\{/);
    expect(reel).toMatch(/video\?\.url/);
  });

  it("폴링은 lib/poll 한 벌 그대로다 — setInterval 을 새로 돌리지 않는다", () => {
    expect(reel).not.toContain("setInterval");
    expect(reel).toContain("startPolling");
  });
});

describe("reel 저장 라우트 — 단계별과 같은 모양", () => {
  it("PATCH 가 있고 신원 검증을 지난다", () => {
    expect(reelRoute).toMatch(/export const PATCH = withUser\(/);
  });

  it("다른 종류의 문서를 막는다 — 격리는 양방향이다", () => {
    const at = reelRoute.indexOf("export const PATCH");
    const body = reelRoute.slice(at);
    expect(body).toMatch(/kind !== "reel"/);
  });

  it("되돌리기 규칙을 라우트가 다시 적지 않는다 — lib/subtitles 의 normalizeSubtitle 하나다", () => {
    expect(reelRoute).toMatch(/from ["'][./]*lib\/subtitles(\.js)?["']/);
    expect(reelRoute).toContain("normalizeSubtitle");
  });

  it("자막 말고 다른 설정은 이 문으로 안 들어온다 — settings 를 통째로 머지하지 않는다", () => {
    const at = reelRoute.indexOf("export const PATCH");
    const body = reelRoute.slice(at);
    expect(body, "settings 를 통째로 머지한다").not.toMatch(/\.\.\.body\.settings/);
  });
});
