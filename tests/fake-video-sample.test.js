// 가짜 모드가 **실제 영상**을 준다(2026-08-25 사장님 지시).
//
// ★★ 지금까지 가짜 굽기는 `imageUrl` 을 그대로 돌려줬다 — 정지 그림이라 재생하면
//   아무 일도 안 일어난다. **배치를 0원으로 검토할 수 없었다**: 영상 자리가 어떻게
//   보이는지도, 자막이 어디 걸리는지도 알 수 없다.
// ★ 오늘 실제로 만든 15초 한 편을 표본으로 둔다(소리도 들어 있어 자막 검토까지 된다).
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";

describe("영상 표본", () => {
  it("파일이 있다", () => {
    expect(existsSync("public/samples/reel-15s.mp4")).toBe(true);
  });

  it("가짜 굽기가 그것을 준다", () => {
    const src = readFileSync("lib/i2v.js", "utf8");
    expect(src).toContain("samples/reel-15s.mp4");
    // ★ 가짜 판정 안에서만 쓴다 — 진짜 모드가 표본을 주면 사장님이 만든 줄 안다.
    const at = src.indexOf("samples/reel-15s.mp4");
    expect(src.slice(Math.max(0, at - 300), at)).toContain("fakeFal()");
  });

  // ★ middleware 가 samples/ 를 안 걸러내면 로그인 벽에 막혀 307 이 된다 —
  //   이미지 표본에서 실제로 그랬다(2026-08-25).
  it("공개 경로에 들어 있다", () => {
    expect(readFileSync("middleware.js", "utf8")).toContain("samples/");
  });
});

describe("⑥완성도 표본을 보여 준다", () => {
  // ★★ 전에는 합성이 `url: null` 을 줌다 — 완성본 자리가 **비어 있어**
  //   ⑥ 배치를 0원으로 검토할 수 없었다. 그 주석은 "재생 안 되는 더미를 주면
  //   합성이 깨졌다고 오해한다"였는데, **진짜 재생되는 표본**이면 그 이유가 없다.
  it("가짜 합성이 표본 주소를 준다", () => {
    const src = readFileSync("lib/compose.js", "utf8");
    expect(src).toContain("samples/reel-15s.mp4");
    const at = src.indexOf("samples/reel-15s.mp4");
    expect(src.slice(Math.max(0, at - 300), at)).toContain("fakeFal()");
  });
});
