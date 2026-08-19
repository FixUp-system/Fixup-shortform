import { describe, it, expect } from "vitest";
import { emptyFilm, filmOf, putFilm } from "../lib/film/doc.js";

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
