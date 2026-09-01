// **운영자는 남의 영상을 단계별로 열어볼 수 있고, 역할을 지정할 수 있다**
// (2026-09-01 사장님 지시).
//
// ★★★ 첫째는 **문이 없었을 뿐**이다. 뒷단은 2026-08-27 에 이미 열렸는데
//   (lib/projects.js 의 ownerScope — tests/admin-edits-others.test.js 가 잰다),
//   보관함 상세의 "이어서 작업하기 →" 가 `mine !== false` 로 가려져 있었다.
//   그 자리 주석이 이유를 이렇게 적어 두었다: *"제작 화면은 소유자만 열 수 있어
//   (getProject 가 소유자를 요구한다) 눌러도 404 다."* — **그 전제가 이미 낡았다.**
//   운영자에게는 404 가 아니다. 낡은 전제로 닫힌 문 하나가 이 지시의 전부다.
//
// ★★ **`mine` 과 `editable` 을 가른다.** 한 값으로 둘을 겸하면 지우기까지 함께 열린다.
//   · `mine`     — 내가 만들었는가. **지우기**가 이 값을 본다(deleteProject 는 설계상
//                  소유자 전용이다 — "고치는 것과 없애는 것은 다른 일이다").
//   · `editable` — 고칠 수 있는가( = mine || 운영자). **제작 화면 문**이 이 값을 본다.
//   ⚠️ 넓히는 값이라 **모를 때는 안 넓힌다** — currentRole() 이 빈 문자열이면 false 다.
//
// ★ 둘째(역할 지정)는 **API 가 이미 있다** — PATCH /api/admin/users/[id] 가 role 을
//   받고 app_metadata·profiles 이중 쓰기까지 한다. 화면만 읽기 전용 텍스트였다.
//   ★★ 자기 자신은 못 바꾼다: 마지막 운영자가 자기를 강등하면 **아무도 못 들어온다**.
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resetMemoryStore, memoryStore } from "../lib/store/memory.js";
import { runWithActor } from "../lib/actor.js";
import { getProjectForViewing } from "../lib/projects.js";
import { blocksSelfRoleChange } from "../lib/admin/self-guard.js";

const OWNER = "11111111-1111-1111-1111-111111111111";
const ADMIN = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";
const P = "p-owned";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

beforeEach(async () => {
  resetMemoryStore();
  await memoryStore.insertProject({ id: P, kind: "reel", material: { text: "원본" } }, OWNER);
});

describe("남의 영상을 열 수 있는가 — editable", () => {
  it("★★★ 운영자는 남의 것도 고칠 수 있다고 답한다", async () => {
    const v = await runWithActor({ id: ADMIN, role: "admin" }, () => getProjectForViewing(P, ADMIN));
    expect(v.editable, "문이 안 열린다").toBe(true);
  });

  it("★★ 그래도 **내 것은 아니다** — 지우기까지 열리면 안 된다", async () => {
    const v = await runWithActor({ id: ADMIN, role: "admin" }, () => getProjectForViewing(P, ADMIN));
    expect(v.mine, "mine 이 참이면 지우기 버튼까지 그려진다").toBe(false);
  });

  it("★★ 보통 사용자는 남의 것을 못 고친다", async () => {
    const v = await runWithActor({ id: OTHER, role: "user" }, () => getProjectForViewing(P, OTHER));
    expect(v.editable).toBe(false);
    expect(v.mine).toBe(false);
  });

  it("★ 소유자는 둘 다 참이다 — 예전 화면이 안 바뀐다", async () => {
    const v = await runWithActor({ id: OWNER, role: "user" }, () => getProjectForViewing(P, OWNER));
    expect(v).toMatchObject({ mine: true, editable: true });
  });

  it("★★ **모를 때는 안 넓힌다** — 컨텍스트 없이 부르면 운영자가 아니다", async () => {
    const v = await getProjectForViewing(P, OTHER);
    expect(v.editable).toBe(false);
  });

  it("★ 문자열 actor 는 역할이 아니다 — 스크립트가 조용히 운영자가 되지 않는다", async () => {
    const v = await runWithActor("admin", () => getProjectForViewing(P, OTHER));
    expect(v.editable).toBe(false);
  });
});

