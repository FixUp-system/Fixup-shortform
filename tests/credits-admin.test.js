// 충전(운영자)과 조회(본인) — 둘 다 **크레딧 단위**다.
// USD 로 받아 환산하던 시절의 편수 표기(videos_left·per_video_usd)는 사라졌다:
// 정가가 길이마다 달라 "N편"이 거짓말이 된다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { POST as grantPOST } from "../app/api/admin/users/[id]/credits/route.js";
import { GET as creditsGET } from "../app/api/credits/route.js";
import { GET as usersGET } from "../app/api/admin/users/route.js";
import { videoPrice } from "../lib/pricing.js";

const A = "00000000-0000-4000-8000-00000000000a";
const P = "00000000-0000-4000-8000-0000000000f1";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
const headersFor = (id, role = "user") => ({
  [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: role,
  "content-type": "application/json",
});
const grantReq = (who, role, body) =>
  new Request("http://localhost/api/admin/users/x/credits", {
    method: "POST", headers: headersFor(who, role), body: JSON.stringify(body),
  });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

// 충전 대상은 실재해야 한다 — 라우트가 insert 앞에서 존재를 확인하기 때문이다.
// (프로덕션에서는 credit_grants.user_id 의 FK 가 같은 것을 훨씬 험한 방식으로 확인한다:
// 없는 uuid 면 insert 가 거부되고 그 거부가 500 으로 새어 나간다. 메모리 스토어엔 FK 가
// 없어 이 갈림이 안 보이므로, 라우트가 스스로 확인하고 테스트가 그것을 문다.)
const seedTarget = async () =>
  getStore().insertProfile({ id: A, email: "a@example.com", status: "approved", role: "user" });

describe("POST /api/admin/users/[id]/credits", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await seedTarget();
  });

  it("운영자가 크레딧으로 넣으면 장부에 남고 잔액이 오른다", async () => {
    const res = await grantPOST(grantReq(ADMIN, "admin", { credits: 500, reason: "체험" }), ctx(A));
    expect(res.status).toBe(200);
    expect((await res.json()).balance).toBe(500);
  });

  it("음수로 회수할 수 있다", async () => {
    await grantPOST(grantReq(ADMIN, "admin", { credits: 300, reason: "충전" }), ctx(A));
    const res = await grantPOST(grantReq(ADMIN, "admin", { credits: -200, reason: "정정" }), ctx(A));
    expect((await res.json()).balance).toBe(100);
  });

  // ★ 합계로 재지 않는다. 합계는 `granted_by` 를 빠뜨려도, 대상 id 를 운영자 자리에 잘못
  // 넣어도 똑같이 나온다 — 그러면 이름만 감사인 테스트가 된다. 장부 행을 직접 꺼내
  // "누가"(호출한 운영자)와 "왜"를 글자로 확인한다.
  it("누가 왜 넣었는지가 남는다 — 감사", async () => {
    await grantPOST(grantReq(ADMIN, "admin", { credits: 50, reason: "체험 한 편" }), ctx(A));

    const rows = await getStore().listGrants(A);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(A);      // 받은 사람
    expect(rows[0].granted_by).toBe(ADMIN); // 넣은 사람 — 대상 자신이 아니다
    expect(rows[0].reason).toBe("체험 한 편");
    // ★ 크레딧으로 적힌다. amount_usd 로 쓰면 sumGrants 가 0 을 세고 잔액이 영영 0 이다
    // (단위가 갈리면 조용히 틀린다 — 이 단언이 그 자리를 문다).
    expect(rows[0].amount_credits).toBe(50);
    expect(rows[0].created_at).toBeTruthy();
  });

  it("없는 사용자에게 충전하면 404 — FK 가 터지기 전에 우리가 막는다", async () => {
    const ghost = "00000000-0000-4000-8000-00000000dead";
    const res = await grantPOST(grantReq(ADMIN, "admin", { credits: 50, reason: "오타" }), ctx(ghost));
    expect(res.status).toBe(404);
    expect(await getStore().sumGrants(ghost)).toBe(0);
  });

  it("운영자가 아니면 403", async () => {
    expect((await grantPOST(grantReq(A, "user", { credits: 50, reason: "내가 나에게" }), ctx(A))).status).toBe(403);
  });

  it("사유가 없으면 400 — 감사 로그가 비면 장부가 아니다", async () => {
    expect((await grantPOST(grantReq(ADMIN, "admin", { credits: 50, reason: "  " }), ctx(A))).status).toBe(400);
  });

  it("0 크레딧은 400", async () => {
    expect((await grantPOST(grantReq(ADMIN, "admin", { credits: 0, reason: "무의미" }), ctx(A))).status).toBe(400);
  });

  it("소수 크레딧은 400 — 크레딧은 정수다", async () => {
    expect((await grantPOST(grantReq(ADMIN, "admin", { credits: 1.5, reason: "반쪽" }), ctx(A))).status).toBe(400);
  });
});

