// 화면 배선을 소스에서 판정한다(staleness-ui.test.js 패턴) — 이 저장소는 React 렌더 테스트가 없다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { lastConfirmIndex, clearConfirms, restoreConfirm } from "../lib/quick-create-state.js";

const src = readFileSync("components/QuickCreate.jsx", "utf8");

describe("QuickCreate — 자동 관통 배선", () => {
  it("t2v 경로를 더는 부르지 않는다", () => {
    expect(src).not.toMatch(/api\/video/);
  });
  it("프로젝트 생성과 자동 관통 시작을 부른다", () => {
    expect(src).toMatch(/\/api\/projects"/);
    expect(src).toMatch(/\/auto/);
  });
  it("진행 폴링은 프로젝트 조회로 한다", () => {
    expect(src).toMatch(/\/api\/projects\/\$\{/);
  });
  it("실패 시 단계별 화면으로 보낸다 — stepHref 가 경로의 진실의 원천", () => {
    expect(src).toMatch(/stepHref/);
  });
  it("[만들기] 버튼은 마지막 요약 카드에만 살아 있다 — 옛 params 로 유료 실행 금지", () => {
    expect(src).toMatch(/m\.confirm && i === lastConfirmIdx/);
  });
  // 가짜 합성은 파일을 안 만든다(render = { fake: true }) — url 을 완료 조건에 AND 로 묶으면
  // 성공한 관통이 15분 뒤 타임아웃으로 "실패"가 된다.
  it("완료 판정은 auto.state === done 하나다 — render.url 을 AND 로 묶지 않는다", () => {
    expect(src).toMatch(/p\.auto\?\.state === "done"/);
    expect(src).not.toMatch(/state === "done"\s*&&\s*p\.render/);
  });
  it("파일이 없는 가짜 완성은 안내 문구로 마무리한다", () => {
    expect(src).toMatch(/가짜 모드라 파일은 만들어지지 않았어요/);
  });

  it("확정은 카드를 전부 내리고, 출발 못 했을 때만 되살린다", () => {
    expect(src).toMatch(/clearConfirms\(prev\)/);
    expect(src).toMatch(/if \(!started\) setMessages\(\(prev\) => restoreConfirm\(prev, idx\)\)/);
  });
});

// 버튼 부활은 소스 정규식으로 못 잡는 동작 결함이라, 상태 전이를 직접 문다.
describe("요약 카드 상태 전이 — lib/quick-create-state", () => {
  const cardA = { role: "ai", confirm: true, params: { material_text: "옛 자료" } };
  const cardB = { role: "ai", confirm: true, params: { material_text: "고친 자료" } };
  const convo = () => [{ role: "ai", text: "인사" }, cardA, { role: "me", text: "바꿔줘" }, cardB];

  it("마지막 요약 카드를 고른다 — 없으면 -1", () => {
    expect(lastConfirmIndex(convo())).toBe(3);
    expect(lastConfirmIndex([{ role: "ai", text: "인사" }])).toBe(-1);
    expect(lastConfirmIndex([])).toBe(-1);
  });

  it("★확정하면 옛 카드까지 전부 내려간다 — 새 카드를 눌러도 옛 버튼이 부활하지 않는다", () => {
    const after = clearConfirms(convo());
    expect(after.filter((m) => m.confirm)).toHaveLength(0);
    expect(lastConfirmIndex(after)).toBe(-1); // 옛 카드 A 로 되돌아가면 여기서 1 이 나온다
  });

  it("확정해도 params 는 그대로 남는다(재시도용)", () => {
    expect(clearConfirms(convo())[3].params.material_text).toBe("고친 자료");
  });

  it("출발 실패 후에는 누른 카드만 되살아난다 — 재시도 길이 열린다", () => {
    const cleared = clearConfirms(convo());
    const withError = [...cleared, { role: "ai", text: "문제가 생겼어요 — 프로젝트 생성 실패" }];
    const restored = restoreConfirm(withError, 3);
    expect(lastConfirmIndex(restored)).toBe(3);
    expect(restored.filter((m) => m.confirm)).toHaveLength(1); // 옛 카드 A 는 죽은 채로
  });
});
