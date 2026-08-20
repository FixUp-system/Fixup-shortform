import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { filmOf, putFilm } from "../lib/film/doc.js";
import { runFilmImages } from "../lib/film/pipeline.js";

const U = "00000000-0000-4000-8000-0000000000f2";
const SETTINGS = { seconds: 15, aspect_ratio: "9:16", narration_lang: "ko", model: "seedance-2.0" };
const SCENARIO = {
  text: "Vertical 9:16 footage.",
  focus: "product",
  tries: 1,
  shots: [
    { line: "안녕", seconds: 8, shows: "a woman holding the box", avatar_id: "av-woman-20s" },
    { line: "잘가", seconds: 7, shows: "the finished bowl on a table", avatar_id: "" },
  ],
};

async function seed({ photoKeys = [], scenarioTries = 1, images } = {}) {
  for (const key of photoKeys) {
    await getStore().putObject("uploads", key, Buffer.from(`bytes:${key}`), "image/jpeg");
  }
  const p = await runWithActor(U, () =>
    createProject({
      settings: SETTINGS,
      material: { text: "떡볶이 밀키트", photos: photoKeys.map((k) => ({ url: `/api/uploads/${k}` })) },
      ownerId: U,
      kind: "ad",
    })
  );
  const row = await getStore().selectProject(p.id, U);
  let doc = { ...row.doc, scenario: { ...SCENARIO, tries: scenarioTries } };
  if (images) doc = putFilm(doc, "refs", { images, status: "images", scenarioTries: 1 });
  await getStore().updateProjectRow(p.id, U, row.version, doc);
  return p;
}

const OLD = [
  { key: "subject", url: "https://fal.example/old-subject.png", of: "old" },
  { key: "subject-in-use", url: "https://fal.example/old-in-use.png", of: "old" },
  { key: "person", url: "https://fal.example/old-person.png", of: "old" },
  { key: "place", url: "https://fal.example/old-place.png", of: "old" },
];

describe("그림 한 장만 다시 그린다", () => {
  beforeEach(() => resetMemoryStore());

  it("★ 고른 축만 새로 그린다 — 나머지는 값을 안 치른다", async () => {
    const p = await seed({ photoKeys: ["a.jpg"], images: OLD });
    const drew = [];
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "refs", {
        only: ["subject"],
        generateImage: async (args) => { drew.push(args); return { url: "https://fal.example/new.png" }; },
      })
    );
    expect(drew).toHaveLength(1);
  });

  it("★ 안 고른 축은 그 자리에 그대로 남는다 — 덧붙이기가 아니라 자리 맞춤이다", async () => {
    const p = await seed({ photoKeys: ["a.jpg"], images: OLD });
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "refs", {
        only: ["subject"],
        generateImage: async () => ({ url: "https://fal.example/new.png" }),
      })
    );
    const row = await getStore().selectProject(p.id, U);
    const after = filmOf(row.doc, "refs").images;
    expect(after.map((i) => i.key)).toEqual(OLD.map((i) => i.key));
    expect(after.find((i) => i.key === "subject").url).toBe("https://fal.example/new.png");
    expect(after.find((i) => i.key === "place").url).toBe("https://fal.example/old-place.png");
  });

  // ★★ 시나리오 판이 다르면 열지 않는다. 섞이면 "어느 판으로 그렸는가"의 보증이 깨지고,
  //   "차이는 방식 때문"이라는 이 기능의 대전제를 나중에 아무도 확인할 수 없다.
  it("★ 시나리오 판이 다르면 던진다 — 판이 섞인 그림 묶음을 만들지 않는다", async () => {
    const p = await seed({ photoKeys: ["a.jpg"], scenarioTries: 2, images: OLD });
    await expect(
      runWithActor(U, () =>
        runFilmImages(p.id, U, "refs", {
          only: ["subject"],
          generateImage: async () => ({ url: "https://fal.example/new.png" }),
        })
      )
    ).rejects.toThrow(/시나리오/);
  });

  it("판이 달라도 전부 다시 그리기는 열린다 — 그때는 묶음이 통째로 새 판이 된다", async () => {
    const p = await seed({ photoKeys: ["a.jpg"], scenarioTries: 2, images: OLD });
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "refs", { generateImage: async () => ({ url: "https://fal.example/n.png" }) })
    );
    const row = await getStore().selectProject(p.id, U);
    expect(filmOf(row.doc, "refs").scenarioTries).toBe(2);
  });

  it("★ 계획에 있는데 그림이 없는 축은 only 밖이라도 그린다 — 빈 자리를 남기지 않는다", async () => {
    const p = await seed({ photoKeys: ["a.jpg"], images: OLD.slice(0, 2) });
    const drew = [];
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "refs", {
        only: ["subject"],
        generateImage: async (a) => { drew.push(a); return { url: "https://fal.example/n.png" }; },
      })
    );
    const row = await getStore().selectProject(p.id, U);
    const after = filmOf(row.doc, "refs").images;
    expect(after.every((i) => i.url)).toBe(true);
    expect(drew.length).toBeGreaterThan(1); // subject + 없던 축들
  });

  it("★ 계획에서 사라진 축의 그림은 안 되살아난다", async () => {
    const p = await seed({
      photoKeys: ["a.jpg"],
      images: [...OLD, { key: "person-full", url: "https://fal.example/ghost.png", of: "old" }],
    });
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "refs", {
        only: ["subject"],
        generateImage: async () => ({ url: "https://fal.example/n.png" }),
      })
    );
    const row = await getStore().selectProject(p.id, U);
    expect(filmOf(row.doc, "refs").images.map((i) => i.key)).not.toContain("person-full");
  });

  // ★★ 장면 순서 방식은 앵커를 먼저 만들고 장면 그림 **전부**가 그것을 참조한다.
  //   장면 하나만 다시 그릴 때 앵커를 새로 만들면 나머지와 갈린다.
  it("★ 앵커는 다시 만들지 않고 기존 것을 참조로 쓴다", async () => {
    const p = await seed({
      images: [
        { key: "anchor", url: "https://fal.example/anchor.png", of: "old" },
        { key: "shot-1", url: "https://fal.example/s1.png", of: "old" },
        { key: "shot-2", url: "https://fal.example/s2.png", of: "old" },
      ],
    });
    const row0 = await getStore().selectProject(p.id, U);
    await getStore().updateProjectRow(p.id, U, row0.version,
      putFilm(row0.doc, "order", { images: filmOf(row0.doc, "refs").images, status: "images", scenarioTries: 1 }));
    const drew = [];
    await runWithActor(U, () =>
      runFilmImages(p.id, U, "order", {
        only: ["shot-2"],
        generateImage: async (a) => { drew.push(a); return { url: "https://fal.example/n.png" }; },
      })
    );
    expect(drew).toHaveLength(1);
    expect(drew[0].refs.some((r) => r.url === "https://fal.example/anchor.png")).toBe(true);
    const row = await getStore().selectProject(p.id, U);
    expect(filmOf(row.doc, "order").images.find((i) => i.key === "anchor").url)
      .toBe("https://fal.example/anchor.png");
  });
});
