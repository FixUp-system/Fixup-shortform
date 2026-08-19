// ★ 단계별 경로의 문 — **종류가 있는 문서는 전부 막는다.**
//
// tests/ad-isolation.test.js 는 `kind === "ad"` 하나만 잰다. 그 판정이 곧 구현이기도 했다:
// 21곳이 손으로 `project.kind === "ad"` 를 적고 있었다. 그래서 새 종류(`kind:"film"`)가
// 생기자 **그 문서들이 단계별 유료 라우트로 그대로 통과**했다. 거기서 만들어지는 컷·이미지·
// 클립은 다른 장부 키(video:)로 청구되므로 장부가 갈린다.
//
// 판정을 뒤집는다: 옛 문서에는 `kind` 필드가 **아예 없다**(그것이 곧 "단계별 문서"라는 뜻이다).
// 그러니 단계별 경로는 **kind 가 없는 문서만** 받는다 — 그러면 "ad" 든 "film" 이든,
// 앞으로 늘어날 종류든 자동으로 막힌다. 판정은 lib/projects.js 의 isStepDoc 한 자리에 있다.
//
// 이 파일이 지키는 것은 셋이다:
//   ① film 문서가 단계별 라우트 전부에서 404 인가
//   ② 광고 문서는 **여전히** 404 인가(판정을 넓히다 광고를 열어 버리는 것이 가장 흔한 사고다)
//   ③ 옛 문서(kind 없음)는 그대로 통과하는가
// 그리고 ★ 정적 그물: app/api/projects/** 의 핸들러 중 이 판정을 **안 쓰는 것이 있으면 실패**한다.
//   다음 종류가 생겼을 때 또 21곳을 뒤지지 않기 위한 자리다.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { resetMemoryStore } from "../lib/store/memory.js";
import { createProject, isStepDoc } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

import { GET as projectGET, PATCH as projectPATCH } from "../app/api/projects/[id]/route.js";
import { POST as autoPOST } from "../app/api/projects/[id]/auto/route.js";
import { POST as scenarioPOST, PATCH as scenarioPATCH } from "../app/api/projects/[id]/scenario/route.js";
import { POST as cutsPOST } from "../app/api/projects/[id]/cuts/route.js";
import { POST as cutRegenPOST } from "../app/api/projects/[id]/cuts/[idx]/regen/route.js";
import { GET as cutPromptGET } from "../app/api/projects/[id]/cuts/[idx]/prompt/route.js";
import { POST as voicePOST } from "../app/api/projects/[id]/voice/route.js";
import { POST as voiceRegenPOST } from "../app/api/projects/[id]/voice/[idx]/regen/route.js";
import { POST as imagesPOST } from "../app/api/projects/[id]/images/route.js";
import { POST as clipsPOST } from "../app/api/projects/[id]/clips/route.js";
import { POST as clipRegenPOST } from "../app/api/projects/[id]/clips/[idx]/regen/route.js";
import { POST as renderPOST } from "../app/api/projects/[id]/render/route.js";
import { POST as subtitlePOST } from "../app/api/projects/[id]/subtitle/route.js";
import { POST as subtitleLangPOST } from "../app/api/projects/[id]/subtitle-lang/route.js";
import { GET as refsGET } from "../app/api/projects/[id]/refs/route.js";
import { GET as statusGET } from "../app/api/projects/[id]/status/route.js";
import { GET as cutsStatusGET } from "../app/api/projects/[id]/cuts/status/route.js";
import { GET as voiceStatusGET } from "../app/api/projects/[id]/voice/status/route.js";
import { GET as clipsStatusGET } from "../app/api/projects/[id]/clips/status/route.js";
import { GET as renderStatusGET } from "../app/api/projects/[id]/render/status/route.js";

const U = "00000000-0000-4000-8000-00000000000a";
const run = (fn) => runWithActor(U, fn);

const headersFor = (id) => ({
  [USER_HEADER]: id,
  [STATUS_HEADER]: "approved",
  [ROLE_HEADER]: "user",
});
const reqAs = (id = U) => new Request("http://localhost/api/projects/x", { headers: headersFor(id) });
const jsonReqAs = (id, body = {}) => ({ json: async () => body, headers: new Headers(headersFor(id)) });
const ctx = (id) => ({ params: Promise.resolve({ id }) });
const idxCtx = (id, idx) => ({ params: Promise.resolve({ id, idx: String(idx) }) });

