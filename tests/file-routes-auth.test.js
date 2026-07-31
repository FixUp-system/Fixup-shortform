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

  it("파일명이 곧 프로젝트 id 다 — 남의 것은 404", async () => {
    const p = await createProject({ settings: {}, material: { text: "가", photos: [] }, ownerId: A });
    const res = await getRender(as(B), { params: Promise.resolve({ name: `${p.id}.mp4` }) });
    expect(res.status).toBe(404);
  });

  it("프로젝트 id 가 아닌 이름은 400 이다", async () => {
    const res = await getRender(as(A), { params: Promise.resolve({ name: "hack.mp4" }) });
    expect(res.status).toBe(400);
  });
});
