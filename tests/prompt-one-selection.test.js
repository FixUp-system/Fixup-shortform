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

  it("★ 스크롤은 상자 하나가 쥐고, 그 막대도 이 화면의 색이다", () => {
    const at = css.indexOf(".prompt-one {");
    const block = css.slice(at, at + 700);
    expect(block, "상자가 스크롤을 안 쥔다 — 안쪽이 따로 구르면 막대가 둘로 보인다")
      .toMatch(/overflow-y:\s*auto|overflow:\s*auto/);
    expect(block, "높이 상한이 없어 상자가 화면을 밀어낸다").toMatch(/max-height/);
    expect(css, "스크롤 막대가 이 화면 색이 아니다 — OS 기본 밝은 막대가 어두운 상자에 뜬다")
      .toMatch(/\.prompt-one::-webkit-scrollbar|scrollbar-color/);
  });
});
