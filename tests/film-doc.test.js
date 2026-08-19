import { describe, it, expect } from "vitest";
import { emptyFilm, filmOf, putFilm, scenarioLock, MAX_FILM_IMAGE_TRIES } from "../lib/film/doc.js";

describe("방식별 두 벌", () => {
  it("★ 없는 방식을 물으면 빈 칸이 온다 — 옛 문서에서도 안 죽는다", () => {
    expect(filmOf({}, "order")).toEqual(emptyFilm());
  });

  it("★ 한 방식을 구워도 **다른 방식이 그대로 남는다** — 비교가 이 기능의 목적이다", () => {
    let p = { id: "x" };
    p = putFilm(p, "refs", { video: { url: "/api/renders/x-refs.mp4", seconds: 15 }, status: "done" });
    p = putFilm(p, "order", { video: { url: "/api/renders/x-order.mp4", seconds: 15 }, status: "done" });
    expect(filmOf(p, "refs").video.url).toBe("/api/renders/x-refs.mp4");
    expect(filmOf(p, "order").video.url).toBe("/api/renders/x-order.mp4");
  });

  it("★ 같은 방식을 다시 구우면 그 칸만 덮어쓴다", () => {
    let p = putFilm({}, "order", { status: "rendering" });
    p = putFilm(p, "order", { status: "done" });
    expect(filmOf(p, "order").status).toBe("done");
  });

  it("★ 모르는 방식은 던진다", () => {
    expect(() => putFilm({}, "nope", {})).toThrow();
    expect(() => filmOf({}, "nope")).toThrow();
  });

  it("★ 프로젝트의 다른 값은 그대로다", () => {
    const p = putFilm({ id: "x", scenario: { text: "s" } }, "order", { status: "done" });
    expect(p.id).toBe("x");
    expect(p.scenario.text).toBe("s");
  });
});

describe("프로젝트 종류", () => {
  it("★ film 종류가 등록돼 있다 — 없으면 createProject 가 던진다", async () => {
    const src = (await import("node:fs")).readFileSync("lib/projects.js", "utf8");
    expect(src).toMatch(/KINDS\s*=\s*\[[^\]]*"film"/);
  });
});

// 시나리오 잠금 — **프로젝트 전체**를 보는 유일한 판정이다(다른 판정은 방식 하나만 본다).
// 라우트와 화면이 같은 값을 봐야 "화면은 열어 줬는데 서버가 400" 이 안 생긴다.
describe("scenarioLock", () => {
  const P = (films) => ({ films });

  it("아무것도 안 했으면 안 막는다", () => {
    expect(scenarioLock(P({}))).toBe(null);
    expect(scenarioLock({})).toBe(null);
    expect(scenarioLock(null)).toBe(null);
  });

  it("그림만 있으면 아직 고칠 수 있다 — 값을 치르기 전이라 막다른 길을 안 만든다", () => {
    expect(scenarioLock(P({ order: { status: "images", images: [{ url: "a" }] } }))).toBe(null);
  });

  it("★ 한 편이라도 구웠으면 막는다", () => {
    expect(scenarioLock(P({ order: { video: { url: "/x.mp4" } } }))?.reason).toBe("baked");
  });

  it("★★ 굽는 중에도 막는다 — 접수된 편은 이미 값을 치렀다", () => {
    expect(scenarioLock(P({ refs: { status: "rendering" } }))?.reason).toBe("rendering");
  });

  it("★★ 그림 상한을 다 쓴 방식이 있으면 막는다 — 안 막으면 값을 치를 길이 없어진다", () => {
    expect(scenarioLock(P({ order: { imageTries: MAX_FILM_IMAGE_TRIES } }))?.reason).toBe("images_exhausted");
  });

  it("옆 방식이 걸려도 막는다 — 시나리오는 둘이 공유하는 하나다", () => {
    const lock = scenarioLock(P({ order: { status: "draft" }, refs: { status: "rendering" } }));
    expect(lock?.reason).toBe("rendering");
  });

  it("사유마다 하는 말이 다르다 — 잠긴 이유를 화면이 그대로 보여준다", () => {
    const msgs = [
      scenarioLock(P({ order: { video: { url: "/x.mp4" } } })).message,
      scenarioLock(P({ order: { status: "rendering" } })).message,
      scenarioLock(P({ order: { imageTries: MAX_FILM_IMAGE_TRIES } })).message,
    ];
    expect(new Set(msgs).size).toBe(3);
    msgs.forEach((m) => expect(m.length).toBeGreaterThan(0));
  });
});
