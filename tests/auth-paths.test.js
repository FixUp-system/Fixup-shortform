// 공개 경로는 보안 경계다 — 늘어나는 것을 테스트가 알아채야 한다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { PUBLIC_PATHS, isPublicPath, ADMIN_PATHS, isAdminPath } from "../lib/auth/paths.js";

describe("공개 경로", () => {
  // ★★★ 2026-09-10 — **셋에서 넷이 됐다.** 늘린 것은 크론 문 하나다.
  //   Vercel 크론에는 로그인한 사람이 없어서, 여기 없으면 307 로 /login 에 튕기고
  //   1분마다 아무 일도 안 일어난다(같은 날 표지 정적 파일이 그 자리에서 307 을 맞았다).
  //   ★ 이 문을 지키는 것은 로그인이 아니라 **`CRON_SECRET`** 이고, 비밀이 없으면
  //     **닫힌 쪽으로** 떨어진다(app/api/cron/collect/route.js · tests/cron-collect.test.js).
  //   ★ 경로를 **하나씩** 적었다 — 접두사(`/api/cron`)로 열면 앞으로 만드는 크론이
  //     비밀 검사를 빠뜨린 채로도 공개가 된다.
  // ★★★ 2026-09-10 **저녁 — 넷에서 다섯이 됐다.** 늘린 것은 **fal 웹훅** 문 하나다.
  //   fal 은 로그인 없이 우리를 부르고, 문서가 못 박는다: *"Redirects are not followed …
  //   a 3xx status code … is treated as a permanent failure and is not retried."*
  //   벽 안에 두면 **307 한 번에 영영 재시도가 없다**.
  //   ★ 자물쇠는 로그인이 아니라 **ED25519 서명**이다(lib/fal-webhook.js) — 검증이 안 되면
  //     401 이고, JWKS 를 못 받아도 401 이다(모르면 닫는다).
  //   ★ 그리고 그 문은 **페이로드를 안 믿는다** — "이 편을 걷어라"는 방아쇠로만 쓰고
  //     무엇이 끝났는지는 우리가 fal 에 다시 묻는다. 뚫려도 돈이 안 나간다.
  // ★★★ 2026-09-11 **다섯에서 여섯이 됐다.** 늘린 것은 `/legal` 하나다 —
  //   이용약관·개인정보처리방침은 **로그인 전에 읽고 동의하는 문서**라 공개가 아니면
  //   가입 절차 자체가 성립하지 않는다(개인정보보호법·전자상거래법).
  //   ★ 여기만 **접두사로 연다.** 위 크론 주석이 "접두사로 열지 마라"고 못 박은 것과
  //     어긋나 보이지만 성질이 다르다: `/api/cron` 아래에는 **앞으로 만들 문**이 생기고
  //     그것이 비밀 검사를 빠뜨릴 수 있는 반면, `/legal` 아래에는 **정적 문서 화면만** 산다.
  //     값이 나가는 문도 남의 것을 읽는 문도 없다. 아래 판이 그 성질을 지킨다.
  it("여섯뿐이다", () => {
    expect([...PUBLIC_PATHS].sort()).toEqual(
      ["/api/auth/login", "/api/auth/signup", "/api/cron/collect", "/api/fal/webhook", "/legal", "/login"].sort()
    );
  });

  it("★★★ 약관·처리방침이 로그인 없이 열린다 — 안 열리면 가입 절차가 성립하지 않는다", () => {
    expect(isPublicPath("/legal/terms")).toBe(true);
    expect(isPublicPath("/legal/privacy")).toBe(true);
  });

  it("★★★ `/legal` 아래에는 **문서 화면 말고 아무것도 두지 않는다**", async () => {
    // 접두사로 연 자리라, 여기에 라우트를 하나라도 만들면 그것이 통째로 공개가 된다.
    const { readdirSync, existsSync } = await import("node:fs");
    if (!existsSync("app/legal")) return;
    const entries = readdirSync("app/legal");
    expect(entries, "/legal 아래에 문서 화면 말고 다른 것이 생겼다").toEqual(["[doc]"]);
    expect(readdirSync("app/legal/[doc]"), "문서 화면 폴더에 라우트가 섞였다").toEqual(["page.js"]);
  });

  it("매직링크 콜백은 더 이상 공개가 아니다", () => {
    expect(isPublicPath("/auth/callback")).toBe(false);
  });

  it("접두어만 겹치는 경로가 공개로 새지 않는다", () => {
    expect(isPublicPath("/login-debug")).toBe(false);
    expect(isPublicPath("/api/auth/login-as-admin")).toBe(false);
  });

  it("보호된 경로는 그대로 보호된다", () => {
    expect(isPublicPath("/create")).toBe(false);
    expect(isPublicPath("/api/projects")).toBe(false);
    expect(isPublicPath("/admin")).toBe(false);
  });

  it("콜백 라우트 파일이 저장소에 없다", () => {
    let exists = true;
    try { readFileSync("app/auth/callback/route.js"); } catch { exists = false; }
    expect(exists).toBe(false);
  });
});

// 운영자 경로도 보안 경계다 — 여기 없는 화면은 middleware 가 안 막는다.
describe("운영자 전용 경로", () => {
  it("둘뿐이다 — 원장(/costs)과 백오피스(/admin)", () => {
    expect([...ADMIN_PATHS].sort()).toEqual(["/admin", "/costs"].sort());
  });

  it("운영자 화면과 그 하위 경로를 맞힌다", () => {
    expect(isAdminPath("/costs")).toBe(true);
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/users/abc")).toBe(true);
  });

  it("접두어만 겹치는 경로가 운영자 경로로 새지 않는다", () => {
    expect(isAdminPath("/costsomething")).toBe(false);
    expect(isAdminPath("/admins")).toBe(false);
    expect(isAdminPath("/admin-debug")).toBe(false);
  });

  it("사장님 화면은 운영자 경로가 아니다", () => {
    expect(isAdminPath("/")).toBe(false);
    expect(isAdminPath("/create")).toBe(false);
    expect(isAdminPath("/archive")).toBe(false);
    expect(isAdminPath("/me")).toBe(false);
  });

  it("API 는 목록에 없다 — 라우트의 adminOnly 가 403 으로 답한다", () => {
    expect(isAdminPath("/api/costs")).toBe(false);
    expect(isAdminPath("/api/admin/users")).toBe(false);
  });

  it("운영자 경로가 공개 경로와 겹치지 않는다", () => {
    for (const p of ADMIN_PATHS) expect(isPublicPath(p)).toBe(false);
  });
});
