// 보관함 「더 보기」 — 목록을 끊어 이어 붙인다 (2026-09-15 사장님 결정).
//
// ★★★ 그전에는 목록이 `limit(100)` 한 번이라 **101편째부터 아무 말 없이 안 보였다.**
//   끊는 방식은 크레딧 내역(app/me/page.js · lib/ledger-read.js)과 같은 모양이다 —
//   번호 페이지가 아니라 **시각 커서(before)** 로 이어 받는다. 지우기가 있는 목록이라
//   번호로 끊으면 한 편 지울 때마다 뒷장이 앞으로 밀려 한 편을 건너뛴다.
// ★★ 다음이 있는지는 **한 편 더 읽어서** 안다(PROJECT_PAGE + 1) — 개수를 따로 세면
//   왕복이 하나 는다.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";

process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

const H = vi.hoisted(() => ({ calls: [] }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table) {
      const state = { table };
      H.calls.push(state);
      const b = {
        select: (cols) => ((state.select = cols), b),
        eq: (c, v) => ((state.eq ||= []).push([c, v]), b),
        lt: (c, v) => ((state.lt ||= []).push([c, v]), b),
        order: () => b,
        limit: (n) => ((state.limit = n), b),
        then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej),
      };
      return b;
    },
  }),
}));

const { supabaseStore } = await import("../lib/store/supabase.js");
const { resetMemoryStore } = await import("../lib/store/memory.js");
const { createProject, PROJECT_PAGE } = await import("../lib/projects.js");
const { USER_HEADER, STATUS_HEADER, ROLE_HEADER } = await import("../lib/auth/headers.js");
const { GET } = await import("../app/api/projects/route.js");
const { loadProjects } = await import("../lib/projects-client.js");

const A = "11111111-1111-1111-1111-111111111111";
const as = (qs = "") => new Request(`http://localhost/api/projects${qs}`, {
  headers: { [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" },
});

describe("store(supabase) — 커서와 상한을 DB 에 건다", () => {
  beforeEach(() => { H.calls.length = 0; });

  it("★★★ before 를 주면 그 시각보다 앞선 것만 묻는다 — 내 목록", async () => {
    const ts = Date.UTC(2026, 8, 1);
    await supabaseStore.listProjects("o1", { before: ts, limit: 25 });
    expect(H.calls[0].lt).toEqual([["created_at", new Date(ts).toISOString()]]);
    expect(H.calls[0].limit).toBe(25);
  });

  it("★★ 전체 목록도 같다 — 두 탭이 다르게 끊기면 안 된다", async () => {
    const ts = Date.UTC(2026, 8, 1);
    await supabaseStore.listAllProjects({ before: ts, limit: 25 });
    expect(H.calls[0].lt).toEqual([["created_at", new Date(ts).toISOString()]]);
    expect(H.calls[0].limit).toBe(25);
  });

  it("★ before 가 없으면 커서를 안 건다 — 첫 쪽이다", async () => {
    await supabaseStore.listProjects("o1", { limit: 25 });
    expect(H.calls[0].lt).toBeUndefined();
  });
});

describe("GET /api/projects — 한 쪽씩 준다", () => {
  beforeEach(() => {
    resetMemoryStore();
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => vi.useRealTimers());

  // 만든 시각이 겹치지 않게 1초씩 벌려 만든다(커서가 시각이라 같은 ms 는 시험이 흐려진다).
  async function make(n) {
    for (let i = 0; i < n; i++) {
      vi.setSystemTime(Date.UTC(2026, 8, 1) + i * 1000);
      await createProject({ settings: {}, material: { text: `편${i}`, photos: [] }, ownerId: A });
    }
  }

  it("★★★ 한 쪽을 넘으면 그만큼만 주고 has_more 로 알린다", async () => {
    await make(PROJECT_PAGE + 3);
    const body = await (await GET(as(), {})).json();
    expect(body.projects).toHaveLength(PROJECT_PAGE);
    expect(body.has_more).toBe(true);
  });

  it("★★★ before 로 이어 받으면 겹치지도 빠지지도 않는다", async () => {
    await make(PROJECT_PAGE + 3);
    const first = await (await GET(as(), {})).json();
    const last = first.projects[first.projects.length - 1];
    const second = await (await GET(as(`?before=${last.created_ts}`), {})).json();
    expect(second.projects).toHaveLength(3);
    expect(second.has_more).toBe(false);
    const ids = [...first.projects, ...second.projects].map((p) => p.id);
    expect(new Set(ids).size).toBe(PROJECT_PAGE + 3);
  });

  it("★ 한 쪽에 다 들어가면 has_more 는 false 다", async () => {
    await make(2);
    const body = await (await GET(as(), {})).json();
    expect(body.projects).toHaveLength(2);
    expect(body.has_more).toBe(false);
  });

  it("★ 이상한 before 는 첫 쪽으로 읽는다 — before=0 이 목록을 통째로 비우면 안 된다", async () => {
    await make(2);
    for (const q of ["?before=0", "?before=abc", "?before=-5"]) {
      const body = await (await GET(as(q), {})).json();
      expect(body.projects, q).toHaveLength(2);
    }
  });
});

describe("loadProjects — before 를 싣고 has_more 를 돌려준다", () => {
  const ok = (body, seen) => async (url) => {
    seen.push(url);
    return { ok: true, status: 200, json: async () => body };
  };

  it("★★ before 가 주소에 실린다(범위와 함께)", async () => {
    const seen = [];
    await loadProjects(ok({ projects: [] }, seen), "all", 1700000000000);
    expect(seen[0]).toBe("/api/projects?scope=all&before=1700000000000");
  });

  it("★ 인자가 없으면 주소가 예전 그대로다 — 홈 등 옛 호출부", async () => {
    const seen = [];
    await loadProjects(ok({ projects: [] }, seen));
    expect(seen[0]).toBe("/api/projects");
  });

  it("★★ hasMore 를 준다 — 옛 응답(필드 없음)은 false", async () => {
    expect((await loadProjects(ok({ projects: [], has_more: true }, []))).hasMore).toBe(true);
    expect((await loadProjects(ok({ projects: [] }, []))).hasMore).toBe(false);
  });
});

describe("보관함 화면 — 「더 보기」", () => {
  const page = readFileSync("app/archive/page.js", "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("★★★ 버튼이 있고, 마지막 카드의 시각으로 이어 받는다", () => {
    expect(page).toContain("더 보기");
    expect(page, "마지막 카드의 created_ts 를 커서로 안 쓴다").toMatch(/created_ts/);
  });

  it("★★ 이어 받은 것은 **붙인다** — 갈아 끼우면 보던 카드가 사라진다", () => {
    expect(page).toMatch(/\.\.\.\s*\(?list/);
  });
});
