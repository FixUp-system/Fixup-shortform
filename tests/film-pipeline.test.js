import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, getProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { buildFilmPrompt, runFilmImages, startFilmRender } from "../lib/film/pipeline.js";

const SCENARIO = { text: "Vertical 9:16 footage. Scene 1 ...", shots: [{ line: "안녕하세요", seconds: 15, shows: "A rabbit on a table" }] };

describe("굽기 프롬프트", () => {
  it("★ 시나리오 지문이 그대로 앞에 온다", () => {
    expect(buildFilmPrompt(SCENARIO, "order").startsWith(SCENARIO.text)).toBe(true);
  });

  it("★ 방식마다 붙는 말이 다르다", () => {
    expect(buildFilmPrompt(SCENARIO, "order")).not.toBe(buildFilmPrompt(SCENARIO, "refs"));
  });

  it("★ 대사가 실린다 — 광고와 같은 장치를 쓴다(안 실으면 모델이 딴 말을 한다)", () => {
    expect(buildFilmPrompt(SCENARIO, "order")).toContain("안녕하세요");
  });

  it("★ 모르는 방식은 던진다", () => {
    expect(() => buildFilmPrompt(SCENARIO, "nope")).toThrow();
  });
});

const U = "00000000-0000-4000-8000-0000000000f1";
const SETTINGS = { seconds: 15, aspect_ratio: "9:16", narration_lang: "ko", model: "seedance-2.0" };

// 사진을 올려 둔 프로젝트 하나. photos[].url 의 마지막 조각이 저장소 키다 —
// 그 규약은 lib/ad/pipeline.js 의 readRefs 가 이미 쓰고 있는 것과 같다.
async function makeFilm({ photoKeys = [] } = {}) {
  for (const key of photoKeys) {
    await getStore().putObject("uploads", key, Buffer.from(`bytes:${key}`), "image/jpeg");
  }
  const p = await runWithActor(U, () =>
    createProject({
      settings: SETTINGS,
      material: { text: "라벤더 토끼 인형", photos: photoKeys.map((k) => ({ url: `/api/uploads/${k}` })) },
      ownerId: U,
      kind: "ad",
    })
  );
  const row = await getStore().selectProject(p.id, U);
  await getStore().updateProjectRow(p.id, U, row.version, { ...row.doc, scenario: SCENARIO });
  return p;
}

