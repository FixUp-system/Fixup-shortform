// **운영자는 남의 영상도 고칠 수 있다** (2026-08-27 사장님 지시:
// "admin 은 사용자가 생성한 영상도 편집 과정을 수정할 수 있게").
//
// ★★ 판정을 어디에 뒀나 — `lib/projects.js` 의 `ownerScope` **한 곳**이다.
//   라우트가 스무 곳이 넘어서, 인자로 흘리면 중간 하나가 빠뜨린 자리만 조용히 안 되고
//   그 자리는 "왜 이 화면만 남의 것을 못 고치지"로 나타난다(찾기 어려운 종류다).
//   역할은 요청 경계(withUser)가 이미 세운 컨텍스트에서 읽는다(lib/actor.js).
//
// ⚠️ 이 판이 재는 것은 **넓어진 폭**이다. 권한을 넓히는 변경이라 세 가지를 못 박는다:
//   ① 운영자만 넓어진다 ② 모를 때는 안 넓힌다 ③ 지우기·내 목록은 그대로다
import { describe, it, expect, beforeEach } from "vitest";
import { resetMemoryStore, memoryStore } from "../lib/store/memory.js";
import { runWithActor } from "../lib/actor.js";
import { getProject, updateProject, listProjects, getProjectCuts } from "../lib/projects.js";

const OWNER = "11111111-1111-1111-1111-111111111111";
const ADMIN = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";
const P = "p-owned";

const asAdmin = (fn) => runWithActor({ id: ADMIN, role: "admin" }, fn);
const asUser = (fn) => runWithActor({ id: OTHER, role: "user" }, fn);

beforeEach(async () => {
  resetMemoryStore();
  await memoryStore.insertProject({ id: P, kind: "reel", cuts: [{ idx: 0 }], material: { text: "원본" } }, OWNER);
});

describe("운영자", () => {
  it("남의 프로젝트를 읽는다", async () => {
    const doc = await asAdmin(() => getProject(P, ADMIN));
    expect(doc?.material?.text).toBe("원본");
  });

  it("★ 남의 프로젝트를 **고친다** — 이 지시의 본체다", async () => {
    await asAdmin(() => updateProject(P, ADMIN, (p) => ({ ...p, material: { text: "운영자가 고침" } })));
    const doc = await asAdmin(() => getProject(P, ADMIN));
    expect(doc.material.text).toBe("운영자가 고침");
  });

  it("고쳐도 **주인은 안 바뀐다** — 남의 작업물이지 내 것이 되는 게 아니다", async () => {
    await asAdmin(() => updateProject(P, ADMIN, (p) => ({ ...p, status: "images" })));
    // 주인이 바뀌었으면 원 소유자가 자기 것을 못 읽는다.
    const mine = await runWithActor({ id: OWNER, role: "user" }, () => getProject(P, OWNER));
    expect(mine?.status).toBe("images");
  });

  it("폴링이 읽는 부분 조회도 함께 열린다 — 화면 하나만 못 도는 일이 없게", async () => {
    const cuts = await asAdmin(() => getProjectCuts(P, ADMIN));
    expect(cuts).not.toBeNull();
  });
});

describe("★ 넓어진 것은 운영자뿐이다", () => {
  it("보통 사용자는 남의 것을 못 읽는다", async () => {
    expect(await asUser(() => getProject(P, OTHER))).toBeNull();
  });

  it("보통 사용자는 남의 것을 못 고친다", async () => {
    await expect(asUser(() => updateProject(P, OTHER, (p) => p))).rejects.toThrow(/찾을 수 없어요/);
  });

  it("★ 컨텍스트가 없으면 안 넓힌다 — 스크립트·단위 테스트가 조용히 운영자가 되지 않는다", async () => {
    expect(await getProject(P, OTHER)).toBeNull();
  });

  it("★ 문자열 actor 는 역할이 아니다 — 스크립트의 runWithActor(\"admin\") 이 권한을 주지 않는다", async () => {
    const doc = await runWithActor("admin", () => getProject(P, OTHER));
    expect(doc, "주체 이름이 admin 이라고 권한이 생겼다").toBeNull();
  });

  it("소유자를 안 넘긴 것은 여전히 사고다 — 조용히 통과시키지 않는다", async () => {
    await expect(asAdmin(() => getProject(P, ""))).rejects.toThrow(/소유자/);
  });
});

describe("★ 그대로 둔 것", () => {
  it("지우기는 소유자 전용이다 — 고치는 것과 없애는 것은 다른 일이다", async () => {
    const gone = await memoryStore.deleteProject(P, ADMIN);
    expect(gone, "운영자가 남의 영상을 지웠다").toBe(false);
    expect(await memoryStore.selectProject(P, OWNER)).not.toBeNull();
  });

  it("[내 영상] 목록은 안 넓어진다 — 넓히면 그 말이 깨진다", async () => {
    const mine = await asAdmin(() => listProjects(ADMIN));
    expect(mine.length, "남의 영상이 내 목록에 들어왔다").toBe(0);
  });
});
