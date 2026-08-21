// 라우트가 지켜야 할 계약 — 값이 나가는 문에 그물이 걸려 있는가.
//
// ★ 이 저장소에는 라우트 실행 인프라가 없다. 재는 것은 "그물을 불렀는가" 하나다
//   (경계값 자체는 lib 쪽 테스트가 이미 잰다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { isStepDoc, createProject } from "../lib/projects.js";
import { applyCasting } from "../app/api/reel/[id]/scenario/route.js";

const read = (p) => readFileSync(p, "utf8");
const clips = read("app/api/reel/[id]/clips/route.js");
const prompts = read("app/api/reel/[id]/prompts/route.js");
const scenario = read("app/api/reel/[id]/scenario/route.js");
const images = read("app/api/reel/[id]/images/route.js");

const ALL = [
  ["clips", clips], ["prompts", prompts], ["scenario", scenario],
  ["images", images],
  ["render", read("app/api/reel/[id]/render/route.js")],
  ["status", read("app/api/reel/[id]/status/route.js")],
];

describe("모든 라우트", () => {
  for (const [name, src] of ALL) {
    it(`${name} 은 withUser 뒤에 있다 — 신원 검증을 스스로 적지 않는다`, () => {
      expect(src).toContain("withUser");
    });
  }
});

describe("값이 나가는 문", () => {
  it("굽기는 정가 게이트를 지난다", () => {
    expect(clips).toContain("requireVideoCharge");
  });

  it("굽기는 프롬프트가 다 찼는지 본다 — 화면과 같은 판정을 쓴다", () => {
    expect(clips).toContain("isPromptsReady");
  });
});

describe("시나리오", () => {
  it("잠금 판정을 lib 에서 가져온다 — 손으로 적으면 화면과 갈린다", () => {
    expect(scenario).toContain("scenarioLock");
  });
});

describe("프롬프트", () => {
  it("사장님이 고친 값을 저장하는 문이 있다", () => {
    expect(prompts).toMatch(/export const PATCH/);
  });

  it("만드는 문도 있다", () => {
    expect(prompts).toMatch(/export const POST/);
  });

  it("only 가 배열이 아니면 막는다 — 조용히 무시하면 전부 다시 만든다", () => {
    expect(prompts).toContain("Array.isArray(only)");
  });
});

