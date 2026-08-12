import { describe, it, expect, beforeEach } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { createProject } from "../lib/projects.js";
import { USER_HEADER, STATUS_HEADER, ROLE_HEADER } from "../lib/auth/headers.js";
import { GET as getUpload } from "../app/api/uploads/[name]/route.js";
import { GET as getRender } from "../app/api/renders/[name]/route.js";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const as = (id) => new Request("http://localhost/x", {
  headers: { [USER_HEADER]: id, [STATUS_HEADER]: "approved", [ROLE_HEADER]: "user" },
});

// 렌더 라우트는 파일명이 곧 프로젝트 id 라 소유자 판정을 getProject 가 한다 —
// upload_owners 같은 별도 원장이 없다. 완성본은 이제 renders 비공개 버킷에 있다
// (lib/compose.js 가 거기에 올린다). ★ 객체를 실제로 심는 이유는 예전에 파일을 심던
// 이유와 같다 — 없으면 getObject 실패가 먼저 404 를 내서, 소유자 검사를 지워도
// 통과하는 "지키는 척하는 테스트"가 된다. 주인이 부르면 200(+내용), 남이 부르면
// 객체가 있는데도 404 여야 진짜 검사다.
async function putRenderObject(projectId, content = "video-bytes") {
  await memoryStore.putObject("renders", `${projectId}.mp4`, Buffer.from(content), "video/mp4");
}

describe("업로드 소유자", () => {
  beforeEach(() => resetMemoryStore());

  it("주인은 받는다", async () => {
    await memoryStore.putObject("uploads", "aaa.jpg", Buffer.from("x"), "image/jpeg");
    await memoryStore.insertUploadOwner("aaa.jpg", A);
    const res = await getUpload(as(A), { params: Promise.resolve({ name: "aaa.jpg" }) });
    expect(res.status).toBe(200);
  });

  it("남은 404 다", async () => {
    await memoryStore.putObject("uploads", "aaa.jpg", Buffer.from("x"), "image/jpeg");
    await memoryStore.insertUploadOwner("aaa.jpg", A);
    const res = await getUpload(as(B), { params: Promise.resolve({ name: "aaa.jpg" }) });
    expect(res.status).toBe(404);
  });

  it("주인 기록이 없는 옛 파일도 404 다 — 열어두지 않는다", async () => {
    await memoryStore.putObject("uploads", "old.jpg", Buffer.from("x"), "image/jpeg");
    const res = await getUpload(as(A), { params: Promise.resolve({ name: "old.jpg" }) });
    expect(res.status).toBe(404);
  });
});

describe("완성본 내려받기", () => {
  beforeEach(() => resetMemoryStore());

  it("주인이 부르면 200 이고 파일 내용이 그대로 온다", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    await putRenderObject(p.id, "진짜-영상-바이트");
    const res = await getRender(as(A), { params: Promise.resolve({ name: `${p.id}.mp4` }) });
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("진짜-영상-바이트");
  });

  it("파일명이 곧 프로젝트 id 다 — 객체가 있어도 남의 것은 404", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    // 객체가 버킷에 실제로 있다 — 그런데도 막혀야 진짜 소유자 검사다(리뷰 C1).
    // 객체를 안 두면 getObject 실패가 먼저 404 를 내서, 소유자 검사를 지워도
    // 테스트가 통과하는 "지키는 척하는 테스트"가 된다.
    await putRenderObject(p.id, "진짜-영상-바이트");
    const res = await getRender(as(B), { params: Promise.resolve({ name: `${p.id}.mp4` }) });
    expect(res.status).toBe(404);
  });

  it("프로젝트 id 가 아닌 이름은 400 이다", async () => {
    const res = await getRender(as(A), { params: Promise.resolve({ name: "hack.mp4" }) });
    expect(res.status).toBe(400);
  });
});
