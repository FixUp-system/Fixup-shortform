// 사용자에게 불필요한 정보를 걷는다 (2026-09-14 사장님 지시).
//
// ★ 걷은 것 중 **다른 판이 안 덮는 자리**만 여기서 잰다:
//   · 상단 띠의 BETA / "시험 서비스" 문구 — 돈을 받는 서비스에 늘 떠 있었다
//   · 사이드바의 누를 수 없는 [템플릿 · 준비 중]
//   · 옵션 트레이의 설명 줄 — LLM 지문(beat)이 반말·설명투 그대로 나가던 것을 보이는 한 줄(note)로
// ★ 보관함 프롬프트·③이미지 지문·PromptWithKo 는 각자의 판(archive-*, reel-images-auto,
//   prompt-translation)이 잰다.
// ⚠️ 주석은 걷어내고 판정한다 — 걷은 이유를 적은 주석이 단정에 걸리면 안 된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AD_FORMATS } from "../lib/ad/options.js";
import { REEL_CONCEPTS } from "../lib/reel/concepts.js";

const code = (p) => readFileSync(p, "utf8")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("상단 띠 — BETA 문구가 없다", () => {
  const shell = code("components/AppShell.jsx");

  it("★ 'BETA'·'시험 서비스' 를 그리지 않는다", () => {
    expect(shell, "BETA 가 돌아왔다").not.toContain("BETA");
    expect(shell, "시험 서비스 문구가 돌아왔다").not.toContain("시험 서비스");
  });

  it("가운데 칸은 남는다 — 계정 묶음 자리가 그 칸을 기준으로 잡힌다", () => {
    expect(shell).toContain('className="belt-mid"');
  });
});

describe("사이드바 — 누를 수 없는 [템플릿] 이 없다", () => {
  it("★ '템플릿' 자리가 없다", () => {
    const side = code("components/Sidebar.jsx");
    expect(side, "[템플릿 · 준비 중]이 돌아왔다").not.toContain("템플릿");
    expect(side).not.toMatch(/name="template"/);
  });
});

describe("옵션 트레이 — 설명 줄은 note 다(beat 는 LLM 지문)", () => {
  it("★ 원클릭 트레이가 포맷의 note 를 그린다", () => {
    const tray = code("components/AdOptionTray.jsx");
    expect(tray).toMatch(/AD_FORMATS\.find\(\(f\) => f\.id === format\)\?\.note/);
    expect(tray, "LLM 지문(beat)이 화면에 나간다").not.toMatch(/\?\.beat\b/);
  });

  it("★ reel 첫 화면이 컨셉의 note 를 그린다([알아서]는 desc 로 떨어진다)", () => {
    const page = code("app/reel/new/page.js");
    expect(page).toMatch(/c\?\.note \|\| c\?\.desc/);
    expect(page, "LLM 지문(beat)이 화면에 나간다").not.toMatch(/c\?\.beat\b/);
  });

  it("표에 note 가 빠짐없이 있다 — 빠지면 트레이 줄이 빈다", () => {
    for (const f of AD_FORMATS) expect(f.note, `포맷 ${f.id} 에 note 가 없다`).toBeTruthy();
    // beat 가 없는 컨셉([알아서])은 desc 로 떨어지므로 note 를 요구하지 않는다.
    for (const c of REEL_CONCEPTS.filter((x) => x.beat)) {
      expect(c.note, `컨셉 ${c.id} 에 note 가 없다`).toBeTruthy();
    }
  });
});