describe("그림 만들기", () => {
  beforeEach(() => resetMemoryStore());

  it("★ 사장님이 올린 사진을 참조로 함께 넘긴다 — 프롬프트만으로는 모델이 생김새를 모른다", async () => {
    const p = await makeFilm({ photoKeys: ["rabbit.jpg", "box.png"] });
    const seen = [];
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "order", {
        generateImage: async (args) => {
          seen.push(args);
          return { url: "https://fal.example/a.png" };
        },
      })
    );
    expect(seen.length).toBeGreaterThan(0);
    for (const args of seen) {
      expect(args.refs.map((r) => r.key)).toEqual(["rabbit.jpg", "box.png"]);
      expect(args.refs.map((r) => r.bytes.toString())).toEqual(["bytes:rabbit.jpg", "bytes:box.png"]);
    }
  });

  it("★ 사진이 없는 프로젝트는 refs 가 빈 배열이고 그대로 만든다", async () => {
    const p = await makeFilm();
    const seen = [];
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "refs", {
        generateImage: async (args) => {
          seen.push(args);
          return { url: "https://fal.example/b.png" };
        },
      })
    );
    expect(seen.length).toBe(3);
    for (const args of seen) expect(args.refs).toEqual([]);
  });

  it("바이트를 못 읽는 사진은 버린다 — 참조가 하나 없다고 그림을 못 만들 이유는 없다", async () => {
    const p = await makeFilm({ photoKeys: ["rabbit.jpg"] });
    // 문서에는 있지만 저장소에 없는 키를 하나 더 심는다
    const row = await getStore().selectProject(p.id, U);
    await getStore().updateProjectRow(p.id, U, row.version, {
      ...row.doc,
      material: { ...row.doc.material, photos: [...row.doc.material.photos, { url: "/api/uploads/없음.jpg" }] },
    });
    const seen = [];
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "order", {
        generateImage: async (args) => { seen.push(args); return { url: "https://fal.example/c.png" }; },
      })
    );
    expect(seen[0].refs.map((r) => r.key)).toEqual(["rabbit.jpg"]);
  });

  // ★★ 그림이 **어느 판의 시나리오**로 그려졌는지 함께 적는다. 이 한 숫자가 없으면
  //   시나리오를 다시 쓴 뒤에도 옛 그림으로 굽기가 열려 $2 가 나가고, 두 방식을 서로
  //   다른 판으로 구워도 문서에 그 사실이 안 남는다(그러면 비교가 무의미해진다).
  it("★★ 그림에 시나리오 판이 함께 적힌다", async () => {
    const p = await makeFilm();
    const row = await getStore().selectProject(p.id, U);
    await getStore().updateProjectRow(p.id, U, row.version, {
      ...row.doc, scenario: { ...SCENARIO, tries: 2 },
    });
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "order", { generateImage: async () => ({ url: "https://fal.example/t.png" }) })
    );
    expect((await getProject(p.id, U)).films.order.scenarioTries).toBe(2);
  });

  it("만든 그림이 방식 칸에 남는다", async () => {
    const p = await makeFilm();
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "order", { generateImage: async () => ({ url: "https://fal.example/d.png" }) })
    );
    const back = await getProject(p.id, U);
    expect(back.films.order.images.length).toBe(SCENARIO.shots.length);
    expect(back.films.order.status).toBe("images");
  });
});

describe("굽기 접수", () => {
  beforeEach(() => resetMemoryStore());

  it("★ 그림 없이 굽지 않는다 — 참조 없이 나가면 뜻이 사라지는데 값은 그대로 든다", async () => {
    const p = await makeFilm();
    await expect(runWithActor(U, () => startFilmRender(p.id, U, "order", { submitAdVideo: async () => ({}) })))
      .rejects.toThrow();
  });

  it("만든 그림을 주소로 넘긴다 — fal 공개 주소라 내려받았다 다시 올릴 이유가 없다", async () => {
    const p = await makeFilm();
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "order", { generateImage: async () => ({ url: "https://fal.example/e.png" }) })
    );
    let got = null;
    await runWithActor(U, () =>
      startFilmRender(p.id, U, "order", {
        submitAdVideo: async (args) => { got = args; return { requestId: "r1", seconds: 15 }; },
        now: () => 1000,
      })
    );
    expect(got.refs).toEqual([{ url: "https://fal.example/e.png" }]);
    expect(got.scenario.endpoint).toBe("r2v");
    expect(got.scenario.text.startsWith(SCENARIO.text)).toBe(true);
    const back = await getProject(p.id, U);
    expect(back.films.order.status).toBe("rendering");
    expect(back.films.order.job.startedAt).toBe(1000);
  });

  it("가짜 모드는 그 자리에서 끝난다", async () => {
    const p = await makeFilm();
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "refs", { generateImage: async () => ({ url: "https://fal.example/f.png" }) })
    );
    const out = await runWithActor(U, () =>
      startFilmRender(p.id, U, "refs", { submitAdVideo: async () => ({ fake: true, url: "F", seconds: 15 }) })
    );
    expect(out.done).toBe(true);
    const back = await getProject(p.id, U);
    expect(back.films.refs.status).toBe("done");
    expect(back.films.refs.video.url).toBe("F");
  });

  it("★ 두 방식을 다 구워도 서로의 칸이 살아 있다 — 비교가 이 기능의 목적이다", async () => {
    const p = await makeFilm();
    const img = { generateImage: async () => ({ url: "https://fal.example/g.png" }) };
    const fake = { submitAdVideo: async () => ({ fake: true, url: "F", seconds: 15 }) };
    await runWithActor(U, () => runFilmImages(p.id, U, "order", img));
    await runWithActor(U, () => startFilmRender(p.id, U, "order", fake));
    await runWithActor(U, () => runFilmImages(p.id, U, "refs", img));
    await runWithActor(U, () => startFilmRender(p.id, U, "refs", fake));

    const back = await getProject(p.id, U);
    expect(back.films.order.images.length).toBe(SCENARIO.shots.length);
    expect(back.films.order.status).toBe("done");
    expect(back.films.refs.images.length).toBe(3);
    expect(back.films.refs.status).toBe("done");
  });
});

