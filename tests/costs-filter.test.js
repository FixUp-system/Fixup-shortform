// 비용 기록을 **날짜·사람·흐름**으로 좁힌다 (2026-08-27 사장님 요청).
//
// ★★ 요청이 둘이었고 뿌리는 하나다: "검색 필터를 추가해줘. 날짜. 사용자 정보를 토대로" ·
//   "광고 영상 비용도 측정해줘. **둘을 구분해서 한 페이지에서**".
//   원장은 전사 한 벌이라, 무엇을 보고 있는지 좁히지 못하면 합계가 뭉뚱그려진 한 숫자다.
//
// ★ 판정을 화면이 아니라 순수 모듈에 두는 이유: 이 저장소에는 컴포넌트 렌더 테스트
//   인프라가 없다. 경계값(그 날 23:59:59 가 들어오는가)은 여기서만 잴 수 있다.
import { describe, it, expect, beforeEach } from "vitest";
import {
  filterRecords, actorOptions, sumCost, sumByFlow, flowOf, flowLabel, FLOWS,
} from "../lib/costs-filter.js";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { listRecords } from "../lib/costs.js";

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

const rows = [
  { request_id: "a", ts: at(2026, 8, 25), actor: "u1", actor_name: "재찬", actor_label: "a@x.kr", kind: "reel", project_id: "p1", known_project: true, est_cost_usd: 1 },
  { request_id: "b", ts: at(2026, 8, 26), actor: "u1", actor_name: "재찬", actor_label: "a@x.kr", kind: "ad", project_id: "p2", known_project: true, est_cost_usd: 2 },
  { request_id: "c", ts: at(2026, 8, 27), actor: "u2", actor_name: "민수", actor_label: "b@x.kr", kind: null, project_id: "p3", known_project: true, est_cost_usd: 4 },
  { request_id: "d", ts: at(2026, 8, 27, 23), actor: "admin", actor_name: "admin", actor_label: "admin", kind: null, project_id: null, known_project: false, est_cost_usd: 8 },
];

describe("날짜로 좁힌다", () => {
  it("시작일 이전은 빠진다", () => {
    const got = filterRecords(rows, { from: "2026-08-26" }).map((r) => r.request_id);
    expect(got).toEqual(["b", "c", "d"]);
  });

  it("★ 끝 날짜는 **그 날을 포함한다** — 자정으로 자르면 그 하루가 통째로 사라진다", () => {
    const got = filterRecords(rows, { to: "2026-08-27" }).map((r) => r.request_id);
    // 8/27 23시 기록(d)까지 들어와야 한다.
    expect(got).toContain("d");
    expect(got.length).toBe(4);
  });

  it("★ 지역 시각으로 읽는다 — UTC 로 읽으면 오전 기록이 하루 밀린다", () => {
    // 8/25 하루만. `new Date("2026-08-25")`(UTC 자정)로 읽으면 한국에서는 오전 9시가 되어
    // 그 날 오전 기록이 빠진다.
    const morning = { request_id: "e", ts: at(2026, 8, 25, 3), actor: "u1", est_cost_usd: 1 };
    const got = filterRecords([...rows, morning], { from: "2026-08-25", to: "2026-08-25" });
    expect(got.map((r) => r.request_id).sort()).toEqual(["a", "e"]);
  });

  it("빈 값은 조건이 아니다 — 아무것도 안 고르면 전부 보인다", () => {
    expect(filterRecords(rows, { from: "", to: "", actor: "", flow: "" }).length).toBe(4);
    expect(filterRecords(rows, {}).length).toBe(4);
  });

  it("말이 안 되는 날짜는 조건 없음으로 본다 — 화면이 통째로 비면 더 나쁘다", () => {
    expect(filterRecords(rows, { from: "어제" }).length).toBe(4);
  });
});

describe("사람으로 좁힌다", () => {
  it("고른 사람 것만 남는다", () => {
    expect(filterRecords(rows, { actor: "u1" }).map((r) => r.request_id)).toEqual(["a", "b"]);
  });

  it("★ 고르는 값은 actor 다 — 이름이 같은 계정이 둘일 수 있다", () => {
    const opts = actorOptions(rows);
    expect(opts.map((o) => o.value).sort()).toEqual(["admin", "u1", "u2"]);
    // 이름을 앞세우고 신원을 곁들인다.
    expect(opts.find((o) => o.value === "u1").label).toBe("재찬 (a@x.kr)");
    // 이름과 신원이 같으면 되풀이하지 않는다.
    expect(opts.find((o) => o.value === "admin").label).toBe("admin");
  });

  it("원장에 없는 사람은 목록에 없다 — 고를 수 없는 이름을 두지 않는다", () => {
    expect(actorOptions(rows).some((o) => o.value === "u9")).toBe(false);
  });
});

