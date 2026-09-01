// **보관함의 "만든 정보"를 한눈에 들어오게** (2026-09-01 사장님 지시:
// "사진, 모델 길이, 화질 화풍. 그리고 사용자가 첨부한 레퍼런스는 어떤건지").
//
// ★★★ 그리고 그 자리에 **깨진 값이 하나 있었다**: 화풍이 `vlog` 로 떴다. 화면이
//   `s.style?.preset || s.style` 을 그대로 그려서 **영어 id 가 새어 나온 것**이다 —
//   옆의 값들은 전부 사람 말이었다("기본" · "15초" · "720p" · "9:16"). 라벨 표는
//   lib/styles.js 에 이미 있었고 화면만 안 보고 있었다.
//
// ★★ 판정을 순수 모듈로 뺀다 — 이 저장소가 같은 화면에서 이미 겪은 사고 때문이다
//   (lib/archive/video.js 머리말: 화면 안 삼항식이라 **값으로 잴 방법이 없었고**,
//   film 갈래만 객체를 내서 재생·내려받기가 둘 다 죽었다).
//
// ★ **모르는 값은 지어내지 않는다.** 표에 없는 화풍 id 는 그대로 보여 준다 — "실사"로
//   떨어뜨리면 화면이 그 문서에 없는 값을 말하게 된다(이 화면의 규칙: 없는 값은 줄째 안 그린다).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { styleLabelOf, archiveRefs } from "../lib/archive/spec.js";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("화풍 — 사람 말로 보여 준다", () => {
  it("★★★ 영어 id 가 아니라 라벨이다 — 이것이 깨져 보이던 자리다", () => {
    expect(styleLabelOf({ settings: { style: "vlog" } })).toBe("브이로그");
    expect(styleLabelOf({ settings: { style: "photo" } })).toBe("실사");
    expect(styleLabelOf({ settings: { style: "render3d" } })).toBe("3D");
  });

  it("★★ 옛 문서의 `{ preset }` 모양도 읽는다 — 화면이 이미 그 둘을 보고 있었다", () => {
    expect(styleLabelOf({ settings: { style: { preset: "anime" } } })).toBe("애니메이션");
  });

  it("★★ **모르는 값은 그대로 둔다** — 아는 척하면 없는 값을 말하게 된다", () => {
    expect(styleLabelOf({ settings: { style: "somethingnew" } })).toBe("somethingnew");
  });

  it("★ 없으면 null 이다 — 이 화면은 없는 줄을 안 그린다", () => {
    expect(styleLabelOf({ settings: {} })).toBeNull();
    expect(styleLabelOf({})).toBeNull();
    expect(styleLabelOf(null)).toBeNull();
  });
});

describe("레퍼런스 — 무엇을 붙였는지 보인다", () => {
  const doc = { material: { photos: [
    { id: "p1", url: "/api/uploads/a.png", role: "logo" },
    { id: "p2", url: "/api/uploads/b.png", role: "product" },
    { id: "p3", url: "/api/uploads/c.png", vision: { person: true } },
    { id: "p4", url: "/api/uploads/d.png" },
  ] } };

  it("★★★ 장수가 아니라 **그림과 종류**다 — '3장'으로는 무엇을 붙였는지 모른다", () => {
    expect(archiveRefs(doc)).toEqual([
      { id: "p1", url: "/api/uploads/a.png", label: "로고" },
      { id: "p2", url: "/api/uploads/b.png", label: "제품" },
      { id: "p3", url: "/api/uploads/c.png", label: "인물" },
      { id: "p4", url: "/api/uploads/d.png", label: "사진" },
    ]);
  });

  it("★★ 라벨이 없어도 **사진 판정**이 인물을 알려 준다", () => {
    expect(archiveRefs(doc)[2].label).toBe("인물");
  });

  it("★ 주소 없는 항목은 버린다 — 깨진 그림 자리를 만들지 않는다", () => {
    expect(archiveRefs({ material: { photos: [{ id: "x" }] } })).toEqual([]);
    expect(archiveRefs({})).toEqual([]);
    expect(archiveRefs(null)).toEqual([]);
  });
});

describe("화면이 그 판정을 쓴다", () => {
  const src = strip(readFileSync("app/archive/[id]/page.js", "utf8"));

  it("★★★ 화풍을 원시 값으로 안 그린다", () => {
    expect(src).toMatch(/styleLabelOf\(/);
    expect(src, "s.style 을 그대로 그리면 다시 `vlog` 가 뜬다")
      .not.toMatch(/s\.style\?\.preset \|\| s\.style/);
  });

  it("★★★ 레퍼런스를 그림으로 보여 준다 — 장수만 적던 자리다", () => {
    expect(src).toMatch(/archiveRefs\(/);
    expect(src, "'N장' 만 적고 그림을 안 그린다").not.toMatch(/photos\.length\}장/);
  });

  it("★★ 사양 다섯을 한 줄로 모은다 — 모델·길이·화질·비율·화풍", () => {
    const at = src.indexOf("spec-chips");
    expect(at, "한눈에 보는 줄이 없다").toBeGreaterThan(-1);
    const block = src.slice(at, at + 900);
    for (const label of ["모델", "길이", "화질", "비율", "화풍"]) {
      expect(block, `${label} 이 그 줄에 없다`).toContain(label);
    }
  });
});
