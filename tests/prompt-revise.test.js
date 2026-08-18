// 수정 지시는 **기존 프롬프트를 고치고 더한다** — 뒤에 덧붙이기만 하지 않는다.
//
// 사장님 지시(2026-08-18): "이미지나 영상을 수정할 때 사용자에게 입력을 받고 기존 내용에
// 추가 혹은 수정하는 방식으로. 예를 들어 '지금 사진에서 어떤 이미지를 고치고 싶어. 이 이미지를
// 수정하고, 배경을 수정해줘' 와 같은 형식으로 입력하게 돼. 이 지시를 했을 때 기존 프롬프트에서
// 이미지는 수정이 되고 배경의 내용은 추가될 수 있도록."
//
// 지금까지는 지시가 **꼬리에 덧붙기만** 했다:
//   `… Important correction requested by the user, apply it strictly: 배경을 노을로.`
// 그러면 원래의 배경 서술이 **그대로 남은 채** 새 요구가 뒤에 붙어, 모델이 서로 다투는 두
// 지시를 받는다. 그리고 지시는 컷에 하나만 저장돼 다음 재생성 때 덮인다 — 쌓이지 않는다.
//
// 지금 계약: 사장님의 한국어 지시를 받아 **본문을 다시 쓴다**. 지시가 가리키는 부분은 바꾸고,
// 새 요구는 더하고, **나머지는 글자 그대로 둔다**. 결과는 컷별 덮어쓰기(image_prompt·clip_prompt)로
// 저장되므로 사장님이 접힌 칸에서 **바뀐 프롬프트를 눈으로 확인**할 수 있다.
import { describe, it, expect } from "vitest";
import { buildPromptReviseMessages, REVISE_MAX } from "../lib/prompt-revise.js";

const CURRENT =
  "High-quality photographic still for a short-form video, vertical 9:16 composition. " +
  "Scene: a red sports car parked on wet asphalt at night. " +
  "Setting (same in every scene of this video): an empty city street, night, neon reflections.";

describe("수정 지시 — 무엇을 모델에게 주는가", () => {
  const msgs = () => buildPromptReviseMessages({ current: CURRENT, instruction: "배경을 노을로 바꾸고, 차를 더 가까이" });

  it("★ 지금 프롬프트와 사장님 지시를 함께 준다", () => {
    const all = JSON.stringify(msgs());
    expect(all, "지금 프롬프트를 안 준다 — 고칠 대상이 없다").toContain("red sports car");
    expect(all, "사장님 지시를 안 준다").toContain("배경을 노을로");
  });

  it("★★ 지시와 무관한 부분은 그대로 두라고 말한다", () => {
    // 이것이 이 기능의 핵심이다. 매번 통째로 다시 쓰면 사장님이 고치지도 않은 부분이
    // 흔들리고, 무엇이 왜 바뀌었는지 아무도 설명할 수 없다.
    expect(msgs().system, "무관한 부분 보존을 안 시킨다").toMatch(/그대로|바꾸지 마|보존/);
  });

  it("★ 고치는 것과 더하는 것을 둘 다 시킨다", () => {
    const sys = msgs().system;
    expect(sys, "고치라는 말이 없다").toMatch(/고친다|바꾼다|수정/);
    expect(sys, "더하라는 말이 없다 — 없던 요구는 붙여야 한다").toMatch(/더한다|추가/);
  });

  it("★ 결과는 영어 한 덩어리다 — 이 글자가 그대로 모델에 실린다", () => {
    const sys = msgs().system;
    expect(sys, "영어로 내라고 안 한다").toMatch(/영어/);
    expect(sys, "설명·머리말을 붙이지 말라고 안 한다 — 그것까지 프롬프트가 된다")
      .toMatch(/설명|머리말|다른 말/);
  });

  it("★ 화면에 실을 글자는 못 쓰게 막는다 — 자막은 우리가 태운다", () => {
    expect(msgs().system).toMatch(/글자|text/i);
  });

  // ⑤영상은 규칙이 하나 더 있다: 대사를 고치면 들리는 말과 자막이 갈린다.
  it("★ 영상 갈래에서는 대사를 건드리지 말라고 말한다", () => {
    const clip = buildPromptReviseMessages({ current: "…", instruction: "더 천천히", kind: "clip" });
    expect(clip.system, "대사 보호가 없다 — 들리는 말과 자막이 갈린다").toMatch(/대사|자막/);
  });

  it("★ 지시가 비면 아무것도 만들지 않는다 — 값 드는 호출을 안 만든다", () => {
    expect(buildPromptReviseMessages({ current: CURRENT, instruction: "   " })).toBeNull();
    expect(buildPromptReviseMessages({ current: "", instruction: "배경을 바꿔" })).toBeNull();
  });

  it("★ 지시 길이에 상한이 있다 — 통짜 문서를 붙여 넣으면 값이 튄다", () => {
    expect(REVISE_MAX).toBeGreaterThan(100);
    const long = "가".repeat(REVISE_MAX + 1);
    expect(() => buildPromptReviseMessages({ current: CURRENT, instruction: long })).toThrow(/글자/);
  });
});

// ⑤영상도 같은 배관을 쓴다(2026-08-18). 화면에 수정사항 칸이 생겼으니 서버도 그 말로
// **본문을 다시 써야** 한다 — 안 그러면 칸만 있고 아무 일도 안 하는 "적을 수 있는 척"이다.
describe("영상 재생성도 지시로 본문을 다시 쓴다", () => {
  it("★ regenClip 이 지시를 받아 clip_prompt 를 고친다", async () => {
    const { resetMemoryStore } = await import("../lib/store/memory.js");
    const { createProject, getProject, updateProject } = await import("../lib/projects.js");
    const pipeline = await import("../lib/pipeline.js");
    resetMemoryStore();
    const OWNER = "00000000-0000-4000-8000-00000000000a";
    const p = await createProject({
      ownerId: OWNER,
      settings: { target_seconds: 30, aspect_ratio: "9:16", i2v_model: "kling-v3" },
      material: { text: "자료", photos: [] },
    });
    await updateProject(p.id, OWNER, (proj) => ({
      ...proj,
      status: "video",
      cuts: [{ idx: 0, sentence: "가", seconds: 5, motion: "천천히 다가간다", image: { url: "https://x/i.png" }, clip_regen_count: 0 }],
    }));

    const seen = [];
    await pipeline.regenClip(p.id, OWNER, 0, {
      clip: async ({ prompt }) => { seen.push(prompt); return { url: "https://x/v.mp4", seconds: 5, truncated: false }; },
      revisePrompt: async (msgs) => { seen.push(msgs.system); return { prompt: "moves in very slowly" }; },
    }, "더 천천히 다가가게");

    const cut = (await getProject(p.id, OWNER)).cuts[0];
    expect(cut.clip_prompt, "고쳐 쓴 본문을 안 담았다").toBe("moves in very slowly");
    expect(seen.some((x) => /대사|자막/.test(x)), "영상 갈래 규칙(대사 보호)을 안 줬다").toBe(true);
    expect(seen.some((x) => x.includes("moves in very slowly")), "고친 본문으로 안 만들었다").toBe(true);
    expect(cut.edit_instruction).toBe("더 천천히 다가가게");
  });
});
