// 사장님이 쓰는 소재 글의 길이 상한 — **한 자리**다.
//
// ★★ 두 벌이었다(2026-08-19): 화면은 maxLength={2000}, 서버는 slice(0, 4000). 화면이 더
//   빡빡해서 사장님은 2,000자에서 막히는데, 서버는 4,000자까지 받을 생각이었다. 두 값이
//   갈리면 언제나 좁은 쪽이 이기고, 넓힌 쪽은 아무 일도 안 한다 — 이 저장소가 여러 번
//   겪은 모양이다(옵션 목록·파일 이름 규칙·문 판정).
// ★ 완전 무제한으로 두지 않는 이유: 이 글은 그대로 LLM 프롬프트에 실린다. 실수로 파일을
//   통째로 붙여넣으면 그 호출값이 그대로 나간다. 상한은 "사장님이 실제로 쓸 일이 없는
//   크기"면 충분하다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MAX_MATERIAL_TEXT } from "../lib/material.js";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (p) => strip(readFileSync(p, "utf8"));

const SCREENS = ["app/film/[mode]/page.js", "app/ads/new/page.js", "app/create/page.js"];
const SERVERS = ["app/api/film/route.js", "app/api/ads/route.js", "app/api/projects/route.js", "app/api/ads/[id]/route.js"];

describe("소재 글 길이 상한", () => {
  it("★ 2,000자보다 넉넉하다 — 사장님이 막히던 값이 그것이다", () => {
    expect(MAX_MATERIAL_TEXT).toBeGreaterThan(2000);
  });

  it("★ 무제한은 아니다 — 이 글은 그대로 LLM 프롬프트에 실린다", () => {
    expect(Number.isFinite(MAX_MATERIAL_TEXT)).toBe(true);
  });

  for (const f of SCREENS) {
    it(`★ ${f} 가 상한을 손으로 안 적는다`, () => {
      const s = read(f);
      expect(s).toMatch(/MAX_MATERIAL_TEXT/);
      expect(s).not.toMatch(/maxLength=\{\s*\d+\s*\}/);
    });
  }

  for (const f of SERVERS) {
    it(`★ ${f} 가 상한을 손으로 안 적는다`, () => {
      const s = read(f);
      expect(s).toMatch(/MAX_MATERIAL_TEXT/);
      expect(s).not.toMatch(/text\.slice\(0,\s*\d+\)/);
    });
  }
});
