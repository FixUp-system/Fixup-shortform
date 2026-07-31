import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { selectCandidate, describePhoto } from "../lib/vlm.js";
import { runWithActor } from "../lib/actor.js";

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
    await runWithActor("t-user", () => selectCandidate({
      cut,
      scene: { role: "가격", shows: "카페 테이블 위 딸기라떼 한 잔", says: "6500원", seconds: 5 },
      candidates,
      fetchImpl: capturingFetch(store),
      apiKey: "k",
    }));
    const text = promptText(store);
    expect(text).toContain("카페 테이블 위 딸기라떼 한 잔");
    expect(text).not.toContain(cut.sentence);
    expect(text).toContain("장면 설명과 일치");
    expect(text).not.toContain("문장 의도 일치");
  });

  it("거울·반사 같은 물리 오류도 본다", async () => {
    // 2026-07-29 실측: 거울을 등지고 선 사람이 거울 속에서는 정면으로 비쳤는데
    // "신체 오류 없음"으로 통과했다. 검수 기준에 반사·그림자가 없었다.
    // 어제는 허공을 잡은 손을 놓쳤다 — 두 번 연속이라 기준을 넓힌다.
    // 장면 설명에는 거울을 넣지 않는다 — 넣으면 그 낱말이 프롬프트에 있다는 이유로
    // 기준과 무관하게 통과해 버린다(실제로 그렇게 거짓 통과하는 테스트를 한 번 썼다)
    const store = {};
    await runWithActor("t-user", () => selectCandidate({ cut, scene: { shows: "작업대 위 코트 클로즈업" }, candidates,
      fetchImpl: capturingFetch(store), apiKey: "k" }));
    const text = promptText(store);
    expect(text).toContain("거울");
    expect(text).toContain("반사");
  });

  it("장면이 없으면(구성 전 옛 프로젝트) 나레이션 문장으로 폴백한다", async () => {
    const store = {};
    await runWithActor("t-user", () => selectCandidate({ cut, candidates, fetchImpl: capturingFetch(store), apiKey: "k" }));
    expect(promptText(store)).toContain(cut.sentence);
  });

  it("응답의 selectedIndex·passed를 그대로 돌려준다", async () => {
    const store = {};
    const verdict = await runWithActor("t-user", () => selectCandidate({
      cut,
      scene: { shows: "화면" },
      candidates,
      fetchImpl: capturingFetch(store),
      apiKey: "k",
    }));
    expect(verdict).toEqual({ selectedIndex: 0, passed: true, note: "ok" });
  });

  it("고르라고 하지 않는다 — 후보가 한 장이라 고를 것이 없다", async () => {
    const store = {};
    const got = await runWithActor("t-user", () => selectCandidate({
      cut: { sentence: "문장." }, scene: { shows: "화면" },
      candidates: [{ url: "http://a" }], fetchImpl: capturingFetch(store), apiKey: "k",
    }));
    expect(promptText(store), "스키마에 selectedIndex 가 남아 있다").not.toContain("selectedIndex");
    expect(got.selectedIndex, "호출부 호환을 위해 0 을 돌려준다").toBe(0);
    expect(got.passed).toBe(true);
  });

  it("불합격은 그대로 전한다 — 이것이 다시 만들기를 부르는 유일한 신호다", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ passed: false, note: "손가락 오류" }) } }] }),
    });
    const got = await runWithActor("t-user", () => selectCandidate({
      cut: { sentence: "문장." }, scene: { shows: "화면" },
      candidates: [{ url: "http://a" }], fetchImpl, apiKey: "k",
    }));
    expect(got.passed).toBe(false);
    expect(got.note).toBe("손가락 오류");
  });
});

describe("describePhoto — 올린 사진에 무엇이 담겼나", () => {
  const reply = (obj, onCall) => async () => {
    onCall?.();
    return {
      ok: true,
      json: async () => ({ model: "gpt-4o", usage: { prompt_tokens: 10, completion_tokens: 5 },
        choices: [{ message: { content: JSON.stringify(obj) } }] }),
    };
  };

  it("인물 사진이면 person 과 who 를 돌려준다", async () => {
    const got = await runWithActor("t-user", () => describePhoto({
      photoBytes: null, projectId: "p1", apiKey: "k",
      fetchImpl: reply({ person: true, what: "작업복 남성", who: "50대 남성" }),
    }));
    expect(got).toEqual({ person: true, what: "작업복 남성", who: "50대 남성" });
  });

  it("사물·공간 사진이면 person=false, who=null", async () => {
    const got = await runWithActor("t-user", () => describePhoto({
      photoBytes: null, projectId: "p1", apiKey: "k",
      fetchImpl: reply({ person: false, what: "가게 내부", who: "몰라" }),
    }));
    expect(got).toEqual({ person: false, what: "가게 내부", who: null });
  });

  it("응답이 깨져도 던지지 않는다 — 사물로 취급해 흐름을 막지 않는다", async () => {
    const got = await runWithActor("t-user", () => describePhoto({
      photoBytes: null, projectId: "p1", apiKey: "k",
      fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "{{{" } }] }) }),
    }));
    expect(got).toEqual({ person: false, what: "", who: null });
  });

  it("호출이 실패해도 던지지 않는다", async () => {
    const got = await runWithActor("t-user", () => describePhoto({
      photoBytes: null, projectId: "p1", apiKey: "k",
      fetchImpl: async () => ({ ok: false, status: 500, text: async () => "" }),
    }));
    expect(got).toEqual({ person: false, what: "", who: null });
  });

  it("가짜 모드에서는 부르지 않는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    let called = false;
    const got = await describePhoto({
      photoBytes: null, projectId: "p1", apiKey: "k",
      fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; },
    });
    expect(called).toBe(false);
    expect(got.person).toBe(false);
    delete process.env.SHOTFORM_FAKE;
  });

  it("fal 만 가짜인 모드(SHOTFORM_FAKE_IMAGES=1)는 부른다 — OpenAI 는 가짜가 아니다", async () => {
    // 이미지가 가짜라고 해서 얼굴 사진 판정까지 건너뛰면, 그 판정이 person:false 로 저장돼
    // 다음 실행부터 얼굴 사진이 영구히 사물로 취급된다. fal 만 가짜인 모드는 실제 판정 경로를 타야 한다.
    process.env.SHOTFORM_FAKE_IMAGES = "1";
    let called = false;
    const got = await runWithActor("t-user", () => describePhoto({
      photoBytes: null, projectId: "p1", apiKey: "k",
      fetchImpl: reply({ person: true, what: "작업복 남성", who: "50대 남성" }, () => { called = true; }),
    }));
    expect(called).toBe(true);
    expect(got).toEqual({ person: true, what: "작업복 남성", who: "50대 남성" });
    delete process.env.SHOTFORM_FAKE_IMAGES;
  });

  it("둘 다 가짜인 모드(SHOTFORM_FAKE=all)는 여전히 부르지 않는다", async () => {
    process.env.SHOTFORM_FAKE = "all";
    let called = false;
    await describePhoto({
      photoBytes: null, projectId: "p1", apiKey: "k",
      fetchImpl: reply({ person: true, what: "작업복 남성", who: "50대 남성" }, () => { called = true; }),
    });
    expect(called).toBe(false);
    delete process.env.SHOTFORM_FAKE;
  });
});
