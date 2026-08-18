// 버튼은 세 크기뿐이다 — 화면마다 새 치수를 만들지 않는다.
//
// 사장님 지적(2026-08-18): "어떤 버튼은 크기가 작고 어떤 버튼은 크고, 일관성이 없다."
//
// 세어 보니 사실이었다. 같은 `.mini` 가 자리마다 다른 몸을 하고 있었다:
//   기본 6/12·12px(높이 자유) · 상단바 50px · 대화상자 46px · 마이페이지 46px ·
//   조절판 38px · 수정 지시줄 13/18·14px · 작성줄 9/16·14px
// 그리고 `.cta` 는 16px·12/20 이라 같은 줄에 선 `.mini` 보다 눈에 띄게 크다 —
// 실행줄 하나에 키가 다른 버튼 둘이 나란히 서 있었다.
//
// 원인은 **치수를 부르는 이름이 없었다**는 것이다. 이름이 없으면 자리마다 픽셀을 새로
// 적게 되고, 그 픽셀은 서로를 모른다. 높이 셋에 이름을 준다:
//   --ctl-sm  카드 안의 보조 조작(순서·삭제)
//   --ctl-md  실행줄 — 이 줄에 선 버튼은 주·보조 가리지 않고 **같은 키**다
//   --ctl-lg  큰 자리(상단바·대화상자·계정)
//
// ⚠️ `--ctl-h`(조절판 38px)는 건드리지 않는다. 그것은 버튼 사다리가 아니라 ⑥완성 조절판의
//    **컨트롤 높이**이고, 세그먼트·색 견본·슬라이더 손잡이가 같은 값으로 맞물려 있다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const rule = (sel) => {
  const at = css.indexOf(`\n${sel} {`);
  return at === -1 ? "" : css.slice(at, css.indexOf("}", at));
};

