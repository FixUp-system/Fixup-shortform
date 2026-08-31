// 손님(로그인 안 한 사람)이 **보관함만** 볼 수 있다 (2026-08-27 사장님 요청).
//
// 요청: "비회원도 보관함의 전체 영상을 살펴볼 수 있게 … 내부 테스트용이라 레퍼런스
// 체크용으로 로그인 없이도 쉽게 접근해서 퀄리티 체크를 할 수 있게".
//
// ⚠️⚠️ 이 판이 재는 것은 **문이 열렸는가**가 아니라 **어디까지만 열렸는가**다.
//   보안 경계를 넓히는 변경이라, 넓어진 폭을 코드가 지키게 못 박는다:
//     ① 기본은 **닫힘** — env 를 잊으면 조용히 열리지 않는다
//     ② **GET 만** — 만들기·고치기·지우기는 그대로 로그인이 필요하다
//     ③ **정확한 자리만** — 접두사로 열면 그 아래 값이 나가는 문까지 함께 열린다
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { guestArchiveOn, isGuestPath, isGuestRequest } from "../lib/auth/guest.js";

const ID = "0f8c1a2b-3c4d-5e6f-7a8b-9c0d1e2f3a4b";

describe("스위치 — 기본은 닫힘이다", () => {
  afterEach(() => { delete process.env.SHOTFORM_PUBLIC_ARCHIVE; });

  it("env 가 없으면 꺼져 있다 — 잊었을 때 열리는 쪽이면 안 된다", () => {
    delete process.env.SHOTFORM_PUBLIC_ARCHIVE;
    expect(guestArchiveOn()).toBe(false);
    expect(isGuestRequest("/archive", "GET")).toBe(false);
  });

  it('오타는 닫힌 쪽으로 떨어진다 — "1" 일 때만 열린다', () => {
    for (const v of ["true", "yes", "0", "", "on"]) {
      process.env.SHOTFORM_PUBLIC_ARCHIVE = v;
      expect(guestArchiveOn(), `${v} 로 열렸다`).toBe(false);
    }
    process.env.SHOTFORM_PUBLIC_ARCHIVE = "1";
    expect(guestArchiveOn()).toBe(true);
  });
});

describe("열린 자리 — 보관함을 보는 데 필요한 것뿐이다", () => {
  const open = [
    "/",
    "/archive",
    `/archive/${ID}`,
    "/api/projects",
    `/api/projects/${ID}`,
    `/api/ads/${ID}`,
    `/api/film/${ID}`,
    `/api/reel/${ID}`,
    `/api/renders/${ID}.mp4`,
    `/api/uploads/${ID}.jpg`,
  ];

  for (const path of open) {
    it(`${path} 는 손님도 읽는다`, () => {
      expect(isGuestPath(path, "GET")).toBe(true);
    });
  }
});

describe("★ 닫힌 자리 — 값이 나가거나 남을 건드리는 문은 전부 막힌다", () => {
  const closed = [
    // 값이 나가는 문 — 이것이 열리면 아무나 우리 돈을 쓴다
    [`/api/reel/${ID}/clips`, "GET"],
    [`/api/reel/${ID}/images`, "GET"],
    [`/api/reel/${ID}/render`, "GET"],
    [`/api/projects/${ID}/clips`, "GET"],
    [`/api/projects/${ID}/auto`, "GET"],
    [`/api/ads/${ID}/generate`, "GET"],
    // 만들기·고치기·지우기 — 같은 주소라도 메서드가 다르면 손님의 것이 아니다
    ["/api/projects", "POST"],
    [`/api/projects/${ID}`, "DELETE"],
    [`/api/reel/${ID}`, "PATCH"],
    [`/api/ads/${ID}`, "PATCH"],
    // 남의 지갑·전사 원장
    ["/api/credits", "GET"],
    ["/api/costs", "GET"],
    ["/api/admin/users", "GET"],
    ["/admin", "GET"],
    ["/costs", "GET"],
    ["/api/me", "GET"],
    // 만드는 화면 — 손님이 눌러도 값이 나가면 안 된다
    ["/home", "GET"],
    [`/reel/${ID}/video`, "GET"],
    ["/create", "GET"],
  ];

  for (const [path, method] of closed) {
    it(`${method} ${path} 는 막힌다`, () => {
      expect(isGuestPath(path, method)).toBe(false);
    });
  }

  it("★ 접두사로 열리지 않는다 — /api/reel 아래 굽기 문이 함께 열리면 안 된다", () => {
    expect(isGuestPath(`/api/reel/${ID}`, "GET")).toBe(true);
    expect(isGuestPath(`/api/reel/${ID}/clips`, "GET")).toBe(false);
    expect(isGuestPath(`/api/reel/${ID}/prompts`, "GET")).toBe(false);
  });
});

