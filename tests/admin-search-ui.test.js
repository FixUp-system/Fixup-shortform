// 사용자가 늘면 표를 눈으로 훑을 수 없다 — 찾아서 좁힌다(2026-08-13 요청).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const admin = readFileSync("app/admin/page.js", "utf8");

describe("사용자 관리 — 찾기와 줄 수", () => {
  it("검색 칸이 있다", () => {
    expect(admin).toMatch(/검색|찾기/);
    expect(admin).toMatch(/query|keyword|search/i);
  });

  // 이메일만 찾을 수 있으면 "그 사람 uuid 로 문의가 왔는데" 를 못 푼다.
  it("이메일과 id 로 찾는다", () => {
    expect(admin).toMatch(/email/);
    expect(admin).toMatch(/\.id\b/);
  });

  // 2026-08-13: 줄 수 고르기는 뺐다 — 사용자가 넷인 지금은 고를 것이 없고, 버튼 셋이
  // 검색칸 옆에서 자리만 먹었다. 500명을 넘기기 시작하면 그때 다시 만든다.
  it("줄 수 고르는 버튼을 두지 않는다", () => {
    expect(admin).not.toMatch(/명씩/);
  });

  // 찾은 결과가 0이면 빈 표만 남아 "고장인가"로 읽힌다.
  it("결과가 없으면 그렇게 말한다", () => {
    expect(admin).toMatch(/찾는 사용자가 없어요|결과가 없어요/);
  });

  // 몇 명 중 몇 명을 보고 있는지 — 잘려 보이는 것을 숨기지 않는다.
  // 자리는 **표 아래**다: 찾기 전에 알아야 하는 값이 아니라 결과를 보고 확인하는 값이다.
  it("보이는 수를 표 아래에 적는다", () => {
    expect(admin).toMatch(/전체 \$\{|전체 \{|중 \$\{/);
    const count = admin.indexOf("admin-count");
    const table = admin.indexOf("</table>");
    expect(count, "수를 적는 자리가 없다").toBeGreaterThan(-1);
    expect(count, "수가 표보다 위에 있다").toBeGreaterThan(table);
  });
});