// ★ 이 결정의 load-bearing 부분 — reel 프로젝트가 옛 단계별 흐름(isStepDoc)의 문을
//   지나면 안 된다. 그 문 뒤(/api/projects/[id]/clips 등)는 clip_prompt 를 모른 채
//   컷을 i2v 로 구우면서 크레딧까지 받는다. 소스 문자열이 아니라 **실제 함수 호출**로
//   잰다 — isStepDoc 은 순수 함수라 여기서 직접 부를 수 있다.
describe("종류 격리", () => {
  it("kind:\"reel\" 문서는 isStepDoc 이 아니다 — 옛 유료 라우트가 이 문서를 못 본다", () => {
    expect(isStepDoc({ kind: "reel" })).toBe(false);
  });

  it("옛 문서(kind 없음)는 여전히 isStepDoc 이다 — 회귀가 없다", () => {
    expect(isStepDoc({ cuts: [] })).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// 2026-08-21 리뷰(Critical 5 · Important 7) 이후 — 고친 자리를 덮는 테스트.
// ────────────────────────────────────────────────────────────────────────

describe("I11 — KINDS 를 읽는 유일한 자리는 createProject 다", () => {
  it('createProject({kind:"reel"}) 이 안 던진다 — isStepDoc 단정은 KINDS 를 안 본다(리뷰 정정)', async () => {
    const project = await createProject({
      ownerId: "test-owner",
      kind: "reel",
      material: { text: "테스트 소재", photos: [] },
      settings: {},
    });
    expect(project.kind).toBe("reel");
  });
});

describe("C5 — 캐스팅이 컷에 ref_ids 를 꽂는다(r2v 가 켜지는 유일한 근거)", () => {
  it("캐스팅이 사람을 찾은 컷에는 ref_ids 가 생긴다", () => {
    const cuts = [
      { idx: 0, shows: "a barista pours coffee behind the counter" },
      { idx: 1, shows: "an empty quiet street at dawn" },
    ];
    const cast = [{ id: "c1", who: "barista", voice: "warm, unhurried", cuts: [0] }];
    const { cuts: out, cast: withRefs } = applyCasting(cuts, cast, [], [], []);
    expect(out[0].ref_ids).toContain("c1");
    expect(out[1].ref_ids).toBeUndefined();
    expect(withRefs).toHaveLength(1);
  });

  it("사물 사진도 같은 자리로 꽂힌다", () => {
    const cuts = [{ idx: 0, shows: "a product on a table" }];
    const props = [{ photo_id: "p1", cuts: [0] }];
    const { cuts: out } = applyCasting(cuts, [], props, [], []);
    expect(out[0].ref_ids).toContain("p1");
  });

  it("아무도 못 찾으면 ref_ids 가 안 생긴다 — 그때는 i2v 로 가는 것이 맞다(참조가 없다)", () => {
    const cuts = [{ idx: 0, shows: "a still product shot" }];
    const { cuts: out } = applyCasting(cuts, [], [], [], []);
    expect(out[0].ref_ids).toBeUndefined();
  });

  it("scenario 라우트가 실제 캐스팅 장치를 부른다 — 새 장치를 만들지 않는다", () => {
    expect(scenario).toContain("buildCastMessages");
    expect(scenario).toContain("resolveCastRefs");
    expect(scenario).toContain("mergeCastIntoCuts");
    expect(scenario).toContain("applyCasting");
  });
});

describe("C3·C4 — 목소리 폴백과 내레이션", () => {
  it("voice 가 빈 문자열이어도 화면 안 대사 컷이 있으면 캐스팅을 만든다", () => {
    // buildReelCast 는 export 되지 않는다(내부 폴백) — 계약은 소스에서 "!voice" 로 통째로
    // 거르지 않는다는 것을 못 박는다. speakingCuts.length 만 보고 만든다.
    expect(scenario).not.toMatch(/if \(!voice \|\| !speakingCuts\.length\)/);
    expect(scenario).toMatch(/if \(!speakingCuts\.length\)/);
  });

  it("narrator_voice 를 scenario.voice 로 채운다 — speechFor 의 내레이션 갈래가 읽는 값", () => {
    expect(scenario).toContain("narrator_voice: scenario.voice");
  });
});

describe("I5 — 시나리오 재실행이 이미 산 클립을 지우지 않는다", () => {
  it("상한을 lib/pricing.js 의 MAX_SCENARIO_TRIES 하나로 잰다", () => {
    expect(scenario).toContain("MAX_SCENARIO_TRIES");
  });

  it("컷에 구운 클립(video.url)이 있으면 시나리오를 다시 못 쓴다", () => {
    expect(scenario).toContain("c.video?.url");
  });
});

describe("C1·C2 — 굽기 성공이 문서에 남고, 재진입이 막힌다", () => {
  it("성공하면 reel.status 를 rendering 밖으로 옮긴다", () => {
    expect(clips).toMatch(/\.then\(/);
    expect(clips).toContain('status: "clips"');
  });

  it("이미 만드는 중이면 청구 앞에서 막는다", () => {
    expect(clips).toContain('reelOf(project).status === "rendering"');
  });
});

describe("I7 — 그림 재진입 잠금과 횟수 상한", () => {
  it("잠금 판정은 lib/reel/doc.js 하나다", () => {
    expect(images).toContain("isImagesLocked");
    expect(images).toContain("imageTriesLeft");
  });
});

describe("I8 — 그림 만들기 중간 실패가 앞 컷의 값을 지키는가", () => {
  it("catch 안에서도 여기까지 만든 cuts 를 저장한다", () => {
    const catchBlock = images.slice(images.indexOf("} catch (e) {"));
    expect(catchBlock).toContain("cuts: next");
  });
});

describe("I9 — 프롬프트 PATCH 에 길이 상한이 있다", () => {
  it("LEDGER_PROMPT_MAX 를 그대로 쓴다 — 원장이 자르는 자리와 같은 값", () => {
    expect(prompts).toContain("LEDGER_PROMPT_MAX");
  });
});

describe("I10 — 종류 격리가 prompts·clips 에도 있다", () => {
  it("prompts 의 POST·PATCH 둘 다 kind 를 본다", () => {
    const hits = prompts.match(/kind !== "reel"/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("clips 도 kind 를 본다", () => {
    expect(clips).toContain('kind !== "reel"');
  });
});
