// **자막 글자를 사장님이 직접 고친다** (2026-09-04).
//
// ★★★ 왜 필요한가. 2026-09-03 에 자막이 소리와 갈리는 결함을 고쳤는데(`video.said`),
//   **이미 구운 편에는 그 값이 없다.** 사장님이 신고한 화장품 편이 그랬고, 고칠 자리가
//   화면에 없어서 **내가 손으로 문서를 고쳐 드렸다**(프로덕션 데이터 직접 수정).
//   그 일이 다시 필요해서는 안 된다 — 사장님이 **직접 0원에** 고치실 수 있어야 한다.
//   (다시 굽는 것은 한 편에 값이 나가므로 글자 하나 때문에 쓸 수 없다.)
//
// ★ 판정은 **순수 함수**가 한다(putSaid). 이 저장소에는 라우트 실행 인프라가 없고,
//   무엇보다 "무엇을 어떻게 바꾸는가"는 라우트가 아니라 규칙이다 — 라우트가 직접 문서를
//   주무르면 같은 규칙이 화면·라우트 두 벌이 된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { putSaid, bakedNarration, SAID_MAX } from "../lib/reel/narration.js";

const strip = (s) => s.replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
const src = (p) => strip(readFileSync(p, "utf8"));

const NOW = "지금 시나리오의 내레이션.";
const whole = (over = {}) => ({
  kind: "reel",
  scenario: { text: "t", narration: { text: NOW } },
  reel: { status: "done", narration_timing: [{ start: 1, seconds: 2 }] },
  cuts: [
    { sentence: "a", video: { url: "u", seconds: 15, whole: true, of: "body" } },
    { sentence: "b" },
  ],
  ...over,
});

describe("자막 글자 고치기 — putSaid", () => {
  it("★★★ 구운 편의 첫 컷에 적는다 — 자막은 그것을 태운다", () => {
    const next = putSaid(whole(), "  영상이 말한 문장.  ");
    expect(next.cuts[0].video.said).toBe("영상이 말한 문장.");
    expect(bakedNarration(next).text).toBe("영상이 말한 문장.");
  });

  it("★★ 빈 값은 **되돌리기**다 — 시나리오의 내레이션으로 떨어진다", () => {
    const next = putSaid(whole(), "   ");
    expect(next.cuts[0].video.said).toBe("");
    expect(bakedNarration(next).text).toBe(NOW);
  });

  it("★★★ 낡은 시각을 걷는다 — 문장이 바뀌면 그 시각은 딴 문장의 것이다", () => {
    const next = putSaid(whole(), "새 문장.");
    expect(next.reel.narration_timing).toBeUndefined();
    // 나머지 reel 값은 그대로다 — 이 문은 자막 글자만 만진다.
    expect(next.reel.status).toBe("done");
  });

  it("★★ 영상과 각인은 **안 건드린다** — 글자를 고쳤다고 산 영상이 낡으면 안 된다", () => {
    const next = putSaid(whole(), "새 문장.");
    expect(next.cuts[0].video.url).toBe("u");
    expect(next.cuts[0].video.of).toBe("body");
    expect(next.cuts[0].video.whole).toBe(true);
  });

  it("★ 다른 컷은 그대로다", () => {
    const next = putSaid(whole(), "새 문장.");
    expect(next.cuts[1]).toEqual({ sentence: "b" });
  });

  it("★★ 통짜로 구운 편이 아니면 **null** — 컷별은 컷마다 sentence 가 자막이라 축이 다르다", () => {
    expect(putSaid(whole({ cuts: [{ video: { url: "u" } }] }), "x")).toBeNull();
    expect(putSaid(whole({ cuts: [{ sentence: "a" }] }), "x")).toBeNull();
    expect(putSaid({ kind: "reel" }, "x")).toBeNull();
  });

  it("★ 상한이 있다 — 화면에 박히는 글자라 끝없이 받지 않는다", () => {
    expect(SAID_MAX).toBeGreaterThan(100);
    const next = putSaid(whole(), "가".repeat(SAID_MAX + 50));
    expect(next.cuts[0].video.said.length).toBe(SAID_MAX);
  });

  it("★ 원본을 안 바꾼다 — 저장 큐가 같은 문서를 다시 읽는다", () => {
    const p = whole();
    putSaid(p, "새 문장.");
    expect(p.cuts[0].video.said).toBeUndefined();
    expect(p.reel.narration_timing).toBeTruthy();
  });
});

describe("문 — PATCH 가 그 규칙을 쓴다", () => {
  const route = src("app/api/reel/[id]/route.js");

  it("★★★ 라우트가 putSaid 를 부른다 — 문서를 직접 주무르지 않는다", () => {
    expect(route).toMatch(/putSaid\(/);
  });

  it("★★ 자막 설정만 보내던 옛 호출은 그대로 산다 — 회귀 0", () => {
    expect(route).toMatch(/settings\?\.subtitle/);
  });

  it("★ 통짜로 구운 편이 아니면 말해 준다 — 조용히 통과하면 '고쳤는데 그대로'가 된다", () => {
    expect(route).toMatch(/putSaid[\s\S]{0,400}400|400[\s\S]{0,400}putSaid/);
  });
});

describe("화면 — 완성에서 고친다", () => {
  const done = src("app/reel/[id]/done/page.js");

  it("★★★ 자막 글자 칸이 있다", () => {
    expect(done).toMatch(/said/);
    expect(done, "공용 규칙을 안 쓴다").toMatch(/AutoTextarea/);
  });

  it("★★ 저장은 **굽기와 별개**다 — 값이 안 나간다는 것이 요점이다", () => {
    expect(done).toMatch(/said/);
    // 저장 문은 PATCH 다(굽기는 /render 의 POST 다).
    expect(done).toMatch(/method:\s*"PATCH"/);
  });
});
