// 장면 카드는 두 흐름이 같은 모양이다 — 광고 쪽에 맞춘다.
//
// 사장님 지시(2026-08-18): "내용은 지금을 유지하되 형식만, UX/UI만 둘을 통일시켜줘. 광고에 맞춰서."
//
// 두 화면은 이미 같은 그릇을 쓴다(`plan-list` · `plan-row` · `num` · `plan-body`).
// 갈리는 것은 **장면 안쪽**이었다:
//   · 광고 — `plan-field` 한 줄에 `<b>라벨</b> 값`, 초는 머리에 배지, 값은 인라인 편집
//   · ②시나리오 — 라벨이 값 **위**에 있는 폼(`sc-cell` + `input.field`/`textarea`), 초도 칸
// 같은 것을 두 모양으로 보여 주고 있었다.
//
// ★ 통일하는 것은 **형식**이지 기능이 아니다. ②시나리오에만 있는 것(초 편집·장면 추가·
//   삭제·순서 이동)은 그대로 남는다 — 광고에는 그 길이 아예 없는데(장면 수를 못 바꾼다),
//   여기서는 초의 합을 목표에 맞추는 것이 **확정의 조건**이라 손댈 수단이 사라지면 안 된다.
// ★ 광고의 "읽기 기본 + [수정하기]" 토글은 옮기지 않는다. 그것은 형식이 아니라 **흐름**이다 —
//   광고는 받아 보는 화면이고 ②는 고치는 화면이다(이 저장소가 "마지막 무료 관문"이라 부른다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ad = readFileSync("app/ads/[id]/page.js", "utf8");
const sc = readFileSync("app/create/[id]/scenario/page.js", "utf8");
const css = readFileSync("app/globals.css", "utf8");

describe("장면 카드 — 두 흐름이 같은 모양", () => {
  it("★ 같은 그릇을 쓴다", () => {
    for (const cls of ["plan-list", "plan-row", "plan-body"]) {
      expect(ad, `광고에 ${cls} 가 없다`).toContain(cls);
      expect(sc, `②시나리오에 ${cls} 가 없다`).toContain(cls);
    }
  });

  it("★★ ②시나리오도 장면 필드를 `plan-field` 한 줄로 그린다", () => {
    expect(sc, "필드가 광고와 다른 모양이다").toContain('className="plan-field"');
    // 라벨은 값 **앞**에 온다(광고와 같다) — 위에 얹는 옛 모양은 걷는다
    expect(sc, "라벨이 아직 값 위에 얹혀 있다").not.toContain('className="sc-label"');
  });

  it("★★ 초는 광고처럼 장면 머리의 배지 자리다", () => {
    const body = sc.slice(sc.indexOf('className="plan-body'), sc.indexOf('className="plan-body') + 900);
    const badgeAt = body.indexOf("sc-secs");
    const firstField = body.indexOf('className="plan-field"');
    expect(badgeAt, "초 자리를 못 찾았다").toBeGreaterThan(-1);
    expect(badgeAt, "초가 필드들 아래에 있다 — 광고는 머리에 둔다").toBeLessThan(firstField);
  });

  it("★ 그래도 초는 고칠 수 있다 — 합이 목표와 맞아야 확정된다", () => {
    expect(sc, "초를 고칠 수 없게 됐다 — 목표에 맞출 수단이 사라진다")
      .toMatch(/seconds: Math\.round/);
  });

  it("★ 장면 추가·삭제·순서는 그대로 남는다 — ②에만 있는 기능이다", () => {
    for (const fn of ["addShot", "removeShot", "moveShot"]) {
      expect(sc, `${fn} 이 사라졌다`).toContain(fn);
    }
  });

  it("★ 광고의 읽기/수정 토글은 옮기지 않는다 — 그건 흐름이지 형식이 아니다", () => {
    expect(sc, "②가 읽기 기본이 됐다 — 고치는 화면인데 한 번 더 눌러야 고쳐진다")
      .not.toMatch(/setEditing\(/);
  });

  it("★ 초 배지가 광고의 배지와 같은 크기·색을 쓴다", () => {
    expect(css, "초 배지 모양이 없다").toMatch(/\.sc-secs/);
  });
});
