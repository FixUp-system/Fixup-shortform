// **출력 저작권 거절을 알아듣는다** (2026-09-28 사장님 신고: 백설공주 편이 안 만들어졌다).
//
// ★★★ 실측 — 프로젝트 `6ce304aa`(09-28 · 단계별 기본 · 사진 0장)가 이렇게 죽었다:
//   `422 · loc:["body","generated_video"]` ·
//   *"Output video has sensitive content. Potential copyright violation."*
//   09-22 미용실 편(`a3b0811e`)도 같은 자리에서 *"The generated output was rejected due to a
//   potential copyright violation."* 로 죽었다.
// ★★ 초상 거절(rejected_likeness)과 **다른 자리**다: 저쪽은 우리가 **보낸 사진**(image_urls)이
//   걸린 것이고, 이쪽은 모델이 **만들어 낸 영상**(generated_video)이 걸린 것이다.
//   그래서 처방도 다르다 — 사진을 바꾸라고 하면 사진을 안 올린 사장님에게는 못 할 조언이다.
// ★ 안내는 **무엇을 바꾸면 풀리는가**를 말한다: 인물 이름 대신 생김새를 적는 것.
import { describe, it, expect } from "vitest";
import { classifyFailure, FAILURE_CODES } from "../lib/failure.js";

const OUT_COPYRIGHT = '영상 생성 실패 (422) {"detail":[{"loc":["body","generated_video"],"msg":"Output video has sensitive content. Potential copyright violation.","type":"content_policy_violation"}]}';
const OUT_COPYRIGHT2 = '영상 생성 실패 (422) {"detail":[{"loc":["body","generated_video"],"msg":"The generated output was rejected due to a potential copyright violation. Please revise your prompt and try again.","type":"content_policy_violation"}]}';
const IN_LIKENESS = '영상 생성 실패 (422) {"detail":[{"loc":["body","image_urls"],"msg":"The images or videos provided may contain likenesses of real people or other private information that cannot be processed.","type":"content_policy_violation"}]}';

describe("출력 저작권 거절", () => {
  it("★★★ 코드가 목록에 있다", () => {
    expect(FAILURE_CODES).toContain("rejected_copyright");
  });

  for (const [name, text] of [["백설공주 편 원문", OUT_COPYRIGHT], ["미용실 편 원문", OUT_COPYRIGHT2]]) {
    it(`★★★ ${name} 을 알아본다`, () => {
      const out = classifyFailure(text);
      expect(out.code).toBe("rejected_copyright");
      expect(out.retryable).toBe(true);
    });
  }

  it("★★★ 안내가 **무엇을 바꾸면 되는지**를 말한다 — 사진 이야기를 하지 않는다", () => {
    const { message } = classifyFailure(OUT_COPYRIGHT);
    expect(message).toMatch(/캐릭터|저작/);
    expect(message).toMatch(/생김새|머리|옷/);
    expect(message, "사진을 안 올린 사장님에게 못 할 조언이다").not.toMatch(/올리신 사진|사진을 바꿔/);
  });

  it("★★★ 초상 거절과 섞이지 않는다 — 걸린 자리가 다르면 처방도 다르다", () => {
    expect(classifyFailure(IN_LIKENESS).code).toBe("rejected_likeness");
  });

  it("★★ 알 수 없는 422 는 예전 그대로다 — 새 갈래가 남의 자리를 먹으면 안 된다", () => {
    expect(classifyFailure("영상 생성 실패 (422) 알 수 없는 오류").code).toBe("rejected");
  });
});