describe("문이 실제로 화면까지 간다", () => {
  const ROUTES = [
    "app/api/reel/[id]/route.js",
    "app/api/ads/[id]/route.js",
    "app/api/film/[id]/route.js",
    "app/api/projects/[id]/route.js",
  ];

  it("★★★ 네 문 모두 editable 을 실어 보낸다 — 하나만 빠지면 그 종류만 안 열린다", () => {
    for (const f of ROUTES) {
      expect(strip(readFileSync(f, "utf8")), `${f} 가 editable 을 안 싣는다`).toMatch(/editable/);
    }
  });

  it("★★★ 상세 화면이 **editable** 로 제작 화면 문을 그린다", () => {
    const src = strip(readFileSync("app/archive/[id]/page.js", "utf8"));
    expect(src).toMatch(/doc\.editable !== false/);
    expect(src, "mine 으로 가리면 운영자에게 여전히 문이 없다")
      .not.toMatch(/doc\.mine !== false/);
  });

  it("★★ 지우기는 **mine** 그대로다 — 고치는 것과 없애는 것은 다른 일이다", () => {
    const src = strip(readFileSync("components/ProjectCards.jsx", "utf8"));
    expect(src, "지우기가 editable 로 바뀌면 운영자가 남의 것을 지운다").toMatch(/p\.mine !== false/);
  });
});

describe("역할 지정", () => {
  it("★★★ 자기 자신은 못 바꾼다 — 마지막 운영자가 자기를 강등하면 아무도 못 들어온다", () => {
    expect(blocksSelfRoleChange(ADMIN, ADMIN)).toBe(true);
    expect(blocksSelfRoleChange(ADMIN, OTHER)).toBe(false);
  });

  it("★ 값이 없으면 막지 않는다 — 없는 것을 같다고 읽으면 남까지 못 바꾼다", () => {
    expect(blocksSelfRoleChange(null, null)).toBe(false);
    expect(blocksSelfRoleChange(undefined, ADMIN)).toBe(false);
  });

  it("★★ 라우트가 그 판정을 쓴다 — 순수 함수만 있고 안 부르면 헛일이다", () => {
    const src = strip(readFileSync("app/api/admin/users/[id]/route.js", "utf8"));
    expect(src).toMatch(/blocksSelfRoleChange\(/);
  });

  it("★★★ 운영자 화면에 역할을 **고르는 자리**가 있다 — 예전에는 읽기 전용 글자였다", () => {
    const src = strip(readFileSync("app/admin/page.js", "utf8"));
    expect(src, "setRole 이 없다 — 역할을 바꿀 길이 없다").toMatch(/setRole\(/);
    expect(src, "role 을 PATCH 로 보내지 않는다").toMatch(/JSON\.stringify\(\{ role \}\)/);
  });

  it("★★ 목록이 **내 줄**을 알려 준다 — 화면이 자기 id 를 알려면 왕복이 하나 더 는다", () => {
    const src = strip(readFileSync("app/api/admin/users/route.js", "utf8"));
    expect(src).toMatch(/self:\s*u\.id === user\.id/);
  });

  it("★★ 화면이 내 줄의 역할 자리를 잠근다 — 다만 그것은 가림막이라 서버도 막는다", () => {
    const src = strip(readFileSync("app/admin/page.js", "utf8"));
    const at = src.indexOf("역할`");
    expect(at, "역할 select 가 없다").toBeGreaterThan(-1);
    expect(src.slice(at - 400, at)).toMatch(/u\.self/);
  });

  it("★ 등급과 **같은 문**을 쓴다 — 문을 새로 내면 승인·차단과 갈린다", () => {
    const src = strip(readFileSync("app/admin/page.js", "utf8"));
    const roleAt = src.indexOf("setRole");
    expect(src.slice(roleAt, roleAt + 400)).toMatch(/\/api\/admin\/users\/\$\{id\}/);
    expect(src.slice(roleAt, roleAt + 400)).toMatch(/method: "PATCH"/);
  });
});
