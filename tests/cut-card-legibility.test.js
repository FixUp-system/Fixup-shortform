// 작은 카드 한 칸에 같은 말을 두 번 쓰지 않는다.
//
// 사장님 지적(2026-08-18): "왼쪽 작은 화면에 문구가 겹쳐서 하나만 표시되게 해줘."
//
// 겹치던 둘:
//   ① 자리표시자(.ph) — 그림이 없을 때 "생성 중…"
//   ② 덮개(.frame-busy) — 도는 동안 "만드는 중이에요"
// 덮개는 **반투명**이라(무엇을 다시 만드는지 옛 그림으로 알라고 그렇게 뒀다) 아래 글자가
// 비쳐 보인다. 그림이 아직 없는 컷에서는 비쳐 보이는 것이 옛 그림이 아니라 **또 다른 문구**다.
// 둘은 같은 사실을 말하므로 하나면 된다 — 남길 것은 도는 표시가 붙은 **덮개**다.
//
// 그리고 문장이 없는 컷(무음 컷)은 빈 따옴표 “”만 남았다. 아무 말도 없는 자리에 따옴표만
// 그리면 "말이 사라졌다"로 읽힌다 — 그 컷은 애초에 읽을 말이 없는 컷이다. 초와 레퍼런스만.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/create/[id]/images/page.js", "utf8");

describe("컷 카드 — 한 칸에 한 말", () => {
  it("★ 도는 동안에는 자리표시자를 안 그린다 — 덮개와 겹친다", () => {
    // 좌측 카드의 그림 자리
    const at = src.indexOf('<span className="num">');
    const box = src.slice(at, at + 700);
    expect(box, "자리표시자를 못 찾았다").toMatch(/className="ph"/);
    // ★ 재는 것은 "조건이 인라인인가"가 아니라 **둘이 같은 판정을 보는가**다.
    //   갈리면 둘 다 뜨거나(겹침) 둘 다 안 뜬다(아무 표시 없음).
    const ph = box.slice(0, box.indexOf('className="ph"'));
    const guard = ph.match(/(\w+)\(c\)\s*\?\s*null\s*:/);
    expect(guard, "도는 중에도 자리표시자를 그린다 — 덮개 문구와 겹친다").toBeTruthy();
    const cover = box.slice(box.indexOf('className="frame-busy"') - 120, box.indexOf('className="frame-busy"'));
    expect(cover, "덮개가 자리표시자와 다른 판정을 본다 — 둘이 갈리면 또 겹친다")
      .toContain(`${guard[1]}(c)`);
  });

  it("★ 문장이 없는 컷은 빈 따옴표를 안 그린다", () => {
    // 따옴표를 여는 자리가 sentence 유무 갈래 안에 있어야 한다
    const at = src.indexOf('<div className="txt">');
    const box = src.slice(at, at + 700);
    expect(box, "따옴표 자리를 못 찾았다").toContain("“");
    expect(box, "문장 유무를 안 보고 따옴표를 그린다").toMatch(/c\.sentence\s*(&&|\?)/);
  });

  it("★ 문장이 없어도 초·레퍼런스 배지는 그대로 있다", () => {
    // 배지 묶음이 문장 갈래 **밖**이어야 한다 — 안에 들어가면 무음 컷이 아무 정보도 못 준다
    const at = src.indexOf('<div className="badges">');
    expect(at, "배지 묶음을 못 찾았다").toBeGreaterThan(-1);
    const quoted = src.indexOf('<div className="txt">');
    const between = src.slice(quoted, at);
    expect(between, "배지가 문장 갈래 안에 들어갔다 — 무음 컷이 초조차 못 보여 준다")
      .not.toMatch(/c\.sentence\s*&&\s*\($/m);
  });
});
