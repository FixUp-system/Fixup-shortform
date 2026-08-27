// 사용자 관리에 **이름**이 뜬다 (2026-08-27 사장님 요청: "사용자 관리 페이지에서 사용자
// 이름도 추가해줘").
//
// 뿌리 — 화면은 이메일밖에 못 보여 주고 있었다. 이름은 프로필에 있었지만
// (`profiles.display_name`, /me 화면이 그것을 적는다) **목록 조회가 그 열을 안 팠다.**
// 화면만 고치면 영영 빈 칸이라, 저장소·화면 둘을 함께 잰다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { displayNameOf } from "../lib/display-name.js";

const page = readFileSync("app/admin/page.js", "utf8");
const store = readFileSync("lib/store/supabase.js", "utf8");
const clean = page
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("목록 조회가 이름을 판다", () => {
  it("★ listProfiles 가 display_name 을 함께 읽는다 — 없으면 화면은 영영 빈 칸이다", () => {
    const at = store.indexOf("async listProfiles()");
    expect(at).toBeGreaterThan(-1);
    expect(store.slice(at, at + 400)).toContain("display_name");
  });
});

describe("화면이 이름을 보여 준다", () => {
  it("표에 이름 열이 있다", () => {
    expect(clean).toContain("<th>이름</th>");
  });

  it("★ 규칙은 한 벌이다 — 화면이 자기 폴백을 새로 만들지 않는다", () => {
    // 이름이 없을 때 무엇을 보여 줄지는 lib/display-name.js 가 정한다(/me·원장과 같은 값).
    expect(clean).toContain("displayNameOf");
    expect(displayNameOf({ email: "boss@fix-up.kr" })).toBe("boss");
    expect(displayNameOf({ display_name: "재찬", email: "boss@fix-up.kr" })).toBe("재찬");
  });

  it("이름으로도 찾을 수 있다 — 사람 이야기는 이름으로 한다", () => {
    const at = clean.indexOf("const found");
    expect(at).toBeGreaterThan(-1);
    const filter = clean.slice(at, at + 400);
    expect(filter).toContain("displayNameOf");
    expect(filter, "이메일 검색이 사라졌다").toContain("u.email");
    expect(filter, "id 검색이 사라졌다").toContain("u.id");
  });

  it("이메일은 그대로 남는다 — 이름은 부르는 말이고 이메일은 신원이다", () => {
    expect(clean).toContain("{u.email}");
  });
});
