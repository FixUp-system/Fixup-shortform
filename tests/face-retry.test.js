// **초상 거절을 한 번은 우리가 받아낸다** (2026-08-31 사장님 결정 A).
//
// ★★★ 왜 예방이 아니라 재시도인가 — **거절은 0원이다.** 굽는 쪽은 만들기 전에 되돌리므로
//   fal 도 안 물리고, 우리 원장에도 안 남는다(`addRecord` 가 성공 뒤에 있다 —
//   lib/i2v.js:119·178. 실측: 거절난 프로젝트 둘 다 영상 원가 기록 0건).
//   그래서 **자연스럽게 먼저 써 보고 걸리면 낮추는** 순서가 값이 안 든다.
//
// ★★ 예방만 하면 무엇을 잃는가 — 같은 날 실측(57db7ad6)에서 성공한 편은 **다섯 장면이
//   전부 제품컷**이었다. 사람이 하나도 없었다. 얼굴을 무서워하면 광고가 그렇게 죽는다.
//   그래서 지문은 되는 쪽을 먼저 말하고(B), 그래도 걸리면 이 재시도가 받는다(A).
//
// ★ 고치는 자리가 **글이 아니라 그림**인 이유: 검사가 걸리는 것은 프롬프트가 아니라
//   `loc:["body","image_urls"]` — 우리가 그린 **스토리보드 판**이다.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { buildStoryboardPrompt, softenFace, facelessPanel } from "../lib/reel/panels.js";
import { collectReelOneShot, retryOneShotWithoutFaces } from "../lib/reel/pipeline.js";
import { reelOf } from "../lib/reel/doc.js";

const RAW422 = '영상 생성 실패 (422) {"detail":[{"loc":["body","image_urls"],"msg":"The images or videos provided may contain likenesses of real people or other private information that cannot be processed.","type":"content_policy_violation"}]}';

const GRID = { rows: 2, cols: 2, canvas: "1:1" };

function makeProject(extra = {}) {
  return {
    id: "p1",
    settings: { target_seconds: 15, aspect_ratio: "9:16", resolution: "720p", i2v_model: "minimax-h3" },
    scenario: { text: "A 15-second commercial." },
    cuts: [0, 1, 2, 3].map((idx) => ({
      idx,
      shows: "a woman brings the spoon to her lips",
      image: { url: `old-${idx}`, sheet: idx === 0 ? "https://sheet.example/one.png" : undefined },
    })),
    ...extra,
  };
}

// 저장소 흉내 — updateProject(id, owner, fn) 이 문서를 실제로 갈아 끼운다.
function makeStore(project) {
  const box = { doc: project };
  return {
    box,
    getProject: async () => box.doc,
    updateProject: async (_id, _owner, fn) => { box.doc = fn(box.doc); return box.doc; },
  };
}

describe("판 지시문 — 얼굴을 낮추되 사람은 남긴다", () => {
  const cuts = makeProject().cuts;

  it("평소에는 이 줄이 아예 없다 — 예전과 글자 그대로다", () => {
    const out = buildStoryboardPrompt(makeProject(), cuts, GRID, "", []);
    expect(out).not.toMatch(/dominates a panel/);
  });

  // ⚠️ 2026-08-31 **두 번째 실측 뒤 계약이 바뀌었다.** 처음에는 "얼굴이 판을 지배하지
  //   않게"(작게)였는데, 얼굴을 작게 그려도 · 단독 인물 카드로 넘겨도 2.5 는 거절했다.
  //   지금 계약은 **얼굴이 아예 안 보이게**다.
  it("★★ face_safe 를 켜면 얼굴이 **안 보이게** 하라고 말한다", () => {
    const out = buildStoryboardPrompt(makeProject({ reel: { face_safe: true } }), cuts, GRID, "", []);
    expect(out).toMatch(/no human face appears/);
    expect(out).toMatch(/cropped outside the frame/);
  });

  it("★★★ **사람을 빼라고는 안 한다** — 그것이 애초에 막으려던 결과다", () => {
    const out = buildStoryboardPrompt(makeProject({ reel: { face_safe: true } }), cuts, GRID, "", []);
    expect(out).toMatch(/Do not remove the people/);
    expect(out).toMatch(/product-only/);
  });

  // ⚠️ 2026-08-31 라이브 뒤 **이름을 고쳤다.** 처음에는 *"장면 설명은 한 글자도 안 바뀐다"*
  //   였는데, 그것이 바로 실패한 설계였다 — 칸 설명이 얼굴을 요구하니 지시가 졌다.
  //   지금은 **얼굴을 부르는 낱말만** 갈아 끼운다(아래 softenFace 절). 여기서 재는 것은
  //   **그 밖의 서술은 그대로 간다**는 것이다.
  it("★ 얼굴을 안 부르는 서술은 그대로 간다 — 걷어내는 것은 카메라뿐이다", () => {
    const plain = buildStoryboardPrompt(makeProject(), cuts, GRID, "", []);
    const safe = buildStoryboardPrompt(makeProject({ reel: { face_safe: true } }), cuts, GRID, "", []);
    for (const c of cuts) expect(safe).toContain(c.shows); // 이 소재엔 얼굴 낱말이 없다
    // 늘어난 것은 그 한 단락뿐이다.
    expect(safe.length).toBeGreaterThan(plain.length);
  });

  it("★ 사장님이 적은 note 자리를 뺏지 않는다 — 그 자리는 '사장님 말'로 나간다", () => {
    const safe = buildStoryboardPrompt(makeProject({ reel: { face_safe: true } }), cuts, GRID, "숟가락을 은색으로", []);
    expect(safe).toMatch(/The client asked for this change/);
    expect(safe).toMatch(/숟가락을 은색으로/);
    // 시스템 지시가 사장님 말인 척 나가면 안 된다.
    expect(safe).not.toMatch(/The client asked for this change[^\n]*dominates/);
  });
});

