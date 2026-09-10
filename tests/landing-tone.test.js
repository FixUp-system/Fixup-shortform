// 랜딩과 앱은 **한 벌이다** (2026-09-10 사장님: "메인 랜딩 페이지 검은색인데 영상
// 만들러가면 톤이 다르잖아 두개를 통일해줘").
//
// ★★★ 무엇이 갈려 있었나. 09-08 에 앱 전체를 밝은 벌 한 벌로 바꾸고 어두운 벌을 파일째
//   지웠는데, 09-09 저녁에 **랜딩만** 어두운 무대가 됐다(사장님이 준 캡처를 옮긴 것).
//   그때 인계 문서가 이렇게 적었다 — *"되돌린 게 아니라 경계가 하나 생겼다"*.
//   09-10 에 사장님이 그 경계를 없애기로 했다: **랜딩을 밝은 쪽으로** 맞춘다.
//
// ★★ 다만 **전부 밝게 하는 것이 아니다.** 이 저장소에는 벌을 안 타는 자리가 둘 있고,
//   그 둘을 함께 밝게 하면 화면이 망가진다:
//     ① 사진 **위에** 얹힌 글자 — `--on-media`. 밑에 깔린 것이 우리 바탕이 아니라
//        사진이라 바탕색을 따라갈 이유가 없다(2026-08-20 에 검정 위 검정이 됐다).
//     ② 무엇을 **보는** 무대 — `--stage-dark`. 자막 무대가 밝으면 흰 자막이 안 보인다.
//   랜딩의 히어로는 ②다 — 영상을 보는 자리다. 그래서 그 한 장만 어둡게 남는다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
// 규칙만 잘라 본다 — 파일 전체에서 문자열을 찾으면 남의 규칙에 걸려 거짓 통과한다.
//
// ★ 같은 선택자가 **여러 규칙**에 나온다(예: `.home .stage-band, .home .stage-steps { … }`
//   의 기둥 규칙과, 색을 정하는 자기 규칙). 첫 번째만 집으면 엉뚱한 규칙을 재게 된다 —
//   실제로 그렇게 한 번 틀렸다. 그래서 **그 선택자를 쓰는 규칙을 전부** 모아 본다.
// ★ 정규식으로 짐작하지 않는다 — 주석·CRLF·중첩 때문에 한 번 헛짚었다. 규칙을 실제로
//   가르고, 선택자 **목록의 한 조각**과 정확히 같은지로 고른다.
const RULES = (() => {
  const out = [];
  // 주석을 먼저 걷는다 — 주석 안의 예시 코드가 규칙으로 읽히면 거짓 통과가 난다.
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const parts = m[1].split(",").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
    out.push({ parts, body: m[2] });
  }
  return out;
})();
const rule = (selector) =>
  RULES.filter((r) => r.parts.includes(selector)).map((r) => r.body).join("\n");

describe("랜딩 — 앱과 같은 바탕에 선다", () => {
  it("★★★ 뿌리가 **앱 토큰**을 쓴다 — 검은 바탕이 아니다", () => {
    const home = rule(".home");
    expect(home, ".home 규칙이 없다").toBeTruthy();
    expect(home, "랜딩 바탕이 앱과 다르다").toMatch(/background:\s*var\(--bg\)/);
    expect(home, "랜딩 글자색이 앱과 다르다").toMatch(/color:\s*var\(--ink\)/);
  });

  it("★★★ 어두운 벌 토큰이 **남아 있지 않다** — 쓰지 않는 색은 다음 사람에게 거짓말을 한다", () => {
    // 이 저장소는 09-09 에 소비자가 0 이 된 토큰 넷을 같은 이유로 지웠다.
    for (const dead of ["--stage-bg", "--stage-ink", "--stage-chrome", "--stage-dim", "--stage-panel", "--stage-line", "--stage-edge"]) {
      expect(css, `${dead} 가 아직 있다`).not.toMatch(new RegExp(`\\${dead}\\s*:`));
      expect(css, `${dead} 를 아직 쓴다`).not.toContain(`var(${dead})`);
    }
  });

  it("★★ 절 사이의 선과 글자가 **앱의 것**이다", () => {
    expect(rule(".home .stage-steps"), "구분선이 어두운 벌 값이다").toMatch(/1px solid var\(--line\)/);
    expect(rule(".home .stage-step h3"), "제목이 앱 글자색이 아니다").toMatch(/color:\s*var\(--ink\)/);
    expect(rule(".home .stage-step p"), "본문이 앱 보조 글자색이 아니다").toMatch(/color:\s*var\(--ink-soft\)/);
  });
});

describe("랜딩 — 벌을 안 타는 자리는 **그대로 둔다**", () => {
  it("★★★ 히어로 무대는 여전히 어둡다 — 영상을 보는 자리다", () => {
    // ⚠️ 여기를 밝게 하면 껍데기의 흰 글자(브랜드·버튼)가 사진에 묻힌다.
    //   `.stage-cover-img` 가 불투명도를 낮춰 이 바탕이 비치게 만들어 글자를 읽히게 한다.
    expect(rule(".home .stage-cover"), "히어로 바탕이 밝아졌다 — 흰 글자가 묻힌다")
      .toMatch(/background:\s*var\(--stage-dark\)/);
  });

  it("★★★ 사진 위 글자는 **여전히 흰색**이다 — 바탕이 밝아졌다고 따라가면 안 된다", () => {
    // 껍데기 브랜드 · 큰 재생 표시 · 타일의 작은 재생 표시 · [더 보러가기].
    for (const sel of [".home .stage-brand", ".home .stage-bigplay", ".home .stage-play", ".home .stage-more"]) {
      expect(rule(sel), `${sel} 이 사진 위에서 바탕색을 따라간다`).toMatch(/color:\s*var\(--on-media\)/);
    }
  });

  it("★★ 사진 위 유리 테두리(`--stage-glass`)는 살아 있다", () => {
    // 흰 8~22% 테두리는 **어두운 스크림 위**에서만 성립한다. 그 넷은 전부 사진 위다.
    expect(css, "유리 테두리가 통째로 사라졌다").toContain("var(--stage-glass)");
  });
});
