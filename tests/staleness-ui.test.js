// 화면이 낡은 것을 알아보고 다음을 막는가 — 소스를 직접 훑는다.
// 이 저장소에는 화면 단위 테스트가 없고, 이 기능의 실패 모드는 "화면 하나를 빠뜨리는 것"이다.
// 스펙 docs/superpowers/specs/2026-07-29-staleness-invalidation-design.md
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");

const PAGES = [
  { step: "③ 목소리", path: "app/create/[id]/voice/page.js", fn: "isAudioStale" },
  { step: "④ 이미지", path: "app/create/[id]/images/page.js", fn: "isImageStale" },
  { step: "⑤ 영상", path: "app/create/[id]/video/page.js", fn: "isClipStale" },
];

describe("낡은 것이 있으면 다음 단계로 못 간다", () => {
  for (const { step, path, fn } of PAGES) {
    it(`${step} 화면이 ${fn} 로 판정한다`, () => {
      const src = read(path);
      expect(src).toContain(fn);
      expect(src).toMatch(/from ["'][./]*lib\/steps["']/);
    });

    it(`${step} 화면의 다음 버튼이 낡은 것에 잠긴다`, () => {
      // 다음 화면으로 보내는 버튼의 disabled 조건 안에 staleCount 가 있어야 한다.
      // 버튼 바로 위 안내문(hint)에도 staleCount 가 나오므로, disabled={...} 안쪽만
      // 좁혀서 봐야 잠금 조건 자체가 지워지는 회귀를 잡을 수 있다.
      const src = read(path);
      expect(src).toContain("staleCount");
      const pushIdx = src.indexOf("router.push");
      const buttonStart = src.lastIndexOf("<button", pushIdx);
      const button = src.slice(buttonStart, pushIdx);
      const disabledMatch = button.match(/disabled=\{([^}]*)\}/);
      expect(disabledMatch, `${path} 의 다음 버튼에 disabled 속성이 없다`).toBeTruthy();
      expect(disabledMatch[1], `${path} 의 다음 버튼 disabled 조건에 staleCount 가 없다`).toContain(
        "staleCount"
      );
    });
  }
});

describe("⑥ 완성", () => {
  it("클립·그림이 낡아도 잠근다 — 사이드바로 ⑥에 바로 들어올 수 있다", () => {
    // ④로 돌아가 그림을 다시 만들면 그림 주소가 바뀌어 클립이 낡는다. 그런데 renderKey 는
    // 소리·클립 주소와 문장만 이어 붙이므로 **그림을 다시 만든 것만으로는 완성본이 안 낡는다.**
    // 앞 단계의 [다음] 버튼 잠금은 사이드바 링크로 우회되므로(isReachable 은 status 만 본다),
    // ⑥이 스스로 클립·그림의 낡음까지 봐야 옛 mp4 가 내려받히지 않는다.
    const src = read("app/create/[id]/done/page.js");
    const at = src.indexOf("const stale");
    expect(at, "⑥ 화면에 stale 판정이 없다").toBeGreaterThan(-1);
    const staleLine = src.slice(at, src.indexOf(";", at));
    expect(staleLine, "⑥의 stale 이 클립 낡음을 보지 않는다").toContain("isClipStale");
    expect(staleLine, "⑥의 stale 이 그림 낡음을 보지 않는다").toContain("isImageStale");
  });

  it("낡은 완성본은 내려받기가 잠긴다", () => {
    const src = read("app/create/[id]/done/page.js");
    expect(src).toContain("isRenderStale");
    // download 속성이 붙은 <a> 를 구조로 찾아, 그 앵커를 감싼 삼항 조건의
    // 참 분기 조건 안에 !stale 이 있는지 본다 — 낱말 등장 순서만으로는
    // 조건이 실제로 앵커를 감싸는지 알 수 없다(주석 하나로도 순서가 어긋난다).
    const downloadIdx = src.indexOf("download");
    expect(downloadIdx, "download 속성이 붙은 내려받기 링크가 없다").toBeGreaterThan(-1);
    const anchorStart = src.lastIndexOf("<a", downloadIdx);
    const ternaryIdx = src.lastIndexOf("? (", anchorStart);
    expect(ternaryIdx, "내려받기 앵커를 감싸는 삼항 조건을 찾지 못했다").toBeGreaterThan(-1);
    const conditionStart = src.lastIndexOf("{", ternaryIdx);
    const condition = src.slice(conditionStart, ternaryIdx);
    expect(condition, "내려받기 앵커를 감싸는 조건에 !stale 이 없다").toContain("!stale");
    // 앵커가 참 분기 안에 있는지(거짓 분기로 넘어간 뒤가 아닌지)도 구조로 확인한다
    const falseBranchIdx = src.indexOf(") : (", ternaryIdx);
    expect(falseBranchIdx, "삼항 조건의 거짓 분기 경계를 찾지 못했다").toBeGreaterThan(-1);
    expect(falseBranchIdx).toBeGreaterThan(anchorStart);
  });
});

// 상한은 모델마다 다르다. 화면이 lib 의 기본값으로 판정하면 브라우저에는 서버 env 가 없어
// Kling(15초)에서 경고가 사라진다. 서버가 실어 보낸 clip_limits 를 봐야 한다.
describe("화면이 활성 모델의 상한을 본다", () => {
  for (const path of ["app/create/[id]/script/page.js", "app/create/[id]/video/page.js"]) {
    it(`${path} 가 clip_limits 를 읽는다`, () => {
      expect(read(path)).toContain("clip_limits");
    });
  }

  it("②대본 화면의 경고 판정이 실려 온 상한을 쓴다 — 기본 상수로 재지 않는다", () => {
    const src = read("app/create/[id]/script/page.js");
    // 판정식에 I2V_MAX_SECONDS 가 남아 있으면 브라우저 기본값(20)으로 재게 된다
    expect(src).not.toContain("c.seconds > I2V_MAX_SECONDS");
  });
});
