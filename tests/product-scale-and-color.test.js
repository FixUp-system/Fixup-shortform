// 제품이 **실제와 다르게, 그리고 터무니없이 크게** 그려지는 문제 — 셋이 한 뿌리다.
//
// 2026-08-19 실측(프로젝트 aec197c6): 사진을 읽은 값이
//   { what: "토끼 모양의 인형 열쇠고리", lettering: "Giants", person: false }
// 였다. **색이 없다.** 그래서 시나리오가 지은 `focus.look` 에도 색이 없었고
//   "soft plush bunny figure with long ears, fabric body, …"
// 장면 설명에는 모델이 상상한 `a small white rabbit` 이 남았다. 배선(어제 c970ac9)은
// 도는데 **재료가 부실해서** 반쪽만 먹은 것이다.
//
// 크기는 더 나쁘다. 프롬프트 어디에도 크기·비례가 없어 모델이 크기를 정할 근거가 아예
// 없는데, 반대로 "이것이 주인공이다"라고 미는 문장은 여러 번 실린다 — 사장님 지적
// "키링인데 가방 전면보다 크게 그려진다"가 그 결과다.
//
// 그래서 세 자리를 함께 고친다:
//   ① lib/vlm.js  — 사진에서 **색과 크기**를 읽는다 (모든 것의 재료)
//   ② lib/scenario.js — 그 값이 `focus.look` 의 크기·비례로 실린다
//   ③ lib/cuts.js — 사장님의 한국어 수정 지시가 **한 번만·이길 수 있게** 실린다
import { describe, it, expect, beforeEach, vi } from "vitest";
import { runWithActor } from "../lib/actor.js";
import { buildScenarioMessages } from "../lib/scenario.js";
import { buildImagePrompt } from "../lib/cuts.js";

// llm.js 는 아래 regenCut 묶음에서만 가짜다 — 파일 하나에 vi.mock 은 파일 전체에 걸리므로
// 위쪽 묶음이 LLM 을 안 부른다는 것을 함께 못 박는 셈이다(부르면 mockReset 된 빈 값이 온다).
const llmMock = vi.hoisted(() => ({ callJson: vi.fn() }));
vi.mock("../lib/llm.js", () => ({ callJson: (...a) => llmMock.callJson(...a) }));

const { describePhoto } = await import("../lib/vlm.js");
const projects = await import("../lib/projects.js");
const pipeline = await import("../lib/pipeline.js");
const { resetMemoryStore } = await import("../lib/store/memory.js");

// ── ① 사진 판정이 색과 크기를 읽는다 ────────────────────────────────────────
describe("사진 판정 — 색과 크기를 읽는다", () => {
  const ask = async (obj) => {
    const store = {};
    const fetchImpl = async (_url, init) => {
      store.body = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          model: "gpt-4o",
          usage: { prompt_tokens: 10, completion_tokens: 5 },
          choices: [{ message: { content: JSON.stringify(obj) } }],
        }),
      };
    };
    const got = await runWithActor("t-user", () =>
      describePhoto({ photoBytes: null, projectId: "p1", apiKey: "k", fetchImpl })
    );
    return { got, text: store.body.messages[0].content[0].text };
  };

  it("★ 지문이 색을 묻는다 — 색이 없으면 아래 모든 것이 색을 지어낸다", async () => {
    const { text } = await ask({ person: false, what: "보라색 토끼 인형 키링" });
    expect(text, "색을 안 묻는다").toMatch(/색/);
  });

  it("★ 지문이 다른 사물에 견준 크기를 묻는다 — 키링이 가방보다 크게 그려진 원인", async () => {
    const { text } = await ask({ person: false, what: "보라색 토끼 인형 키링" });
    expect(text, "크기를 안 묻는다").toMatch(/크기|비례/);
    // "작다"만으로는 모자란다 — 무엇에 견주어 얼마나인지가 있어야 모델이 크기를 정한다
    expect(text, "무엇에 견주라는 것인지 안 말한다").toMatch(/견주|대비|비교|함께 찍힌/);
    // 짐작으로 채우면 그 짐작이 그대로 그림이 된다
    expect(text, "못 재면 비우라는 말이 없다").toMatch(/비운다|빈 문자열/);
  });

  it("★ 읽은 크기가 판정 결과에 실린다", async () => {
    const { got } = await ask({ person: false, what: "보라색 토끼 인형 키링", scale: "손바닥 절반 크기의 작은 참" });
    expect(got.scale).toBe("손바닥 절반 크기의 작은 참");
    expect(got.what).toBe("보라색 토끼 인형 키링");
  });

  it("모델이 크기를 안 냈으면 빈 문자열이다 — 없는 것을 지어내지 않는다", async () => {
    const { got } = await ask({ person: false, what: "가게 내부" });
    expect(got.scale).toBe("");
  });

  it("판정이 실패해도 모양이 같다 — 옛 소비자가 죽지 않는다", async () => {
    const got = await runWithActor("t-user", () =>
      describePhoto({
        photoBytes: null, projectId: "p1", apiKey: "k",
        fetchImpl: async () => ({ ok: false, status: 500, text: async () => "" }),
      })
    );
    expect(got).toEqual({ person: false, what: "", who: null, lettering: "", scale: "" });
  });
});

