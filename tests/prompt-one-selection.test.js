// 지시문 한 덩어리는 **한 번에 끌어서 선택**된다.
//
// 사장님 지적(2026-08-18): "하단에 고정된 영역은 분리돼서 전달이 되는데, 드래그 안에
// 포함이 안 돼서 전체 드래그가 한 번에 안 돼. 휠 부분 UI 도 해당 영역과 일치하게."
//
// 원인은 스타일이 아니라 **요소의 종류**였다. 본문이 `<textarea>`(폼 컨트롤)라, 그 안에서
// 시작한 선택은 **밖으로 넘어갈 수 없다** — 브라우저가 그렇게 만들어져 있다. 한 상자로
// 이어 보이게 만들어 놓고(2026-08-18 앞 작업) 정작 **한 덩어리로 집어갈 수는 없었다.**
// 스크롤바가 둘로 보이던 것도 같은 뿌리다: textarea 가 제 스크롤을 따로 갖는다.
//
// → 본문을 contentEditable 로 바꾼다(이 저장소가 컷 문장 편집에 이미 쓰는 방식이다).
//   그러면 본문과 꼬리가 **같은 종류의 노드**라 선택이 이어지고, 스크롤도 상자 하나가 쥔다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const PAGES = [
  ["④이미지", readFileSync("app/create/[id]/images/page.js", "utf8")],
  ["⑤영상", readFileSync("app/create/[id]/video/page.js", "utf8")],
];
const css = readFileSync("app/globals.css", "utf8");

describe("실제로 보내는 지시 — 한 덩어리로 집어간다", () => {
  for (const [step, src] of PAGES) {
    it(`★ ${step} — 본문이 폼 컨트롤이 아니다(그래야 선택이 꼬리까지 간다)`, () => {
      const at = src.indexOf('className="prompt-one"');
      expect(at, "지시문 상자를 못 찾았다").toBeGreaterThan(-1);
      const box = src.slice(at, src.indexOf("</div>", at));
      expect(box, "본문이 textarea 다 — 선택이 상자 밖으로 못 나간다").not.toMatch(/<textarea/);
      expect(box, "고칠 수 있는 자리가 사라졌다").toMatch(/contentEditable/);
    });

    it(`★ ${step} — 꼬리는 여전히 못 고친다`, () => {
      const at = src.indexOf('className="prompt-one"');
      const box = src.slice(at, src.indexOf("</div>", at));
      const tail = box.slice(box.indexOf("prompt-fixed"));
      expect(tail, "꼬리까지 고칠 수 있게 됐다 — 저장할 때마다 꼬리가 두 벌이 된다")
        .not.toMatch(/contentEditable/);
    });

    it(`★ ${step} — 고친 글이 저장 대상으로 이어져 있다`, () => {
      // 편집칸만 바꾸고 상태로 안 흘리면 "고칠 수 있는 척하는 칸"이 된다
      expect(src, "고친 글을 안 읽는다").toMatch(/setPrompt\(/);
    });
  }

  // ★ 계약이 뒤집혔다(2026-08-19). 예전 규칙은 "상자 **하나**가 스크롤을 쥔다"였고, 그
  //   목적은 **막대가 둘로 보이지 않게** 하는 것이었다(안쪽 textarea 가 제 스크롤을 따로
  //   가져 OS 기본 밝은 막대가 어두운 상자에 뜨던 일).
  //   이제 상자는 상한을 걷어 **아무것도 자르지 않는다** — 사장님이 "987자가 전부 드래그가
  //   안 되고 중간에 한번 짤려"라고 지적했고, 실측으로 420px 상자에 718px 내용이 들어
  //   있었다. 자를 것이 없으면 막대도 없으므로 "막대가 둘"은 **구조적으로 불가능**해졌다.
  //   그래서 목적은 그대로 두고 재는 것을 바꾼다: 셋 중 **어느 것도 스스로 구르지 않는다**.
  it("★ 이 상자는 아무것도 자르지 않는다 — 잘리면 드래그가 그 경계에서 끊긴다", () => {
    const at = css.indexOf(".prompt-one {");
    const block = css.slice(at, css.indexOf(".prompt-one .prompt-fixed"));
    expect(block, "상한이 남아 있으면 긴 지시문이 다시 잘린다").not.toMatch(/max-height:/);
    expect(block, "안쪽이나 상자가 스스로 구르면 그 경계에서 선택이 끊긴다")
      .not.toMatch(/overflow(-y)?:\s*(auto|scroll)/);
  });
});
