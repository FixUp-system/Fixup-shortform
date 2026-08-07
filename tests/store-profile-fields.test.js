// 스토어가 마이페이지에 필요한 것을 주는가. 인메모리 스토어로 판정한다
// (vitest.setup.js 가 SHOTFORM_STORE=memory 를 세운다).
import { describe, it, expect, beforeEach } from "vitest";
import { memoryStore, resetMemoryStore } from "../lib/store/memory.js";
import { displayNameOf, NAME_MAX } from "../lib/display-name.js";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

describe("findProfiles — 마이페이지가 쓰는 필드", () => {
  beforeEach(() => resetMemoryStore());

  it("display_name 과 created_at 을 함께 준다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@b.com", status: "approved", role: "user" });
    await memoryStore.updateProfile(A, { display_name: "윤재찬" });
    const p = (await memoryStore.findProfiles([A])).get(A);
    expect(p.display_name).toBe("윤재찬");
    expect(typeof p.created_at).toBe("string");
    // 기존 소비자(/admin 목록)가 쓰던 필드가 그대로 있어야 한다.
    expect(p.email).toBe("a@b.com");
    expect(p.role).toBe("user");
    expect(p.status).toBe("approved");
  });

  it("이름을 한 번도 안 정했으면 display_name 은 null 이다", async () => {
    await memoryStore.insertProfile({ id: A, email: "a@b.com", status: "approved", role: "user" });
    expect((await memoryStore.findProfiles([A])).get(A).display_name).toBe(null);
  });
});

// ★ listProjects().length 로 세면 안 된다 — 그 쿼리에 limit(100) 이 있어
// 영상이 많은 이용자에게 조용히 틀린 숫자를 보여준다. 그래서 세는 자리를 따로 둔다.
describe("countProjects — 소유자별로 센다", () => {
  beforeEach(() => resetMemoryStore());

  it("남의 영상은 안 센다", async () => {
    await memoryStore.insertProject({ id: "p1", created_ts: 1, status: "draft" }, A);
    await memoryStore.insertProject({ id: "p2", created_ts: 2, status: "draft" }, A);
    await memoryStore.insertProject({ id: "p3", created_ts: 3, status: "draft" }, B);
    expect(await memoryStore.countProjects(A)).toBe(2);
    expect(await memoryStore.countProjects(B)).toBe(1);
  });

  it("하나도 없으면 0", async () => {
    expect(await memoryStore.countProjects(A)).toBe(0);
  });
});

describe("displayNameOf — 이름이 없으면 이메일 앞부분", () => {
  it("이름이 있으면 그대로", () => {
    expect(displayNameOf({ display_name: "윤재찬", email: "a@b.com" })).toBe("윤재찬");
  });
  it("없거나 공백뿐이면 이메일의 @ 앞", () => {
    expect(displayNameOf({ display_name: null, email: "jaechan@fix-up.kr" })).toBe("jaechan");
    expect(displayNameOf({ display_name: "   ", email: "jaechan@fix-up.kr" })).toBe("jaechan");
  });
  it("둘 다 없으면 빈 버튼이 생기지 않게 기본 문구", () => {
    expect(displayNameOf({})).toBe("이용자");
  });
  it("상한은 20자다", () => {
    expect(NAME_MAX).toBe(20);
  });
});