// ── ② 제품 묘사에 크기·비례가 실린다 ────────────────────────────────────────
describe("시나리오 지문 — 크기·비례", () => {
  const BASE = {
    id: "aaaaaaaa-0000-4000-8000-00000000ffff",
    settings: { i2v_model: "seedance-2.0", target_seconds: 30, aspect_ratio: "9:16" },
    material: { text: "에스더버니 키링을 소개하는 영상", photos: [] },
  };
  const withPhotos = (photos) => ({ ...BASE, material: { ...BASE.material, photos } });
  const PHOTO = { id: "p1", filename: "bunny.jpg", url: "/api/uploads/360cb1cb.jpg" };

  it("★ look 지시가 크기·비례를 요구한다 — 지금은 색·부위·소재까지만 요구한다", () => {
    const { system } = buildScenarioMessages(BASE);
    const lookLine = system.split("\n").find((l) => l.includes("\"look\""));
    expect(lookLine, "look 칸이 사라졌다").toBeTruthy();
    expect(lookLine, "크기·비례를 안 요구한다").toMatch(/크기|비례/);
  });

  it("★ 사진에서 읽은 크기가 지문에 실리고, 그것을 따르라고 말한다", () => {
    const vision = { person: false, what: "보라색 토끼 인형 키링", who: null, lettering: "Giants", scale: "가방 절반도 안 되는 작은 참" };
    const u = buildScenarioMessages(withPhotos([{ ...PHOTO, vision }])).messages[0].content;
    expect(u, "읽은 크기가 지문에 없다").toContain("가방 절반도 안 되는 작은 참");
    // 값만 있고 지시가 없으면 모델은 무시한다 — 따르라는 말이 함께 있어야 한다
    expect(u, "크기를 따르라는 규칙이 없다").toMatch(/크기|비례/);
  });

  it("★ 크기를 못 읽은 옛 vision 에서도 죽지 않고, 크기 문구를 지어내지 않는다", () => {
    const old = { person: false, what: "가방에 달린 보라색 토끼 인형", who: null, lettering: "Esther Bunny" };
    const u = buildScenarioMessages(withPhotos([{ ...PHOTO, vision: old }])).messages[0].content;
    expect(u).toContain("가방에 달린 보라색 토끼 인형");
    expect(u).not.toContain("undefined");
  });
});