describe("배선 — 화면과 라우트가 같은 판정을 본다", () => {
  it("middleware 가 그 판정 하나만 쓴다", async () => {
    const { readFileSync } = await import("fs");
    const mw = readFileSync("middleware.js", "utf8");
    expect(mw).toContain("isGuestRequest");
    // 조건을 손으로 다시 적으면 그 사본이 조용히 넓어진다.
    expect(mw, "middleware 가 스스로 경로를 판정한다").not.toMatch(/pathname.*archive/);
  });

  it("읽기 문에는 guest 표시가, 쓰는 문에는 없다", async () => {
    const { readFileSync } = await import("fs");
    const reel = readFileSync("app/api/reel/[id]/route.js", "utf8");
    // GET 에만 붙어 있다 — PATCH 는 소유자 전용 그대로다.
    const get = reel.slice(reel.indexOf("export const GET"), reel.indexOf("export const PATCH"));
    const patch = reel.slice(reel.indexOf("export const PATCH"));
    expect(get, "읽기 문이 손님을 안 받는다").toContain("guest: true");
    expect(patch, "★ 고치는 문이 손님에게 열렸다").not.toContain("guest: true");
  });

  it("값이 나가는 문에는 guest 표시가 한 줄도 없다", async () => {
    const { readFileSync } = await import("fs");
    for (const f of [
      "app/api/reel/[id]/clips/route.js",
      "app/api/reel/[id]/images/route.js",
      "app/api/projects/[id]/clips/route.js",
      "app/api/ads/route.js",
    ]) {
      expect(readFileSync(f, "utf8"), `${f} 가 손님에게 열렸다`).not.toContain("guest: true");
    }
  });
});

describe("손님이 보는 목록", () => {
  const OWNER = "11111111-1111-1111-1111-111111111111";
  let GET;
  beforeEach(async () => {
    process.env.SHOTFORM_PUBLIC_ARCHIVE = "1";
    const { resetMemoryStore, memoryStore } = await import("../lib/store/memory.js");
    resetMemoryStore();
    GET = (await import("../app/api/projects/route.js")).GET;
    await memoryStore.insertProject({ id: "p1", kind: "reel", material: { text: "가" } }, OWNER);
  });
  afterEach(() => { delete process.env.SHOTFORM_PUBLIC_ARCHIVE; });

  it("★ 신원 없이도 전체가 보이고, 내 것은 하나도 없다", async () => {
    const res = await GET(new Request("http://x/api/projects"), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.guest, "손님이라고 말해 주지 않는다").toBe(true);
    expect(body.projects.length).toBe(1);
    // mine 이 참이면 화면이 지우기·이어서 작업하기를 그린다.
    expect(body.projects[0].mine).toBe(false);
  });

  it("스위치가 꺼져 있으면 신원 없이는 못 읽는다", async () => {
    delete process.env.SHOTFORM_PUBLIC_ARCHIVE;
    const res = await GET(new Request("http://x/api/projects"), {});
    expect(res.status).toBe(500); // 신원 헤더가 없다 = matcher 밖이거나 손님 금지
  });
});

// ── 들어오는 문 ──────────────────────────────────────────────────────────
//
// 사장님 지시(2026-08-27): "기본으로 보관함 바로 확인하고 상세 기능들을 사용하려면
// 로그인 및 회원가입 해야 볼 수 있는 걸로". 즉 첫 화면이 로그인 벽이면 안 된다.
describe("루트가 신원에 따라 갈린다", () => {
  const src = readFileSync("app/page.js", "utf8");

  it("로그인했으면 만들기 화면, 아니면 보관함", () => {
    expect(src).toContain("/home");
    expect(src).toContain("/archive");
    // 신원은 middleware 가 넣어 준 헤더를 읽기만 한다 — 세션을 여기서 다시 확인하지 않는다.
    expect(src).toContain("USER_HEADER");
    expect(src, "화면이 세션을 다시 판정한다").not.toContain("createServerClient");
  });

  it("★ 루트가 손님 목록에 있다 — 없으면 첫 화면에서 로그인 벽을 만난다", () => {
    expect(isGuestPath("/", "GET")).toBe(true);
  });
});

// ★ 첫 화면은 보관함이지만, 로그인 화면에 닿는 길은 여럿이다(로그아웃 직후 · 주소창
//   자동완성 · 만들기 화면에서 튕겨 옴). 그 자리에서 나갈 길이 없으면 로그인이
//   **유일한 문**처럼 보인다 — 사장님이 "보관함을 확인할 수 있어야 해"라고 한 그 지점이다.
describe("로그인 화면에서도 보관함으로 갈 수 있다", () => {
  const src = readFileSync("app/login/page.js", "utf8");

  it("보관함으로 가는 길이 있다", () => {
    expect(src).toContain("/archive");
    expect(src).toContain("로그인 없이 보관함 보기");
  });

  it("로그인·가입은 그대로다 — 보는 길이 문을 대신하지 않는다", () => {
    expect(src).toContain("회원가입");
    expect(src).toMatch(/type="submit"/);
  });
});

describe("손님에게 보이는 상단바", () => {
  const src = readFileSync("components/UserMenu.jsx", "utf8");

  it("로그인 버튼 하나만 그린다 — 없는 계정의 메뉴를 그리지 않는다", () => {
    const at = src.indexOf("if (guest)");
    expect(at, "손님 갈래가 없다").toBeGreaterThan(-1);
    // ★ 그 갈래**만** 자른다 — 넉넉히 잘랐더니 뒤따르는 로그인 사용자용 코드(크레딧·
    //   로그아웃)까지 들어와 거짓 경보가 났다(2026-08-27).
    const block = src.slice(at, src.indexOf("\n  }", at));
    expect(block).toContain("/login");
    expect(block, "손님에게 로그아웃을 그린다").not.toContain("로그아웃");
    expect(block, "손님에게 크레딧을 그린다").not.toContain("크레딧");
  });

  it("★ 401 을 실패와 가른다 — 일시적 오류에 로그인 버튼이 뜨면 안 된다", () => {
    const me = readFileSync("components/MeContext.jsx", "utf8");
    expect(me).toContain("res.status === 401");
    expect(me).toContain("setGuest");
  });
});
