import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const layout = () => readFileSync("app/film/[id]/layout.js", "utf8");
// ⚠️ 읽는 자리는 **컨텍스트**다(레이아웃이 아니다). 처음에 이 시험이 레이아웃 소스에서
//   `/api/film/${id}` 를 찾았는데, 그 문자열은 거기 **주석에만** 있었다 — 즉 주석을 재고
//   있었다. 재야 하는 것은 "어느 문으로 두드리는가"이므로 실제로 두드리는 파일을 본다.
//   (오늘 이 저장소에서 같은 종류의 거짓 통과를 세 번 밟았다: 옷차림 규칙 창 둘, 여기 하나.)
const io = () => readFileSync("components/FilmProjectContext.jsx", "utf8");

describe("film 레이아웃", () => {
  it("★ 프로젝트는 film 전용 문으로 읽는다 — /api/projects/[id] 는 kind 를 막는다", () => {
    // 주석을 빼고 **코드에서** 찾는다 — 주석에 적힌 경로는 두드리지 않는다.
    const code = io().replace(/\/\/[^\n]*/g, "");
    expect(code).toMatch(/fetch\(`\/api\/film\/\$\{id\}`\)/);
    expect(code).not.toMatch(/\/api\/projects\//);
    // 레이아웃은 자기 fetch 를 따로 갖지 않는다 — 두 벌이면 한쪽이 낡는다.
    expect(layout().replace(/\/\/[^\n]*/g, "")).not.toMatch(/fetch\(/);
  });

  it("★ 단계 표를 직접 적지 않고 lib/film/steps 에서 읽는다", () => {
    expect(layout()).toMatch(/from ".*lib\/film\/steps"/);
  });

  it("★ 못 연 단계로 들어오면 되돌려 보낸다", () => {
    const src = layout();
    expect(src).toMatch(/isFilmStepReachable/);
    expect(src).toMatch(/router\.replace/);
  });

  it("★ 폴링은 lib/poll 을 쓴다 — 화면에서 setInterval 을 직접 돌리지 않는다", () => {
    expect(layout()).not.toMatch(/setInterval/);
  });
});
