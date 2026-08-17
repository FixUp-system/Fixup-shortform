// 화면이 낡은 것을 알아보고 다음을 막는가 — 소스를 직접 훑는다.
// 이 저장소에는 화면 단위 테스트가 없고, 이 기능의 실패 모드는 "화면 하나를 빠뜨리는 것"이다.
// 스펙 docs/superpowers/specs/2026-07-29-staleness-invalidation-design.md
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");

// ⑤영상만 잠금 방식이 다르다. ③목소리·④이미지는 "남은 것이 있나"와 "낡았나"가 서로 다른
// 값(cuts 개수 vs staleCount)이라 disabled 안에 staleCount 를 따로 얹어야 한다. ⑤영상은
// Task 9 에서 "남은 컷"과 "낡은 컷"을 remainingCount 하나로 합쳤다 — 낡은 컷도 remainingCount
// 에 들어가므로, 완성 버튼은 remainingCount > 0 인 동안 아예 렌더되지 않는다(disabled 로
// 잠그는 게 아니라 갈래 자체가 다르다). 완성 버튼의 disabled 에 staleCount 를 남기면 그
// 조건은 항상 이미 remainingCount === 0 인 자리에서만 평가되므로 아무도 못 알아보는 죽은
// 코드가 된다 — 그래서 여기서만 검사 방식을 remainingCount 쪽으로 바꾼다.
// next 는 그 화면의 [다음 단계] 버튼이 보내는 경로다 — 잠금 검사가 그 push 를 겨냥한다.
const PAGES = [
  { step: "③ 목소리", path: "app/create/[id]/voice/page.js", fn: "isAudioStale", lock: "staleCount", next: "images" },
  { step: "④ 이미지", path: "app/create/[id]/images/page.js", fn: "isImageStale", lock: "staleCount", next: "video" },
  { step: "⑤ 영상", path: "app/create/[id]/video/page.js", fn: "isClipStale", lock: "remaining", next: "done" },
];

