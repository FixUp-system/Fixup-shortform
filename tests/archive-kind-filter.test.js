// 보관함 정리 — **종류는 필터, 상태는 안 끝난 카드에만** (2026-09-15 사장님 결정).
//
// ★★★ 카드에 넷(「영상」 태그 · 날짜 · 종류 배지 · 상태 배지)이 붙어 복잡했다. 성격대로 흩었다:
//   · 종류 — 위 필터(서버가 거른다) · 날짜 — 위 좁히기 줄의 시작일·종료일(서버가 거른다)
//   · 상태 — 안 끝난 카드의 썸네일 태그 하나 · 「영상」 태그 — "완성"과 같은 말이라 걷었다
// ★★ **필터는 DB 가 거른다.** 받은 24편 안에서 거르면 「더 보기」 쪽마다 몇 편만 남아
//   영상이 사라진 것처럼 보인다.
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
        select: () => b,
        eq: (c, v) => ((state.eq ||= []).push([c, v]), b),
        or: (f) => ((state.or ||= []).push(f), b),
        lt: () => b,
        gte: (c, v) => ((state.gte ||= []).push([c, v]), b),
        lte: (c, v) => ((state.lte ||= []).push([c, v]), b),
        order: () => b,
        limit: () => b,
        then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej),
      };
      return b;
    },
  }),
}));

const { supabaseStore } = await import("../lib/store/supabase.js");
const { resetMemoryStore } = await import("../lib/store/memory.js");
const { createProject } = await import("../lib/projects.js");
const { USER_HEADER, STATUS_HEADER, ROLE_HEADER } = await import("../lib/auth/headers.js");
const { GET } = await import("../app/api/projects/route.js");
const { loadProjects } = await import("../lib/projects-client.js");
const { archiveKindOf, cardStatusTag, archiveDateOf, archiveHref, pickDateRange } = await import("../lib/archive/spec.js");
const { dayBounds } = await import("../lib/costs-filter.js");

