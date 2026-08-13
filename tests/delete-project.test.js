// 보관함에서 지우기 — 사장님이 만든 것을 스스로 치울 수 있어야 한다.
//
// ★ 지워도 **장부는 남는다.** 지우면 환불이 되면 "만들고 지워서 되돌려받는" 길이 열린다.
//   돈이 오간 사실은 프로젝트 문서가 아니라 장부에 있고, 장부는 무슨 일이 있었는지
//   남기는 것이 일이다(lib/charges.js 의 환불도 지우지 않고 음수 행을 더한다).
//
// ★ 완성본 파일은 **함께 지운다.** 저장 용량이 진짜 제약이다 — 자막 원본 때문에 편당
//   ~20MB 라 무료 플랜 1GB 면 50편에서 찬다. 지우기가 용량을 되찾는 유일한 길이다.
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore } from "../lib/store/memory.js";
import { getStore } from "../lib/store/index.js";
import { createProject, getProject } from "../lib/projects.js";
import { chargeVideo } from "../lib/charges.js";
import { DELETE } from "../app/api/projects/[id]/route.js";
// 라우트는 신원 헤더(withUser)로 소유자를 정한다 — 헤더가 없으면 500 이다.
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

const authed = (uid) => ({
  headers: new Headers({ [USER_HEADER]: uid, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" }),
});
const req = () => authed(A);
const reqAs = (uid) => authed(uid);
const ctx = (id) => ({ params: Promise.resolve({ id }) });

const make = (ownerId = A) =>
  createProject({ ownerId, settings: {}, material: { text: "자료", photos: [] } });

describe("프로젝트 지우기", () => {
  beforeEach(() => resetMemoryStore());

  it("지우면 없어진다", async () => {
    const p = await make();
    const res = await DELETE(req(), ctx(p.id));
    expect(res.status ?? 200).toBe(200);
    expect(await getProject(p.id, A)).toBeFalsy();
  });

  it("남의 것은 못 지운다 — 있는지조차 알려주지 않는다", async () => {
    const p = await make(B);
    const res = await DELETE(reqAs(A), ctx(p.id));
    expect(res.status).toBe(404);
    expect(await getProject(p.id, B), "남의 프로젝트가 지워졌다").toBeTruthy();
  });

  it("지워도 장부는 남는다 — 만들고 지워서 되돌려받는 길을 열지 않는다", async () => {
    const store = getStore();
    await store.insertGrant({ user_id: A, amount_credits: 500, reason: "충전", granted_by: A });
    const p = await make();
    const paid = await chargeVideo({ userId: A, projectId: p.id, seconds: 30 });
    expect(paid).toBeGreaterThan(0);

    await DELETE(req(), ctx(p.id));
    expect(await store.sumCharges(A), "지웠다고 청구가 사라졌다").toBe(paid);
    expect((await store.listCharges(A)).length).toBe(1);
  });

  it("완성본 파일도 함께 지운다 — 저장 용량을 되찾는다", async () => {
    const store = getStore();
    const p = await make();
    await store.putObject("renders", `${p.id}.mp4`, Buffer.from("완성본"), "video/mp4");
    await store.putObject("renders", `${p.id}-raw.mp4`, Buffer.from("자막 없는 원본"), "video/mp4");

    await DELETE(req(), ctx(p.id));

    await expect(store.getObject("renders", `${p.id}.mp4`)).rejects.toThrow();
    await expect(store.getObject("renders", `${p.id}-raw.mp4`)).rejects.toThrow();
  });

  it("없는 프로젝트를 지우려 하면 404", async () => {
    const res = await DELETE(req(), ctx("00000000-0000-4000-8000-0000000000ff"));
    expect(res.status).toBe(404);
  });
});
