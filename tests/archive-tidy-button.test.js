// **[정리] 는 사라지지 않는다** (2026-09-01 사장님 지적: "수정 부분이 있다 없다 해").
//
// ★★★ 그전에는 `{count > 0 && !isAll && (…)}` 이라 **조건부로 렌더**했다. 그래서
//   [전체] 로 바꾸거나 영상이 0편이면 버튼이 통째로 사라지고, 옆의 토글까지 자리가
//   흔들렸다. 사라지면 "없어졌나?" 로 읽히지만, **흐리게 있으면 "지금은 못 쓴다"** 로
//   읽힌다 — 그래서 자리를 고정하고 못 쓸 때는 비활성으로 둔다.
//
// ★★ **이름을 `수정` → `정리` 로 바꿨다**(사장님 지시). 그 버튼이 실제로 여는 것은
//   편집이 아니라 **여러 편 골라 지우기**다(모두 선택 · 취소 · N편 지우기). 이름이
//   하는 일과 어긋나 있었다.
//   ★ 아이콘도 톱니바퀴가 아니라 **휴지통**이다 — 톱니바퀴는 "설정" 으로 읽혀서, 눌러
//     보면 삭제 모드가 열리는 지금 동작과 어긋난다.
//
// ★ **왜 [전체] 에서는 못 쓰나** — 그 목록에는 남이 만든 카드가 섞여 있어 "모두 선택" 이
//   지울 수 없는 것까지 고른다(옛 주석이 적어 둔 이유 그대로다). 이제 그 이유를 화면이
//   말한다(title) — 그전에는 말없이 사라지기만 했다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const page = strip(readFileSync("app/archive/page.js", "utf8"));

// 정리 버튼 한 덩어리 — 여는 태그부터 닫는 태그까지.
const tidy = (() => {
  const at = page.indexOf('aria-label="영상 정리"');
  if (at < 0) return "";
  const open = page.lastIndexOf("<button", at);
  const close = page.indexOf("</button>", at);
  return page.slice(open, close + 9);
})();

describe("[정리] — 자리가 안 흔들린다", () => {
  it("★★★ 늘 그려진다 — 조건부 렌더가 아니다", () => {
    expect(tidy, "정리 버튼을 못 찾았다").not.toBe("");
    expect(page, "옛 조건부 렌더가 남아 있다 — 자리가 다시 흔들린다")
      .not.toMatch(/count > 0 && !isAll && \(/);
  });

  it("★★★ 못 쓸 때는 **비활성**이다 — 없애지 않는다", () => {
    expect(tidy).toMatch(/disabled=/);
    expect(tidy, "[전체] 에서 잠기지 않는다").toMatch(/isAll/);
    expect(tidy, "영상이 0편일 때 잠기지 않는다").toMatch(/count/);
  });

  it("★★ 왜 못 쓰는지 화면이 말한다 — 그전에는 말없이 사라졌다", () => {
    expect(tidy).toMatch(/title=/);
    expect(page).toMatch(/남이 만든 영상이 섞여 있어요/);
  });
});

describe("[정리] — 이름과 아이콘이 하는 일과 맞는다", () => {
  it("★★★ 이름이 '정리' 다 — '수정' 이 아니다", () => {
    expect(tidy).toContain("정리");
    expect(tidy, "옛 이름이 남아 있다").not.toContain("수정");
  });

  it("★★ 휴지통 아이콘이다 — 톱니바퀴는 '설정' 으로 읽힌다", () => {
    expect(tidy).toMatch(/name="trash"/);
    expect(page, "톱니바퀴를 썼다 — 눌러 보면 삭제 모드라 어긋난다").not.toMatch(/name="gear"/);
  });

  it("★★ 아이콘만 두지 않는다 — 읽을 이름이 있어야 한다", () => {
    expect(tidy).toMatch(/aria-label="영상 정리"/);
  });

  it("★ 여는 것은 예전 그대로 고르기 모드다 — 동작은 안 바꿨다", () => {
    expect(tidy).toMatch(/setSelecting\(true\)/);
    expect(page, "고르기 모드의 지우기 버튼이 사라졌다").toMatch(/편 지우기/);
  });
});

// ★ flex 안에서는 JSX 의 공백 텍스트 노드가 사라진다 — 안 주면 "🗑정리" 로 붙는다.
//   실제로 붙어서 나왔고(2026-09-01 브라우저 실측) `.mini` 에 간격을 줬다.
describe("아이콘과 글자가 안 붙는다", () => {
  it("★★ 버튼에 간격이 있다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const at = css.indexOf(".mini {");
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, at + 500), "gap 이 없어 아이콘과 글자가 붙는다").toMatch(/gap:/);
  });
});
