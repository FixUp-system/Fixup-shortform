// 화면이 낡은 것을 알아보고 다음을 막는가 — 소스를 직접 훑는다.
// 이 저장소에는 화면 단위 테스트가 없고, 이 기능의 실패 모드는 "화면 하나를 빠뜨리는 것"이다.
// 스펙 docs/superpowers/specs/2026-07-29-staleness-invalidation-design.md
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");

const PAGES = [
  { step: "③ 목소리", path: "app/create/[id]/voice/page.js", fn: "isAudioStale" },
  { step: "④ 이미지", path: "app/create/[id]/images/page.js", fn: "isImageStale" },
  { step: "⑤ 영상", path: "app/create/[id]/video/page.js", fn: "isClipStale" },
];

describe("낡은 것이 있으면 다음 단계로 못 간다", () => {
  for (const { step, path, fn } of PAGES) {
    it(`${step} 화면이 ${fn} 로 판정한다`, () => {
      const src = read(path);
      expect(src).toContain(fn);
      expect(src).toMatch(/from ["'][./]*lib\/steps["']/);
    });

    it(`${step} 화면의 다음 버튼이 낡은 것에 잠긴다`, () => {
      // 다음 화면으로 보내는 버튼에 staleCount 조건이 걸려 있어야 한다
      const src = read(path);
      expect(src).toContain("staleCount");
      const button = src.slice(src.indexOf("router.push") - 400, src.indexOf("router.push"));
      expect(button, `${path} 의 다음 버튼에 staleCount 조건이 없다`).toContain("staleCount");
    });
  }
});

describe("⑥ 완성", () => {
  it("낡은 완성본은 내려받기가 잠긴다", () => {
    const src = read("app/create/[id]/done/page.js");
    expect(src).toContain("isRenderStale");
    // 내려받기 링크는 낡지 않았을 때만 나온다
    const anchor = src.slice(0, src.indexOf("내려받기"));
    expect(anchor).toContain("!stale");
  });
});
