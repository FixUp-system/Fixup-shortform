// 광고 대사가 **영상 모델까지 실제로 간다**는 것을 잰다.
//
// ★ 왜 이 파일이 생겼나(2026-08-18 실측): 음성과 자막이 전혀 다른 말이었다. 원인은
//   시나리오가 대사(shots[].line)를 우리 문서에만 적고, fal 로 나가는 프롬프트
//   (scenario.text)에는 "Korean female narration warm and cheerful" 같은 **분위기만**
//   실려서다 — 무슨 말을 하라는지가 한 글자도 안 갔다. 모델은 매번 자기가 지어낸 말을
//   하고, 자막(lib/ad/subtitles.js)은 우리 대본을 깔아 서로 다른 내용이 됐다.
//
// 두 겹으로 막는다. 여기서 둘 다 잰다:
//   ① 시나리오 SYSTEM 이 "대사를 지문 안에 따옴표로 그대로 넣어라"를 요구하는가
//   ② LLM 이 빠뜨려도 **코드가** 나가기 전에 붙이는가
//
// ⚠️ 이 파일의 fetch 는 전부 가짜다. 진짜 fal 은 한 번이 $3.63 이다.
import { describe, it, expect, afterEach } from "vitest";
import { submitAdVideo, withSpokenLines } from "../lib/ad/generate.js";
import { buildScenarioMessages } from "../lib/ad/scenario.js";
import { runWithActor } from "../lib/actor.js";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";

const U = "00000000-0000-4000-8000-00000000000b";
const project = {
  id: "00000000-0000-4000-8000-0000000000f7",
  settings: { seconds: 15, aspect_ratio: "9:16", model: "seedance-2.0-fast" },
};

function fakeSubmitFetch(onSubmit) {
  return async (url, init) => {
    onSubmit({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      json: async () => ({
        request_id: "req-line", status_url: "https://queue.fal.run/_p/s", response_url: "https://queue.fal.run/_p/r",
      }),
      text: async () => "",
    };
  };
}

async function promptFor(scenario) {
  resetMemoryStore();
  await getStore().insertGrant({ user_id: U, amount_credits: 1000, reason: "테스트", granted_by: "admin" });
  let seen;
  const fetchImpl = fakeSubmitFetch((s) => { seen = s; });
  await runWithActor(U, () => submitAdVideo({ project, scenario, refs: [], fetchImpl }));
  return seen.body.prompt;
}

describe("광고 대사가 프롬프트에 실린다", () => {
  afterEach(() => { delete process.env.SHOTFORM_FAKE; resetMemoryStore(); });

  it("지시문에 대사가 없으면 코드가 붙여서 보낸다", async () => {
    const scenario = {
      endpoint: "t2v",
      // 실제 프로덕션 문서와 같은 모양 — 분위기만 있고 무슨 말을 하는지가 없다.
      text: "Scene 1: low-angle push-in on the tin. Sound: warm Korean female narration.",
      shots: [
        { line: "오늘도 참았죠", seconds: 5 },
        { line: "이제 그러지 마세요", seconds: 5 },
        { line: "", seconds: 5 },
      ],
    };
    const prompt = await promptFor(scenario);
    expect(prompt).toContain("오늘도 참았죠");
    expect(prompt).toContain("이제 그러지 마세요");
    // 원래 지문은 그대로 남는다 — 덮어쓰는 것이 아니라 보강이다
    expect(prompt).toContain("low-angle push-in");
  });

  it("이미 들어 있는 대사는 두 번 붙이지 않는다", async () => {
    const scenario = {
      endpoint: "t2v",
      text: 'Scene 1: the narrator says "오늘도 참았죠" while the tin opens.',
      shots: [{ line: "오늘도 참았죠", seconds: 15 }],
    };
    const prompt = await promptFor(scenario);
    expect(prompt.split("오늘도 참았죠").length - 1).toBe(1);
  });

  it("대사가 빈 장면은 억지로 채우지 않는다", () => {
    const out = withSpokenLines("Scene 1: a quiet shot.", [{ line: "", seconds: 5 }, { line: "   ", seconds: 5 }]);
    expect(out).toBe("Scene 1: a quiet shot.");
  });

  it("붙일 때 화면 글자가 아니라 말이라고 못 박는다", () => {
    const out = withSpokenLines("Scene 1: a shot.", [{ line: "안녕하세요", seconds: 5 }]);
    expect(out).toContain("안녕하세요");
    // 자막은 우리가 따로 태운다 — 모델이 이것을 화면 글자로 그리면 안 된다
    expect(out.toLowerCase()).toContain("on-screen text");
  });

  it("줄바꿈·따옴표가 달라도 이미 있는 것으로 본다", () => {
    const text = 'The narrator says:\n  “오늘도  참았죠”';
    expect(withSpokenLines(text, [{ line: "오늘도 참았죠" }])).toBe(text);
  });

  it("시나리오 SYSTEM 이 대사를 지문에 그대로 넣으라고 요구한다", () => {
    const { system } = buildScenarioMessages({
      settings: { seconds: 15, aspect_ratio: "9:16", narration_lang: "ko", format: "hero", mood: "premium", style: "photo" },
      material: { text: "가", photos: [] },
    });
    // "text 에 대사를 그대로 넣어라"가 있어야 한다
    expect(system).toMatch(/대사/);
    expect(system).toMatch(/따옴표/);
    // 기존 금지(화면에 글자를 넣으라고 요구하지 마라)는 그대로 남아 있어야 한다
    expect(system).toMatch(/글자를 넣으라고 요구하지 마라/);
  });
});
