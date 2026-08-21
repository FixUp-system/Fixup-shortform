// r2v 엔드포인트 문자열은 표 옆 한 자리에 산다.
//
// ⚠️ 이 문자열이 fal 의 경로와 **글자 그대로** 같아야 한다. 한 글자만 달라도 404 인데
//    그때는 이미 값을 치른 뒤다(tests/ad-two-models.test.js 와 같은 이유로 대조한다).
import { describe, it, expect } from "vitest";
import { refEndpointForProject, endpointForProject } from "../lib/clip-limits.js";

describe("refEndpointForProject", () => {
  it("Seedance 2.0 의 r2v 경로를 준다", () => {
    const p = { settings: { i2v_model: "seedance-2.0" } };
    expect(refEndpointForProject(p)).toBe("bytedance/seedance-2.0/reference-to-video");
  });

  it("r2v 를 안 여는 모델은 null 이다 — 조용히 다른 모델로 갈아타지 않는다", () => {
    const p = { settings: { i2v_model: "kling-v3" } };
    expect(refEndpointForProject(p)).toBe(null);
  });

  it("모델을 모르는 옛 프로젝트도 null 이다 (레거시 = Kling)", () => {
    expect(refEndpointForProject({})).toBe(null);
  });

  it("i2v 경로는 안 바뀐다", () => {
    const p = { settings: { i2v_model: "seedance-2.0" } };
    expect(endpointForProject(p)).toBe("bytedance/seedance-2.0/image-to-video");
  });
});
