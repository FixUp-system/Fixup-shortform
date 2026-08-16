// 남은 세 화면(②대본·③목소리·⑥완성)이 폴링 한 벌로 옮겨졌는지 잰다.
//
// 이 저장소에는 컴포넌트 렌더 테스트 인프라가 없다 — 그래서 소스에서 잰다
// (tests/video-preview-ui.test.js 와 같은 수법). 재는 것은 "화면이 루프와 판정을
// 스스로 적지 않고 lib 에 맡겼는가" 하나다. 경계값 자체는 tests/poll.test.js·
// tests/progress.test.js 가 이미 잰다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const voice = readFileSync("app/create/[id]/voice/page.js", "utf8");
const scenario = readFileSync("app/create/[id]/scenario/page.js", "utf8");
const done = readFileSync("app/create/[id]/done/page.js", "utf8");
// ④이미지도 컷 분할을 기다린다 — 말하는 모델에는 ③목소리가 없어서 확정 뒤 바로 여기 온다.
// 이 파일이 재는 것은 그 **대기 루프**뿐이다(본 루프는 tests/generation-status-ui.test.js).
const images = readFileSync("app/create/[id]/images/page.js", "utf8");

const SCREENS = [["③목소리", voice], ["⑥완성", done]];

// 컷 분할 대기 루프 한 토막만 잘라낸다. 주소로 닻을 내리는 이유: ③목소리에는 루프가
// 둘이고(본 루프는 `/voice/status`), 파일 전체를 재면 어느 루프의 옵션인지 못 가른다.
//
// ★ 글자 수로 자르지 않는다. 900자 창을 쓰던 때 `await load(` 이 이미 827번째에 있어서,
//   주석 두 줄만 더 늘어도 창 밖으로 밀려났다. 아래 부정 단정(`.catch` 가 없어야 한다)은
//   창 밖으로 밀리면 **조용히 초록**이 된다 — 얼어붙음 회귀를 지키는 바로 그 단정이라
//   거짓말을 할 수 있으면 안 된다. 그래서 코드를 따라가는 닫는 괄호를 끝으로 삼는다.
const SPLIT_WAIT_URL = "`/api/projects/${id}/status`";
function splitWaitBlock(src, name) {
  const at = src.indexOf(SPLIT_WAIT_URL);
  if (at < 0) throw new Error(`${name} 에서 컷 분할 대기 루프를 못 찾겠다`);
  const rest = src.slice(at);
  // startPolling({ … }) 를 닫는 줄. 안쪽 콜백들은 `},` 로 닫히므로 이것이 처음 만나는 `});` 다.
  const end = rest.search(/\n\s*\}\);/);
  if (end < 0) throw new Error(`${name} 의 컷 분할 대기 루프가 어디서 끝나는지 못 찾겠다`);
  return rest.slice(0, end);
}

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

  // ②시나리오는 폴링하지 않지만, 자기 루프를 들이면 여기 걸리게 해 둔다.
  it("②시나리오가 setInterval 을 직접 돌리지 않는다", () => {
    expect(scenario, "②시나리오에 setInterval 이 생겼다 — lib/poll.js 로 가라").not.toMatch(/setInterval\(/);
  });

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
  //
  // ★ 파일 전체를 훑으면 안 된다. ③목소리에는 루프가 둘이라, Infinity 를 **본 루프**에
  //   달고 대기 루프를 기본값에 둬도 초록이 난다 — 이 단정이 막으려던 것과 정확히 반대다.
  //   그래서 대기 루프의 주소 뒤 한 토막만 잘라 잰다.
  it("컷 분할 대기 루프에는 상한도 실패 카운트도 없다", () => {
    for (const [name, src] of [["③목소리", voice], ["④이미지", images]]) {
      const block = splitWaitBlock(src, name);
      expect(block, `${name} 대기 루프에 상한이 새로 생긴다`).toMatch(/timeoutMs:\s*Infinity/);
      expect(block, `${name} 대기 루프에 실패 중단이 새로 생긴다`).toMatch(/maxFailures:\s*Infinity/);
    }
  });

  // ★ 여기서 true 를 돌려주면 폴링이 **끝난다**. load(id) 가 거절당했는데(네트워크 한 번
  //   끊김 — ProjectContext 는 non-ok 에 거절한다) 그 회차에 끝내 버리면, project 가
  //   그대로라 splitting 도 그대로고, effect deps 도 안 바뀌고, 재시작 가드
  //   (`if (splitPollRef.current) return`)까지 막는다(기본 onStop 이 noop 이라 ref 를
  //   비울 사람이 없다). 화면은 "대본을 컷으로 나누는 중이에요"에서 영영 안 움직인다.
  //   옮기기 전에는 다음 주기가 load 를 그냥 다시 불렀다 — 그 회복을 되돌려 놓는다.
  it("컷 분할 대기 루프는 전체를 실제로 받아온 뒤에만 끝난다", () => {
    for (const [name, src] of [["③목소리", voice], ["④이미지", images]]) {
      const block = splitWaitBlock(src, name);
      expect(block, `${name} 대기 루프의 onTick 이 비동기가 아니다`).toMatch(/onTick:\s*async\b/);
      expect(block, `${name} 대기 루프가 load 를 기다리지 않고 끝낸다`).toMatch(/await load\(/);
      expect(block, `${name} 대기 루프가 load 실패를 삼킨 채 끝낸다`)
        .not.toMatch(/load\([^)]*\)\.catch/);
    }
  });

  // ★ ⑥완성만 상한이 10분이다. 빠뜨리면 모듈 기본값 5분이 걸려 정상적으로 6~9분 걸리는
  //   합성이 "상태를 확인하지 못했어요"로 끝난다.
  it("⑥완성의 상한은 그대로 10분이다", () => {
    expect(done).toMatch(/timeoutMs:\s*10 \* 60 \* 1000/);
  });
});
