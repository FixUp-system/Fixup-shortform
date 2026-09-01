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
    expect(filterRecords(rows, { from: "", to: "", person: "", flow: "" }).length).toBe(4);
    expect(filterRecords(rows, {}).length).toBe(4);
  });

  it("말이 안 되는 날짜는 조건 없음으로 본다 — 화면이 통째로 비면 더 나쁘다", () => {
    expect(filterRecords(rows, { from: "어제" }).length).toBe(4);
  });
});

// ★★ 2026-08-27 — **고르기에서 찾기로 바뀌었다**(사장님 지시: "사용자는 검색할 수 있게").
//   사람이 늘면 목록을 훑는 것이 일이 된다. 이제 이름·이메일 조각을 적으면 좁혀진다.
describe("사람으로 좁힌다 — 적어서 찾는다", () => {
  it("이름 조각으로 찾는다", () => {
    expect(filterRecords(rows, { person: "재찬" }).map((r) => r.request_id)).toEqual(["a", "b"]);
  });

  it("이메일 조각으로도 찾는다 — 같은 이름 둘을 가르는 길이다", () => {
    expect(filterRecords(rows, { person: "b@x" }).map((r) => r.request_id)).toEqual(["c"]);
  });

  it("대소문자를 안 가린다", () => {
    expect(filterRecords(rows, { person: "A@X.KR" }).map((r) => r.request_id)).toEqual(["a", "b"]);
  });

  it("원장에 적힌 actor 값으로도 찾는다 — 문자열 actor(admin·local)가 그렇게 걸린다", () => {
    expect(filterRecords(rows, { person: "admin" }).map((r) => r.request_id)).toEqual(["d"]);
  });

  it("아무것도 안 맞으면 빈 목록이다 — 조건 없음으로 뭉개지 않는다", () => {
    expect(filterRecords(rows, { person: "없는사람" })).toEqual([]);
  });

  it("빈 칸은 조건이 아니다", () => {
    expect(filterRecords(rows, { person: "   " }).length).toBe(4);
  });

  it("★ 거들어 주는 목록은 **보이는 말**이다 — 적어 넣는 칸이라 값이 곧 글자다", () => {
    const opts = actorOptions(rows);
    expect(opts).toContain("재찬");
    expect(opts).toContain("a@x.kr");
    // 이름과 신원이 같으면 되풀이하지 않는다.
    expect(opts.filter((o) => o === "admin").length).toBe(1);
  });

  it("원장에 없는 사람은 목록에 없다", () => {
    expect(actorOptions(rows)).not.toContain("없는사람");
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

  // ★★ 2026-08-27 — 고르는 목록은 **제품 둘만**이다(사장님 지시). 그래도 옛 흐름의
  //   지출은 합계에서 안 버린다 — 버리면 흐름별 합이 누적과 안 맞아 "어디로 샜지"가 된다.
  it("표 순서를 따르고, 옛 흐름은 그 뒤에 선다", () => {
    // ⚠️ 2026-09-01 — 순서가 뒤집혔다. 이름을 사이드바에 맞추면서(원클릭 영상 ·
    //   단계별 영상) **거기 순서**를 따랐다 — 사이드바에서 원클릭이 위다.
    const order = sumByFlow(rows).map((f) => f.flow);
    expect(order.slice(0, 2)).toEqual(["ad", "reel"]);
    expect(order).toContain("step");
    expect(order).toContain("etc");
  });

  it("고를 수 있는 종류는 지금 파는 둘뿐이다", () => {
    // ⚠️ 2026-09-01 — 이름이 바뀌었다. 사이드바가 "원클릭 영상 · 단계별 영상" 으로
    //   바뀐 뒤에도 여기만 옛 이름에 남아 있었다(같은 것을 두 화면이 다르게 불렀다).
    //   ★ 그 어긋남을 다시 안 놓치게 tests/costs-flow-names.test.js 가 **사이드바 소스를
    //     읽어** 대조한다 — 글자를 손으로 적는 이 판만으로는 또 같이 낡는다.
    expect(FLOWS.map((f) => f.id)).toEqual(["ad", "reel"]);
    expect(FLOWS.map((f) => f.label)).toEqual(["원클릭 영상", "단계별 영상"]);
  });

  it("옛 흐름도 표에서는 사람 말로 보인다 — 안쪽 이름을 그대로 보여 주지 않는다", () => {
    expect(flowLabel("film")).toBe("한 번에 굽기");
    // ⚠️ `reel` 이 "단계별 영상" 이 되면서 옛 이름 "단계별" 과 부딪혔다 — 옛것임이
    //   이름에 드러나야 표에서 안 헷갈린다.
    expect(flowLabel("step")).toBe("옛 단계별");
    expect(flowLabel("etc")).toBe("기타");
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
    expect(sumCost(filterRecords(rows, { person: "재찬" }))).toBe(3);
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