describe("실패는 문서에 남는다", () => {
  beforeEach(() => resetMemoryStore());

  // ★ 그림 만들기는 fire-and-forget 이 되기 쉽다 — 던지고 끝내면 화면은 영원히 "만드는 중"이다
  it("★ 그림 만들기가 실패하면 문서에 남고, 다시 던진다", async () => {
    const p = await makeFilm();
    await expect(
      runWithActor(U, () =>
        runFilmImages(p.id, U, "order", { generateImage: async () => { throw new Error("fal 이 막았어요"); } }))
    ).rejects.toThrow("fal 이 막았어요");
    const back = await getProject(p.id, U);
    expect(back.films.order.status).toBe("error");
    expect(back.films.order.error).toBe("fal 이 막았어요");
  });

  it("★ 굽기 접수가 실패하면 문서에 남고, 다시 던진다", async () => {
    const p = await makeFilm();
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "refs", { generateImage: async () => ({ url: "https://fal.example/h.png" }) })
    );
    await expect(
      runWithActor(U, () =>
        startFilmRender(p.id, U, "refs", { submitAdVideo: async () => { throw new Error("영상 접수 실패 (429)"); } }))
    ).rejects.toThrow("영상 접수 실패 (429)");
    const back = await getProject(p.id, U);
    expect(back.films.refs.status).toBe("error");
    expect(back.films.refs.error).toBe("영상 접수 실패 (429)");
  });

  // ★ 입구에서 막는 것은 "일이 실패한 것"이 아니라 "시작할 수 없는 것"이다 —
  //   문서에 error 를 남기면 아직 시작도 안 한 방식이 실패한 것처럼 보인다
  it("★ 시작할 수 없는 것은 문서에 안 적는다", async () => {
    const p = await makeFilm();
    await expect(runWithActor(U, () => startFilmRender(p.id, U, "order", {}))).rejects.toThrow();
    expect((await getProject(p.id, U)).films?.order).toBeUndefined();
  });

  it("다시 성공하면 앞 회차 실패가 지워진다 — done 인데 error 가 붙은 모순을 안 남긴다", async () => {
    const p = await makeFilm();
    await expect(
      runWithActor(U, () =>
        runFilmImages(p.id, U, "order", { generateImage: async () => { throw new Error("한 번 실패"); } }))
    ).rejects.toThrow();
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "order", { generateImage: async () => ({ url: "https://fal.example/i.png" }) })
    );
    await runWithActor(U, () =>
      startFilmRender(p.id, U, "order", { submitAdVideo: async () => ({ fake: true, url: "F", seconds: 15 }) })
    );
    const back = await getProject(p.id, U);
    expect(back.films.order.status).toBe("done");
    expect(back.films.order.error).toBeNull();
  });
});