describe("낡은 것이 있으면 다음 단계로 못 간다", () => {
  for (const { step, path, fn, lock, next } of PAGES) {
    it(`${step} 화면이 ${fn} 로 판정한다`, () => {
      const src = read(path);
      expect(src).toContain(fn);
      expect(src).toMatch(/from ["'][./]*lib\/steps["']/);
    });

    if (lock === "staleCount") {
      it(`${step} 화면의 다음 버튼이 낡은 것에 잠긴다`, () => {
        // 다음 화면으로 보내는 버튼의 disabled 조건 안에 staleCount 가 있어야 한다.
        // 버튼 바로 위 안내문(hint)에도 staleCount 가 나오므로, disabled={...} 안쪽만
        // 좁혀서 봐야 잠금 조건 자체가 지워지는 회귀를 잡을 수 있다.
        const src = read(path);
        expect(src).toContain("staleCount");
        // ★ **다음 단계로 보내는** push 를 겨냥한다(아무 push 나 첫 것을 잡으면 안 된다).
        // ③목소리 화면에는 그 경로로 가는 넘김이 둘이다 — 말하는 모델(클립이 직접 말한다)에는
        // 만든 소리가 없어 낡을 것도 없고, 그 갈래는 화면 위쪽에서 먼저 return 된다.
        // 잠겨야 하는 것은 소리를 만든 뒤의 버튼이고 그것이 아래쪽(마지막) 것이다.
        const target = "router.push(`/create/${id}/" + next + "`)";
        const pushIdx = src.lastIndexOf(target);
        expect(pushIdx, `${path} 에 ${next} 로 보내는 router.push 가 없다`).toBeGreaterThan(-1);
        const buttonStart = src.lastIndexOf("<button", pushIdx);
        const button = src.slice(buttonStart, pushIdx);
        const disabledMatch = button.match(/disabled=\{([^}]*)\}/);
        expect(disabledMatch, `${path} 의 다음 버튼에 disabled 속성이 없다`).toBeTruthy();
        expect(disabledMatch[1], `${path} 의 다음 버튼 disabled 조건에 staleCount 가 없다`).toContain(
          "staleCount"
        );
      });
    } else {
      it(`${step} 화면의 다음 버튼이 남은 것(낡은 것 포함)에 잠긴다 — disabled 가 아니라 렌더 자체가 갈린다`, () => {
        const src = read(path);
        // 낡은 컷이 remainingCount 에 들어가야 이 갈래가 성립한다
        const remainingIdx = src.indexOf("const remainingCount");
        expect(remainingIdx, `${path} 에 remainingCount 정의가 없다`).toBeGreaterThan(-1);
        const remainingLine = src.slice(remainingIdx, src.indexOf(";", remainingIdx));
        expect(
          remainingLine,
          `${path} 의 remainingCount 가 isClipStale 을 포함하지 않는다 — 낡은 컷이 남은 것에 안 들어간다`
        ).toContain("isClipStale");

        // 완성(다음) 버튼은 remainingCount > 0 분기의 else 쪽에서만 렌더돼야 한다 —
        // 남은 게(낡은 것 포함) 있으면 그 분기 자체에 오지 않는다
        const branchIdx = src.indexOf("remainingCount > 0 ?");
        expect(branchIdx, `${path} 에 remainingCount > 0 분기가 없다`).toBeGreaterThan(-1);
        const elseIdx = src.indexOf(") : (", branchIdx);
        expect(elseIdx, `${path} 의 remainingCount 삼항에 else 분기 경계가 없다`).toBeGreaterThan(-1);
        const pushIdx = src.indexOf("router.push", branchIdx);
        expect(pushIdx, `${path} 에 다음 화면으로 보내는 router.push 가 없다`).toBeGreaterThan(-1);
        expect(
          pushIdx,
          `${path} 의 다음 버튼이 remainingCount > 0 분기의 참 쪽(=남은 게 있어도 렌더되는 자리)에 있다`
        ).toBeGreaterThan(elseIdx);
      });
    }
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
  // ②대본도 이 목록에 있었다 — 그 화면이 사라졌다(2026-08-16).
  for (const path of ["app/create/[id]/video/page.js"]) {
    it(`${path} 가 clip_limits 를 읽는다`, () => {
      expect(read(path)).toContain("clip_limits");
    });
  }
});

// 컷 하나만 있는 중간 상태가 실제로 생겼고, 그때 만들기 버튼이 사라졌다.
// 화면은 "하나라도 있나"가 아니라 "남은 게 있나"로 갈려야 한다.
describe("⑤영상 화면이 남은 컷을 센다", () => {
  const src = read("app/create/[id]/video/page.js");

  it("만들기 버튼 분기가 cuts.some((c) => c.video) 로 갈리지 않는다", () => {
    expect(src).not.toContain("const madeAny = cuts.some((c) => c.video)");
  });

  it("남은 컷 수를 세고, 그것으로 만들기를 띄운다", () => {
    expect(src).toContain("remainingCount");
    // 남은 것이 있으면 만들기, 없으면 완성하러 가기 — 그 분기가 remainingCount 로 갈린다
    const branchIdx = src.indexOf("remainingCount > 0 ?");
    expect(branchIdx).toBeGreaterThan(-1);
  });
});

// isImageStale 이 화풍을 보려면 project 를 함께 받아야 한다. 그런데 두 화면이 함수를
// 그대로 넘기고 있었다 — cuts.filter(isImageStale) / cuts.some(isImageStale).
// 그대로 두면 배열 번호가 project 자리에 들어가 화풍 판정이 조용히 죽는다. 화면이 아무
// 경고도 띄우지 않고, 옛 실사 그림이 클립·완성본까지 그대로 간다.
describe("그림 낡음 판정에 프로젝트를 넘긴다 — 화풍이 컷 밖에 있기 때문이다", () => {
  const CALLERS = [
    { step: "④ 이미지", path: "app/create/[id]/images/page.js" },
    { step: "⑥ 완성", path: "app/create/[id]/done/page.js" },
  ];

  for (const { step, path } of CALLERS) {
    it(`${step} 화면이 isImageStale 을 포인트프리로 넘기지 않는다`, () => {
      const src = read(path);
      // filter(isImageStale) · some(isImageStale) · map(isImageStale) 전부 금지
      expect(src, `${path} 가 isImageStale 을 그대로 넘긴다 — 배열 번호가 project 자리로 간다`)
        .not.toMatch(/\.(filter|some|every|map)\(\s*isImageStale\s*\)/);
    });

    it(`${step} 화면의 isImageStale 호출이 전부 인자를 둘 받는다`, () => {
      const src = read(path);
      const calls = [...src.matchAll(/isImageStale\(([^)]*)\)/g)].map((m) => m[1]);
      expect(calls.length, `${path} 에 isImageStale 호출이 없다`).toBeGreaterThan(0);
      for (const args of calls) {
        expect(args, `${path} 의 isImageStale(${args}) 이 프로젝트를 안 넘긴다`).toContain("project");
      }
    });
  }
});

// isClipStale 도 같은 이유로 project 를 함께 받는다 — 말하는 모델에서는 대사·목소리가
// 클립 프롬프트에 실리는데, 그 둘은 컷이 아니라 **캐스팅(project.cast)** 에 있다.
// 함수를 그대로 넘기면 배열 번호가 project 자리에 들어가 그 판정이 조용히 죽는다.
describe("클립 낡음 판정에 프로젝트를 넘긴다 — 대사·목소리가 컷 밖에 있기 때문이다", () => {
  const CALLERS = [
    { step: "⑤ 영상", path: "app/create/[id]/video/page.js" },
    { step: "⑥ 완성", path: "app/create/[id]/done/page.js" },
  ];

  for (const { step, path } of CALLERS) {
    it(`${step} 화면이 isClipStale 을 포인트프리로 넘기지 않는다`, () => {
      const src = read(path);
      expect(src, `${path} 가 isClipStale 을 그대로 넘긴다 — 배열 번호가 project 자리로 간다`)
        .not.toMatch(/\.(filter|some|every|map)\(\s*isClipStale\s*\)/);
    });

    it(`${step} 화면의 isClipStale 호출이 전부 프로젝트를 넘긴다`, () => {
      const src = read(path);
      const calls = [...src.matchAll(/isClipStale\(([^)]*)\)/g)].map((m) => m[1]);
      expect(calls.length, `${path} 에 isClipStale 호출이 없다`).toBeGreaterThan(0);
      for (const args of calls) {
        expect(args, `${path} 의 isClipStale(${args}) 이 프로젝트를 안 넘긴다`).toContain("project");
      }
    });
  }
});

