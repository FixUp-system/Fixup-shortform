// 렌더 테스트 인프라가 없어 소스에서 잰다(tests/video-preview-ui.test.js 와 같은 수법).
// 재는 것은 "화면이 판정을 스스로 하지 않고 lib 에 맡겼는가" 하나다 — 그래야 경계는
// tests/progress.test.js 가 잰 것으로 보장된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const images = readFileSync("app/create/[id]/images/page.js", "utf8");

describe("④이미지 — 생성 상태 표시", () => {
  it("판정을 lib/progress 에 맡긴다", () => {
    expect(images).toMatch(/generationState/);
  });

  it("끝난 컷을 손으로 세지 않고 파이프라인과 같은 술어를 쓴다", () => {
    // 손으로 적었을 때 실제로 갈렸다: image 없이 needs_attention 인 컷을 안 세서
    // 정상 종료한 실행이 영구히 "멈춤"으로 읽혔다.
    expect(images).toMatch(/isCutDone\(\s*c\s*,\s*"images"\s*\)/);
  });

  it("오류 필드를 손으로 고르지 않고 표에서 가져온다", () => {
    expect(images).toMatch(/firstError/);
  });

  it("폴링을 손으로 돌리지 않는다", () => {
    expect(images).toMatch(/startPolling/);
    expect(images, "setInterval 이 화면에 남아 있다").not.toMatch(/setInterval\(/);
  });

  it("폴링이 스스로 끝나면 손잡이를 비운다 — 안 비우면 다시 시작할 수 없다", () => {
    // startPolling 이 돌려주는 것은 함수라 영원히 truthy 다. onStop 에서 비우지 않으면
    // "이미 돌고 있음" 가드에 걸려 폴링이 되살아나지 않는다.
    const onStop = images.slice(images.indexOf("onStop:"), images.indexOf("onStop:") + 400);
    expect(images.indexOf("onStop:")).toBeGreaterThan(-1);
    expect(onStop, "onStop 안에서 ref 를 null 로 비우지 않는다").toMatch(/stopRef\.current\s*=\s*null/);
  });

  it("멈춤과 실패를 서로 다른 말로 알린다", () => {
    expect(images).toMatch(/stalled/);
    expect(images).toMatch(/멈춰/);
  });

  it("진척을 숫자로 보여준다", () => {
    expect(images).toMatch(/\bdone\b/);
    expect(images).toMatch(/\btotal\b/);
  });

  it("임계 시간을 화면에 손으로 적지 않는다", () => {
    expect(images, "120000 을 화면에 적었다").not.toMatch(/120_?000/);
  });

  it("서버가 잰 멈춤 시간을 읽는다 — 브라우저 시계로 빼지 않는다", () => {
    expect(images).toMatch(/stalled_for_ms/);
    expect(images, "화면이 stalledFor 를 직접 부른다 — 사장님 PC 시계가 판정에 끼어든다")
      .not.toMatch(/\bstalledFor\s*\(/);
  });
});
