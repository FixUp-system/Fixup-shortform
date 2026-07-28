import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { selectCandidate, describePhoto } from "../lib/vlm.js";

// 프롬프트 첫 텍스트 블록만 붙잡는 가짜 OpenAI
function capturingFetch(store) {
  return async (_url, init) => {
    store.body = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ selectedIndex: 0, passed: true, note: "ok" }) } }] }),
    };
  };
}

const promptText = (store) => store.body.messages[0].content[0].text;

const cut = { idx: 0, scene_idx: 0, sentence: "6500원이면 한 잔 값이에요", seconds: 5, source: "ai" };
const candidates = [{ url: "http://img/a" }, { url: "http://img/b" }];

beforeEach(() => {
  delete process.env.SHOTFORM_FAKE_IMAGES; // 테스트 모드면 호출 자체를 건너뛴다
});
afterEach(() => {
  delete process.env.SHOTFORM_FAKE_IMAGES;
});

describe("selectCandidate 검수 기준", () => {
  it("장면이 있으면 shows로 심사하고 나레이션 문장은 쓰지 않는다", async () => {
    const store = {};
    await selectCandidate({
      cut,
      scene: { role: "가격", shows: "카페 테이블 위 딸기라떼 한 잔", says: "6500원", seconds: 5 },
      candidates,
      fetchImpl: capturingFetch(store),
      apiKey: "k",
    });
    const text = promptText(store);
    expect(text).toContain("카페 테이블 위 딸기라떼 한 잔");
    expect(text).not.toContain(cut.sentence);
    expect(text).toContain("장면 설명과 일치");
    expect(text).not.toContain("문장 의도 일치");
  });

  it("장면이 없으면(구성 전 옛 프로젝트) 나레이션 문장으로 폴백한다", async () => {
    const store = {};
    await selectCandidate({ cut, candidates, fetchImpl: capturingFetch(store), apiKey: "k" });
    expect(promptText(store)).toContain(cut.sentence);
  });

  it("응답의 selectedIndex·passed를 그대로 돌려준다", async () => {
    const store = {};
    const verdict = await selectCandidate({
      cut,
      scene: { shows: "화면" },
      candidates,
      fetchImpl: capturingFetch(store),
      apiKey: "k",
    });
    expect(verdict).toEqual({ selectedIndex: 0, passed: true, note: "ok" });
  });
});

describe("describePhoto — 올린 사진에 무엇이 담겼나", () => {
  const reply = (obj) => async () => ({
    ok: true,
    json: async () => ({ model: "gpt-4o", usage: { prompt_tokens: 10, completion_tokens: 5 },
      choices: [{ message: { content: JSON.stringify(obj) } }] }),
  });

  it("인물 사진이면 person 과 who 를 돌려준다", async () => {
    const got = await describePhoto({
      photoPath: null, projectId: "p1", apiKey: "k",
      fetchImpl: reply({ person: true, what: "작업복 남성", who: "50대 남성" }),
    });
    expect(got).toEqual({ person: true, what: "작업복 남성", who: "50대 남성" });
  });

  it("사물·공간 사진이면 person=false, who=null", async () => {
    const got = await describePhoto({
      photoPath: null, projectId: "p1", apiKey: "k",
      fetchImpl: reply({ person: false, what: "가게 내부", who: "몰라" }),
    });
    expect(got).toEqual({ person: false, what: "가게 내부", who: null });
  });

  it("응답이 깨져도 던지지 않는다 — 사물로 취급해 흐름을 막지 않는다", async () => {
    const got = await describePhoto({
      photoPath: null, projectId: "p1", apiKey: "k",
      fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "{{{" } }] }) }),
    });
    expect(got).toEqual({ person: false, what: "", who: null });
  });

  it("호출이 실패해도 던지지 않는다", async () => {
    const got = await describePhoto({
      photoPath: null, projectId: "p1", apiKey: "k",
      fetchImpl: async () => ({ ok: false, status: 500, text: async () => "" }),
    });
    expect(got).toEqual({ person: false, what: "", who: null });
  });

  it("가짜 모드에서는 부르지 않는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    let called = false;
    const got = await describePhoto({
      photoPath: null, projectId: "p1", apiKey: "k",
      fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
    });
    expect(called).toBe(false);
    expect(got.person).toBe(false);
    delete process.env.SHOTFORM_FAKE;
  });
});