// 영상 컨셉을 고르는 자리는 **자료 쪽**이다: 자료를 넣는 화면(/create)에서 처음 고르고,
// ①자료 화면에서 되돌아와 바꾼다. ②대본에는 두지 않는다.
describe("영상 컨셉은 자료 쪽에서 고른다", () => {
  const createSrc = read("app/create/page.js");
  const briefSrc = read("app/create/[id]/briefing/page.js");
  const scenarioSrc = read("app/create/[id]/scenario/page.js");
  const pickerSrc = read("components/StylePicker.jsx");

  it("칩을 프리셋 표에서 그린다 — 컨셉 이름을 화면에 박지 않는다", () => {
    expect(pickerSrc).toMatch(/from ["'][./]*lib\/styles["']/);
    expect(pickerSrc).toContain("STYLE_PRESETS.map");
  });

  // ★★ 2026-08-18 — 자리가 **하나로 모였다**(사용자 지시). 컨셉·사이즈·화질·공통 지시를
  //    ①자료에서 또 받고 있었고, 그것은 첫 화면에서 이미 받은 것을 두 번 묻는 일이었다.
  //    그래서 이 묶음의 이름("자료 쪽에서 고른다")은 그대로이고 자리만 하나다.
  it("첫 화면이 컨셉을 고른다", () => {
    expect(createSrc, "/create 가 StylePicker 를 안 쓴다").toContain("StylePicker");
  });

  it("①자료는 컨셉을 다시 묻지 않는다", () => {
    expect(briefSrc, "①자료가 컨셉을 또 받는다 — 첫 화면에서 이미 받았다")
      .not.toContain("StylePicker");
  });

  // 자리만 ②대본에서 ②시나리오로 바뀌었고 규칙은 같다 — 컨셉은 그림의 근거라 자료 쪽에 있어야 한다.
  it("②시나리오에는 컨셉 고르기가 없다", () => {
    expect(scenarioSrc).not.toContain("StylePicker");
    expect(scenarioSrc).not.toContain("STYLE_PRESETS");
  });

  it("/create 가 만들 때 컨셉을 함께 보낸다", () => {
    expect(createSrc).toMatch(/style:\s*\{\s*preset:/);
  });

  // ★ 옛 계약 둘을 지웠다(2026-08-18): "①자료의 보이는 모든 상태에 stylePicker 가 있다"와
  //   "그림이 이미 있으면 값 경고를 띄운다". 둘 다 **①자료에서 컨셉을 바꿀 수 있을 때만**
  //   뜻이 있던 못이다. 지금은 만들기 전에 한 번 고르므로, 이미 만든 그림을 낡게 만들
  //   길 자체가 그 화면에 없다 — 경고할 것도 없다.
  //   ⚠️ 대가는 분명하다: **시작한 뒤에는 컨셉을 바꿀 수 없다.** 바꿀 자리를 다시 열려면
  //      그때 이 경고(madeImages)도 함께 돌아와야 한다 — 없이 열면 산 그림이 조용히 낡는다.
});

// ★ 여기 있던 묶음 셋을 지웠다(2026-08-16) — 전부 ②대본 화면 하나를 재던 것이고,
// 그 화면이 원고와 함께 사라졌다: 컷 문장 손편집 · [이야기 더 들려주기]를 뻐다는 확인 · 촬영 용어를
// 안 보여 준다는 확인.
//
// ⚠ **지금 단계별 흐름에는 컷을 고치는 화면이 없다**(saveCut 호출처 0). 사장님이 고치는
//   자리는 ②시나리오로 옮겨갔고(대사·초), 컷은 그것을 코드가 옮겨 담는 산출물이 됐다.
//   화면·움직임·속도를 손으로 고치는 길은 다시 열지 않았다 — 열 것인지는 제품 결정이라 여기 적어 둔다.

// 글 쓰는 칸은 규칙이 한 벌이다(textarea.field). 두 벌로 두면 한쪽만 고치는 날이 오고,
// 그때 같은 일을 하는 칸이 화면마다 다르게 보인다.
//
// ⚠️ 실제로 겪었다: 공용 규칙을 뽑으면서 /create 쪽에 field 를 안 붙였더니 그 화면의 칸이
//    브라우저 기본값(흰 배경·13px)으로 돌아갔다. 클래스 하나가 빠진 것을 코드가 판정한다.
describe("글 쓰는 칸은 공용 규칙을 쓴다", () => {
  const FIELDS = [
    { 자리: "자료 넣는 화면", path: "app/create/page.js", cls: "composer-text" },
    { 자리: "컨셉 보정", path: "components/StylePicker.jsx", cls: "tray-input" },
  ];

  for (const { 자리, path, cls } of FIELDS) {
    it(`${자리} 칸이 field 와 함께 쓰인다`, () => {
      const src = read(path);
      const re = new RegExp(`className="field ${cls}"`);
      expect(src, `${path} 의 ${cls} 에 field 가 빠졌다 — 브라우저 기본 스타일로 돌아간다`)
        .toMatch(re);
    });
  }

  it("공용 규칙이 검정 바탕·스크롤 없음을 정한다", () => {
    const css = read("app/globals.css");
    const block = css.slice(css.indexOf("textarea.field {"), css.indexOf("textarea.field:focus"));
    expect(block).toContain("background: var(--deep)");
    expect(block).toContain("overflow-y: hidden");
    expect(block).toContain("resize: none");
  });
});
