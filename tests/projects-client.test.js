import { describe, it, expect } from "vitest";
import { loadProjects } from "../lib/projects-client.js";

// ★ 최종 리뷰 I4 — 홈 화면이 500·403 을 삼켜 "아직 만든 영상이 없어요"로 보여주던 것을
// /costs 화면(lib/costs-client.js)과 같은 방식으로 맞췄다.
const fakeFetch = (status, body) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe("loadProjects — 실패를 삼키지 않는다", () => {
  it("500 이면 빈 목록이 아니라 오류를 준다", async () => {
    const { projects, err } = await loadProjects(fakeFetch(500, { error: "boom" }));
    expect(projects).toEqual([]);
    expect(err).toBe("목록을 불러오지 못했어요");
  });

  it("네트워크 오류도 오류로 준다", async () => {
    const { projects, err } = await loadProjects(async () => {
      throw new Error("네트워크 끊김");
    });
    expect(projects).toEqual([]);
    expect(err).toBe("목록을 불러오지 못했어요");
  });

  it("성공하면 목록을 그대로 준다", async () => {
    const { projects, err } = await loadProjects(fakeFetch(200, { projects: [{ id: "p1" }] }));
    expect(err).toBe("");
    expect(projects).toHaveLength(1);
  });
});