// ★★★ **라이브가 이 판을 만들었다**(2026-08-31). 처음 A 는 지시를 덧붙이기만 했고,
//   다시 그린 판에서 인물은 **카메라를 안 보게 바뀌었는데도**(지시는 먹었다) **얼굴이
//   여전히 커서 또 거절됐다.** 칸 설명이 `"facing camera … vertical chest-up shot"` 을
//   그대로 **요구하고 있었다.** 이 저장소의 법 그대로다 — *금지 문구를 더 붙이는 것은
//   소용없다. 못 그리는 것은 애초에 요구하지 않는다.*
describe("칸 설명에서 얼굴 요구를 걷어낸다 — 덧붙이기만으로는 안 됐다", () => {
  const LINE = "Panel 5: a cheerful young woman facing camera, eyes bright, holding the heaped "
    + "spoon just at her lips, mid-bite smile, vertical chest-up shot, slight low angle.";

  it("★★★ 실측에서 거절을 부른 그 문장의 낱말이 전부 사라진다", () => {
    const out = softenFace(LINE);
    for (const bad of [/facing camera/i, /eyes bright/i, /mid-bite smile/i, /chest-up shot/i]) {
      expect(out, `아직 남아 있다: ${bad}`).not.toMatch(bad);
    }
  });

  it("★★ **크기 축**도 내린다 — 시선만 내려서는 안 걸리지 않는다", () => {
    // 실측이 정확히 그랬다: 시선은 내려갔는데 얼굴이 커서 그대로 거절됐다.
    expect(softenFace(LINE)).toMatch(/waist-up/);
  });

  // ★★★ 2026-08-31 **두 번째 실측** — 얼굴을 작게 그리는 것으로도 부족했다.
  //   같은 아바타 사진을 **단일 인물 카드**(`@Image1`, 트윗과 같은 형식)로 넘겨도
  //   2.5 는 9초 만에 거절했다(값 $0). 형식이 아니라 **사진 같은 얼굴의 존재**가 기준이다.
  //   → 얼굴을 **프레임 밖으로** 내보낸다. 사람은 남고, 영상 속 얼굴은 지문이 만든다.
  describe("얼굴을 프레임 밖으로 — 작게가 아니라 아예 안 보이게", () => {
    it("★★★ 사람이 나오는 칸에는 '얼굴은 프레임 밖' 지시가 그 칸 안에 붙는다", () => {
      const out = facelessPanel(LINE);
      expect(out).toMatch(/face cropped outside the frame/);
      expect(out).toMatch(/No face is visible in this panel/);
    });

    it("★★ 사람이 없는 칸은 한 글자도 안 바뀐다", () => {
      const product = "Panel 2: golden fried rice piled in a hot skillet, wisps of steam above the grains.";
      expect(facelessPanel(product)).toBe(product);
    });

    it("★★ 사람과 동작은 그대로 남는다 — 빼는 것은 얼굴이지 사람이 아니다", () => {
      const out = facelessPanel(LINE);
      expect(out).toMatch(/young woman/);
      expect(out).toMatch(/heaped\s+spoon/);
    });

    it("★ 지시가 **그 칸 줄 안에** 있다 — 문단으로 따로 두면 칸 설명이 이긴다(1차 실패 원인)", () => {
      const cuts = [{ idx: 0, shows: "a woman brings the spoon to her lips" }];
      const safe = buildStoryboardPrompt(makeProject({ reel: { face_safe: true } }), cuts, GRID, "", []);
      const panelLine = safe.split("\n").find((l) => /^Panel/.test(l));
      expect(panelLine, "칸 줄에 지시가 없다").toMatch(/face cropped outside the frame/);
    });
  });

  it("★★ 사람도 동작도 남는다 — 걷어내는 것은 카메라이지 사람이 아니다", () => {
    const out = softenFace(LINE);
    expect(out).toMatch(/young woman/);
    expect(out).toMatch(/heaped\s+spoon/);
  });

  it("★ 목적어를 안 잃는다 — 낱말만 지우면 문장이 부서진다(2026-08-18 함정)", () => {
    expect(softenFace("a man facing camera, holding the can")).toMatch(/turned toward the food, holding the can/);
    expect(softenFace(LINE)).not.toMatch(/,\s*,/);
  });

  it("★ 좁은 짝을 먼저 본다 — 손 클로즈업이 얼굴 클로즈업으로 남으면 안 된다", () => {
    expect(softenFace("extreme close-up of her face")).toMatch(/close-up of their hands/);
  });

  it("★★ 평소에는 한 글자도 안 바꾼다 — face_safe 가 아닐 때 회귀 0", () => {
    const cuts = [{ idx: 0, shows: "a woman facing camera, eyes bright" }];
    const plain = buildStoryboardPrompt(makeProject(), cuts, GRID, "", []);
    expect(plain).toMatch(/facing camera/);
  });

  it("★★★ face_safe 를 켜면 **칸 설명에서** 사라진다(덧붙인 문단이 아니라)", () => {
    const cuts = [{ idx: 0, shows: "a woman facing camera, eyes bright" }];
    const safe = buildStoryboardPrompt(makeProject({ reel: { face_safe: true } }), cuts, GRID, "", []);
    const panelLines = safe.split("\n").filter((l) => /^Panel/.test(l));
    expect(panelLines.length).toBeGreaterThan(0);
    for (const l of panelLines) expect(l, "칸 설명이 아직 얼굴을 요구한다").not.toMatch(/facing camera/);
  });
});

