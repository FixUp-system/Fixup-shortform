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

  // ★ 프로젝트 단위 video_error 는 스스로 지워지지 않는다. 컷별 [다시 만들기] 라우트는
  //   그 필드를 건드리지 않고, 지우는 것은 POST /clips(=아래 만들기 버튼) 뿐이다.
  //   그런데 마지막 빠진 컷을 컷별로 되살리면 remainingCount 가 0 이 되어 그 버튼 자체가
  //   렌더되지 않는다 — 전부 성공한 프로젝트에 실패 경고가 영영 붙어 있게 된다.
  it("전부 성공한 프로젝트에 옛 실패 경고가 남지 않는다", () => {
    const at = video.indexOf("generationState({");
    const call = video.slice(at, video.indexOf("});", at));
    const errLine = call.split(/\r?\n/).find((l) => l.trim().startsWith("error:"));
    expect(errLine, "generationState 에 error 를 안 넘긴다").toBeTruthy();
    expect(
      errLine,
      "프로젝트 단위 오류를 조건 없이 넘긴다 — 컷별로 되살려도 경고가 영영 남는다"
    ).not.toMatch(/^\s*error:\s*firstError\(/);
    expect(errLine).toContain("nothingLeftToMake");

    // 그 조건이 실제 판정이어야 한다 — 이름만 맞으면 안 된다.
    // ★ `cuts.every((c) => c.video)` 로 재면 구멍이 난다: 낡은 클립만 남은 상태에서 다시
    //   돌렸다가 실패하면 옛 클립이 그대로 있어 **방금 난 실패가 가려진다.** 없거나 낡은
    //   컷을 함께 세는 remainingCount 로 재야 그 경우 경고가 제대로 뜬다.
    const guardIdx = video.indexOf("const nothingLeftToMake");
    expect(guardIdx, "nothingLeftToMake 정의가 없다").toBeGreaterThan(-1);
    const guard = video.slice(guardIdx, video.indexOf(";", guardIdx));
    expect(guard, "낡은 클립이 남은 채 난 실패를 가린다").not.toContain("cuts.every");
    expect(guard).toContain("remainingCount === 0");
  });

  // ★ 멈춘 컷에는 c.video 도 c.video_error 도 없어 컷별 버튼이 **아예 렌더되지 않는다.**
  //   그러니 멈춤 문구가 그 버튼을 가리키면 없는 길을 알려주는 것이다. 실제로 열려 있어야
  //   하는 것은 아래 만들기 CTA 이고, 그것이 busy 로 잠겨 있으면 멈춤 초반 3분 동안
  //   사장님이 할 수 있는 일이 하나도 없다.
  it("멈췄을 때 실제로 있는 길만 말하고, 그 길을 열어 둔다", () => {
    const at = video.indexOf('gen.kind === "stalled"');
    expect(at, "멈춤 분기가 없다").toBeGreaterThan(-1);
    const block = video.slice(at, video.indexOf("</p>", at));
    expect(block, "렌더되지 않는 컷별 버튼을 가리킨다").not.toContain("컷별로 다시 만들");

    const startIdx = video.indexOf("onClick={start}");
    expect(startIdx, "만들기 버튼이 없다").toBeGreaterThan(-1);
    const btn = video.slice(video.lastIndexOf("<button", startIdx), startIdx);
    const disabled = btn.match(/disabled=\{([^}]*)\}/);
    expect(disabled, "만들기 버튼에 disabled 가 없다").toBeTruthy();
    expect(
      disabled[1],
      "busy 로 잠가 두면 멈춤 동안 유일한 탈출구까지 잠긴다"
    ).not.toMatch(/\bbusy\b/);
    expect(disabled[1]).toContain('gen.kind === "running"');
  });

  // ★ 멈춤 동안에도 busy 는 참이다(5분 상한에 닿아야 풀린다). 카드가 busy 를 보면
  //   머리말은 "멈춰 있는 것 같아요", 카드는 "만드는 중…" 이라 서로 다른 말을 한다.
  it("컷 카드와 머리말이 같은 상태를 말한다", () => {
    expect(video, "카드·버튼 문구가 아직 busy 를 본다").not.toMatch(/\{busy \? "만드는 중…"/);
    const at = video.indexOf('"아직 만들지 않았어요"');
    expect(at, "만들지 않은 컷 안내가 없다").toBeGreaterThan(-1);
    const expr = video.slice(video.lastIndexOf("{", at), at);
    expect(expr, "카드가 진행 판정을 안 본다").toContain('gen.kind === "running"');
    expect(expr, "카드가 멈춤을 따로 말하지 않는다").toContain('gen.kind === "stalled"');
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
