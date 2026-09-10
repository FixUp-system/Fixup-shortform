// projects 인덱스 — 목록 조회가 전수 스캔이었다 (2026-09-10).
//
// ★ 왜 생겼나. `db/schema.sql` 에 인덱스가 다섯인데 **projects 것이 하나도 없었다**
//   (cost_records 2 · upload_owners 1 · credit_* 2 — 이 판이 그 수를 다시 센다).
//   그런데 이 저장소에서 가장 자주 도는 조회 셋이 전부 projects 다:
//     · 보관함 내 목록   — owner_id 로 거르고 created_at 으로 정렬해 100건(listProjects)
//     · 보관함 [전체]    — 소유자 필터 없이 created_at 정렬 100건(listAllProjects)
//     · 굽는 편 훑기     — doc->>kind 로 거른다(selectBakingProjects, **1분마다** = 하루 1,440회)
//   인덱스가 없으면 셋 다 전수 스캔이고, 정렬·거르기가 끝난 뒤에야 100건이 남는다.
//   목록 셀렉트는 `doc->…` 투영이라 **버려질 행의 jsonb 까지 detoast** 한다 — 전송량으로
//   서비스가 한 번 죽은 저장소(09-07 Supabase egress 402)에서 이건 가용성 문제다.
//
// ★ 이 판은 **SQL 문자열을 잰다.** 라이브 DB 를 부르지 않는다(그럴 자격도, 그럴 자리도
//   여기가 아니다). 그래서 잴 수 있는 것은 "인덱스가 조회의 모양과 맞는가" 하나다 —
//   맞지 않는 인덱스는 만들어도 planner 가 안 문다.
// ⚠️ 소스를 문자열로 재므로 **주석(`--`)을 먼저 걷는다.** 안 걷으면 설명 주석에 적어 둔
//   DDL 이 판정을 통과시킨다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const raw = readFileSync("db/schema.sql", "utf8");
const sql = raw.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const store = readFileSync("lib/store/supabase.js", "utf8");

const indexes = sql.match(/create\s+index[\s\S]*?;/gi) || [];
const onProjects = indexes.filter((s) => /on\s+projects\s*\(/i.test(s));

describe("projects 인덱스 — 목록 조회를 태울 자리", () => {
  it("★★ 인덱스가 하나라도 있다 — 전에는 0개였다", () => {
    expect(onProjects.length).toBeGreaterThan(0);
  });

  it("★★ 내 목록의 모양 그대로다 — (owner_id, created_at desc)", () => {
    // 순서가 뒤집히면(created_at, owner_id) 소유자 필터가 선두를 못 써서 그대로 전수 스캔이다.
    expect(
      onProjects.some((s) => /\(\s*owner_id\s*,\s*created_at\s+desc\s*\)/i.test(s)),
      "owner_id 선두 + created_at desc 인덱스가 없다"
    ).toBe(true);
  });

  it("★ 보관함 [전체]도 태운다 — 소유자 필터가 없는 최신순 100건", () => {
    // (owner_id, created_at) 의 선두는 owner_id 라 이 조회는 그것을 못 쓴다.
    expect(
      onProjects.some((s) => /\(\s*created_at\s+desc\s*\)/i.test(s)),
      "created_at 단독 인덱스가 없다"
    ).toBe(true);
  });

  it("★ 1분마다 도는 kind 거르기도 태운다 — 표현식 그대로 적어야 planner 가 문다", () => {
    // 조회는 `doc->>'kind'` 로 묻는다. 생성 컬럼을 만들어도 planner 는 그 조회를 컬럼으로
    // 바꿔 읽지 않는다 — 인덱스도 **같은 표현식**이어야 한다.
    expect(
      onProjects.some((s) => /\(\s*\(\s*doc\s*->>\s*'kind'\s*\)\s*\)/i.test(s)),
      "doc->>'kind' 표현식 인덱스가 없다"
    ).toBe(true);
  });
});

describe("인덱스가 겨냥하는 조회가 실제로 그 모양이다", () => {
  // 두 벌이면 갈린다 — 조회가 바뀌었는데 인덱스가 그대로면 아무도 모르게 전수 스캔으로
  // 되돌아간다. 여기서 저장소 쪽 모양을 **읽기만** 해서 대조한다.
  it("내 목록은 owner_id 로 거르고 created_at 으로 정렬한다", () => {
    const at = store.indexOf("async listProjects(");
    expect(at, "listProjects 가 없다").toBeGreaterThan(-1);
    const body = store.slice(at, at + 1600);
    expect(body).toMatch(/\.eq\("owner_id"/);
    expect(body).toMatch(/\.order\("created_at",\s*\{\s*ascending:\s*false/);
  });

  it("보관함 [전체]는 소유자 필터 없이 created_at 으로 정렬한다", () => {
    const at = store.indexOf("async listAllProjects(");
    expect(at, "listAllProjects 가 없다").toBeGreaterThan(-1);
    const body = store.slice(at, at + 1600);
    expect(body).toMatch(/\.order\("created_at",\s*\{\s*ascending:\s*false/);
  });

  it("굽는 편 훑기는 doc->>kind 로 거른다", () => {
    const at = store.indexOf("async selectBakingProjects(");
    expect(at, "selectBakingProjects 가 없다").toBeGreaterThan(-1);
    expect(store.slice(at, at + 1200)).toMatch(/\.eq\("doc->>kind"/);
  });
});

// ── 파일의 성질: 통째로 다시 올려도 안전해야 한다 ────────────────────────────
// 이 파일은 사람이 Supabase SQL 편집기에 **통째로 붙여 넣어** 적용한다(머리말 규칙).
// 한 줄이라도 두 번 돌면 죽는 구문이 섞이면 그 순간 적용이 중단되고, 뒤에 있는 것들이
// 전부 안 만들어진다 — 라이브에서 한 번 겪으면 원인을 찾기 어렵다.
describe("스키마는 몇 번을 올려도 안전하다", () => {
  it("★ 모든 create index 가 if not exists 다", () => {
    for (const s of indexes) {
      expect(s, `if not exists 가 없다: ${s.slice(0, 80)}`).toMatch(/create\s+index\s+if\s+not\s+exists/i);
    }
  });

  it("★ 모든 drop 이 if exists 다", () => {
    for (const s of sql.match(/drop\s+\w+[^\n;]*/gi) || []) {
      expect(s, `if exists 가 없다: ${s}`).toMatch(/drop\s+\w+\s+if\s+exists/i);
    }
  });

  it("★ 테이블·컬럼을 지우지 않는다 — 스키마 파일은 데이터를 안 버린다", () => {
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/drop\s+column/i);
  });

  it("생성 컬럼을 더한다면 조회도 같이 옮겨야 한다 — 안 옮기면 인덱스가 헛돈다", () => {
    // 지금은 표현식 인덱스로 간다(조회를 안 고치고 태울 수 있는 유일한 길). 나중에 누가
    // 생성 컬럼(kind)을 더한다면 저장소 조회도 그 컬럼을 물어야 의미가 있다.
    if (/generated\s+always\s+as\s*\(\s*doc\s*->>\s*'kind'/i.test(sql)) {
      expect(store, "생성 컬럼만 만들고 조회는 doc->>kind 그대로다").toMatch(/\.eq\("kind"/);
    }
  });
});
