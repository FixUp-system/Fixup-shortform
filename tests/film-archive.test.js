// 보관함에서 두 방식을 구분한다(2026-08-19 사장님 요청).
//
// ★★ 그 전에 구멍이 둘이었다:
//   ① 목록이 films 를 안 뽑아 카드가 방식을 모른다 — "한 번에" 배지만 있고 장면 순서인지
//      참고 그림인지 안 보인다.
//   ② **film 카드에 썸네일이 아예 안 나온다.** video_url 이 `doc.render`(단계별)와
//      `doc.videos[0]`(광고)만 보는데, film 은 films[mode].video.url 에 있다.
//
// ★ film 은 한 프로젝트가 **두 편**을 담는다(order·refs). 카드는 하나이고, 어느 쪽을
//   구웠는지를 배지로 말한다 — 둘 다 구웠으면 둘 다 붙는다.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { createProject, updateProject, listProjects } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { resetMemoryStore } from "../lib/store/memory.js";
import { putFilm } from "../lib/film/doc.js";

const U = "00000000-0000-4000-8000-0000000000f1";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const makeFilm = async (patch) => {
  const p = await runWithActor(U, () =>
    createProject({ ownerId: U, kind: "film", material: { text: "키링 광고", photos: [] }, settings: {} })
  );
  if (patch) await runWithActor(U, () => updateProject(p.id, U, patch));
  return p;
};

describe("보관함 목록이 film 을 안다", () => {
  beforeEach(() => resetMemoryStore());

  it("★ 구운 방식을 목록이 알려준다", async () => {
    const p = await makeFilm((d) => putFilm(d, "order", { status: "done", video: { url: "/api/renders/a-order.mp4" } }));
    const row = (await runWithActor(U, () => listProjects(U))).find((r) => r.id === p.id);
    expect(row.film_modes).toEqual(["order"]);
  });

  it("★ 둘 다 구웠으면 둘 다 알려준다", async () => {
    const p = await makeFilm((d) =>
      putFilm(putFilm(d, "order", { status: "done", video: { url: "/a-order.mp4" } }), "refs", {
        status: "done", video: { url: "/a-refs.mp4" },
      })
    );
    const row = (await runWithActor(U, () => listProjects(U))).find((r) => r.id === p.id);
    expect(row.film_modes.sort()).toEqual(["order", "refs"]);
  });

  it("아직 안 구웠으면 빈 배열이다 — 배지가 안 붙는다", async () => {
    const p = await makeFilm();
    const row = (await runWithActor(U, () => listProjects(U))).find((r) => r.id === p.id);
    expect(row.film_modes).toEqual([]);
  });

  it("★★ film 카드에도 썸네일이 나온다 — 그 전에는 video_url 이 null 이었다", async () => {
    const p = await makeFilm((d) => putFilm(d, "order", { status: "done", video: { url: "/api/renders/a-order.mp4" } }));
    const row = (await runWithActor(U, () => listProjects(U))).find((r) => r.id === p.id);
    expect(row.video_url).toBe("/api/renders/a-order.mp4");
  });

  it("film 이 아닌 문서는 film_modes 가 빈 배열이다 — 옛 카드가 안 바뀐다", async () => {
    const p = await runWithActor(U, () =>
      createProject({ ownerId: U, kind: "ad", material: { text: "광고", photos: [] }, settings: {} })
    );
    const row = (await runWithActor(U, () => listProjects(U))).find((r) => r.id === p.id);
    expect(row.film_modes).toEqual([]);
  });
});

describe("카드가 방식을 그린다", () => {
  const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));

  it("★ 방식 이름을 표에서 가져온다 — 손으로 적으면 방식이 늘 때 빠진다", () => {
    expect(cards).toMatch(/FILM_MODES/);
  });

  it("★ film_modes 를 읽어 배지를 그린다", () => {
    expect(cards).toMatch(/film_modes/);
  });
});
