// ⑤영상 화면이 "되는 중 / 멈춤 / 실패 / 끝남"을 구분해 말하는가 — 소스를 직접 훑는다.
// 이 저장소에는 컴포넌트 렌더 테스트 인프라가 없어(lib/projects-client.js:2) 판정은
// lib/progress.js 가 단위로 검증하고, 화면 쪽은 "그 판정을 실제로 쓰는가"만 본다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const video = readFileSync("app/create/[id]/video/page.js", "utf8");

describe("⑤영상 — 생성 상태 표시", () => {
  it("판정을 lib/progress 에 맡긴다", () => {
    expect(video).toMatch(/generationState/);
  });

  it("오류 필드를 표에서 가져온다", () => {
    expect(video).toMatch(/firstError/);
  });

  it("폴링을 손으로 돌리지 않는다", () => {
    expect(video).toMatch(/startPolling/);
    expect(video, "setInterval 이 화면에 남아 있다").not.toMatch(/setInterval\(/);
  });

  it("멈춤을 실패와 다른 말로 알린다", () => {
    expect(video).toMatch(/stalled/);
    expect(video).toMatch(/멈춰/);
  });

  it("임계 시간을 화면에 손으로 적지 않는다", () => {
    expect(video, "120000 을 화면에 적었다").not.toMatch(/120_?000/);
  });

  // ★ 브라우저 시계로 멈춤을 재면 사장님 PC 가 3분 빠를 때 시작하자마자 "멈췄어요"가 뜬다.
  //   서버가 실어 보낸 stalled_for_ms 를 읽어야 한다.
  it("멈춤을 브라우저 시계로 재지 않는다", () => {
    expect(video, "화면이 stalledFor 를 직접 부른다").not.toMatch(/stalledFor\b/);
    expect(video).toMatch(/stalled_for_ms/);
  });

  // ★ 진행 판정의 분모/분자는 화면 문구용 doneCount 와 다른 질문이다 —
  //   "더 기다릴 것이 남았는가"라서 실패로 끝난 컷도 끝난 것으로 세야 한다.
  //   조회식을 손으로 또 적으면 실패 표시를 빠뜨려 정상 종료가 영원히 "멈춤"이 된다.
  it("끝남 판정을 손으로 적지 않고 isCutDone 에 맡긴다", () => {
    expect(video).toMatch(/isCutDone\(\s*c\s*,\s*["']video["']\s*\)/);
    const at = video.indexOf("generationState({");
    expect(at, "generationState 호출이 없다").toBeGreaterThan(-1);
    const call = video.slice(at, video.indexOf("});", at));
    expect(call, "진행 판정에 doneCount(성공한 클립 수)를 그대로 넘겼다").not.toMatch(
      /done:\s*doneCount/
    );
    expect(call).toContain("isCutDone");
    expect(call, "서버가 실어 보낸 멈춤 시간을 안 넘긴다").toContain("stalled_for_ms");
  });

  // 화면 문구("N/M개 컷을 만들었어요")는 **성공한** 클립 수 그대로여야 한다
  it("문구용 doneCount 는 성공한 클립만 센다", () => {
    expect(video).toContain("const doneCount = cuts.filter((c) => c.video).length");
  });

  it("네 상태를 서로 다른 말로 그린다", () => {
    expect(video).toMatch(/gen\.kind === "running"/);
    expect(video).toMatch(/gen\.kind === "stalled"/);
    expect(video).toMatch(/gen\.kind === "failed"/);
    expect(video).toMatch(/gen\.reason\.message/);
  });

  // 멈췄거나 실패했을 때 busy 가 참인 채로 남을 수 있다. 그때 컷별 [다시 만들기] 가
  // 유일한 탈출구인데 잠겨 있으면 사장님이 할 수 있는 일이 없다.
  it("컷별 다시 만들기가 멈춤·실패 때 눌린다", () => {
    const regenIdx = video.indexOf("onClick={() => regen(c.idx)}");
    expect(regenIdx, "컷별 다시 만들기 버튼이 없다").toBeGreaterThan(-1);
    const buttonStart = video.lastIndexOf("<button", regenIdx);
    const button = video.slice(buttonStart, regenIdx);
    const disabled = button.match(/disabled=\{([^}]*)\}/);
    expect(disabled, "컷별 다시 만들기에 disabled 가 없다").toBeTruthy();
    expect(disabled[1], "busy 로 잠가 두면 멈춤·실패에서 빠져나갈 수 없다").not.toMatch(
      /\bbusy\b/
    );
    expect(disabled[1]).toContain('gen.kind === "running"');
  });

  // 폴링 핸들을 onStop 에서 비우지 않으면 ref 가 영원히 truthy 라 스스로 끝난 폴링이
  // 다시 시작되지 않는다(startPolling 이 돌려주는 것은 떼기(detach)라 null 로 안 바꾼다).
  it("폴링이 스스로 끝나면 손잡이를 비운다", () => {
    const at = video.indexOf("onStop:");
    expect(at, "onStop 이 없다").toBeGreaterThan(-1);
    const block = video.slice(at, at + 400);
    expect(block, "onStop 안에서 ref 를 비우지 않는다").toMatch(/stopRef\.current = null/);
  });
});
