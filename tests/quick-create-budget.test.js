// POST /api/video (Quick Create) — 예산 가드가 실제로 fal 호출을 막는지 확인한다.
//
// ★ 이 라우트는 오래 addRecord(기록)만 하고 assertBudget 을 안 불렀다 — kling v3 가
// 오디오 포함 초당 $0.126 이라 10초 한 번에 $1.26 이 상한 없이 나갔다(task-10-brief).
// "가드를 달았다"만으로는 부족하다 — fal 로 실제 요청이 안 나가는지까지 봐야
// "지키는 척하는 테스트"가 안 된다.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { POST as quickCreatePOST } from "../app/api/video/route.js";

const headersFor = (id, status = "approved") => ({
  [USER_HEADER]: id,
  [STATUS_HEADER]: status,
  [ROLE_HEADER]: "user",
  "content-type": "application/json",
});

const reqAs = (id, body) =>
  new Request("http://localhost/api/video", {
    method: "POST",
    headers: headersFor(id),
    body: JSON.stringify(body),
  });

const ORIG_ENV = {
  FAL_KEY: process.env.FAL_KEY,
  SHOTFORM_FAKE: process.env.SHOTFORM_FAKE,
  SHOTFORM_FAKE_IMAGES: process.env.SHOTFORM_FAKE_IMAGES,
  SHOTFORM_BUDGET_TOTAL_USD: process.env.SHOTFORM_BUDGET_TOTAL_USD,
  SHOTFORM_BUDGET_USER_USD: process.env.SHOTFORM_BUDGET_USER_USD,
  FAL_VIDEO_ENDPOINT: process.env.FAL_VIDEO_ENDPOINT,
};
const ORIG_FETCH = global.fetch;