const strip = (s) => s
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const A = "11111111-1111-1111-1111-111111111111";
const as = (qs = "") => new Request(`http://localhost/api/projects${qs}`, {
  headers: { [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" },
});

describe("archiveKindOf — 모르는 값은 전체다", () => {
  it("★ 아는 값은 그대로", () => {
    for (const k of ["all", "ad", "step"]) expect(archiveKindOf(k)).toBe(k);
  });
  it("★★ 모르는 값·빈 값은 전체 — 엉뚱하게 좁히면 영상이 사라진 것처럼 보인다", () => {
    for (const k of [null, "", "reel", "AD", "x"]) expect(archiveKindOf(k)).toBe("all");
  });
  // ★★ 2026-09-15 사장님 지시 — 「한 번에」 칸은 없다. 옛 주소 ?kind=film 은 전체로 읽는다.
  it("★★ 「한 번에」(film)는 칸이 없다 — 주소로 와도 전체다", () => {
    expect(archiveKindOf("film")).toBe("all");
  });
});

describe("cardStatusTag — 안 끝난 카드만 말한다", () => {
  it("★★★ 완성본이 있으면 태그가 없다 — 영상 자체가 보인다", () => {
    expect(cardStatusTag({ video_url: "/a.mp4" }, "시나리오")).toBeNull();
    expect(cardStatusTag({}, "완성")).toBeNull();
  });
  it("★★ 안 끝났으면 「진행 중 · 단계」", () => {
    expect(cardStatusTag({}, "시나리오")).toBe("진행 중 · 시나리오");
    expect(cardStatusTag({}, "입력")).toBe("진행 중 · 입력");
  });
  it("★ 라벨이 이미 진행을 말하면 앞말을 또 안 붙인다", () => {
    expect(cardStatusTag({}, "진행 중")).toBe("진행 중");
    expect(cardStatusTag({}, "만드는 중")).toBe("만드는 중");
    expect(cardStatusTag({}, "")).toBe("진행 중");
  });
});

describe("store(supabase) — 종류를 DB 에 건다", () => {
  beforeEach(() => { H.calls.length = 0; });

  it("★★ 원클릭은 kind 가 ad 인 것만 — 전체 목록도 같다", async () => {
    await supabaseStore.listProjects("o1", { kind: "ad" });
    expect(H.calls[0].eq).toContainEqual(["doc->>kind", "ad"]);
    await supabaseStore.listAllProjects({ kind: "ad" });
    expect(H.calls[1].eq).toContainEqual(["doc->>kind", "ad"]);
  });

  it("★★★ 단계별은 ad·film 이 아닌 전부 — 종류 없는 옛 문서(null)도 든다", async () => {
    await supabaseStore.listProjects("o1", { kind: "step" });
    const f = H.calls[0].or?.[0] || "";
    expect(f, "null 을 안 받는다 — not.in 만으로는 옛 문서가 빠진다").toContain("doc->>kind.is.null");
    expect(f).toContain("doc->>kind.not.in.(ad,film)");
  });

  it("★ 전체면 조건이 없다", async () => {
    await supabaseStore.listProjects("o1", { kind: "all" });
    expect(H.calls[0].or).toBeUndefined();
    expect((H.calls[0].eq || []).some(([c]) => c === "doc->>kind")).toBe(false);
  });
});

describe("GET /api/projects?kind= — 서버가 거른다", () => {
  beforeEach(async () => {
    resetMemoryStore();
    vi.useFakeTimers({ toFake: ["Date"] });
    const make = async (i, kind) => {
      vi.setSystemTime(Date.UTC(2026, 8, 1) + i * 1000);
      await createProject({ settings: {}, material: { text: `편${i}`, photos: [] }, ownerId: A, ...(kind ? { kind } : {}) });
    };
    await make(0, "ad");
    await make(1, "film");
    await make(2, "reel");
    await make(3); // 종류 없는 옛 문서
  });
  afterEach(() => vi.useRealTimers());

  const kinds = async (qs) => (await (await GET(as(qs), {})).json()).projects.map((p) => p.kind);

  it("★★★ 종류마다 그것만 온다 — 단계별에 「한 번에」가 안 섞인다", async () => {
    expect(await kinds("?kind=ad")).toEqual(["ad"]);
    expect((await kinds("?kind=step")).sort()).toEqual([null, "reel"].sort());
  });

  it("★ 전체·모르는 값(옛 ?kind=film 포함)은 다 온다 — 「한 번에」는 전체에서 보인다", async () => {
    expect(await kinds("")).toHaveLength(4);
    expect(await kinds("?kind=zzz")).toHaveLength(4);
    expect(await kinds("?kind=film")).toHaveLength(4);
  });
});

// ★★★ 2026-09-15 사장님 지시 — **만든 날짜로 좁힌다**(이 제품의 날짜 좁히기와 같은 한 벌).
describe("날짜 좁히기 — 서버가 거른다", () => {
  const day = (d, h = 12) => new Date(2026, 8, d, h).getTime(); // 지역 시각 2026-09-d

  beforeEach(async () => {
    resetMemoryStore();
    vi.useFakeTimers({ toFake: ["Date"] });
    // 9/10 오전 1시 · 9/11 낮 · 9/12 밤 11시 59분 · 9/13 자정 직후
    for (const [i, ts] of [[0, day(10, 1)], [1, day(11)], [2, new Date(2026, 8, 12, 23, 59).getTime()], [3, day(13, 0)]].entries()) {
      vi.setSystemTime(ts[1]);
      await createProject({ settings: {}, material: { text: `편${i}`, photos: [] }, ownerId: A });
    }
  });
  afterEach(() => vi.useRealTimers());

  const got = async (from, to) => {
    const { start, end } = dayBounds(from, to);
    const qs = new URLSearchParams();
    if (start !== null) qs.set("from_ts", String(start));
    if (end !== null) qs.set("to_ts", String(end));
    const body = await (await GET(as(`?${qs}`), {})).json();
    return body.projects.length;
  };

  it("★★★ 끝 날짜는 그 날을 **포함한다** — 9/12 밤 11시 59분에 만든 편도 든다", async () => {
    expect(await got("2026-09-11", "2026-09-12")).toBe(2);
  });

  it("★★ 시작 날짜는 그 날 자정부터 — 9/10 새벽 1시에 만든 편이 든다", async () => {
    expect(await got("2026-09-10", "2026-09-10")).toBe(1);
  });

  it("★ 한쪽만 골라도 된다 · 안 고르면 전부", async () => {
    expect(await got("2026-09-12", "")).toBe(2);
    expect(await got("", "2026-09-10")).toBe(1);
    expect(await got("", "")).toBe(4);
  });

  it("★★ to_ts 가 빈 값이면 조건이 아니다 — Number(\"\")=0 이 목록을 비우면 안 된다", async () => {
    const body = await (await GET(as("?from_ts=&to_ts="), {})).json();
    expect(body.projects).toHaveLength(4);
  });

  it("★ store(supabase) 가 경계를 created_at 에 건다", async () => {
    H.calls.length = 0;
    const { start, end } = dayBounds("2026-09-11", "2026-09-12");
    await supabaseStore.listProjects("o1", { from: start, to: end });
    expect(H.calls[0].gte).toEqual([["created_at", new Date(start).toISOString()]]);
    expect(H.calls[0].lte).toEqual([["created_at", new Date(end).toISOString()]]);
  });
});

describe("loadProjects — 좁히기를 싣는다", () => {
  const seen = [];
  const f = async (url) => { seen.push(url); return { ok: true, json: async () => ({ projects: [] }) }; };

  it("★★ 종류·날짜·커서가 함께 실린다", async () => {
    seen.length = 0;
    await loadProjects(f, "mine", 1700000000000, { kind: "step", start: 1, end: 2 });
    expect(seen[0]).toBe("/api/projects?kind=step&from_ts=1&to_ts=2&before=1700000000000");
  });

  it("★ 좁히기가 없으면 안 싣는다 — 주소가 예전 그대로다", async () => {
    seen.length = 0;
    await loadProjects(f, "mine", undefined, { kind: "all", start: null, end: null });
    await loadProjects(f);
    expect(seen).toEqual(["/api/projects", "/api/projects"]);
  });
});

// ★★★ 2026-09-15 사장님 지적 — "1월을 골랐는데 9월 영상이 나온다. 없으면 없다고 나와야 한다."
describe("pickDateRange — 날짜 하나를 고르면 그날 하루다", () => {
  it("★★★ 시작일만 고르면 종료일이 같은 날로 채워진다 — 「그날부터 지금까지」가 아니다", () => {
    expect(pickDateRange({ from: "", to: "" }, "from", "2026-01-01")).toEqual({ from: "2026-01-01", to: "2026-01-01" });
  });

  it("★★★ 종료일만 골라도 같다", () => {
    expect(pickDateRange({ from: "", to: "" }, "to", "2026-03-05")).toEqual({ from: "2026-03-05", to: "2026-03-05" });
  });

  it("★★ 범위를 넓히는 것은 그대로 받는다", () => {
    expect(pickDateRange({ from: "2026-09-08", to: "2026-09-08" }, "to", "2026-09-11")).toEqual({ from: "2026-09-08", to: "2026-09-11" });
    expect(pickDateRange({ from: "2026-09-08", to: "2026-09-11" }, "from", "2026-09-01")).toEqual({ from: "2026-09-01", to: "2026-09-11" });
  });

  it("★★ 거꾸로 되면 반대쪽을 같은 날로 맞춘다 — 키보드로 연도를 칠 때의 중간값도 여기로 온다", () => {
    expect(pickDateRange({ from: "2026-09-08", to: "2026-09-11" }, "from", "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-01" });
    expect(pickDateRange({ from: "2026-09-08", to: "2026-09-11" }, "to", "2026-01-01")).toEqual({ from: "2026-01-01", to: "2026-01-01" });
  });

  it("★ 칸을 비우면 반대쪽은 그대로 둔다", () => {
    expect(pickDateRange({ from: "2026-09-08", to: "2026-09-11" }, "from", "")).toEqual({ from: "", to: "2026-09-11" });
  });

  it("★★★ 날짜 칸이 이 판정을 지난다 — 화면이 범위를 손으로 만들지 않는다", () => {
    const page = strip(readFileSync("app/archive/page.js", "utf8"));
    expect(page).toMatch(/pickDateRange\(\{ from, to \}, which, value\)/);
    expect(page).toMatch(/changeDate\("from", e\.target\.value\)/);
    expect(page).toMatch(/changeDate\("to", e\.target\.value\)/);
  });
});

describe("보관함 주소 — 한 자리에서 싣는다", () => {
  it("★★★ 범위·종류·날짜가 함께 실린다 — 하나를 바꿔도 다른 조건이 안 떨어진다", () => {
    expect(archiveHref({ scope: "all", kind: "ad", from: "2026-09-01", to: "2026-09-15" }))
      .toBe("/archive?scope=all&kind=ad&from=2026-09-01&to=2026-09-15");
  });

  it("★ 기본값은 안 싣는다", () => {
    expect(archiveHref({ scope: "mine", kind: "all", from: "", to: "" })).toBe("/archive");
    expect(archiveHref()).toBe("/archive");
  });

  it("★ 모양이 틀린 값은 버린다 — 옛 ?kind=film · 이상한 날짜", () => {
    expect(archiveHref({ kind: "film", from: "9월 1일" })).toBe("/archive");
    expect(archiveDateOf("2026-9-1")).toBe("");
    expect(archiveDateOf("2026-09-01")).toBe("2026-09-01");
  });
});

describe("화면 — 좁히기 줄과 카드", () => {
  const page = strip(readFileSync("app/archive/page.js", "utf8"));
  const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));

  it("★★★ 종류 칸은 aria-pressed 로 고른 칸을 말한다(범위 토글과 같은 규율)", () => {
    expect(page).toMatch(/ARCHIVE_KINDS\.map/);
    expect(page).toMatch(/aria-pressed=\{kind === k\.id\}/);
  });

  it("★★ 첫 값은 주소가 정하고, 바꾸면 주소를 replace 로 옮긴다 — 주소는 archiveHref 하나가 만든다", () => {
    expect(page).toMatch(/archiveKindOf\(params\.get\("kind"\)\)/);
    expect(page).toMatch(/archiveDateOf\(params\.get\("from"\)\)/);
    expect(page).toMatch(/archiveDateOf\(params\.get\("to"\)\)/);
    for (const name of ["changeScope", "changeKind", "changeDate", "resetFilters"]) {
      const fn = page.slice(page.indexOf(`function ${name}`));
      expect(fn.slice(0, fn.indexOf("\n  }")), name).toMatch(/router\.replace\(archiveHref\(/);
    }
  });

  it("★★ 첫 쪽과 「더 보기」가 **같은 좁히기**로 부른다 — 갈리면 다른 조건의 편이 붙는다", () => {
    const calls = page.match(/loadProjects\([^)]*\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) expect(c, c).toMatch(/\{ kind, start, end \}\)$/);
  });

  it("★★ 좁히기를 바꾸면 다시 부른다", () => {
    expect(page).toMatch(/\}, \[viewScope, kind, start, end\]\);/);
  });

  it("★★★ 카드에는 「영상」 태그·종류 배지가 없고, 상태 태그는 판정을 지난다", () => {
    expect(cards).not.toContain('<span className="thumb-tag">영상</span>');
    expect(cards).not.toMatch(/className="badge/);
    expect(cards).toMatch(/cardStatusTag\(p, label\)/);
    expect(cards).toMatch(/\{status && <span className="thumb-tag">\{status\}<\/span>\}/);
  });
});

