import { describe, it, expect } from "vitest";
import { isCutDone, generationState, stalledFor, STALL_MS } from "../lib/progress.js";

describe("isCutDone — 단계별 끝남 판정", () => {
  it("이미지 단계는 그림이 있거나 내 사진인 컷을 끝난 것으로 센다", () => {
    expect(isCutDone({ image: { url: "a" } }, "images")).toBe(true);
    expect(isCutDone({ source: "photo" }, "images")).toBe(true);
    expect(isCutDone({}, "images")).toBe(false);
  });

  // ★ 회귀 방지: 그림 생성이 죽으면 image 없이 state 만 needs_attention 으로 남는다.
  // 이것을 안 세면 정상 종료한 생성이 done: N-1 에 영영 멈춰 "멈춤"으로 오독된다.
  it("이미지 단계는 그림 없이 needs_attention 으로 끝난 컷도 끝난 것으로 센다", () => {
    expect(isCutDone({ state: "needs_attention" }, "images")).toBe(true);
  });

  it("목소리 단계는 낭독이나 실패가 있는 컷을 끝난 것으로 센다", () => {
    expect(isCutDone({ audio: {} }, "voice")).toBe(true);
    expect(isCutDone({ voice_error: "x" }, "voice")).toBe(true);
    expect(isCutDone({}, "voice")).toBe(false);
  });

  it("영상 단계는 클립이나 실패가 있는 컷을 끝난 것으로 센다", () => {
    expect(isCutDone({ video: {} }, "video")).toBe(true);
    expect(isCutDone({ video_error: "x" }, "video")).toBe(true);
    expect(isCutDone({}, "video")).toBe(false);
  });

  it("모르는 단계는 던지지 않고 false 다", () => {
    expect(isCutDone({ image: { url: "a" } }, "render")).toBe(false);
    expect(isCutDone({}, undefined)).toBe(false);
  });

  it("컷이 없어도 안 던진다", () => {
    expect(isCutDone(null, "images")).toBe(false);
    expect(isCutDone(undefined, "voice")).toBe(false);
  });
});

const base = { done: 0, total: 3, error: null, phase: "images", stepPhase: "images", stalledForMs: 0, busy: true };

describe("stalledFor", () => {
  it("progress 가 없으면 null 이다 — 판정 불가이지 멈춤이 아니다", () => {
    expect(stalledFor({}, 1000)).toBeNull();
    expect(stalledFor({ progress: null }, 1000)).toBeNull();
  });
  it("마지막 진척 이후 흐른 시간을 잰다", () => {
    expect(stalledFor({ progress: { at: 400 } }, 1000)).toBe(600);
  });
  it("시계가 뒤로 가도 음수를 안 준다", () => {
    expect(stalledFor({ progress: { at: 2000 } }, 1000)).toBe(0);
  });
});

describe("generationState", () => {
  it("실패가 있으면 무엇보다 먼저 failed 다", () => {
    const s = generationState({ ...base, error: { message: "이미지 생성 실패 (429) x" } });
    expect(s.kind).toBe("failed");
    expect(s.reason.code).toBe("busy");
    expect(s.reason.retryable).toBe(true);
  });

  it("컷이 없으면 idle", () => {
    expect(generationState({ ...base, total: 0 }).kind).toBe("idle");
    // 기본값은 undefined 에만 걸린다. total: null 이 ②를 빠져나가면 `0 >= null` 이 참이 되어
    // "완료 0/null" 이 화면에 뜬다.
    expect(generationState({ ...base, total: null }).kind).toBe("idle");
  });

  it("다 끝났으면 done — 진척이 오래 멈춰 있어도 done 이 먼저다", () => {
    const s = generationState({ ...base, done: 3, total: 3, stalledForMs: 999_999 });
    expect(s.kind).toBe("done");
  });

  // 재실행이 컷을 다시 찍으면 done 이 total 을 넘길 수 있다.
  it("done 이 total 을 넘겨도 done 이다", () => {
    expect(generationState({ ...base, done: 4, total: 3 }).kind).toBe("done");
  });

  it("시작 전이면 idle — 누르지 않았는데 스피너가 돌면 안 된다", () => {
    expect(generationState({ ...base, busy: false, stalledForMs: null }).kind).toBe("idle");
  });

  it("도는 중이면 running", () => {
    const s = generationState({ ...base, done: 1, stalledForMs: 3000 });
    expect(s).toMatchObject({ kind: "running", done: 1, total: 3 });
    // reason 은 실패일 때만 채운다.
    expect(s.reason).toBeNull();
  });

  // ★ busy 는 "이 탭에서 내가 눌렀다"는 지역 표시일 뿐이다. 새로고침 뒤·다른 탭·
  //   시작하지 않고 폴링만 하는 화면에서는 돌고 있어도 false 다. 여기서 idle 로 접으면
  //   진행도 멈춤도 영영 안 보인다 — 이 기능이 없애려는 바로 그 거짓 음성이다.
  it("내가 안 눌렀어도 이 단계의 심장박동이 살아 있으면 running 이다 — 새로고침 뒤에도 봐야 한다", () => {
    expect(generationState({ ...base, busy: false, stalledForMs: 3000 }).kind).toBe("running");
  });
  it("내가 안 눌렀어도 이 단계의 심장박동이 임계만큼 멎었으면 stalled 다", () => {
    expect(generationState({ ...base, busy: false, stalledForMs: STALL_MS }).kind).toBe("stalled");
  });

  it("임계 직전은 아직 running", () => {
    expect(generationState({ ...base, stalledForMs: STALL_MS - 1 }).kind).toBe("running");
  });

  it("임계에 닿으면 stalled", () => {
    expect(generationState({ ...base, stalledForMs: STALL_MS }).kind).toBe("stalled");
  });

  // ★ 앞 단계의 심장박동이 남아 있는 채로 다음 화면에 들어오는 흔한 경우.
  //   단계를 안 보면 ④이미지에 들어서자마자 "멈췄어요"가 뜬다.
  it("다른 단계의 심장박동으로는 멈춤을 판정하지 않는다", () => {
    const s = generationState({ ...base, busy: false, phase: "voice", stalledForMs: 999_999 });
    expect(s.kind).toBe("idle");
  });

  it("다른 단계여도 지금 누른 상태(busy)면 running 이다", () => {
    const s = generationState({ ...base, busy: true, phase: "voice", stalledForMs: 999_999 });
    expect(s.kind).toBe("running");
  });

  it("progress 가 없는 옛 문서는 도는 동안 running 이고 절대 stalled 가 아니다", () => {
    expect(generationState({ ...base, stalledForMs: null }).kind).toBe("running");
  });

  it("합성은 멈춤 판정에서 빠진다 — 정상 합성이 10분 걸린다", () => {
    const s = generationState({
      done: 0, total: 1, error: null, phase: "render", stepPhase: "render",
      stalledForMs: 999_999, busy: true,
    });
    expect(s.kind).toBe("running");
  });

  it("빈 입력에도 안 던진다", () => {
    expect(generationState().kind).toBe("idle");
  });
});
