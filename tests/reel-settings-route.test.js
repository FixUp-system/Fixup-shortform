// 열린 축만 고칠 수 있다. **잠긴 축은 라우트가 막는다** — 화면만 막으면 주소로 부르면 뚫린다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import * as projects from "../lib/projects.js";
import { PATCH } from "../app/api/reel/[id]/settings/route.js";

const A = "00000000-0000-4000-8000-00000000000a";
const headers = { [USER_HEADER]: A, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user", "content-type": "application/json" };
const req = (body) => new Request("http://localhost/api/reel/x/settings", { method: "PATCH", headers, body: JSON.stringify(body) });
const ctx = (id) => ({ params: Promise.resolve({ id }) });

async function makeReel(extra = {}) {
  return projects.createProject({
    ownerId: A, kind: "reel",
    settings: { aspect_ratio: "9:16", target_seconds: 15, i2v_model: "seedance-2.0", resolution: "720p", style: "photo" },
    material: { text: "자료", photos: [] },
    ...extra,
  });
}

// 등급은 문서가 아니라 **프로필**에서 온다(tierOf + findProfiles). 기본 등급은 단계별에서
// seedance-2.0 하나만 열리므로, 2.5 를 만지는 판은 프로 등급을 심어 둬야 한다.
async function makePro() {
  await getStore().insertProfile({ id: A, email: "a@example.com", status: "approved", role: "user", tier: "pro" });
}

beforeEach(() => resetMemoryStore());

describe("PATCH /api/reel/[id]/settings", () => {
  // ★★★ Ruling 6 — 길이는 **그 모델이 한 번에 만들 수 있는 것** 안에서만 고른다.
  //   실측: seedance-2.0 [15] · seedance-2.5 [15,30].
  //   왜 돈 문제인가: target_seconds 가 모델 상한을 넘으면 통짜(r2v) 판정이 깨져
  //   **컷별 갈래**로 떨어진다 — 15초짜리에 48초를 굽고 40크레딧만 청구하던 그 구멍이다.
  it("열린 축은 저장된다 — 그 모델이 만들 수 있는 길이라면", async () => {
    const p = await makeReel({
      settings: { aspect_ratio: "9:16", target_seconds: 15, i2v_model: "seedance-2.5", resolution: "720p", style: "photo" },
    });
    const res = await PATCH(req({ target_seconds: 30 }), ctx(p.id));
    expect(res.status, await res.text()).toBe(200);
    const after = await projects.getProject(p.id, A);
    expect(after.settings.target_seconds).toBe(30);
  });

  it("★★★ 모델 상한을 넘는 길이는 400 이고, 저장도 안 된다 — 컷별 갈래로 새는 자리다", async () => {
    const p = await makeReel(); // seedance-2.0 → 한 번에 15초까지
    const res = await PATCH(req({ target_seconds: 30 }), ctx(p.id));
    expect(res.status).toBe(400);
    const after = await projects.getProject(p.id, A);
    expect(after.settings.target_seconds, "막았는데 저장됐다").toBe(15);
    expect(after.settings.seconds, "별칭까지 새어 들어갔다").not.toBe(30);
  });

  it("★★ 모델과 길이가 함께 오면 **새 모델** 기준으로 길이를 잰다", async () => {
    await makePro();
    const p = await makeReel(); // 지금은 2.0(15초까지) — 옛 모델로 재면 30초가 막힌다
    const res = await PATCH(req({ i2v_model: "seedance-2.5", target_seconds: 30 }), ctx(p.id));
    expect(res.status, await res.text()).toBe(200);
    const after = await projects.getProject(p.id, A);
    expect(after.settings.i2v_model).toBe("seedance-2.5");
    expect(after.settings.target_seconds).toBe(30);
  });

  it("★★ 잠긴 축은 409 다 — 화면이 아니라 여기가 문지기다", async () => {
    const p = await makeReel();
    await projects.updateProject(p.id, A, (d) => ({ ...d, scenario: { text: "확정된 시나리오" } }));
    const res = await PATCH(req({ target_seconds: 30 }), ctx(p.id));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("시나리오를 확정해서");
    const after = await projects.getProject(p.id, A);
    expect(after.settings.target_seconds, "막았는데 저장됐다").toBe(15);
  });

  it("모르는 값은 400 이다 — 목록 밖 비율·길이·화질", async () => {
    const p = await makeReel();
    for (const body of [{ aspect_ratio: "3:2" }, { target_seconds: 17 }, { resolution: "4K" }]) {
      const res = await PATCH(req(body), ctx(p.id));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("남의 영상은 못 고친다", async () => {
    const p = await makeReel();
    const other = { ...headers, [USER_HEADER]: "00000000-0000-4000-8000-00000000000b" };
    const res = await PATCH(
      new Request("http://localhost/api/reel/x/settings", { method: "PATCH", headers: other, body: JSON.stringify({ target_seconds: 30 }) }),
      ctx(p.id)
    );
    expect([403, 404]).toContain(res.status);
  });

  it("★ 길이를 고치면 seconds 도 같이 간다 — 정가와 시나리오 길이가 갈리면 안 된다", async () => {
    const p = await makeReel({
      settings: { aspect_ratio: "9:16", target_seconds: 15, seconds: 15, i2v_model: "seedance-2.5", resolution: "720p", style: "photo" },
    });
    const res = await PATCH(req({ target_seconds: 30 }), ctx(p.id));
    expect(res.status).toBe(200);
    const after = await projects.getProject(p.id, A);
    // target_seconds 는 정가·청구가, seconds 는 시나리오 생성이 읽는다(app/api/reel/route.js).
    expect(after.settings.seconds, "seconds 가 안 따라왔다").toBe(30);
  });

  it("★★ 모델과 화질이 함께 오면 **새 모델** 기준으로 화질을 잰다", async () => {
    // 모델을 안 적어 둔 옛 문서는 kling-v3(LEGACY)로 떨어지고, 그 모델은 화질 목록이
    // **비어 있다** — 옛 모델로 재면 어떤 화질도 통과 못 한다. 새 모델로 재야 200 이다.
    const p = await makeReel({ settings: { aspect_ratio: "9:16", target_seconds: 15, style: "photo" } });
    const res = await PATCH(req({ i2v_model: "seedance-2.0", resolution: "720p" }), ctx(p.id));
    expect(res.status, await res.text()).toBe(200);
    const after = await projects.getProject(p.id, A);
    expect(after.settings.i2v_model).toBe("seedance-2.0");
    expect(after.settings.resolution).toBe("720p");
  });

  it("★ 못 쓰는 모델은 화면 밖에서도 막힌다", async () => {
    const p = await makeReel();
    // minimax-h3 는 단계별(reel)이 여는 모델이 아니다(REEL_MODEL_IDS).
    const unknown = await PATCH(req({ i2v_model: "minimax-h3" }), ctx(p.id));
    expect(unknown.status).toBe(400);
    // seedance-2.5 는 reel 모델이지만 기본 등급에는 안 열린다 — 등급은 400 이 아니라 403 이다.
    const gated = await PATCH(req({ i2v_model: "seedance-2.5" }), ctx(p.id));
    expect(gated.status).toBe(403);
    const after = await projects.getProject(p.id, A);
    expect(after.settings.i2v_model, "막았는데 모델이 바뀌었다").toBe("seedance-2.0");
  });

  it("★ 모르는 모델이 길이와 함께 오면 **모델** 을 먼저 말한다", async () => {
    const p = await makeReel();
    const res = await PATCH(req({ target_seconds: 30, i2v_model: "없는모델" }), ctx(p.id));
    expect(res.status).toBe(400);
    // 길이 문구가 나오면 사장님이 멀쩡한 길이 칩을 고치러 간다 — 잘못된 뿌리를 먼저 말해야 한다.
    expect((await res.json()).error).toContain("모델");
  });

  it("화풍은 첫 그림에서만 잠긴다 — 시나리오만 확정한 때는 아직 열려 있다", async () => {
    const p = await makeReel();
    await projects.updateProject(p.id, A, (d) => ({ ...d, scenario: { text: "확정" } }));
    const open = await PATCH(req({ style: "anime" }), ctx(p.id));
    expect(open.status, await open.text()).toBe(200);

    await projects.updateProject(p.id, A, (d) => ({ ...d, cuts: [{ idx: 0, image: { url: "http://x/1.png" } }] }));
    const shut = await PATCH(req({ style: "illust" }), ctx(p.id));
    expect(shut.status).toBe(409);
    expect((await shut.json()).error).toContain("첫 그림");
    const after = await projects.getProject(p.id, A);
    expect(after.settings.style).toBe("anime");
  });

  it("고칠 값이 없으면 400 이고, 다른 설정은 안 건드린다", async () => {
    const p = await makeReel();
    const res = await PATCH(req({ 모르는축: 1 }), ctx(p.id));
    expect(res.status).toBe(400);
    const after = await projects.getProject(p.id, A);
    expect(after.settings.aspect_ratio).toBe("9:16");
    expect(after.settings.style).toBe("photo");
  });

  it("reel 이 아닌 프로젝트는 404 다", async () => {
    const p = await projects.createProject({
      ownerId: A,
      settings: { aspect_ratio: "9:16", target_seconds: 15 },
      material: { text: "자료", photos: [] },
    });
    const res = await PATCH(req({ target_seconds: 30 }), ctx(p.id));
    expect(res.status).toBe(404);
  });
});
