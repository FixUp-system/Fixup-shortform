// 처음 만드는 것과 다시 만드는 것은 다른 말이다.
//
// 덮개 문구가 "다시 만드는 중이에요" 하나로 못 박혀 있었다. 그래서 ④이미지에서 **처음**
// 굽는 컷에도 "다시"가 떴다 — 아직 한 번도 안 만든 그림을 두고 다시 만든다고 말하는 셈이다.
// ⑤영상도 같다(최초 클립 굽기에서 같은 문구가 뜬다). 사장님이 "내가 뭘 잘못 눌렀나"를
// 의심하게 만드는 종류의 거짓말이라, 값이 아니라 **말**이 틀린 자리다.
//
// 판정은 하나뿐이다: **사장님이 [재생성]을 눌렀는가**(regening). 그 밖의 굽기는 전부
// 처음이다 — 전체 생성이든 낡아서 다시 부르는 것이든, 화면이 아는 것은 그것뿐이다.
// 문구를 화면마다 손으로 적으면 넷이 갈린다(실제로 갈릴 자리가 넷이다) — lib 에 둔다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { busyLabel } from "../lib/progress.js";

describe("만드는 중 문구", () => {
  it("★ 처음이면 '다시'를 안 붙인다", () => {
    expect(busyLabel(false)).toBe("만드는 중이에요");
    expect(busyLabel(false)).not.toMatch(/다시/);
  });

  it("★ 재생성이면 '다시'를 붙인다 — 옛 결과가 남아 있으니 구별이 필요하다", () => {
    expect(busyLabel(true)).toBe("다시 만드는 중이에요");
  });

  // 덮개는 네 자리다(④이미지 좌·우, ⑤영상 좌·우). 손으로 적으면 갈린다.
  for (const [step, path] of [
    ["④이미지", "app/create/[id]/images/page.js"],
    ["⑤영상", "app/create/[id]/video/page.js"],
  ]) {
    it(`★ ${step} — 덮개 둘 다 busyLabel 로 말한다`, () => {
      const src = readFileSync(path, "utf8");
      const covers = src.split('className="frame-busy"').slice(1);
      expect(covers.length, "덮개가 둘이 아니다").toBe(2);
      for (const cover of covers) {
        const block = cover.slice(0, 260);
        expect(block, "문구를 손으로 적었다 — 네 자리가 갈린다").toMatch(/busyLabel\(/);
        expect(block, "처음 만들 때도 '다시'라고 말한다").not.toMatch(/다시 만드는 중이에요/);
      }
    });

    it(`★ ${step} — 무엇을 기준으로 '다시'인지가 regening 이다`, () => {
      const src = readFileSync(path, "utf8");
      const covers = src.split('className="frame-busy"').slice(1);
      for (const cover of covers) {
        expect(cover.slice(0, 260), "재생성 여부를 안 보고 문구를 고른다")
          .toMatch(/busyLabel\(\s*regening/);
      }
    });
  }
});