describe("흐름(광고 · 영상 만들기)을 가른다", () => {
  it("kind 가 곧 흐름이다", () => {
    expect(flowOf(rows[0])).toBe("reel");
    expect(flowOf(rows[1])).toBe("ad");
  });

  it("★ kind 없는 둘을 안 뭉친다 — 단계별 흐름과 프로젝트 없는 줄은 다르다", () => {
    expect(flowOf(rows[2])).toBe("step");   // 프로젝트는 있는데 kind 가 없다
    expect(flowOf(rows[3])).toBe("etc");    // 프로젝트 자체가 없다(대화 등)
  });

  it("흐름별로 합계를 낸다 — 이것이 '둘을 구분해서'의 값이다", () => {
    const by = Object.fromEntries(sumByFlow(rows).map((f) => [f.flow, f.usd]));
    expect(by.reel).toBe(1);
    expect(by.ad).toBe(2);
    expect(by.step).toBe(4);
    expect(by.etc).toBe(8);
  });

  it("안 쓴 흐름은 칸을 안 만든다", () => {
    expect(sumByFlow([rows[1]]).map((f) => f.flow)).toEqual(["ad"]);
  });

  it("표 순서를 따른다 — 값 크기로 정렬하면 날마다 순서가 바뀐다", () => {
    const order = sumByFlow(rows).map((f) => f.flow);
    const want = FLOWS.map((f) => f.id).filter((id) => order.includes(id));
    expect(order).toEqual(want);
  });

  it("흐름으로 좁힐 수 있다", () => {
    expect(filterRecords(rows, { flow: "ad" }).map((r) => r.request_id)).toEqual(["b"]);
  });

  it("모르는 종류가 와도 죽지 않는다 — 그대로 보여 준다", () => {
    expect(flowOf({ kind: "새흐름" })).toBe("새흐름");
    expect(flowLabel("새흐름")).toBe("새흐름");
  });
});

describe("합계는 한 곳에서 낸다", () => {
  it("고른 것만 더한다", () => {
    expect(sumCost(filterRecords(rows, { actor: "u1" }))).toBe(3);
  });

  it("금액이 없는 줄도 죽지 않는다", () => {
    expect(sumCost([{ est_cost_usd: null }, { }])).toBe(0);
  });
});

// ── 원장이 그 값을 실제로 실어 보내는가 ──────────────────────────────────
//
// 위 판정이 아무리 맞아도 원장 줄에 kind·이름이 안 실리면 화면은 전부 "기타"다.
describe("원장이 흐름과 이름을 싣는다", () => {
  const U = "11111111-1111-1111-1111-111111111111";
  beforeEach(() => resetMemoryStore());

  it("프로젝트의 kind 가 원장 줄에 실린다", async () => {
    await memoryStore.insertProject({ id: "pa", kind: "ad" }, U);
    await memoryStore.insertProject({ id: "pr", kind: "reel" }, U);
    await memoryStore.insertCost({ request_id: "1", ts: 1, endpoint: "e", actor: U, project_id: "pa", est_cost_usd: 1 });
    await memoryStore.insertCost({ request_id: "2", ts: 2, endpoint: "e", actor: U, project_id: "pr", est_cost_usd: 1 });

    const rec = Object.fromEntries((await listRecords()).map((r) => [r.request_id, r]));
    expect(flowOf(rec["1"])).toBe("ad");
    expect(flowOf(rec["2"])).toBe("reel");
  });

  it("★ 지워진 프로젝트와 단계별을 가른다", async () => {
    await memoryStore.insertProject({ id: "ps" }, U);           // kind 없음 = 단계별
    await memoryStore.insertCost({ request_id: "3", ts: 3, endpoint: "e", actor: U, project_id: "ps", est_cost_usd: 1 });
    await memoryStore.insertCost({ request_id: "4", ts: 4, endpoint: "e", actor: U, project_id: "없는거", est_cost_usd: 1 });

    const rec = Object.fromEntries((await listRecords()).map((r) => [r.request_id, r]));
    expect(flowOf(rec["3"])).toBe("step");
    expect(flowOf(rec["4"])).toBe("etc");
  });

  it("이름과 신원을 따로 싣는다 — 이름으로 읽고 신원으로 가른다", async () => {
    await memoryStore.insertProfile({ id: U, email: "boss@fix-up.kr", status: "approved", role: "user", display_name: "재찬" });
    await memoryStore.insertCost({ request_id: "5", ts: 5, endpoint: "e", actor: U, est_cost_usd: 1 });
    const [row] = await listRecords();
    expect(row.actor_name).toBe("재찬");
    expect(row.actor_label).toBe("boss@fix-up.kr");
  });

  it("이름을 안 적은 사람은 이메일 앞부분이다 — 빈 칸을 남기지 않는다", async () => {
    await memoryStore.insertProfile({ id: U, email: "boss@fix-up.kr", status: "approved", role: "user" });
    await memoryStore.insertCost({ request_id: "6", ts: 6, endpoint: "e", actor: U, est_cost_usd: 1 });
    const [row] = await listRecords();
    expect(row.actor_name).toBe("boss");
  });
});