// ★★ 장면 순서 방식의 앵커(2026-08-19). 실측에서 사장님이 눈으로 잡으신 결함이다 —
// 컷마다 인물도 컵도 딴 것이 나왔다. 원인은 imagePlanFor 의 order 갈래가 컷마다
// **독립적으로** 그림을 만들기 때문이다(앞 그림을 안 본다).
//
// ★ 앞 그림을 이어서 넘기지 않는다. 2→3→4 로 오차가 누적된다(직전만 보면 조금씩 밀린다).
//   focus 하나만 그린 **앵커 한 장**을 먼저 만들어 장면 그림 전부의 참조로 넘긴다.
// ★ 첫 장면 그림을 앵커로 삼지 않는 이유: 첫 장면에 중심이 안 보일 수 있다(실측에서
//   1번 컷은 잔만 있고 인물이 없었다 — 그걸로는 인물을 고정할 수 없다).
describe("장면 순서 — 앵커 한 장이 일관성을 쥔다", () => {
  beforeEach(() => resetMemoryStore());

  const runOrder = async (focus) => {
    const p = await makeFilm();
    const row = await getStore().selectProject(p.id, U);
    await getStore().updateProjectRow(p.id, U, row.version, {
      ...row.doc, scenario: { ...SCENARIO, focus },
    });
    const seen = [];
    let n = 0;
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "order", {
        generateImage: async (args) => { seen.push(args); return { url: `https://fal.example/anchor-${n++}.png` }; },
      })
    );
    return { id: p.id, seen };
  };

  it("★ 앵커를 **먼저** 만든다 — 뒤에 만들면 장면 그림이 참조할 것이 없다", async () => {
    const { seen } = await runOrder("person");
    expect(seen[0].prompt).toMatch(/portrait|person/i);
  });

  it("★ 장면 그림 전부가 같은 앵커를 참조한다 — 직전 그림이 아니다(오차가 누적된다)", async () => {
    const { seen } = await runOrder("person");
    const scenes = seen.slice(1);
    expect(scenes.length).toBe(SCENARIO.shots.length);
    for (const args of scenes) {
      expect(args.refs.some((r) => r.url === "https://fal.example/anchor-0.png")).toBe(true);
    }
  });

  it("★ 앵커는 문서에 남지만 장면 그림과 구분된다 — 굽기에 무엇이 참조로 갔는지 알아야 한다", async () => {
    const { id } = await runOrder("product");
    const row = await getStore().selectProject(id, U);
    const keys = row.doc.films.order.images.map((im) => im.key);
    expect(keys[0]).toBe("anchor");
    expect(keys.slice(1)).toEqual(SCENARIO.shots.map((_, i) => `shot-${i + 1}`));
  });

  it("★ focus 가 info 면 앵커를 안 만든다 — 고정할 대상이 없는데 $0.08 을 치를 이유가 없다", async () => {
    const { seen } = await runOrder("info");
    expect(seen).toHaveLength(SCENARIO.shots.length);
    for (const args of seen) expect(args.refs.every((r) => !r.url)).toBe(true);
  });

  it("focus 없는 옛 문서도 앵커를 안 만든다 — 예전 그대로 흐른다", async () => {
    const p = await makeFilm();
    const seen = [];
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "order", {
        generateImage: async (args) => { seen.push(args); return { url: "https://fal.example/x.png" }; },
      })
    );
    expect(seen).toHaveLength(SCENARIO.shots.length);
  });

  it("★ 참고 그림 방식은 앵커를 안 만든다 — 그 방식은 세 축 자체가 앵커다", async () => {
    const p = await makeFilm();
    const row = await getStore().selectProject(p.id, U);
    await getStore().updateProjectRow(p.id, U, row.version, {
      ...row.doc, scenario: { ...SCENARIO, focus: "person" },
    });
    const seen = [];
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "refs", {
        generateImage: async (args) => { seen.push(args); return { url: "https://fal.example/y.png" }; },
      })
    );
    expect(seen).toHaveLength(3);
  });
});

