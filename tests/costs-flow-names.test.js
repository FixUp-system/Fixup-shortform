// **비용 화면의 흐름 이름이 사이드바와 어긋났다** (2026-09-01 사장님 지시:
// "실제 비용 관리 부분도 원클릭 단계별 영상에 맞게 두가지로 볼 수 있게").
//
// ★★★ lib/costs-filter.js 의 머리말이 이미 규칙을 적어 두었다:
//   *"이름은 사이드바와 **글자 그대로 같다** — 같은 것을 두 화면이 다르게 부르면 안 된다."*
//   그런데 그 규칙이 깨져 있었다. 그 글이 쓰인 2026-08-27 에는 사이드바가 "광고 영상 ·
//   영상 만들기" 였는데, 그 뒤 사이드바만 **원클릭 영상 · 단계별 영상**으로 바뀌었다.
//   비용 화면은 옛 이름에 남아, 사장님이 아는 두 제품과 원장의 종류가 안 이어졌다.
//
// ★★ 그래서 이 판은 **글자를 손으로 적지 않는다.** 사이드바 소스에서 읽어 대조한다 —
//   손으로 적으면 다음에 사이드바가 바뀔 때 이 판도 같이 낡아 또 못 잡는다.
//
// ★ 옛 흐름 이름과의 **충돌**도 함께 본다. `step`(종류가 없던 옛 문서)의 이름이 "단계별"
//   이었는데, 이제 `reel` 이 "단계별 영상" 이라 표에서 둘이 헷갈린다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { FLOWS, flowLabel, flowOf } from "../lib/costs-filter.js";

// ⚠️ **주석을 걷고 읽는다.** 사이드바 주석에도 "[단계별 영상]" 같은 말이 나오는데,
//   그 자리가 실제 링크보다 위라 순서 판정이 뒤집혔다(이 저장소가 오늘 네 번째로 밟은
//   같은 함정 — 글자로 소스를 재는 판은 늘 주석을 먼저 걷어야 한다).
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sidebar = strip(readFileSync("components/Sidebar.jsx", "utf8"));
const costsPage = readFileSync("app/costs/page.js", "utf8");

describe("흐름 이름 — 사이드바와 같은 말을 쓴다", () => {
  it("★★★ 두 흐름의 이름이 사이드바에 **그대로** 있다", () => {
    for (const f of FLOWS) {
      expect(sidebar, `사이드바에 "${f.label}" 이 없다 — 두 화면이 다르게 부른다`)
        .toContain(f.label);
    }
  });

  it("★★★ 원클릭은 ad, 단계별은 reel 이다 — 원장 종류와 제품이 이어져야 한다", () => {
    expect(flowLabel("ad")).toBe("원클릭 영상");
    expect(flowLabel("reel")).toBe("단계별 영상");
  });

  it("★★ 순서도 사이드바를 따른다 — 원클릭이 먼저다", () => {
    expect(FLOWS.map((f) => f.id)).toEqual(["ad", "reel"]);
    expect(sidebar.indexOf("원클릭 영상")).toBeLessThan(sidebar.indexOf("단계별 영상"));
  });

  it("★★ 옛 흐름 이름이 새 이름과 안 부딪힌다", () => {
    const legacy = flowLabel("step");
    expect(legacy, "옛 흐름과 지금 제품이 같은 말로 불린다").not.toBe("단계별 영상");
    expect(legacy).not.toBe("단계별");
  });

  it("★ 판정 자체는 안 바뀐다 — 이름만 고쳤다", () => {
    expect(flowOf({ kind: "ad" })).toBe("ad");
    expect(flowOf({ kind: "reel" })).toBe("reel");
    expect(flowOf({ project_id: "p", known_project: true })).toBe("step");
    expect(flowOf({})).toBe("etc");
  });
});

// ★★ **두 가지로 볼 수 있게** — 그전에는 드롭다운이라 무엇을 고를 수 있는지 열어 봐야
//   알았다. 보관함에서 쓰는 그 세그먼트를 그대로 쓴다(같은 일에 두 벌을 만들지 않는다).
// ★ 옛 흐름(한 번에 굽기·기타)은 **고르는 자리에 원래 없다** — `flowsInLedger` 가 거르는
//   것은 `FLOWS`(지금 파는 제품 둘)이지 원장에 있는 종류 전부가 아니다. 2026-08-27 의
//   결정이고(lib/costs-filter.js 머리말) 이번 변경이 건드리지 않았다.
//   ★ 다만 **그 돈은 안 사라진다** — 흐름별 타일에는 그대로 뜬다(실측 $45.79·$7.77).
describe("고르는 자리 — 한눈에 갈아 끼운다", () => {
  it("★★★ 드롭다운이 아니라 세그먼트다", () => {
    expect(costsPage, "seg 를 안 쓴다").toMatch(/className="seg"/);
    expect(costsPage, "옛 드롭다운이 남았다").not.toMatch(/value=\{flow\}[\s\S]{0,80}<option/);
  });

  it("★★ [전체]와 원장에 있는 흐름이 모두 칸으로 선다", () => {
    const at = costsPage.indexOf('className="seg"');
    const box = costsPage.slice(at, at + 900);
    expect(box).toContain("전체");
    expect(box, "원장에 있는 흐름을 안 돌린다").toMatch(/flowsInLedger/);
  });

  it("★★ 지금 고른 칸을 aria-pressed 로 말한다 — 보관함과 같은 규율", () => {
    const at = costsPage.indexOf('className="seg"');
    expect(costsPage.slice(at, at + 900)).toMatch(/aria-pressed/);
  });
});
