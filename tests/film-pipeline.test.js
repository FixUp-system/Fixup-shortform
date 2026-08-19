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