describe("GET /api/credits", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await seedTarget();
  });

  it("내 잔액을 크레딧 정수로 준다", async () => {
    await grantPOST(grantReq(ADMIN, "admin", { credits: 500, reason: "충전" }), ctx(A));
    const res = await creditsGET(new Request("http://localhost/api/credits", { headers: headersFor(A) }), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balance).toBe(500);
    // 편수 표기는 폐지됐다 — 정가가 길이마다 달라 "N편"이 거짓말이 된다.
    expect(body.videos_left).toBeUndefined();
    expect(body.per_video_usd).toBeUndefined();
  });

  it("충전이 없으면 0", async () => {
    const res = await creditsGET(new Request("http://localhost/api/credits", { headers: headersFor(A) }), {});
    expect((await res.json()).balance).toBe(0);
  });

  it("쓴 만큼 줄어든다 — 잔액은 충전 − 청구다", async () => {
    await grantPOST(grantReq(ADMIN, "admin", { credits: 500, reason: "충전" }), ctx(A));
    await getStore().insertCharge({
      user_id: A, project_id: P, kind: "video", credits: videoPrice(30), idem_key: `video:${P}:1`,
    });
    const res = await creditsGET(new Request("http://localhost/api/credits", { headers: headersFor(A) }), {});
    expect((await res.json()).balance).toBe(500 - videoPrice(30));
  });

  // 게이트가 지금 적용되는지를 서버가 알려 준다. 화면이 SHOTFORM_FAKE 를 직접 볼 수
  // 없기도 하지만, 진짜 이유는 **판정을 한 곳에 두려는 것**이다 — 시작 게이트가
  // `if (!fakeFal())` 로 건너뛰는데 화면이 그걸 모르면 0원 관통이 화면에서 막힌다
  // (실제로 막혔다: 서버는 202 인데 버튼이 disabled).
  it("가짜 모드에서는 게이트가 꺼졌다고 알려 준다", async () => {
    const before = process.env.SHOTFORM_FAKE;
    process.env.SHOTFORM_FAKE = "all";
    try {
      const res = await creditsGET(new Request("http://localhost/api/credits", { headers: headersFor(A) }), {});
      expect((await res.json()).gated).toBe(false);
    } finally {
      if (before === undefined) delete process.env.SHOTFORM_FAKE;
      else process.env.SHOTFORM_FAKE = before;
    }
  });

  it("실모드에서는 게이트가 켜져 있다고 알려 준다", async () => {
    const before = process.env.SHOTFORM_FAKE;
    delete process.env.SHOTFORM_FAKE;
    try {
      const res = await creditsGET(new Request("http://localhost/api/credits", { headers: headersFor(A) }), {});
      expect((await res.json()).gated).toBe(true);
    } finally {
      if (before !== undefined) process.env.SHOTFORM_FAKE = before;
    }
  });
});

describe("GET /api/admin/users", () => {
  beforeEach(async () => {
    resetMemoryStore();
    await seedTarget();
  });

  it("행마다 크레딧 잔액이 실린다 — 충전에서 청구를 뺀 값", async () => {
    await grantPOST(grantReq(ADMIN, "admin", { credits: 500, reason: "충전" }), ctx(A));
    await getStore().insertCharge({
      user_id: A, project_id: P, kind: "video", credits: 50, idem_key: `video:${P}:1`,
    });
    const res = await usersGET(
      new Request("http://localhost/api/admin/users", { headers: headersFor(ADMIN, "admin") }), {}
    );
    expect(res.status).toBe(200);
    const row = (await res.json()).users.find((u) => u.id === A);
    expect(row.balance).toBe(450);
    expect(row.videos_left).toBeUndefined();
  });
});