const make = (kind) =>
  run(() => createProject({ material: { text: "자료" }, ownerId: U, ...(kind ? { kind } : {}) }));

// ── 판정 자체 ───────────────────────────────────────────────────────────────
describe("isStepDoc — 종류가 없는 문서만 단계별 문서다", () => {
  it("kind 가 아예 없으면 단계별 문서다 — 옛 문서가 그 모양이다", () => {
    expect(isStepDoc({ id: "x" })).toBe(true);
  });

  // 좁은 셀렉터(selectProjectProgress 등)는 kind 를 `?? null` 로 실어 온다.
  // 없음과 null 을 다르게 보면 폴링 라우트만 조용히 다르게 판정한다.
  it("kind 가 null 이어도 단계별 문서다 — 셀렉터가 그렇게 싣는다", () => {
    expect(isStepDoc({ id: "x", kind: null })).toBe(true);
  });

  it("종류가 있으면 전부 아니다 — 아는 종류든 모르는 종류든", () => {
    expect(isStepDoc({ kind: "ad" })).toBe(false);
    expect(isStepDoc({ kind: "film" })).toBe(false);
    // ★ 이 한 줄이 이번 수정의 요지다. 다음에 생길 종류를 아무도 여기 적지 않아도 막힌다.
    expect(isStepDoc({ kind: "아직-없는-종류" })).toBe(false);
  });

  it("없는 문서는 단계별 문서가 아니다 — 호출부가 404 로 옮긴다", () => {
    expect(isStepDoc(null)).toBe(false);
    expect(isStepDoc(undefined)).toBe(false);
  });
});

