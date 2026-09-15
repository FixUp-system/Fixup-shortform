// 보관함 상세의 완성본 자리 — **프로젝트가 고른 비율대로 선다** (2026-09-15 사장님 지적).
//
// ★★★ 실측으로 잡았다: 화면에 「비율 16:9」 칩이 떠 있는데 미리보기 자리는 360×220 이었다.
//   `--ar` 이 아예 안 실려 CSS 의 기본값(9:16)으로 서 있었던 것이다. 완성본이 있었다면
//   360×640 검은 상자 안에 360×202 영상이 떠서 위아래가 438px 비었다.
// ★★ 처방은 이미 저장소에 있다 — `components/SubtitleEditor.jsx` 와
//   `app/create/[id]/video/page.js` 가 같은 모양을 쓴다. 보관함만 안 받고 있었다:
//     · 바깥 칸(.done-preview) 에는 **숫자** `--ar`(가로/세로) → 폭 min(560, 640×ar)
//     · 액자(.preview-frame) 에는 aspectRatio + maxWidth → CSS 에 박힌 9/16 을 덮는다
//   ★ 둘 다 있어야 한다. 액자만 고치면 바깥 칸이 360px 이라 가로 영상이 그 안에서 또 줄고,
//     바깥만 고치면 액자가 9:16 이라 상자가 세로로 길게 남는다.
// ★ 값의 출처는 **프로젝트 하나**다(`lib/aspects.js` 의 aspectFor). 여기서 비율표를 다시
//   적으면 사이즈가 하나 늘 때 화면과 합성이 갈린다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/archive/[id]/page.js", "utf8");
const code = src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const css = readFileSync("app/globals.css", "utf8");

describe("보관함 상세 — 완성본 자리의 비율", () => {
  it("★★★ 비율표를 여기서 다시 적지 않는다 — lib/aspects 하나를 본다", () => {
    expect(code, "aspectFor 를 안 쓴다").toContain("aspectFor");
    expect(code, "lib/aspects 에서 안 가져온다").toMatch(/from\s+["'][^"']*lib\/aspects/);
    expect(code, "비율표를 화면에 다시 적었다").not.toMatch(/16\s*\/\s*9/);
  });

  it("★★★ 프로젝트가 고른 비율을 읽는다 — 안 고른 옛 영상은 기본으로 떨어진다", () => {
    // aspectFor 는 모르는 값·빈 값이면 9:16 으로 떨어진다(던지지 않는다).
    expect(code, "설정의 비율을 안 본다").toMatch(/aspectFor\((?:\s|\w|\.|\?)*aspect_ratio/);
  });

  it("★★★ 바깥 칸에 --ar 을 싣는다 — 폭이 min(560, 640×ar) 로 정해진다", () => {
    expect(code, "--ar 을 안 싣는다").toContain('"--ar"');
    // 바깥 칸의 --ar 은 **숫자**여야 한다 — CSS 가 calc(640px * var(--ar)) 로 곱한다.
    // "16 / 9" 같은 글자를 실으면 calc 가 통째로 무효가 돼 폭 규칙이 죽는다.
    expect(code, "--ar 이 숫자가 아니다").toMatch(/"--ar":\s*\w+\.width\s*\/\s*\w+\.height/);
  });

  it("★★★ 액자에도 비율을 준다 — CSS 에 박힌 9/16 을 덮어야 한다", () => {
    const frame = code.slice(code.indexOf('className="preview-frame"'));
    expect(frame.slice(0, 120), "액자가 맨몸이다").toMatch(/style=\{/);
    expect(code, "액자 비율이 없다").toContain("aspectRatio");
    expect(code, "세로로 긴 비율에서 화면을 넘는다").toContain("maxWidth");
  });

  it("★★ CSS 의 9/16 은 **기본값으로** 남는다 — 안 실은 화면이 갑자기 넓어지면 안 된다", () => {
    const i = css.indexOf(".preview-frame {");
    expect(i, ".preview-frame 규칙이 사라졌다").toBeGreaterThan(-1);
    const rule = css.slice(i, css.indexOf("}", i));
    expect(rule, "기본 비율이 없어졌다").toMatch(/aspect-ratio:\s*9\s*\/\s*16/);
  });
});
