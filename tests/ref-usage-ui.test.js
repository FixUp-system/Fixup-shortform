// ④이미지 — **어느 사진이 실제로 쓰였는지** 보여 준다.
//
// 2026-08-18 실측: 사장님이 사진 5장을 올렸는데 컷에 실린 것은 1장이었고, 화면은 그 사실을
// 한 마디도 하지 않았다. 그래서 "레퍼런스가 반영이 안 된다"로 읽힌다. 손실이 세 층이다:
//   ① 캐스팅(LLM)이 인물 대표 한 장만 고른다
//   ② 컷당 실리는 장수에 상한이 있다(lib/cast.js) — 인물이 섞이면 사물은 한 장이다
//   ③ Storage 를 못 읽으면 조용히 빠진다(lib/cut-refs.js 의 missing)
//
// ★ 판정은 **서버에서** 온다. "어느 사진이 실리는가"는 resolveCutRefs → readRefBytes 를
//   거쳐야 알 수 있고 그 사슬이 `fs`·Storage 를 끈다 — 화면("use client")은 부를 수 없다.
//   그래서 컷 전체를 한 번에 주는 라우트를 두었다(컷마다 부르면 요청이 컷 수만큼 늘고,
//   같은 사진 바이트를 컷마다 다시 내려받는다).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, updateProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const { GET } = await import("../app/api/projects/[id]/refs/route.js");

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const req = (user = A) => ({
  headers: new Headers({ [USER_HEADER]: user, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" }),
});
const ctx = (id) => ({ params: Promise.resolve({ id }) });

// 사진 셋을 올렸는데 컷은 하나만 쓰는 프로젝트 — 실측에서 본 그 모양이다.
async function project({ bytesFor = ["a.png", "b.png", "c.png"], cuts } = {}) {
  const p = await createProject({
    ownerId: A,
    settings: { target_seconds: 30, aspect_ratio: "9:16" },
    material: {
      text: "자료",
      photos: [
        { id: "p1", url: "/api/uploads/a.png", filename: "신발.png" },
        { id: "p2", url: "/api/uploads/b.png", filename: "가방.png" },
        { id: "p3", url: "/api/uploads/c.png", filename: "모자.png" },
      ],
    },
  });
  for (const key of bytesFor) {
    await getStore().putObject("uploads", key, Buffer.from("PNG"), "image/png");
  }
  await updateProject(p.id, A, (proj) => ({
    ...proj,
    status: "images",
    cuts: cuts || [
      { idx: 0, sentence: "가", seconds: 3, shows: "a shoe", ref_ids: ["p1"] },
      { idx: 1, sentence: "나", seconds: 3, shows: "a street" },
    ],
  }));
  return p;
}

describe("GET 컷별 레퍼런스 사용 현황", () => {
  beforeEach(() => resetMemoryStore());

  it("컷마다 실린 사진을 이름까지 알려 준다", async () => {
    const p = await project();
    const got = await (await GET(req(), ctx(p.id))).json();

    expect(got.cuts).toHaveLength(2);
    expect(got.cuts[0].idx).toBe(0);
    expect(got.cuts[0].refs).toHaveLength(1);
    expect(got.cuts[0].refs[0].name, "사장님이 알아볼 이름(파일명)이 없다").toBe("신발.png");
    expect(got.cuts[0].refs[0].kind).toBe("thing");
    expect(got.cuts[0].missing).toBe(0);
    // 아무 사진도 안 실린 컷도 그렇다고 답한다 — 빈 자리가 "모름"으로 읽히면 안 된다
    expect(got.cuts[1].picked).toBe(0);
    expect(got.cuts[1].refs).toEqual([]);
  });

  it("★ 어느 컷에도 안 쓰인 사진을 알려 준다 — 이것이 지금 화면에 없는 사실이다", async () => {
    const p = await project();
    const got = await (await GET(req(), ctx(p.id))).json();

    expect(got.photos_total).toBe(3);
    expect(got.unused.map((u) => u.name).sort()).toEqual(["가방.png", "모자.png"]);
  });

  it("사진을 그대로 쓰는 컷의 사진은 안 쓰인 것으로 세지 않는다", async () => {
    // 컷이 레퍼런스로 참고하는 것이 아니라 그 사진 자체를 화면으로 쓰는 경우
    const p = await project({
      cuts: [
        { idx: 0, sentence: "가", seconds: 3, source: "photo", photo_id: "p2" },
        { idx: 1, sentence: "나", seconds: 3, shows: "a street", ref_ids: ["p1"] },
      ],
    });
    const got = await (await GET(req(), ctx(p.id))).json();

    expect(got.unused.map((u) => u.name), "그대로 쓰는 사진을 '안 쓰였다'고 하면 거짓 경고다")
      .toEqual(["모자.png"]);
  });

  it("못 읽은 사진은 실린 것으로 세지 않되, 안 쓰인 것도 아니다", async () => {
    const p = await project({ bytesFor: [] }); // Storage 에 아무것도 없다
    const got = await (await GET(req(), ctx(p.id))).json();

    expect(got.cuts[0].picked).toBe(1);
    expect(got.cuts[0].refs, "못 읽었는데 실린 것으로 센다").toEqual([]);
    expect(got.cuts[0].missing).toBe(1);
    // 고르기는 골랐다 — "안 올려서 안 쓰인 것"과 "못 읽어서 빠진 것"은 다른 사건이다
    expect(got.unused.map((u) => u.name)).toEqual(["가방.png", "모자.png"]);
  });

  it("같은 사진을 여러 컷이 쓰면 Storage 를 한 번만 읽는다", async () => {
    const p = await project({
      cuts: [
        { idx: 0, sentence: "가", seconds: 3, shows: "a shoe", ref_ids: ["p1"] },
        { idx: 1, sentence: "나", seconds: 3, shows: "a shoe", ref_ids: ["p1"] },
        { idx: 2, sentence: "다", seconds: 3, shows: "a shoe", ref_ids: ["p1"] },
      ],
    });
    const store = getStore();
    const orig = store.getObject;
    let reads = 0;
    store.getObject = (...args) => { reads += 1; return orig.apply(store, args); };
    try {
      const got = await (await GET(req(), ctx(p.id))).json();
      expect(got.cuts).toHaveLength(3);
      expect(reads, "컷 수만큼 사진 원본을 다시 내려받는다").toBe(1);
    } finally {
      store.getObject = orig;
    }
  });

  it("사진을 안 올린 프로젝트는 셀 것이 없다", async () => {
    const p = await createProject({ ownerId: A, settings: {}, material: { text: "자료" } });
    await updateProject(p.id, A, (proj) => ({
      ...proj, status: "images", cuts: [{ idx: 0, sentence: "가", seconds: 3 }],
    }));
    const got = await (await GET(req(), ctx(p.id))).json();
    expect(got.photos_total).toBe(0);
    expect(got.unused).toEqual([]);
  });

  it("남의 프로젝트는 없는 것과 같다", async () => {
    const p = await project();
    expect((await GET(req(B), ctx(p.id))).status).toBe(404);
  });

  it("광고 문서는 이 경로가 다루지 않는다", async () => {
    const p = await project();
    await updateProject(p.id, A, (proj) => ({ ...proj, kind: "ad" }));
    expect((await GET(req(), ctx(p.id))).status).toBe(404);
  });
});

// ── 화면 ────────────────────────────────────────────────────────────────
// 소스 문자열로 재므로 **범위를 좁힌다** — 파일 전체를 훑는 정규식은 주석이나 딴 블록에
// 걸려서 재려는 것을 통째로 지워도 초록이다.
const PAGE = "app/create/[id]/images/page.js";
const src = readFileSync(PAGE, "utf8");
const noComments = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

describe("④이미지 화면 — 쓴 사진 보이기", () => {
  it("서버에 물어본다 — 화면은 이 판정을 스스로 할 수 없다", () => {
    expect(noComments).toMatch(/fetch\(`\/api\/projects\/\$\{id\}\/refs`\)/);
  });

  it("컷마다 실린 사진 장수를 적는다", () => {
    expect(noComments).toContain("쓴 사진");
  });

  it("★ 어느 컷에도 안 쓰인 사진을 알린다", () => {
    expect(noComments).toContain("어느 컷에도 안 쓰였어요");
  });

  it("★ 값이 없으면 아무것도 그리지 않는다 — 빈 칸을 만들지 않는다", () => {
    // 띠지는 반드시 "안 쓰인 사진이 있다"는 조건 뒤에 있어야 한다.
    const i = noComments.indexOf("어느 컷에도 안 쓰였어요");
    const before = noComments.slice(Math.max(0, i - 400), i);
    expect(before, "조건 없이 그린다 — 사진을 안 올린 프로젝트에 빈 띠지가 뜬다")
      .toMatch(/unused\?*\.length\s*>\s*0\s*&&/);
  });

  it("큰 미리보기에도 이 컷에 쓴 사진을 적는다", () => {
    const i = noComments.indexOf("function PreviewPane");
    expect(i).toBeGreaterThan(0);
    expect(noComments.slice(i)).toContain("이 컷에 쓴 사진");
  });

  it("뒷단 낱말을 화면에 흘리지 않는다", () => {
    expect(src).not.toContain("ref_ids");
    expect(src).not.toContain("REF_MAX");
  });
});
