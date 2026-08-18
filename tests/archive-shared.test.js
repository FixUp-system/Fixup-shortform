// 보관함 전체 공유 — **읽기만** 연다.
//
// 내부 팀이라 남이 만든 결과물을 서로 볼 수 있어야 한다. 그런데 이 저장소의 규율은
// "getProject(id, ownerId) 가 소유자를 필수로 요구한다"이고, 그 덕분에 20곳 넘는
// 제작 라우트가 **아무도 기억하지 않아도** 잠겨 있다. 그 문에 "검사 건너뛰기" 옵션을
// 달면 그 보장이 통째로 사라진다 — 그래서 문을 새로 판다(getProjectForViewing).
//
// 이 파일이 지키는 것은 두 가지다:
//   ① 읽는 문 넷(목록·상세·영상 파일·업로드 사진)이 실제로 열렸는가
//   ② **돈이 나가거나 파괴하는 문은 그대로 잠겨 있는가** — 특히 쓰기 라우트가
//      새 문(getProjectForViewing·listAllProjects)을 **부르지 않는다**는 정적 보장.
//      이 한 줄이 무너지면 남의 프로젝트로 유료 생성이 돌 수 있다.
import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  createProject,
  updateProject,
  getProject,
  getProjectForViewing,
  listProjects,
  listAllProjects,
} from "../lib/projects.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { GET as PROJECTS_GET } from "../app/api/projects/route.js";
import { GET as PROJECT_GET, PATCH as PROJECT_PATCH, DELETE as PROJECT_DELETE } from "../app/api/projects/[id]/route.js";
import { GET as AD_GET, PATCH as AD_PATCH } from "../app/api/ads/[id]/route.js";
import { GET as RENDER_GET } from "../app/api/renders/[name]/route.js";
import { GET as UPLOAD_GET } from "../app/api/uploads/[name]/route.js";

// 가짜 PostgREST — 체이닝만 기록한다(tests/store-supabase-rows.test.js 와 같은 방식).
// 인메모리 저장소로는 "owner_id 필터를 걸었는가"가 아예 안 보이기 때문에 필요하다.
// 이 파일의 나머지 테스트는 인메모리(SHOTFORM_STORE=memory)라 이 mock 을 지나지 않는다.
const H = vi.hoisted(() => ({ calls: [] }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table) {
      const state = { table };
      H.calls.push(state);
      const b = {
        select: (cols) => ((state.select = cols), b),
        eq: (c, v) => ((state.eq ||= []).push([c, v]), b),
        order: () => b,
        limit: (n) => ((state.limit = n), b),
        then: (res) => Promise.resolve({ data: [], error: null }).then(res),
      };
      return b;
    },
  }),
}));
process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

const A = "00000000-0000-4000-8000-0000000000aa"; // 나
const B = "00000000-0000-4000-8000-0000000000bb"; // 남