// ── ① film · ② ad 가 같은 자리에서 막히는가 ────────────────────────────────
//
// 두 종류를 같은 표로 돈다. 광고만 잰 것이 이번 구멍의 원인이었으니, 여기서는
// "종류가 있으면 막힌다"를 두 값으로 함께 못 박는다.
describe("단계별 라우트는 종류 있는 문서를 모른다", () => {
  beforeEach(() => resetMemoryStore());

  const KINDS = ["film", "ad"];

  const bodyRoutes = [
    ["auto", autoPOST],
    ["scenario(POST)", scenarioPOST],
    ["scenario(PATCH)", scenarioPATCH],
    ["cuts", cutsPOST],
    ["images", imagesPOST],
    ["voice", voicePOST],
    ["clips", clipsPOST],
    ["render", renderPOST],
    // ★ 원래 판정이 **아예 없던** 둘. subtitle-lang 은 번역 LLM 을 부르는 자리라
    //   종류가 다른 문서로도 값이 나갈 수 있었다.
    ["subtitle", subtitlePOST],
    ["subtitle-lang", subtitleLangPOST],
  ];

  for (const kind of KINDS) {
    it.each(bodyRoutes)(`POST /api/projects/[id]/%s — ${kind} 문서는 404`, async (_n, handler) => {
      const p = await make(kind);
      const res = await handler(jsonReqAs(U, {}), ctx(p.id));
      expect(res.status).toBe(404);
    });

    it.each([
      ["cuts/[idx]/regen", cutRegenPOST],
      ["voice/[idx]/regen", voiceRegenPOST],
      ["clips/[idx]/regen", clipRegenPOST],
    ])(`POST /api/projects/[id]/%s — ${kind} 문서는 404`, async (_n, handler) => {
      const p = await make(kind);
      const res = await handler(jsonReqAs(U, {}), idxCtx(p.id, 0));
      expect(res.status).toBe(404);
    });

    it.each([
      ["refs", refsGET],
      ["status", statusGET],
      ["cuts/status", cutsStatusGET],
      ["voice/status", voiceStatusGET],
      ["clips/status", clipsStatusGET],
      ["render/status", renderStatusGET],
    ])(`GET /api/projects/[id]/%s — ${kind} 문서는 404`, async (_n, handler) => {
      const p = await make(kind);
      const res = await handler(reqAs(), ctx(p.id));
      expect(res.status).toBe(404);
    });

    it(`GET /api/projects/[id]/cuts/[idx]/prompt — ${kind} 문서는 404`, async () => {
      const p = await make(kind);
      const res = await cutPromptGET(reqAs(), idxCtx(p.id, 0));
      expect(res.status).toBe(404);
    });

    it(`GET /api/projects/[id] — ${kind} 문서는 404`, async () => {
      const p = await make(kind);
      const res = await projectGET(reqAs(), ctx(p.id));
      expect(res.status).toBe(404);
    });

    // PATCH 는 본문 모양마다 다른 자리를 지난다(사전 판정 둘 · 락 안 판정 하나).
    // 셋 다 같은 답을 내야 한다 — 하나만 열려 있어도 그 본문으로 문서가 갱신된다.
    it.each([
      ["material 만", { material: { text: "덮어쓰기" } }],
      ["target_seconds", { settings: { target_seconds: 30 } }],
      ["resolution", { settings: { resolution: "1080p" } }],
    ])(`PATCH /api/projects/[id] — %s 본문도 ${kind} 문서면 404`, async (_n, body) => {
      const p = await make(kind);
      const res = await projectPATCH(jsonReqAs(U, body), ctx(p.id));
      expect(res.status).toBe(404);
    });
  }

  // 가짜 모드에서도 같은 답이어야 한다(ad-isolation.test.js 가 광고로 못 박은 자리 —
  // regen 셋의 판정이 `if (!fakeFal())` 블록 안으로 되돌아가면 여기서 걸린다).
  const withFake = async (level, fn) => {
    const prev = process.env.SHOTFORM_FAKE;
    process.env.SHOTFORM_FAKE = level;
    try {
      await fn();
    } finally {
      if (prev === undefined) delete process.env.SHOTFORM_FAKE;
      else process.env.SHOTFORM_FAKE = prev;
    }
  };

  it.each([
    ["cuts/[idx]/regen", cutRegenPOST],
    ["voice/[idx]/regen", voiceRegenPOST],
    ["clips/[idx]/regen", clipRegenPOST],
  ])("%s — SHOTFORM_FAKE=all 이어도 film 문서는 404", async (_n, handler) => {
    const p = await make("film");
    await withFake("all", async () => {
      const res = await handler(jsonReqAs(U, {}), idxCtx(p.id, 0));
      expect(res.status).toBe(404);
    });
  });
});

// ── ③ 옛 문서는 그대로 통과한다 ─────────────────────────────────────────────
//
// 판정을 뒤집는 수정의 진짜 위험은 "너무 많이 막는 것"이다 — 옛 문서가 하나라도
// 막히면 지금 쓰고 있는 프로젝트가 통째로 죽는다.
describe("옛 문서(kind 없음)는 그대로 지난다", () => {
  beforeEach(() => resetMemoryStore());

  it("GET /api/projects/[id] — 200", async () => {
    const p = await make(null);
    expect((await projectGET(reqAs(), ctx(p.id))).status).toBe(200);
  });

  it("PATCH /api/projects/[id] — 200", async () => {
    const p = await make(null);
    const res = await projectPATCH(jsonReqAs(U, { settings: { target_seconds: 30 } }), ctx(p.id));
    expect(res.status).toBe(200);
  });

  it.each([
    ["refs", refsGET],
    ["status", statusGET],
    ["cuts/status", cutsStatusGET],
    ["voice/status", voiceStatusGET],
    ["clips/status", clipsStatusGET],
    ["render/status", renderStatusGET],
  ])("GET /api/projects/[id]/%s — 404 가 아니다", async (_n, handler) => {
    const p = await make(null);
    const res = await handler(reqAs(), ctx(p.id));
    expect(res.status ?? 200).not.toBe(404);
  });

  // 굽기·번역은 재료가 없어 400 으로 돌아온다 — 요지는 "문에서 404 로 막히지 않는다"다.
  it.each([
    ["subtitle", subtitlePOST],
    ["subtitle-lang", subtitleLangPOST],
  ])("POST /api/projects/[id]/%s — 404 가 아니다(재료가 없어 400 이다)", async (_n, handler) => {
    const p = await make(null);
    const res = await handler(jsonReqAs(U, {}), ctx(p.id));
    expect(res.status).toBe(400);
  });
});

