// 라우트가 지켜야 할 계약 — 값이 나가는 문에 그물이 걸려 있는가.
//
// ★ 이 저장소에는 라우트 실행 인프라가 없다. 재는 것은 "그물을 불렀는가" 하나다
//   (경계값 자체는 lib 쪽 테스트가 이미 잰다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { isStepDoc, createProject } from "../lib/projects.js";
import { applyCasting } from "../app/api/reel/[id]/scenario/route.js";
import { mergeImages } from "../app/api/reel/[id]/images/route.js";
import { runReelClips } from "../lib/reel/pipeline.js";
import { resolveCutRefs } from "../lib/cast.js";

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
  it("실패해도 성공해도 같은 병합 함수(mergeImages)로 저장한다 — 스냅샷 대체가 아니다", () => {
    expect(images).toContain("mergeImages(p.cuts, made)");
    // ★ N1(리뷰 재검토) — snapshot 대체(next=[...])로 되돌아가지 않았는지 못 박는다.
    expect(images).not.toMatch(/cuts:\s*next\b/);
  });
});

describe("N1 — 그림 만들기 실패가 다른 컷의 값을 지운다(재검토 Critical)", () => {
  it("만든 그림만 얹는다 — 컷 목록 길이도 다른 필드도 안 줄어든다", () => {
    const cuts = [
      { idx: 0, video: { url: "https://x/v0.mp4" } }, // 이미 구운 클립 — 이번 요청과 무관
      { idx: 1 }, // 이번 요청에서 성공
      { idx: 2, clip_prompt: "이미 써 둔 프롬프트" }, // 루프가 여기서 던졌다고 하자 — 시도 전
    ];
    const made = new Map([[1, { url: "https://x/img1.png", of: "prompt1" }]]);
    const out = mergeImages(cuts, made);

    expect(out).toHaveLength(3); // ★ 컷이 안 잘려 나간다 — 이게 N1 의 핵심
    expect(out[0].video.url).toBe("https://x/v0.mp4"); // 구운 클립이 안 사라진다
    expect(out[1].image.url).toBe("https://x/img1.png"); // 새로 만든 것은 얹힌다
    expect(out[2].clip_prompt).toBe("이미 써 둔 프롬프트"); // 안 건드린 컷의 다른 필드도 그대로
    expect(out[2].image).toBeUndefined(); // 시도 전이라 그림은 없다 — 조작하지 않는다
  });

  it("빈 cuts·빈 made 에도 안 던진다", () => {
    expect(mergeImages([], new Map())).toEqual([]);
    expect(mergeImages(undefined, new Map())).toEqual([]);
  });
});

describe("N4 — 굽는 중에는 그림도 다시 그리지 않는다(재검토 Important)", () => {
  it("images 라우트가 reel.status === \"rendering\" 을 409 로 막는다", () => {
    expect(images).toContain('reel.status === "rendering"');
  });
});

describe("N2 — 캐스팅 폴백이 컷 단위로 좁혀진다(재검토 Important)", () => {
  it("cast.length 로 통째로 켜고 끄지 않는다 — 안 덮인 컷만 폴백이 맡는다", () => {
    // ★ 예전 처방(리뷰 전): `casted.cast.length ? casted.cast : buildReelCast(...)`.
    //   그러면 캐스팅이 화면 안 대사 컷 일부만 덮어도 폴백이 통째로 꺼져, 안 덮인 컷은
    //   speechFor 매치를 못 찾는다(C3 이 고친 증상이 다른 입구로 남는다).
    expect(scenario).not.toMatch(/casted\.cast\.length \? casted\.cast : buildReelCast/);
    expect(scenario).toContain("coveredIdx");
    expect(scenario).toContain("!coveredIdx.has(c.idx)");
    // 두 결과를 합친다 — 진짜 cast 가 덮은 컷과 폴백이 덮은 컷은 서로 다른 번호라 안 겹친다.
    expect(scenario).toMatch(/\[\.\.\.casted\.cast,\s*\.\.\.fallback\]/);
  });
});

describe("N3 — 시나리오 재작성이 그림 회차를 리셋한다(재검토 Important)", () => {
  it("scenario 라우트가 imageTries 를 0으로 되돌린다", () => {
    expect(scenario).toContain("imageTries: 0");
  });
});

describe("N5 — 굽기 재진입이 완성 클립을 다시 굽지 않는다(재검토 Critical, 제 판정)", () => {
  it("runReelClips 는 낡지 않은 완성 클립을 건너뛴다 — makeClip 이 안 불린다", async () => {
    const doc = {
      id: "pid",
      settings: { i2v_model: "seedance-2.0", aspect_ratio: "9:16" },
      scenario: { environment: "a sunlit kitchen counter" },
      cuts: [
        // 이미 구웠고 clip_prompt 가 그대로다 — 낡지 않았다. 다시 구우면 안 된다.
        {
          idx: 0, shows: "a hand reaching for the kettle", clip_prompt: "body0", seconds: 4,
          image: { url: "https://x/c0.png" }, video: { url: "https://x/v0.mp4", seconds: 4, of: "body0" },
        },
        // clip_prompt 를 고쳐서 각인(video.of)과 갈렸다 — 낡았다. 다시 구워야 한다.
        {
          idx: 1, shows: "a mug on a wooden desk", clip_prompt: "body1-edited", seconds: 4,
          image: { url: "https://x/c1.png" }, video: { url: "https://x/v1.mp4", seconds: 4, of: "body1" },
        },
      ],
    };
    const calls = [];
    await runReelClips("pid", "uid", {
      getProject: async () => doc,
      updateProject: async (_id, _owner, fn) => { Object.assign(doc, fn(doc)); return doc; },
      loadRefs: async () => ({ refs: [], resolved: [], missing: 0 }),
      makeClip: async (args) => { calls.push(args); return { url: "https://x/new.mp4", seconds: 4 }; },
    });
    expect(calls).toHaveLength(1); // 컷 1만 다시 구웠다
    expect(doc.cuts[0].video.url).toBe("https://x/v0.mp4"); // 컷 0 은 그대로 — 재청구·이중지출이 없다
    expect(doc.cuts[1].video.url).toBe("https://x/new.mp4"); // 컷 1 은 새로 구워졌다
  });

  it("pipeline.js 가 isReelClipStale 로 판정한다 — 화면과 같은 값", () => {
    const pipeline = read("lib/reel/pipeline.js");
    expect(pipeline).toContain("isReelClipStale");
  });
});

describe("r2v 가 실제로 켜지는 증거 — ref_ids 가 refs 로 풀린다(재검토가 요구)", () => {
  it("resolveCutRefs(cut, project) 가 비어 있지 않은 목록을 준다", () => {
    const cut = { idx: 0, ref_ids: ["p1"] };
    const project = { material: { photos: [{ id: "p1", url: "/api/uploads/p1.png" }] }, cast: [] };
    const refs = resolveCutRefs(cut, project);
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].kind).toBe("thing");
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