describe("재시도 — 판을 다시 그리고 다시 굽는다", () => {
  const drawn = new Map([[0, { url: "new-0", of: "prompt2", sheet: "https://sheet.example/two.png", cell: 0 }]]);

  it("★★ 판을 다시 그리고 굽기를 다시 부른다", async () => {
    const store = makeStore(makeProject());
    const draw = vi.fn(async () => drawn);
    const rerun = vi.fn(async () => {});
    const r = await retryOneShotWithoutFaces("p1", "u1", {
      ...store, drawStoryboardSheet: draw, runReelOneShot: rerun,
    });
    expect(r.retried).toBe(true);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(rerun).toHaveBeenCalledTimes(1);
    expect(store.box.doc.cuts[0].image.url).toBe("new-0");
    // 안 그린 칸은 그대로 남는다 — 병합이지 대체가 아니다.
    expect(store.box.doc.cuts[1].image.url).toBe("old-1");
  });

  it("★★★ 표시는 **그리기 전에** 켜진다 — 동시에 들어온 둘째가 또 그리면 값이 두 번 나간다", async () => {
    const store = makeStore(makeProject());
    let flagWhenDrawing = null;
    await retryOneShotWithoutFaces("p1", "u1", {
      ...store,
      drawStoryboardSheet: async () => { flagWhenDrawing = reelOf(store.box.doc)?.face_safe; return drawn; },
      runReelOneShot: async () => {},
    });
    expect(flagWhenDrawing, "그리는 동안 잠금이 안 걸려 있었다").toBe(true);
  });

  it("★★ **한 번뿐이다** — 두 번째는 그리지 않는다", async () => {
    const store = makeStore(makeProject());
    const draw = vi.fn(async () => drawn);
    await retryOneShotWithoutFaces("p1", "u1", { ...store, drawStoryboardSheet: draw, runReelOneShot: async () => {} });
    const second = await retryOneShotWithoutFaces("p1", "u1", { ...store, drawStoryboardSheet: draw, runReelOneShot: async () => {} });
    expect(second.retried).toBe(false);
    expect(second.reason).toBe("already");
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("★ 통짜가 아니면 받아낼 것이 없다 — 컷별은 그 컷 하나만 죽는다", async () => {
    const store = makeStore(makeProject({ cuts: [{ idx: 0, image: { url: "x" } }] })); // sheet 가 없다
    const draw = vi.fn(async () => drawn);
    const r = await retryOneShotWithoutFaces("p1", "u1", { ...store, drawStoryboardSheet: draw, runReelOneShot: async () => {} });
    expect(r.retried).toBe(false);
    expect(draw).not.toHaveBeenCalled();
  });

  it("다시 그리다 실패하면 사유가 문서에 남는다 — 조용히 사라지지 않는다", async () => {
    const store = makeStore(makeProject());
    const r = await retryOneShotWithoutFaces("p1", "u1", {
      ...store,
      drawStoryboardSheet: async () => { throw new Error("그림 생성 실패 (500)"); },
      runReelOneShot: async () => {},
    });
    expect(r.retried).toBe(false);
    expect(reelOf(store.box.doc).error).toMatch(/500/);
    expect(reelOf(store.box.doc).imagesDrawing).toBe(false);
  });
});

// ★★★ 2026-09-02 — **이 묶음은 뒤집힌 것이다.** 그전에는 "수거가 초상 거절을 재시도로
//   넘긴다"(08-31 결정 A)를 못 박았는데, 사장님이 뒤집었다: "자동으로 재시도가 돌면 안 돼 —
//   우리 비용과 관련된 문제라서." 판 재작화 $0.401 + 재굽기 ~$2 가 사용자 행동 없이
//   나가고, 보관함 줍기(GET)가 생기면서 **열기만 해도** 나갈 뻔했다.
//   retryOneShotWithoutFaces 는 수동 버튼용으로만 남는다(위 단위 판들이 그 함수 자체를 잰다).
describe("수거가 초상 거절을 자동으로 재시도하지 않는다", () => {
  const withJob = () => makeProject({ reel: { job: { requestId: "r1", of: "body", imageOf: "sheet" } } });

  it("★★★ 초상 거절도 **자동 재시도 없이** 확정 실패로 적힌다 — 돈은 사용자 행동으로만", async () => {
    const store = makeStore(withJob());
    const retry = vi.fn(async () => ({ retried: true }));
    const r = await collectReelOneShot("p1", "u1", {
      ...store,
      collectClip: async () => { throw new Error(RAW422); },
      retryOneShotWithoutFaces: retry,
    });
    expect(retry, "자동 재시도가 돌았다 — 사장님이 금지한 지출이다").not.toHaveBeenCalled();
    expect(reelOf(store.box.doc).status).toBe("error");
    expect(reelOf(store.box.doc).error).toContain("likenesses");
  });

  // ★ 2026-09-02 — 표본을 (500)→(422)로 바꿨다. 5xx 는 이제 **일시 오류**라 접수증을
  //   지키고 물러난다(tests/reel-collect-recovery.test.js 가 그 계약을 잰다) — 이 판이
  //   재는 것은 "초상이 아닌 **확정** 실패는 재시도 없이 error 로 간다"이므로 확정 표본을 쓴다.
  it("★★ 초상이 아닌 확정 실패는 예전 그대로다 — 재시도를 안 부른다", async () => {
    const store = makeStore(withJob());
    const retry = vi.fn(async () => ({ retried: true }));
    await collectReelOneShot("p1", "u1", {
      ...store,
      collectClip: async () => { throw new Error('영상 생성 실패 (422) {"detail":[{"msg":"invalid input"}]}'); },
      retryOneShotWithoutFaces: retry,
    });
    expect(retry).not.toHaveBeenCalled();
    expect(reelOf(store.box.doc).status).toBe("error");
  });

  it("★ 이미 한 번 낮춘 판이면 또 안 부른다 — 두 번째 거절은 사장님께 간다", async () => {
    const store = makeStore(makeProject({ reel: { face_safe: true, job: { requestId: "r1" } } }));
    const retry = vi.fn(async () => ({ retried: true }));
    await collectReelOneShot("p1", "u1", {
      ...store,
      collectClip: async () => { throw new Error(RAW422); },
      retryOneShotWithoutFaces: retry,
    });
    expect(retry).not.toHaveBeenCalled();
    expect(reelOf(store.box.doc).status).toBe("error");
  });
});

describe("배선 — 접수 때 거절도 같은 문으로 받는다", () => {
  // ★ 거절이 **접수** 때 올지 **수거** 때 올지 모른다(큐로 옮긴 뒤로는 응답 쪽이 유력하지만
  //   실측 표본이 없다). 두 자리 다 받아야 한 자리에서만 새지 않는다.
  it("★★ /clips 라우트가 초상 거절에서 재시도를 부른다", () => {
    const src = readFileSync("app/api/reel/[id]/clips/route.js", "utf8");
    expect(src).toMatch(/retryOneShotWithoutFaces/);
    expect(src).toMatch(/rejected_likeness/);
  });

  it("★★ 판 그리기의 집은 하나다 — 라우트와 재시도가 같은 함수를 쓴다", () => {
    const route = readFileSync("app/api/reel/[id]/images/route.js", "utf8");
    const pipe = readFileSync("lib/reel/pipeline.js", "utf8");
    expect(route, "라우트가 아직 손으로 그린다").toMatch(/drawStoryboardSheet/);
    expect(pipe, "재시도가 다른 길로 그린다").toMatch(/drawStoryboardSheet/);
  });
});
