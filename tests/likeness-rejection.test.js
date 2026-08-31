// **초상 거절(fal 422)을 사장님 말로 옮긴다** — 그리고 원클릭 화면이 그 말을 쓴다.
//
// 2026-08-31 사장님이 원클릭에서 받은 실제 오류:
//
//   영상 생성 실패 (422) {"detail":[{"loc":["body","image_urls"],
//   "msg":"The images or videos provided may contain likenesses of real people or other
//   private information that cannot be processed.","type":"content_policy_violation"}]}
//
// ★★ **화풍 때문이 아니다.** 사장님은 실사 칩을 의심하셨지만 두 가지가 그것을 반증한다:
//   ① 2026-08-25 실측 — 같은 날 원장에 **실사인데 통과한 표본**이 있었다. 갈린 것은
//      화풍이 아니라 **얼굴이 식별 가능한가**(크기 × 정면성 × 응시)였다.
//   ② 원클릭에는 **그림 단계가 아예 없다**(단일 클립). `image_urls` 에 실리는 것은
//      우리가 그린 그림이 아니라 **사장님이 올린 사진 그 자체**다
//      (lib/ad/pipeline.js 의 readRefs → project.material.photos).
//   즉 화풍을 바꿔도 그 사진은 그대로 나간다.
//
// ★★ **프롬프트로도 못 푼다.** 오류가 `image_urls` 를 가리킨다 — 이미지를 따로 검사하는
//   분류기이고 prompt 는 그 검사 대상이 아니다. 끄는 파라미터도 없다(2026-08-25 확인).
//   그래서 여기서 할 수 있는 유일한 개선은 **무엇을 해야 풀리는지 정확히 알려 주는 것**이다.
//
// ⚠️ 지금 4xx 기본 문구는 이 경우 **틀린 안내**다 — "문장을 조금 바꿔 다시 시도해 주세요".
//   문장을 백 번 바꿔도 안 풀린다. 바꿔야 하는 것은 **사진**이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { classifyFailure, FAILURE_CODES } from "../lib/failure.js";

const RAW = '영상 생성 실패 (422) {"detail":[{"loc":["body","image_urls"],"msg":"The images or videos provided may contain likenesses of real people or other private information that cannot be processed.","type":"content_policy_violation"}]}';

describe("초상 거절을 알아본다", () => {
  it("★ 제 갈래로 잡힌다 — 뭉뚱그린 4xx 가 아니다", () => {
    expect(classifyFailure(RAW).code).toBe("rejected_likeness");
    expect(FAILURE_CODES).toContain("rejected_likeness");
  });

  it("★★ 문구가 **사진**을 가리킨다 — '문장을 바꿔'가 아니다", () => {
    const { message } = classifyFailure(RAW);
    expect(message).toContain("사진");
    expect(message, "문장을 바꾸라는 틀린 안내가 남아 있다").not.toContain("문장을");
  });

  it("다시 해 볼 수는 있다 — 사진을 바꾸면 풀리는 종류다", () => {
    // retryable=false 로 두면 화면이 다시 하기를 닫는다. 사장님이 사진을 바꾼 뒤
    // 다시 굽는 것이 바로 이 오류의 해법이라 그 문을 닫으면 안 된다.
    expect(classifyFailure(RAW).retryable).toBe(true);
  });

  it("낱말만으로도 잡는다 — 상태 코드가 안 붙은 문구도 있다", () => {
    expect(classifyFailure("likenesses of real people").code).toBe("rejected_likeness");
    expect(classifyFailure('content_policy_violation ... "image_urls"').code).toBe("rejected_likeness");
  });

  // ★★ 경계 — **이미지에 대한 거절일 때만** 이 갈래다. "사진을 바꿔 주세요"는 그때만
  //   맞는 말이라, 프롬프트가 걸린 정책 거절까지 물면 엉뚱한 곳을 고치게 만든다.
  it("★ 이미지 칸을 안 가리킨 정책 거절은 예전 갈래 그대로다", () => {
    const r = classifyFailure("이미지 생성 실패 (400) content policy violation");
    expect(r.code).toBe("rejected");
  });

  it("★ 판정이 4xx 규칙보다 **앞**이다 — 뒤에 두면 영원히 안 잡힌다", () => {
    // 원문에 (422) 가 들어 있어 status>=400 가지가 먼저 물면 이 갈래는 죽은 코드가 된다.
    const src = readFileSync("lib/failure.js", "utf8");
    expect(src.indexOf("rejected_likeness")).toBeLessThan(src.indexOf("status >= 400"));
  });
});

describe("다른 오류는 그대로다 — 이번 변경이 넓히지 않는다", () => {
  it("모르는 오류는 원문 그대로", () => {
    expect(classifyFailure("뭔가 이상해요").message).toBe("뭔가 이상해요");
  });

  it("초상이 아닌 4xx 는 예전 문구 그대로", () => {
    expect(classifyFailure("영상 생성 실패 (400) bad request").code).toBe("rejected");
  });

  it("429·402 도 그대로", () => {
    expect(classifyFailure("실패 (429) x").code).toBe("busy");
    expect(classifyFailure("실패 (402) x").code).toBe("no_credits");
  });
});

describe("원클릭 화면이 그 말을 쓴다", () => {
  // 이 저장소에는 렌더 하네스가 없다 — 소스 문자열로 잰다(tests/*-ui.test.js 와 같은 방식).
  const src = readFileSync("app/ads/[id]/page.js", "utf8");

  it("★ 굽기 오류를 classifyFailure 로 옮겨서 보인다 — 지금까지 fal 원문 영어가 그대로 떴다", () => {
    expect(src, "classifyFailure 를 안 부른다").toMatch(/classifyFailure/);
    // video_error 를 날것으로 그리던 자리가 남아 있으면 안 된다.
    expect(src, "video_error 를 아직 원문으로 그린다").not.toMatch(/>\{video_error\}</);
  });
});
