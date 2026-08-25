// [영상에 적용]은 **반영할 것이 남았으면** 눌린다 — 자막 설정만 보지 않는다.
//
// 사장님 지적(2026-08-18): "중국어로 설정해서 적용하고, 그 뒤에 다른 언어를 선택하려고 하면
// 적용 버튼이 안 눌려."
//
// 원인: 버튼의 잠금이 `dirty` 하나였고, 그 값은 **자막 설정**(위치·글꼴·색·크기)만 비교한다.
//   const dirty = JSON.stringify(sub) !== JSON.stringify(seedSubtitle(project));
// 언어는 고르는 즉시 서버에 저장되므로(pickLang) 이 비교에 안 걸린다 → 영상에는 옛 언어가
// 구워져 있는데 버튼은 잠긴 채 **"적용됨"**이라고 말한다. 화면이 거짓말을 하는 자리다.
//
// ★ 각인은 이미 알고 있었다 — 언어를 바꾸면 renderKey 가 달라져 `stale` 이 참이 되고
//   화면에 "다시 합치면 새 자막으로 나와요" 경고까지 떴다. **아는데 문이 안 열린 것**이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const done = readFileSync("app/create/[id]/done/page.js", "utf8");

// ★★ 2026-08-25 — 버튼 자체는 공용 편집기(components/SubtitleEditor.jsx)로 옮겼고,
//   **무엇을 보고 잠글지·뭐라고 말할지는 이 화면이 넘긴다**(applyDisabled·applyLabel).
//   그래서 이 파일은 그 두 식을 잰다 — 계약("잠금과 문구가 같은 값을 본다")은 그대로다.
describe("영상에 적용 — 언제 눌리나", () => {
  // 넘기는 식 한 줄을 그대로 떠 온다(`이름={...}`) — 줄 단위라 정규식 이스케이프에
  // 기대지 않는다(중괄호가 섞인 패턴은 실제로 한 번 조용히 빈 문자열을 냈다).
  const expr = (name) => {
    const line = done.split("\n").find((l) => l.trim().startsWith(`${name}=`)) || "";
    return line.slice(line.indexOf("{") + 1, line.lastIndexOf("}"));
  };

  it("★★ 자막 설정뿐 아니라 낡음도 문을 연다", () => {
    expect(done, "실행을 편집기에 안 넘긴다").toContain("onApply={applyToVideo}");
    const disabled = expr("applyDisabled");
    expect(disabled, "잠금식을 못 찾았다").toBeTruthy();
    expect(disabled, "자막 설정만 보고 잠근다 — 언어를 바꿔도 안 열린다")
      .not.toMatch(/^applying \|\| busy \|\| !dirty$/);
    expect(disabled, "낡음을 안 본다").toMatch(/stale/);
  });

  it("★★ 눌릴 것이 없을 때만 '적용됨'이라고 말한다", () => {
    // 잠금과 문구가 **같은 값**을 봐야 한다 — 갈리면 잠긴 버튼이 "영상에 적용"이라 하거나
    // 눌리는 버튼이 "적용됨"이라 한다(지금이 뒤쪽이었다).
    const disabled = expr("applyDisabled");
    const label = expr("applyLabel");
    expect(disabled, "잠금식을 못 찾았다").toBeTruthy();
    expect(label, "문구식을 못 찾았다").toBeTruthy();
    for (const token of ["dirty", "stale"]) {
      expect(disabled.includes(token), `잠금이 ${token} 를 안 본다`).toBe(true);
      expect(label.includes(token), `문구가 ${token} 를 안 본다 — 잠금과 갈린다`).toBe(true);
    }
  });
});