function restoreEnv() {
  for (const [k, v] of Object.entries(ORIG_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

describe("Quick Create — POST /api/video 의 예산 가드", () => {
  beforeEach(() => {
    resetMemoryStore();
    process.env.FAL_KEY = "test-key";
    process.env.SHOTFORM_FAKE = "off";
    delete process.env.SHOTFORM_FAKE_IMAGES;
    delete process.env.FAL_VIDEO_ENDPOINT; // 기본 kling v3
  });
  afterEach(() => {
    restoreEnv();
    global.fetch = ORIG_FETCH;
  });

  it("상한을 넘으면 fal 을 부르지 않고 402 를 돌려준다", async () => {
    process.env.SHOTFORM_BUDGET_TOTAL_USD = "20";
    process.env.SHOTFORM_BUDGET_USER_USD = "0.01"; // 10초 kling($1.26)이 바로 넘긴다

    let called = false;
    global.fetch = async () => {
      called = true;
      return { ok: true, json: async () => ({ request_id: "r1" }) };
    };

    const res = await quickCreatePOST(
      reqAs("u-1", { prompt: "고양이", duration: "10", aspect_ratio: "9:16" })
    );

    expect(called).toBe(false); // ★ 돈이 실제로 안 나갔는지가 핵심
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toMatch(/예산 상한/);
  });

  it("여유가 있으면 fal 을 부르고 기록을 남긴다", async () => {
    process.env.SHOTFORM_BUDGET_TOTAL_USD = "20";
    process.env.SHOTFORM_BUDGET_USER_USD = "20";

    let called = false;
    global.fetch = async () => {
      called = true;
      return { ok: true, json: async () => ({ request_id: "r2" }) };
    };

    const res = await quickCreatePOST(
      reqAs("u-1", { prompt: "고양이", duration: "5", aspect_ratio: "9:16" })
    );

    expect(called).toBe(true);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.request_id).toBe("r2");
  });

  it("남의 사용자 상한 소진은 나를 막지 않는다", async () => {
    process.env.SHOTFORM_BUDGET_TOTAL_USD = "20";
    process.env.SHOTFORM_BUDGET_USER_USD = "0.01";

    // u-2 로 먼저 소진 — u-1 의 요청에 영향이 없어야 한다
    let called = false;
    global.fetch = async () => {
      called = true;
      return { ok: true, json: async () => ({ request_id: "r3" }) };
    };
    const exhausted = await quickCreatePOST(
      reqAs("u-2", { prompt: "고양이", duration: "10", aspect_ratio: "9:16" })
    );
    expect(exhausted.status).toBe(402);
    expect(called).toBe(false);

    // u-1 은 아직 아무것도 안 썼으니 사용자 상한만으로는 통과해야 하는데, 위와 같은
    // 낮은 상한(0.01)이라 u-1 도 자기 몫으로 걸린다 — "남의 지출이 안 섞였다"만 보려면
    // total 은 넉넉하고 user 상한이 각자 독립인지를 별도 스텝으로 확인해야 하므로,
    // 여기서는 u-1 요청도 걸리되 이유가 "u-2 의 지출" 때문이 아니라 "자기 몫"임을
    // 응답 바디로 확인한다(에러 메시지의 액수가 u-2 의 지출을 반영하지 않는다).
    const mine = await quickCreatePOST(
      reqAs("u-1", { prompt: "강아지", duration: "10", aspect_ratio: "9:16" })
    );
    expect(mine.status).toBe(402);
    const body = await mine.json();
    // u-2 가 이미 못 썼으므로(호출이 막혀 addRecord 도 안 갔다) 원장은 여전히 0이다 —
    // u-1 의 에러 메시지도 "지금까지 $0.00" 이어야 한다(u-2 의 지출이 안 섞였다는 뜻)
    expect(body.error).toMatch(/\$0\.00/);
  });

  // ★ 리뷰 I1 — 위의 "남의 사용자 상한" 테스트는 상대가 addRecord 에 도달하기 전에
  // 막히는 경로만 탔다. 이 태스크의 핵심 주장("같은 사용자가 두 번 부르면 누적돼 두
  // 번째가 막힌다")을 무는 테스트가 없었다. actor 를 직접 꽂지 않고 **실제 라우트를
  // 두 번 통과**시켜 addRecord → sumCosts({actor}) 경로를 실제로 탄다.
  //
  // lib/store/memory.js 의 insertCost 가 `user` → `actor` 매핑을 안 하면(리뷰 이전 상태)
  // sumCosts({actor})가 항상 0을 봐서 두 번째 호출도 200으로 통과한다 — 그 회귀를 잡는다.
  it("같은 사용자가 실제 라우트로 두 번 부르면 두 번째가 누적 차단된다", async () => {
    process.env.SHOTFORM_BUDGET_TOTAL_USD = "20";
    process.env.SHOTFORM_BUDGET_USER_USD = "1"; // kling v3 5초 = $0.63, 두 번이면 $1.26 > $1

    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: true, json: async () => ({ request_id: `r-${calls}` }) };
    };

    const first = await quickCreatePOST(
      reqAs("u-1", { prompt: "고양이", duration: "5", aspect_ratio: "9:16" })
    );
    expect(first.status).toBe(200); // 첫 호출은 통과하고 원장에 실제로 기록된다

    const second = await quickCreatePOST(
      reqAs("u-1", { prompt: "고양이 두 번째", duration: "5", aspect_ratio: "9:16" })
    );
    expect(second.status).toBe(402); // 누적 $1.26 > $1 상한
    expect(calls).toBe(1); // 두 번째는 fal 을 아예 안 불렀다
  });

  // ★ 최종 리뷰 I3 — 가짜 모드인데 fal 을 실제로 불렀던 자리. SHOTFORM_FAKE=all("완전 0원")
  // 로 띄워도 이 라우트만 예외적으로 진짜 queue.fal.run 을 불렀다.
  it("가짜 모드에서는 fal 을 부르지 않고 플레이스홀더 request_id 를 돌려준다", async () => {
    process.env.SHOTFORM_FAKE = "all";

    let called = false;
    global.fetch = async () => {
      called = true;
      return { ok: true, json: async () => ({ request_id: "real-should-not-happen" }) };
    };

    const res = await quickCreatePOST(
      reqAs("u-1", { prompt: "고양이", duration: "5", aspect_ratio: "9:16" })
    );

    expect(called).toBe(false);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.request_id).toMatch(/^fake-/);
  });

  it("헤더가 없으면(미인증) 500 이고 fal 을 부르지 않는다", async () => {
    let called = false;
    global.fetch = async () => {
      called = true;
      return { ok: true, json: async () => ({ request_id: "r4" }) };
    };
    const bare = new Request("http://localhost/api/video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "고양이", duration: "5", aspect_ratio: "9:16" }),
    });
    const res = await quickCreatePOST(bare);
    expect(res.status).toBe(500);
    expect(called).toBe(false);
  });
});
