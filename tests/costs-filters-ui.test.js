// 비용 기록(/costs) 좁히기 줄 — 칸 키와 영역(2026-09-14 사장님 지적:
// "종류 부분이 시작일·종료일·사용자랑 라벨 위치가 안 맞고, 컴포넌트 안에 넣어서 영역을 구분해줘").
//
// ★ 원인: 날짜·검색 칸이 `height: var(--ctl-h)` 였는데 `--ctl-h` 는 **자막 조절판(.sub-editor) 안에서만**
//   정의된다. /costs 에서는 값이 없어 칸이 20px 로 쪼그라들고, 32px 인 종류 세그먼트와 밑선을 맞추느라
//   라벨이 서로 다른 높이에 섰다(실측: 칸 20px · 세그먼트 32px · 라벨 top 170 vs 158).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const page = readFileSync("app/costs/page.js", "utf8");
const rule = (sel) => {
  const i = css.indexOf(`${sel} {`);
  return i < 0 ? "" : css.slice(i, css.indexOf("}", i));
};

describe("비용 기록 — 좁히기 줄", () => {
  it("날짜·검색 칸은 :root 에 있는 키를 쓴다 — 세그먼트(.seg)와 같은 --ctl-sm", () => {
    expect(rule(".cost-filters input.field")).toMatch(/height:\s*var\(--ctl-sm\)/);
    expect(rule(".seg")).toMatch(/height:\s*var\(--ctl-sm\)/);
  });

  it("좁히기 줄이 카드 안에 있다 — 아래 요약 타일과 영역이 갈린다", () => {
    expect(page).toMatch(/className="panel cost-filters"/);
  });
});
