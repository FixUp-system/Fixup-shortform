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
    // ⚠️ `.mini {` 라는 글자는 `.home-header .mini {` 에도 들어 있다 — 그냥 indexOf 로
    //   찾으면 엉뚱한 규칙을 잡고, 고정 창으로 자르면 옆 규칙까지 넘어가 거짓으로
    //   통과한다(이 저장소가 오늘 그 함정을 세 번 밟았다). 맨 왼쪽 규칙만, 규칙 끝까지.
    const at = css.indexOf("\n.mini {");
    expect(at, ".mini 규칙을 못 찾았다").toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf("}", at) + 1), "gap 이 없어 아이콘과 글자가 붙는다")
      .toMatch(/gap:/);
  });
});

// **[정리] 는 옆 토글과 같은 키다** (2026-09-01 사장님 지시).
//
// ★★★ 그전에는 한 줄에 키가 셋이었다(브라우저 실측): 토글 33px · [정리] **48px** ·
//   [새 영상 만들기] 40px. `.home-header .mini` 가 그 줄의 버튼을 `--ctl-lg` 로 키우는데
//   세그먼트는 `--ctl-sm` 이라, 나란히 서면 눈에 띄게 어긋났다.
// ★ [새 영상 만들기] 는 그대로 크다 — 주 버튼이라 커야 하는 것이 맞다. 맞추는 것은
//   **고르는 줄에 함께 서는 [정리]** 하나다.
// ★ `.home-header .mini` 자체를 안 건드린다 — 고르는 동안 뜨는 버튼 셋
//   (모두 선택·취소·N편 지우기)은 그 줄을 통째로 쓰므로 지금 키가 맞다.
describe("[정리] — 옆 토글과 같은 키", () => {
  const css = readFileSync("app/globals.css", "utf8");

  it("★★★ 세그먼트와 같은 사다리를 쓴다", () => {
    const at = css.indexOf(".home-header .mini.tidy-btn");
    expect(at, "[정리] 전용 크기 규칙이 없다").toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at) + 1);
    expect(rule, "세그먼트(--ctl-sm)와 다른 사다리를 쓴다").toMatch(/height:\s*var\(--ctl-sm\)/);
  });

  it("★★ 화면이 그 클래스를 단다", () => {
    expect(tidy).toMatch(/tidy-btn/);
  });

  // ★ 키를 쥔 것은 **상자**다. 칸에만 주면 상자의 테두리가 그 위에 더해져 1.3px 커지고
  //   나란히 둔 [정리] 와 밑선이 어긋난다(실측). 상자가 --ctl-sm 을 쥐고 칸이 채운다.
  it("★ 세그먼트 상자도 같은 사다리다 — 둘이 같은 값을 봐야 맞는다", () => {
    const box = css.indexOf(".seg {");
    expect(box, ".seg 규칙이 없다").toBeGreaterThan(-1);
    expect(css.slice(box, css.indexOf("}", box) + 1)).toMatch(/height:\s*var\(--ctl-sm\)/);
    const btn = css.indexOf(".seg-btn {");
    expect(css.slice(btn, css.indexOf("}", btn) + 1), "칸이 상자를 안 채운다")
      .toMatch(/height:\s*100%/);
  });
});
