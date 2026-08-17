// 정가는 길이에 묶여 있다(VIDEO_PRICE). 만들 때는 길이를 검증하는데 고칠 때는 안 봐서,
// 15초로 25크레딧 낸 뒤 60초로 고치면 추가 청구가 0 이었다.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const A = "00000000-0000-4000-8000-00000000000a";
const P = "p-1";

const { PATCH } = await import("../app/api/projects/[id]/route.js");

const req = (settings) =>
  new Request(`http://localhost/api/projects/${P}`, {
    method: "PATCH",
    headers: {
      [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user",
      "content-type": "application/json",
    },
    body: JSON.stringify({ settings }),
  });
const ctx = () => ({ params: Promise.resolve({ id: P }) });

async function seedProject() {
  await memoryStore.insertProject(
    { id: P, created_ts: 1, status: "draft", settings: { target_seconds: 15 } },
    A
  );
}

describe("PATCH /api/projects/[id] — 길이", () => {
  beforeEach(async () => { resetMemoryStore(); await seedProject(); });

  it("결제 전에는 목록 안의 값으로 바꿀 수 있다", async () => {
    expect((await PATCH(req({ target_seconds: 30 }), ctx())).status).toBe(200);
    const row = await memoryStore.selectProject(P, A);
    expect(row.doc.settings.target_seconds).toBe(30);
  });

  it("목록 밖 값은 400 이고 저장되지 않는다", async () => {
    expect((await PATCH(req({ target_seconds: 37 }), ctx())).status).toBe(400);
    const row = await memoryStore.selectProject(P, A);
    expect(row.doc.settings.target_seconds).toBe(15);
  });

  // ★ 이 태스크의 존재 이유.
  it("정가를 낸 뒤에는 길이를 못 바꾼다", async () => {
    // ★ 필드 이름은 `credits` 다(`amount_credits` 아님 — 그건 충전 장부 쪽이다).
    // idem_key 는 videoKey(projectId, 회차) = `video:<id>:1` 이어야 alreadyChargedVideo 가
    // 이 행을 찾는다(lib/charges.js:38,52).
    await memoryStore.insertCharge({
      idem_key: `video:${P}:1`, user_id: A, project_id: P,
      kind: "video", credits: 25,
    });
    const res = await PATCH(req({ target_seconds: 60 }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/바꿀 수 없어요/);
    const row = await memoryStore.selectProject(P, A);
    expect(row.doc.settings.target_seconds).toBe(15);
  });

  it("결제해도 같은 길이를 다시 보내는 것은 막지 않는다 — 다른 설정을 고치는 정상 저장이다", async () => {
    // ★ 필드 이름은 `credits` 다(`amount_credits` 아님 — 그건 충전 장부 쪽이다).
    // idem_key 는 videoKey(projectId, 회차) = `video:<id>:1` 이어야 alreadyChargedVideo 가
    // 이 행을 찾는다(lib/charges.js:38,52).
    await memoryStore.insertCharge({
      idem_key: `video:${P}:1`, user_id: A, project_id: P,
      kind: "video", credits: 25,
    });
    expect((await PATCH(req({ target_seconds: 15 }), ctx())).status).toBe(200);
  });
});

// 화질은 닫힌 목록인데 **목록이 모델마다 다르다** — Seedance 만 열고 Kling·LTX 는 안 연다.
// settings 는 화이트리스트 없이 얕게 머지되므로 여기서 안 막으면 아무 값이나 들어가고,
// 그 값이 그대로 fal 유료 호출로 나간다(lib/i2v.js 가 resolution 키로 싣는다).
describe("PATCH /api/projects/[id] — 화질", () => {
  const seedanceSettings = { target_seconds: 15, i2v_model: "seedance-2.0" };
  const seedSeedance = () =>
    memoryStore.insertProject({ id: P, created_ts: 1, status: "draft", settings: seedanceSettings }, A);
  const savedSettings = async () => (await memoryStore.selectProject(P, A)).doc.settings;

  beforeEach(() => { resetMemoryStore(); });

  it("모델이 여는 화질은 저장된다", async () => {
    await seedSeedance();
    expect((await PATCH(req({ resolution: "1080p" }), ctx())).status).toBe(200);
    expect((await savedSettings()).resolution).toBe("1080p");
  });

  it("모델에 없는 해상도는 저장을 거절한다", async () => {
    await seedSeedance();
    const res = await PATCH(req({ resolution: "2160p" }), ctx());
    expect(res.status).toBe(400);
    expect((await savedSettings()).resolution).toBeUndefined();
  });

  // Kling 은 이 파라미터 자체가 없다 — "아는 화질처럼 생긴 값"이라고 받아 두면
  // 화면에 없는 선택이 문서에 남고, 각인(lib/steps.js)이 그 값을 본다.
  it("해상도를 안 여는 모델(레거시=Kling)에는 어떤 값도 못 넣는다", async () => {
    await seedProject();   // i2v_model 없음 = 레거시 Kling
    expect((await PATCH(req({ resolution: "1080p" }), ctx())).status).toBe(400);
    expect((await savedSettings()).resolution).toBeUndefined();
  });

  // ★★ 모델을 함께 바꾸는 PATCH. 판정을 **바뀌기 전 모델**로 하면
  // "Seedance 의 1080p 니까 통과" → 저장된 모델은 Kling 이 되어 없는 파라미터가 남는다.
  //
  // ★ **문구까지 단정한다.** 상태 코드 400 만 보면 이 테스트가 화질 게이트를 안 잰다 —
  //   모델 잠금도 400 을 주기 때문이다(리뷰 실측: 판정을 merged → project 로 되돌려도
  //   11건이 전부 그린이었다). 화질 게이트가 무는 문이라는 것을 문구가 증명한다.
  it("모델을 Kling 으로 바꾸면서 1080p 를 함께 보내도 통과하지 않는다 — 막는 것은 화질 게이트다", async () => {
    await seedSeedance();
    const res = await PATCH(req({ i2v_model: "kling-v3", resolution: "1080p" }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("그 화질은 몰라요");
    const s = await savedSettings();
    expect(s.resolution).toBeUndefined();
    expect(s.i2v_model).toBe("seedance-2.0");
  });

  // 같은 모델을 다시 보내는 것은 정상 저장이다(화면이 헛 PATCH 를 보낼 수 있다) —
  // 그때 화질 판정은 **머지 뒤 모델**로 하므로 그대로 통과해야 한다.
  it("같은 모델을 함께 보내면서 화질을 고르는 것은 막지 않는다", async () => {
    await seedSeedance();
    expect((await PATCH(req({ i2v_model: "seedance-2.0", resolution: "480p" }), ctx())).status).toBe(200);
    expect((await savedSettings()).resolution).toBe("480p");
  });
});

// ★★ 돈이 새던 자리 — 화질은 **정가를 바꾼다**(Seedance 30초: 720p 160 · 1080p 360).
// 정가는 ③목소리에서 걷히고 화질 칩은 ②대본에 있다. 화면은 결제 뒤 칩을 잠그는데
// 서버가 안 막아서, 720p 로 내고 PATCH 로 1080p 로 바꾸면 ⑤에서 requireVideoCharge 가
// **살아 있는 청구를 보고 그냥 지나간다**(lib/charges.js:131) — 160 을 내고 원가 2.25배를 받는다.
describe("PATCH /api/projects/[id] — 결제 뒤 화질 잠금", () => {
  const seed = (settings) =>
    memoryStore.insertProject({ id: P, created_ts: 1, status: "draft", settings }, A);
  const pay = () =>
    memoryStore.insertCharge({
      idem_key: `video:${P}:1`, user_id: A, project_id: P, kind: "video", credits: 160,
    });
  const savedSettings = async () => (await memoryStore.selectProject(P, A)).doc.settings;

  beforeEach(() => { resetMemoryStore(); });

  it("정가를 낸 뒤에는 화질을 못 바꾼다", async () => {
    await seed({ target_seconds: 30, i2v_model: "seedance-2.0", resolution: "720p" });
    await pay();
    const res = await PATCH(req({ resolution: "1080p" }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/바꿀 수 없어요/);
    expect((await savedSettings()).resolution).toBe("720p");
  });

  it("같은 화질을 다시 보내는 것은 막지 않는다 — 다른 설정을 고치는 정상 저장이다", async () => {
    await seed({ target_seconds: 30, i2v_model: "seedance-2.0", resolution: "720p" });
    await pay();
    expect((await PATCH(req({ resolution: "720p" }), ctx())).status).toBe(200);
  });

  // 저장값이 없는 프로젝트는 720p 로 값을 치른다(resolutionForProject 의 폴백) —
  // 그 값을 명시로 보내는 것은 **바꾸는 것이 아니다**. 날것 비교로 재면 여기서 400 이 나
  // 화면의 정상 저장이 막힌다.
  it("저장값이 없어도 실제로 치른 화질(720p)과 같으면 통과한다", async () => {
    await seed({ target_seconds: 30, i2v_model: "seedance-2.0" });
    await pay();
    expect((await PATCH(req({ resolution: "720p" }), ctx())).status).toBe(200);
  });

  it("저장값이 없는데 1080p 로 올리는 것은 막는다", async () => {
    await seed({ target_seconds: 30, i2v_model: "seedance-2.0" });
    await pay();
    expect((await PATCH(req({ resolution: "1080p" }), ctx())).status).toBe(400);
    expect((await savedSettings()).resolution).toBeUndefined();
  });

  // 환불된 프로젝트는 살아 있는 청구가 없다 — alreadyChargedVideo 가 false 다.
  // 다시 돌리면 새 회차로 정가를 다시 받으므로 바꿔도 어긋나지 않는다.
  it("환불받은 프로젝트는 다시 고를 수 있다", async () => {
    await seed({ target_seconds: 30, i2v_model: "seedance-2.0", resolution: "720p" });
    await pay();
    await memoryStore.insertCharge({
      idem_key: `refund:${P}:1`, user_id: A, project_id: P, kind: "refund", credits: -160,
    });
    expect((await PATCH(req({ resolution: "1080p" }), ctx())).status).toBe(200);
    expect((await savedSettings()).resolution).toBe("1080p");
  });

  it("결제 전에는 자유롭게 고른다", async () => {
    await seed({ target_seconds: 30, i2v_model: "seedance-2.0", resolution: "720p" });
    expect((await PATCH(req({ resolution: "1080p" }), ctx())).status).toBe(200);
    expect((await savedSettings()).resolution).toBe("1080p");
  });

  // ★★★ 경합(TOCTOU) — 이 태스크의 존재 이유.
  //
  // 사전 판정은 updateProject 의 직렬 큐·version **밖**에 있다. PATCH(1080p) 와 ③목소리
  // 결제를 동시에 쏘면 ①PATCH 가 charged=false 를 읽고 → ②720p 로 청구가 확정되고 →
  // ③1080p 가 저장되는 순서가 성립한다. 즉 이 문이 막으려던 바로 그 시나리오가 통한다.
  //
  // 재현: 저장소의 selectProject 를 세어 **두 번째 호출**(= updateProject 가 락 안에서 읽는
  // 그 읽기) 때 결제 행을 끼워 넣는다. 사전 판정 시점(첫 번째 읽기)엔 미결제라 그 문은
  // 그대로 통과하고, 락 안 판정만이 이것을 잡을 수 있다.
  //
  // ⚠️ 문구까지 단정한다 — 상태 코드만 보면 다른 게이트가 준 400 을 잘못 센다.
  // ⚠️ 500 이면 안 된다 — 던진 것을 라우트가 받아 사전 판정과 같은 400 으로 답해야 한다.
  it("사전 판정 뒤·저장 전에 결제가 확정되면 락 안에서 막는다", async () => {
    await seed({ target_seconds: 30, i2v_model: "seedance-2.0", resolution: "720p" });
    const orig = memoryStore.selectProject.bind(memoryStore);
    let reads = 0;
    const spy = vi.spyOn(memoryStore, "selectProject").mockImplementation(async (...args) => {
      const row = await orig(...args);
      // 1번째 = 사전 판정(미결제로 읽힌다) · 2번째 = updateProject 가 락 안에서 읽는 읽기
      if (++reads === 2) await pay();
      return row;
    });
    try {
      const res = await PATCH(req({ resolution: "1080p" }), ctx());
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe(
        "이미 결제된 영상은 화질을 바꿀 수 없어요 — 새로 만들어 주세요"
      );
      expect(reads).toBeGreaterThanOrEqual(2);   // 락 안 읽기까지 갔다 = 사전 판정은 통과했다
      expect((await savedSettings()).resolution).toBe("720p");
    } finally {
      spy.mockRestore();
    }
  });
});

// 프로젝트 공통 지시 두 칸(settings.image_note · settings.clip_note) — 사장님이 밖에서 써 온
// 프롬프트를 그대로 넣는 자리라 값이 길다. settings 는 화이트리스트 없이 얕게 머지되므로
// 여기서 안 막으면 아무 값이나 들어가고 그 값이 그대로 유료 호출로 나간다(위 화질과 같은 이유).
describe("PATCH /api/projects/[id] — 프로젝트 공통 지시", () => {
  beforeEach(async () => { resetMemoryStore(); await seedProject(); });
  const savedSettings = async () => (await memoryStore.selectProject(P, A)).doc.settings;

  it("정규화한 값이 저장된다 — 개행이 눕고 앞뒤가 걷힌다", async () => {
    expect((await PATCH(req({ image_note: "  shot on\n35mm film  " }), ctx())).status).toBe(200);
    expect((await savedSettings()).image_note).toBe("shot on 35mm film");
  });

  // ★ 이 칸이 존재하는 이유 — 화풍 보정(120자)이면 붙여넣기부터 거절당한다.
  it("400자짜리 붙여넣기가 통과한다 — 화풍 보정 상한(120자)이었다면 못 들어온다", async () => {
    const long = "a".repeat(400);
    expect((await PATCH(req({ clip_note: long }), ctx())).status).toBe(200);
    expect((await savedSettings()).clip_note).toBe(long);
  });

  it("상한을 넘으면 400 이고 저장되지 않는다 — 자르지 않는다", async () => {
    const res = await PATCH(req({ clip_note: "가".repeat(601) }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/영상 지시/);
    expect((await savedSettings()).clip_note).toBeUndefined();
  });

  it("글이 아닌 값은 400 이다 — 그 값이 프롬프트로 나가면 안 된다", async () => {
    const res = await PATCH(req({ image_note: { text: "a cat" } }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/이미지 지시/);
    expect((await savedSettings()).image_note).toBeUndefined();
  });
});

// ★ 광고 문서(kind:"ad")는 이 경로가 다루지 않는다 — /api/ads/* 가 다룬다.
// 화질 PATCH 도 target_seconds 게이트와 같은 모양으로 404 여야 한다(리뷰 M3: 프로브로만
// 확인돼 있고 테스트가 없었다). 여기서 안 막으면 결제 잠금이 **기존 종류의 청구 장부**를
// 광고 문서에 물어 엉뚱한 답을 낸다.
describe("PATCH /api/projects/[id] — 광고 문서", () => {
  beforeEach(() => { resetMemoryStore(); });

  it("광고 문서에 화질을 PATCH 하면 404 다", async () => {
    await memoryStore.insertProject(
      { id: P, created_ts: 1, kind: "ad", status: "draft", settings: { i2v_model: "seedance-2.0" } },
      A
    );
    const res = await PATCH(req({ resolution: "1080p" }), ctx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("프로젝트를 찾을 수 없어요");
  });
});
