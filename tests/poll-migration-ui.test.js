// 남은 세 화면(②대본·③목소리·⑥완성)이 폴링 한 벌로 옮겨졌는지 잰다.
//
// 이 저장소에는 컴포넌트 렌더 테스트 인프라가 없다 — 그래서 소스에서 잰다
// (tests/video-preview-ui.test.js 와 같은 수법). 재는 것은 "화면이 루프와 판정을
// 스스로 적지 않고 lib 에 맡겼는가" 하나다. 경계값 자체는 tests/poll.test.js·
// tests/progress.test.js 가 이미 잰다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const voice = readFileSync("app/create/[id]/voice/page.js", "utf8");
const script = readFileSync("app/create/[id]/script/page.js", "utf8");
const done = readFileSync("app/create/[id]/done/page.js", "utf8");

const SCREENS = [["③목소리", voice], ["②대본", script], ["⑥완성", done]];

describe("남은 화면 — 폴링 한 벌", () => {
  for (const [name, src] of SCREENS) {
    it(`${name} 이 setInterval 을 직접 돌리지 않는다`, () => {
      expect(src).toMatch(/startPolling/);
      expect(src, `${name} 에 setInterval 이 남아 있다`).not.toMatch(/setInterval\(/);
    });

    // 서버가 이미 재서 stalled_for_ms 로 실어 보낸다. 브라우저가 자기 시계로 빼면
    // 사장님 PC 가 3분 빠를 때 시작하자마자 "멈췄어요"가 뜬다.
    it(`${name} 이 멈춤을 자기 시계로 재지 않는다`, () => {
      expect(src, `${name} 이 stalledFor 를 들여왔다`).not.toMatch(/stalledFor\s*[,}]/);
      expect(src, `${name} 에 임계 시간을 손으로 적었다`).not.toMatch(/120_?000/);
    });
  }

  it("③목소리는 네 상태를 구분해 말한다", () => {
    expect(voice).toMatch(/generationState/);
    expect(voice).toMatch(/멈춰/);
  });

  // ⑥완성은 단일 ffmpeg 작업이라 중간 진척이 없다 — 멈춤 경고를 띄우면 정상 합성이
  // 전부 "멈췄어요"가 된다(lib/progress.js STALL_EXEMPT_PHASES).
  it("⑥완성은 멈춤 경고를 띄우지 않는다", () => {
    expect(done, "합성에 멈춤 경고를 달았다").not.toMatch(/멈춰/);
  });

  // ★ 옮기기만 하는 자리다. 지금 이 두 대기 루프에는 상한도 실패 카운트도 없다 —
  //   기본값을 그대로 받으면 5분 상한과 연속 5회 중단이 **새로** 생기고, 컷 분할이
  //   길어지면 화면이 아무 말 없이 얼어붙는다(onStop 이 없어 알릴 사람도 없다).
  it("컷 분할 대기 루프에는 상한도 실패 카운트도 없다", () => {
    for (const [name, src] of [["③목소리", voice], ["②대본", script]]) {
      expect(src, `${name} 대기 루프에 상한이 새로 생긴다`).toMatch(/timeoutMs:\s*Infinity/);
      expect(src, `${name} 대기 루프에 실패 중단이 새로 생긴다`).toMatch(/maxFailures:\s*Infinity/);
    }
  });

  // ★ ⑥완성만 상한이 10분이다. 빠뜨리면 모듈 기본값 5분이 걸려 정상적으로 6~9분 걸리는
  //   합성이 "상태를 확인하지 못했어요"로 끝난다.
  it("⑥완성의 상한은 그대로 10분이다", () => {
    expect(done).toMatch(/timeoutMs:\s*10 \* 60 \* 1000/);
  });
});