// ── ③ 수정 지시가 한 번만·이길 수 있게 실린다 ───────────────────────────────
describe("수정 지시 — 반대로 미는 문장을 걷어낸다", () => {
  const PROJECT = {
    settings: { aspect_ratio: "9:16" },
    scenario: { focus: { mode: "물건", subject: "a bunny keyring", look: "lavender plush" } },
    material: { photos: [] },
  };
  const NOTE = "이 이미지에서 에스더버니가 키링인데 가방보다 사이즈가 너무 커서 사실적으로 묘사되고 있지 않아. 인형 사이즈를 줄여줘";
  const CUT = { idx: 0, shows: "the keyring on a bag", edit_instruction: NOTE };

  it("★★ 본문에 이미 실린 지시는 꼬리에 다시 안 붙는다 — 같은 말이 두 번, 그중 하나는 한국어였다", () => {
    const p = buildImagePrompt({ ...CUT, image_prompt: "A tiny bunny charm on a large bag", edit_applied: true }, PROJECT, []);
    expect(p, "한국어 원문이 영어 프롬프트에 그대로 또 실린다").not.toContain(NOTE);
    expect(p).not.toContain("Important correction requested by the user");
  });

  it("★ 고쳐 쓰기가 실패한 컷에서는 지시가 꼬리에 남되, 앞 문장을 이긴다고 못 박는다", () => {
    const p = buildImagePrompt({ ...CUT, edit_applied: false }, PROJECT, []);
    expect(p).toContain(NOTE);
    expect(p, "한국어라는 것을 안 알려 준다").toMatch(/Korean/);
    expect(p, "앞 문장과 부딪힐 때 어느 쪽이 이기는지 안 말한다").toMatch(/override|contradict|take precedence/i);
  });

  it("★ 옛 컷(플래그 없음)의 프롬프트는 글자 그대로 예전과 같다 — 흔들리면 이미 산 그림이 낡는다", () => {
    const p = buildImagePrompt(CUT, PROJECT, []);
    expect(p).toContain(` Important correction requested by the user, apply it strictly: ${NOTE}.`);
    expect(p, "옛 컷에 없던 문장이 새로 붙었다 — 각인이 흔들린다").not.toMatch(/Korean/);
  });
});

// ── ③-b 파이프라인이 "본문에 실었는가"를 컷에 남긴다 ────────────────────────
describe("regenCut — 지시를 본문에 실었는지 컷이 안다", () => {
  const OWNER = "11111111-1111-1111-1111-111111111111";
  const deps = () => ({
    splitCuts: async () => [{ idx: 0, sentence: "AI컷", seconds: 6, source: "ai", regen_count: 0 }],
    genImage: async () => ({ url: "http://img/x" }),
    select: async () => ({ selectedIndex: 0, passed: true, note: "ok" }),
  });
  beforeEach(() => {
    resetMemoryStore();
    llmMock.callJson.mockReset();
  });
  const make = async () => {
    const p = await projects.createProject({
      ownerId: OWNER, settings: { aspect_ratio: "9:16" }, material: { text: "자료", photos: [] },
    });
    await pipeline.runSplitPipeline(p.id, OWNER, deps());
    await pipeline.runImagesPipeline(p.id, OWNER, deps());
    return p;
  };

  it("★ 고쳐 쓰기가 성공하면 실었다고 표시한다", async () => {
    const p = await make();
    await pipeline.regenCut(p.id, OWNER, 0, { ...deps(), revisePrompt: async () => ({ prompt: "A tiny charm" }) }, "인형을 작게");
    const cut = (await projects.getProject(p.id, OWNER)).cuts.find((c) => c.idx === 0);
    expect(cut.edit_applied).toBe(true);
  });

  it("★ 고쳐 쓰기가 실패하면 못 실었다고 표시한다 — 꼬리가 유일한 전달자가 된다", async () => {
    const p = await make();
    await pipeline.regenCut(p.id, OWNER, 0, { ...deps(), revisePrompt: async () => { throw new Error("망함"); } }, "인형을 작게");
    const cut = (await projects.getProject(p.id, OWNER)).cuts.find((c) => c.idx === 0);
    expect(cut.edit_applied).toBe(false);
  });
});