const headers = (uid) =>
  new Headers({ [USER_HEADER]: uid, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" });
const req = (uid) => ({ headers: headers(uid) });
const urlReq = (uid, url) => new Request(url, { headers: headers(uid) });
const ctx = (v) => ({ params: Promise.resolve(v) });

const make = (ownerId, text = "자료", extra) =>
  createProject({ ownerId, settings: {}, material: { text, photos: [] }, ...extra });

// ── ① 새 문 자체 ────────────────────────────────────────────────────────────
describe("getProjectForViewing — 보기 전용 문", () => {
  it("남이 만든 프로젝트를 읽어 준다", async () => {
    const p = await make(B, "남의 영상");
    const v = await getProjectForViewing(p.id, A);
    expect(v?.doc?.id).toBe(p.id);
  });

  it("내 것인지 아닌지를 함께 알려준다 — 화면이 쓰기 버튼을 지우는 근거다", async () => {
    const mine = await make(A);
    const theirs = await make(B);
    expect((await getProjectForViewing(mine.id, A)).mine).toBe(true);
    expect((await getProjectForViewing(theirs.id, A)).mine).toBe(false);
  });

  it("없는 것은 null 이다", async () => {
    expect(await getProjectForViewing("00000000-0000-4000-8000-0000000000ff", A)).toBeNull();
  });

  it("소유자 검사 문(getProject)은 그대로다 — 남의 것은 여전히 안 준다", async () => {
    const p = await make(B);
    expect(await getProject(p.id, A)).toBeNull();
    await expect(getProject(p.id)).rejects.toThrow(/소유자/);
  });
});

describe("listAllProjects — 보관함 전체 목록", () => {
  it("모두를 최신순으로 주고, 내 것에만 mine 을 세운다", async () => {
    const mine = await make(A, "내 것");
    const theirs = await make(B, "남의 것");
    const all = await listAllProjects(A);
    expect(all.map((r) => r.id).sort()).toEqual([mine.id, theirs.id].sort());
    expect(all.find((r) => r.id === mine.id).mine).toBe(true);
    expect(all.find((r) => r.id === theirs.id).mine).toBe(false);
  });

  it("만든 사람이 누구인지는 안 흘린다 — 이번 범위 밖이다", async () => {
    await make(B);
    const [row] = await listAllProjects(A);
    expect(row).not.toHaveProperty("owner_id");
    expect(row).not.toHaveProperty("email");
  });

  it("doc 통짜를 안 싣는다 — 목록의 계약은 그대로다", async () => {
    await make(B);
    const [row] = await listAllProjects(A);
    expect(row).not.toHaveProperty("cuts");
    expect(row).toHaveProperty("title");
  });

  it("내 목록(listProjects)은 여전히 내 것만 주고 mine 은 늘 참이다", async () => {
    const mine = await make(A);
    await make(B);
    const rows = await listProjects(A);
    expect(rows.map((r) => r.id)).toEqual([mine.id]);
    expect(rows[0].mine).toBe(true);
  });
});

// ── ② 읽는 문 넷 ────────────────────────────────────────────────────────────
describe("GET /api/projects — scope 로 갈린다", () => {
  it("기본은 내 것만이다 — 실수로 전체가 기본이 되면 안 된다", async () => {
    const mine = await make(A);
    await make(B);
    const res = await PROJECTS_GET(urlReq(A, "http://t/api/projects"), {});
    const { projects } = await res.json();
    expect(projects.map((p) => p.id)).toEqual([mine.id]);
  });

  it("scope=all 이면 남의 것도 준다", async () => {
    await make(A);
    const theirs = await make(B);
    const res = await PROJECTS_GET(urlReq(A, "http://t/api/projects?scope=all"), {});
    const { projects } = await res.json();
    expect(projects.map((p) => p.id)).toContain(theirs.id);
    expect(projects.find((p) => p.id === theirs.id).mine).toBe(false);
  });
});

describe("GET /api/projects/[id] · /api/ads/[id] — 남의 것도 열어 준다", () => {
  it("단계별 문서를 읽어 준다", async () => {
    const p = await make(B, "남의 단계별");
    const res = await PROJECT_GET(req(A), ctx({ id: p.id }));
    expect(res.status ?? 200).toBe(200);
    const doc = await res.json();
    expect(doc.id).toBe(p.id);
    expect(doc.mine).toBe(false);
  });

  it("광고 문서를 읽어 준다", async () => {
    const p = await make(B, "남의 광고", { kind: "ad" });
    const res = await AD_GET(req(A), ctx({ id: p.id }));
    expect(res.status ?? 200).toBe(200);
    const doc = await res.json();
    expect(doc.id).toBe(p.id);
    expect(doc.mine).toBe(false);
  });

  it("두 문의 격리는 그대로다 — 광고는 /api/projects 에서 404 다", async () => {
    const p = await make(B, "남의 광고", { kind: "ad" });
    const res = await PROJECT_GET(req(A), ctx({ id: p.id }));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/renders/[name] — 남이 만든 영상도 재생된다", () => {
  it("남의 완성본을 흘려준다", async () => {
    const p = await make(B, "남의 완성본");
    await updateProject(p.id, B, (d) => ({ ...d, render: { url: `/api/renders/${p.id}.mp4`, ts: 1 } }));
    await getStore().putObject("renders", `${p.id}.mp4`, Buffer.from("mp4-bytes"), "video/mp4");
    const res = await RENDER_GET(urlReq(A, `http://t/api/renders/${p.id}.mp4`), ctx({ name: `${p.id}.mp4` }));
    expect(res.status ?? 200).toBe(200);
  });

  it("프로젝트가 아예 없으면 그대로 404 다", async () => {
    const name = "00000000-0000-4000-8000-0000000000ff.mp4";
    const res = await RENDER_GET(urlReq(A, `http://t/api/renders/${name}`), ctx({ name }));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/uploads/[name] — 남이 올린 사진도 보인다", () => {
  it("남의 업로드를 흘려준다", async () => {
    const key = "aaaaaaaa-0000-4000-8000-000000000001.jpg";
    await getStore().insertUploadOwner(key, B);
    await getStore().putObject("uploads", key, Buffer.from("jpg"), "image/jpeg");
    const res = await UPLOAD_GET(req(A), ctx({ name: key }));
    expect(res.status ?? 200).toBe(200);
  });

  it("주인 기록이 없는 파일은 여전히 안 연다 — 아무 이름이나 찔러보는 길을 막는다", async () => {
    const res = await UPLOAD_GET(req(A), ctx({ name: "bbbbbbbb-0000-4000-8000-000000000002.jpg" }));
    expect(res.status).toBe(404);
  });
});

// ── ③ 잠긴 채로 남아야 하는 문 ──────────────────────────────────────────────
describe("쓰는 문은 그대로 잠겨 있다", () => {
  it("남의 것은 못 지운다", async () => {
    const p = await make(B);
    const res = await PROJECT_DELETE(req(A), ctx({ id: p.id }));
    expect(res.status).toBe(404);
    expect(await getProject(p.id, B), "남의 프로젝트가 지워졌다").toBeTruthy();
  });

  it("남의 것은 못 고친다 (단계별)", async () => {
    const p = await make(B);
    const res = await PROJECT_PATCH(
      { headers: headers(A), json: async () => ({ settings: { aspect_ratio: "9:16" } }) },
      ctx({ id: p.id })
    );
    expect(res.status).toBe(404);
  });

  it("남의 것은 못 고친다 (광고)", async () => {
    const p = await make(B, "남의 광고", { kind: "ad" });
    const res = await AD_PATCH(
      { headers: headers(A), json: async () => ({ material: { text: "덮어쓰기" } }) },
      ctx({ id: p.id })
    );
    expect(res.status).toBe(404);
  });
});

// ★ 이 파일에서 가장 중요한 테스트.
//
// 읽는 문을 새로 판 대가는 "누군가 그 문을 쓰기 자리에 갖다 쓰는 것"이다. 그러면
// 남의 프로젝트로 이미지·영상 생성이 돌아 **남의 이름으로 돈이 나간다**. 파일 단위가
// 아니라 **메서드 블록 단위**로 본다 — GET 과 PATCH 가 한 파일에 같이 사는 라우트가
// 여럿이라(projects/[id]·ads/[id]) 파일 단위 검사는 그 자리를 못 잡는다.
describe("★ 쓰기 라우트는 보기 전용 문을 부르지 않는다", () => {
  const routeFiles = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "route.js") routeFiles.push(full);
    }
  })("app/api");

  // 주석을 걷어내고 판정한다 — 주석 속 낱말이 계약을 대신 통과시키는 사고가 반복됐다.
  const strip = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  const VIEWING = /ForViewing|listAllProjects/;
  const METHOD = /export\s+(?:const|async\s+function)\s+(GET|POST|PATCH|PUT|DELETE)\b/g;

  it("라우트 파일을 실제로 훑었다 — 목록이 비면 이 테스트는 아무것도 안 지킨다", () => {
    expect(routeFiles.length).toBeGreaterThan(20);
  });

  it("GET 이 아닌 핸들러 안에는 보기 전용 문이 한 번도 안 나온다", () => {
    const offenders = [];
    for (const file of routeFiles) {
      const src = strip(readFileSync(file, "utf8"));
      const marks = [...src.matchAll(METHOD)];
      for (let i = 0; i < marks.length; i++) {
        if (marks[i][1] === "GET") continue;
        const body = src.slice(marks[i].index, marks[i + 1]?.index ?? src.length);
        if (VIEWING.test(body)) offenders.push(`${file} → ${marks[i][1]}`);
      }
    }
    expect(offenders, "쓰기 핸들러가 소유자 검사를 건너뛰는 문을 쓴다").toEqual([]);
  });

  it("소유자 검사 문에 '건너뛰기' 옵션이 안 생겼다", () => {
    const src = strip(readFileSync("lib/projects.js", "utf8"));
    // getProject 는 여전히 requireOwner 를 지난다
    expect(src).toMatch(/export async function getProject\(id, ownerId\)\s*\{\s*requireOwner\(ownerId\)/);
    expect(src).not.toMatch(/skipOwner|ignoreOwner|bypassOwner|allowAnyOwner/);
  });
});

// ── ④ 화면 ─────────────────────────────────────────────────────────────────
describe("보관함 화면 — 전체/내 영상", () => {
  const strip = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const page = strip(readFileSync("app/archive/page.js", "utf8"));
  const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));
  const detail = strip(readFileSync("app/archive/[id]/page.js", "utf8"));

  it("전환 버튼 둘이 있다", () => {
    expect(page).toContain("전체");
    expect(page).toContain("내 영상");
  });

  it("기본값은 내 영상이다 — 켜자마자 남의 것이 쏟아지면 안 된다", () => {
    expect(page).toMatch(/useState\(\s*["']mine["']\s*\)/);
  });

  it("전체를 고르면 scope 를 실어 다시 부른다", () => {
    expect(page).toMatch(/scope/);
    expect(strip(readFileSync("lib/projects-client.js", "utf8"))).toMatch(/scope=all/);
  });

  it("남의 카드에는 지우기 버튼을 안 그린다", () => {
    // 지우기 버튼이 mine 판정을 지나야 한다
    expect(cards).toMatch(/mine[^\n]*&&|&&[^\n]*mine/);
    expect(cards).toContain("card-del");
  });

  it("남의 것에는 [이어서 작업하기]를 안 그린다 — 눌러도 404 인 유료 문이다", () => {
    expect(detail).toMatch(/mine/);
  });
});

// ── ⑤ Supabase 구현 ────────────────────────────────────────────────────────
//
// 인메모리 저장소로는 절대 못 잡는 자리다 — "owner_id 필터를 안 걸었는가"는
// 쿼리 체인을 봐야만 보인다(tests/store-supabase-rows.test.js 와 같은 이유).
describe("supabaseStore.listAllProjects — owner_id 로 안 거른다", () => {
  it("소유자 필터 없이 읽고, 행에 owner_id 를 실어 온다", async () => {
    H.calls.length = 0;
    const { supabaseStore } = await import("../lib/store/supabase.js");
    await supabaseStore.listAllProjects();
    expect(H.calls[0].eq, "전체 목록인데 소유자 필터가 걸려 있다").toBeUndefined();
    expect(H.calls[0].select).toContain("owner_id");
  });

  it("내 목록은 지금처럼 owner_id 로 거른다 — 두 문이 갈려 있어야 한다", async () => {
    H.calls.length = 0;
    const { supabaseStore } = await import("../lib/store/supabase.js");
    await supabaseStore.listProjects("owner-9");
    expect(H.calls[0].eq).toContainEqual(["owner_id", "owner-9"]);
  });
});