describe("버튼 치수 — 이름 있는 세 단", () => {
  it("★ 사다리가 토큰으로 있다", () => {
    for (const t of ["--ctl-sm", "--ctl-md", "--ctl-lg"]) {
      expect(css, `${t}: 선언이 없다 — 이름이 없으면 자리마다 픽셀을 새로 적게 된다`).toContain(`${t}:`);
    }
  });

  it("★★ 기본 버튼 둘이 사다리 위에 선다", () => {
    expect(rule(".mini"), ".mini 가 높이를 안 정한다 — 글자 크기에 따라 키가 흔들린다")
      .toMatch(/height:\s*var\(--ctl-/);
    expect(rule(".cta"), ".cta 가 높이를 안 정한다").toMatch(/height:\s*var\(--ctl-/);
  });

  it("★★ 실행줄에 선 버튼은 주·보조가 같은 키다", () => {
    const row = css.slice(css.indexOf(".step-actions {"), css.indexOf(".side-new"));
    expect(row, "실행줄이 버튼 키를 안 맞춘다 — 주 버튼만 커서 줄이 들쭉날쭉하다")
      .toMatch(/\.step-actions\s+\.(mini|cta)[\s\S]{0,160}height:\s*var\(--ctl-md\)/);
  });

  it("★★ 버튼 자리에 손으로 적은 높이가 없다", () => {
    // 예전 예외들: 50px(상단바) · 46px(대화상자·계정)
    for (const [sel, px] of [[".home-header .mini", "50px"], [".dlg-actions .mini", "46px"], [".me-row .mini", "46px"], [".me-row .cta", "46px"]]) {
      expect(rule(sel), `${sel} 이 아직 ${px} 를 손으로 적는다`).not.toContain(px);
    }
  });

  it("★ 조절판 높이는 버튼 사다리가 아니다 — 그대로 둔다", () => {
    expect(css, "--ctl-h: 가 사라졌다 — ⑥완성 조절판의 세그먼트·슬라이더가 함께 어긋난다")
      .toContain("--ctl-h:");
  });
});

// 간격도 이름을 가진다 — 다만 **카드 층위만**이다.
//
// 세어 보니 gap 이 1·2·4·6·7·8·9·10·12·14·20·22px 열두 가지, margin-top 이 열한 가지였다.
// 전부 4의 배수로 스냅하는 것이 깔끔해 보이지만 **하면 안 된다**: 조밀한 묶음의 값들은
// 실측으로 맞춘 것이다(`.sub-row .chips { gap: 7px }` 는 234px 칸에 언어 칩 셋을 한 줄로
// 넣으려고 잰 값이고, 그것이 어긋나 중국어 칩만 다음 줄로 내려간 적이 있다).
//
// 그래서 사다리를 **카드와 그 안의 단** 에만 적용한다 — 사장님 눈에 "배치"로 읽히는 층이다.
// 칩·배지처럼 글자에 붙어 사는 값들은 그 자리의 실측이 계속 정한다.
describe("간격 — 카드 층위의 사다리", () => {
  it("★ 사다리가 토큰으로 있다", () => {
    for (const t of ["--sp-1", "--sp-2", "--sp-3", "--sp-4", "--sp-5"]) {
      expect(css, `${t}: 선언이 없다`).toContain(`${t}:`);
    }
  });

  it("★★ 카드 층위 규칙이 손으로 적은 px 대신 사다리를 쓴다", () => {
    for (const sel of [".panel", ".plan-row", ".plan-field", ".step-actions", ".workbench-step + .workbench-step"]) {
      const r = rule(sel);
      expect(r, `${sel} 규칙을 못 찾았다`).toBeTruthy();
      expect(r, `${sel} 이 아직 px 로 간격을 적는다`).toMatch(/var\(--sp-/);
    }
  });

  it("★ 조밀한 묶음은 사다리 밖이다 — 실측값을 지킨다", () => {
    expect(rule(".sub-row .chips"), "언어 칩 줄바꿈 금지가 사라졌다").toMatch(/nowrap/);
    expect(css, "칩 간격 실측값(7px)이 사라졌다 — 중국어 칩이 다시 줄을 넘는다")
      .toMatch(/\.chips \{[^}]*gap:\s*7px/);
  });
});

// ★★ 한 화면을 위한 치수는 **그 화면의 이름 아래**에 둔다(2026-08-18).
//    `.step-actions .fwd .mini` 라는 전역 선택자가 "실행줄 오른쪽의 모든 작은 버튼"을
//    132px 로 늘리고 있었다. 완성 화면의 [내려받기] 짝을 맞추려고 쓴 값인데, ②시나리오의
//    [장면 추가] 기호 버튼까지 늘려 놓았다 — 사장님이 "추가 버튼 크기가 안 줄어든다"고
//    했고, 선택자가 셋이라 나중에 쓴 규칙이 이기지도 못했다.
describe("치수는 화면 이름 아래에 산다", () => {
  it("★★ 실행줄 오른쪽의 모든 작은 버튼을 키우는 전역 규칙이 없다", () => {
    expect(css, "전역 선택자가 되살아났다 — 다른 화면의 아이콘 버튼까지 커진다")
      .not.toMatch(/\.step-actions \.fwd \.mini\s*\{/);
    expect(css, "결과 줄 전용 이름이 없다").toMatch(/\.step-actions--result \.fwd \.mini/);
  });

  it("★ 그 이름을 쓰는 화면이 실제로 있다 — 이름만 만들고 안 쓰면 치수가 사라진다", () => {
    const done = readFileSync("app/create/[id]/done/page.js", "utf8");
    const ad = readFileSync("app/ads/[id]/page.js", "utf8");
    expect(done, "⑥완성이 결과 줄 이름을 안 쓴다").toContain("step-actions--result");
    expect(ad, "광고 완성이 결과 줄 이름을 안 쓴다").toContain("step-actions--result");
  });
});
