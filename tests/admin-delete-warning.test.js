// **남의 것을 지울 때는 다르게 묻는다** (2026-09-03 사장님 지시).
//
// ★★ 왜 필요한가 — 운영자에게 보관함 [전체]가 열리면서 **같은 버튼이 두 가지 일**을 하게
//   됐다: 내 것 지우기와 남이 만든 것 지우기. 문구가 같으면 그 둘이 손끝에서 구별되지
//   않는다. 카드가 격자로 촘촘해 오조작이 쉬운 자리이고(ProjectCards 의 remove 주석),
//   지우기는 완성본 파일까지 함께 없애 **되돌릴 수 없다**.
//
// ★ 판정 기준은 `mine === false` — "내 것이 아님이 **확인된** 것"에만 붙인다.
//   목록에 mine 이 없는 옛 호출부(홈)는 undefined 라 예전 문구 그대로다. 모르면 안 겁준다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));
const archive = strip(readFileSync("app/archive/page.js", "utf8"));

describe("카드 낱개 지우기 — 남의 것이면 경고가 다르다", () => {
  it("★★★ mine === false 로 가른다 — undefined(모름)는 안 겁준다", () => {
    expect(cards).toMatch(/const others = p\.mine === false/);
  });

  it("★★★ 남의 것이면 제목·본문·버튼이 **셋 다** 달라진다 — 하나만 바꾸면 눈에 안 띈다", () => {
    const fn = cards.slice(cards.indexOf("async function remove"), cards.indexOf("setBusyId(p.id)"));
    expect(fn, "제목이 안 갈린다").toMatch(/others \? `남이 만든/);
    expect(fn, "본문이 안 갈린다").toMatch(/others[\s\S]{0,80}다른 사람이 만든/);
    expect(fn, "확인 버튼이 안 갈린다").toMatch(/others \? "그래도 지우기"/);
  });

  it("★★ 되돌릴 수 없다는 말은 **양쪽 다** 한다", () => {
    const fn = cards.slice(cards.indexOf("async function remove"), cards.indexOf("setBusyId(p.id)"));
    expect((fn.match(/되돌릴 수 없/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("여러 편 정리 — 남의 것이 몇 편인지 센다", () => {
  it("★★★ 고른 것 중 남의 것을 **수로** 말한다 — 있는지만 말하면 규모를 모른다", () => {
    expect(archive).toMatch(/selected\.has\(p\.id\) && p\.mine === false/);
    expect(archive, "제목에 수가 안 실린다").toMatch(/남이 만든 것 \$\{others\}편 포함/);
  });

  it("★★ 남의 것이 없으면 예전 문구 그대로다 — 늘 겁주면 경고가 무뎌진다", () => {
    const fn = archive.slice(archive.indexOf("async function removeSelected"), archive.indexOf("setBusy(true)"));
    expect(fn).toMatch(/others\s*\?[\s\S]{0,200}:\s*"만든 영상과 그림이 함께 지워지고/);
  });

  it("★★ 확인 버튼도 갈린다", () => {
    expect(archive).toMatch(/confirmLabel: others \? "그래도 지우기" : "지우기"/);
  });
});