// ★★ 사진이 있으면 앵커를 안 만든다(2026-08-19 사장님 결정).
//
// 사장님이 올린 사진이 **제품의 진실**이다. 앵커는 그 사진을 참조로 AI 가 그린 그림이라
// 한 다리 건넌 것인데, 장면 그림에 둘 다 참조로 넘기면 조금만 달라도 두 참조 사이에서
// 흔들린다. 사진이 있으면 사진이 더 나은 앵커다 — 값($0.08)도 아낀다.
//
// ⚠️ 남는 한계: focus 가 person·place 인데 올린 사진이 **제품 사진**이면 인물·공간을
//   고정할 것이 없어진다. 올린 사진에 무엇이 찍혔는지는 이 코드가 모른다(사장님 결정으로
//   지금은 여기서 멈춘다 — 알려면 사진을 읽는 단계가 하나 더 필요하다).
describe("사진이 있으면 앵커를 안 만든다", () => {
  beforeEach(() => resetMemoryStore());

  const run = async ({ photoKeys }) => {
    const p = await makeFilm({ photoKeys });
    const row = await getStore().selectProject(p.id, U);
    await getStore().updateProjectRow(p.id, U, row.version, {
      ...row.doc, scenario: { ...SCENARIO, focus: "product" },
    });
    const seen = [];
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "order", {
        generateImage: async (args) => { seen.push(args); return { url: "https://fal.example/z.png" }; },
      })
    );
    const after = await getStore().selectProject(p.id, U);
    return { seen, keys: after.doc.films.order.images.map((im) => im.key) };
  };

  it("★ 사진이 있으면 장면 수만큼만 만든다 — 앵커 한 장을 안 산다", async () => {
    const { seen, keys } = await run({ photoKeys: ["keyring.jpg"] });
    expect(seen).toHaveLength(SCENARIO.shots.length);
    expect(keys).not.toContain("anchor");
  });

  it("★ 사진이 없으면 앵커를 만든다 — 그때는 고정할 것이 그림밖에 없다", async () => {
    const { keys } = await run({ photoKeys: [] });
    expect(keys[0]).toBe("anchor");
  });

  it("★ 사진이 있으면 장면 그림이 그 사진을 참조한다 — 앵커 자리를 사진이 대신한다", async () => {
    const { seen } = await run({ photoKeys: ["keyring.jpg"] });
    for (const args of seen) {
      expect(args.refs.map((r) => r.key)).toEqual(["keyring.jpg"]);
    }
  });
});

// ★★ 값이 **실제로 흐르는지**가 이 태스크의 전부다. imagePlanFor 에 옵션 자리를 열어도
// runFilmImages 가 안 넘기면 코드만 있고 아무 일도 안 일어난다 — shows 가 정확히
// 그랬다(스키마에 칸이 없어 SYSTEM 요구가 무의미했다).
describe("그림 맥락(언어·사진)이 계획까지 흐른다", () => {
  beforeEach(() => resetMemoryStore());

  const run = async ({ photoKeys = [], narration_lang = "ko" } = {}) => {
    const p = await makeFilm({ photoKeys });
    const row = await getStore().selectProject(p.id, U);
    await getStore().updateProjectRow(p.id, U, row.version, {
      ...row.doc,
      settings: { ...row.doc.settings, narration_lang },
      scenario: { ...SCENARIO, focus: "product" },
    });
    const seen = [];
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "order", {
        generateImage: async (args) => { seen.push(args); return { url: "https://fal.example/q.png" }; },
      })
    );
    return seen;
  };

  it("★ 나레이션 언어가 그림 프롬프트에 닿는다 — 한국어면 인물이 한국인이다", async () => {
    const seen = await run({ narration_lang: "ko" });
    expect(seen.some((a) => /Korean/.test(a.prompt))).toBe(true);
  });

  it("★ 사진이 있으면 '참조가 이긴다'가 프롬프트에 닿는다", async () => {
    const seen = await run({ photoKeys: ["keyring.jpg"] });
    expect(seen.every((a) => /reference photo/i.test(a.prompt))).toBe(true);
  });

  it("사진이 없으면 그 말을 안 붙인다", async () => {
    const seen = await run({ photoKeys: [] });
    expect(seen.every((a) => !/reference photo/i.test(a.prompt))).toBe(true);
  });
});