// ★ 이 파일에서 가장 중요한 테스트 — 정적 그물.
//
// 위의 표는 "지금 있는 라우트"만 잰다. 새 라우트가 생기면 그 표에 아무도 줄을 더하지 않고,
// 그 라우트로 다른 종류의 문서가 유료 파이프라인에 흘러든다. 그래서 파일을 훑어서
// **판정을 안 쓰는 핸들러가 있으면 실패**시킨다(tests/archive-shared.test.js 와 같은 방식).
describe("★ 단계별 라우트는 전부 공용 판정을 쓴다", () => {
  const routeFiles = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "route.js") routeFiles.push(full.split(path.sep).join("/"));
    }
  })("app/api/projects");

  // 주석을 걷어내고 판정한다 — 주석 속 낱말이 계약을 대신 통과시키는 사고가 반복됐다.
  const strip = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  const METHOD = /export\s+(?:const|async\s+function)\s+(GET|POST|PATCH|PUT|DELETE)\b/g;

  // 문서 하나를 다루지 않는 핸들러 — 여기에 종류 판정을 걸 대상이 없다.
  //
  // ★ DELETE 는 **일부러** 뺀다. 보관함의 지우기 버튼(components/ProjectCards.jsx)이
  //   종류를 가리지 않고 이 문 하나로 지운다 — 여기에 판정을 걸면 광고·film 카드가
  //   영영 안 지워진다. 소유자 검사는 스토어가 하므로 남의 것은 여전히 못 지운다.
  const EXEMPT = new Set([
    "app/api/projects/route.js → GET", // 목록 — 문서 하나를 안 읽는다
    "app/api/projects/route.js → POST", // 새로 만들기 — 아직 문서가 없다
    "app/api/projects/[id]/route.js → DELETE", // 보관함 지우기(위 주석)
  ]);

  it("라우트 파일을 실제로 훑었다 — 목록이 비면 이 테스트는 아무것도 안 지킨다", () => {
    expect(routeFiles.length).toBeGreaterThan(15);
  });

  it("모든 핸들러가 isStepDoc 판정을 지난다", () => {
    const offenders = [];
    for (const file of routeFiles) {
      const src = strip(readFileSync(file, "utf8"));
      const marks = [...src.matchAll(METHOD)];
      // 핸들러 앞부분(머리말)에 사는 도우미 — scenario/route.js 의 load() 처럼
      // 판정을 감싼 함수를 핸들러가 부르는 모양도 통과시켜야 한다.
      const preamble = src.slice(0, marks[0]?.index ?? src.length);
      const preambleGuards = preamble.includes("isStepDoc")
        ? [...preamble.matchAll(/(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=/g)]
            .map((m) => m[1] || m[2])
            .filter(Boolean)
        : [];
      for (let i = 0; i < marks.length; i++) {
        const name = `${file} → ${marks[i][1]}`;
        if (EXEMPT.has(name)) continue;
        const body = src.slice(marks[i].index, marks[i + 1]?.index ?? src.length);
        const guarded =
          body.includes("isStepDoc") || preambleGuards.some((g) => body.includes(`${g}(`));
        if (!guarded) offenders.push(name);
      }
    }
    expect(offenders, "종류 판정을 안 하는 단계별 라우트가 있다 — 다른 종류의 문서가 유료 경로로 샌다").toEqual([]);
  });

  // 판정이 한 자리에 있어야 값어치가 있다. 손으로 적은 `kind === "ad"` 가 다시 생기면
  // 그것은 곧 "다음 종류를 또 빠뜨릴 자리"다.
  it("손으로 적은 종류 비교가 남아 있지 않다", () => {
    const offenders = routeFiles.filter((f) => /kind\s*[=!]==\s*["'](ad|film)["']/.test(strip(readFileSync(f, "utf8"))));
    expect(offenders, "단계별 라우트가 종류를 손으로 비교한다 — isStepDoc 을 쓸 것").toEqual([]);
  });
});
