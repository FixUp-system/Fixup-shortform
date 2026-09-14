// 스토리보드 원본 한 장을 **어디서 보여 주는가**.
//
// ★★ 2026-08-27 — ③에서 **크기가 줄고 짝이 생겼다**. 그날 한 번 통째로 뺐다가
//   ("기존에 4컷을 통합한건 제거해줘") 곧 되돌렸다("전체 4컷도 상단에 배치해줘").
//   지금 뜻: 통합본은 **전체 흐름을 한눈에**(작게, 맨 위), "어느 칸이 어느 문장인가"는
//   그 아래 컷별 목록이 맡는다. 뺐을 때 사라졌던 것이 앞의 일이었다.
//
// ★ **만드는 방식은 안 바뀌었다** — 여전히 한 장을 사서 칸을 자른다
//   (app/api/reel/[id]/images/route.js). 바뀐 것은 보여 주는 자리뿐이다.
// ★ ④프롬프트·⑤영상에서는 그대로 크게 보여 준다: 굽기에 **통째로 넘기는** 그 한 장이라
//   그 화면들에서는 그것이 본문이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const images = readFileSync("app/reel/[id]/images/page.js", "utf8");
const prompts = readFileSync("app/reel/[id]/prompts/page.js", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("③이미지 — 통합본은 맨 위, 그 아래가 컷별 목록", () => {
  // ★ 통합본은 "전체 흐름을 한눈에" 보는 자리다. "어느 칸이 어느 문장인가"는 아래
  //   컷별 목록이 맡는다(tests/reel-images-auto.test.js) — 둘의 일이 다르다.
  it("통합 한 장을 맨 위에 그린다", () => {
    expect(strip(images)).toContain("sheet-view");
  });

  // ★ 컷별 갈래(격자 밖 칸 수·한 칸만 다시 그리기)에는 칸마다 [다시 만들기]가 붙는다 —
  //   그 갈래의 상자는 그대로 살아 있어야 한다.
  it("컷별 갈래의 상자는 남는다", () => {
    expect(strip(images)).toContain("cut-shots");
  });
});

describe("④프롬프트 — 굽기에 넘기는 그 한 장이 본문이다", () => {
  const clean = strip(prompts);

  // ★★ 판독은 lib/reel/oneshot.js 의 reelSheetUrl 하나다 — 화면마다 손으로 찾으면
  //   ④·⑤가 "통짜로 구울 수 있는가"를 각자 다른 주소로 판정하게 된다.
  it("저장된 sheet 주소를 읽는다", () => {
    expect(clean).toContain("reelSheetUrl");
    expect(readFileSync("lib/reel/oneshot.js", "utf8")).toMatch(/image\?\.sheet/);
  });

  it("원본이 있으면 그것을 그린다", () => {
    expect(clean).toContain("sheet-view");
    expect(css, "CSS 에 .sheet-view 가 없다").toContain(".sheet-view");
  });

  // ★★ 비율을 강제하지 않는다 — 격자 캔버스는 칸 수마다 다르다(9:16 · 3:4 · 4:5 · 16:9).
  //   9:16 으로 잡으면 3칸(가로 한 줄) 스토리보드가 잘려 보인다.
  it("비율을 강제하지 않는다", () => {
    const at = css.indexOf(".sheet-view");
    expect(css.slice(at, at + 400)).not.toMatch(/aspect-ratio/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// ⑤영상 — 돈을 치르기 **직전**에 보는 그 한 장.
//
// ★★★ 2026-09-14 밤 사장님 지적: "영상 단계에서 사진이 너무 작게 보여".
//   ⑤의 통짜 갈래가 스토리보드를 `.up`(86×86px)에 넣고 있었다 — 칸 하나가 ~28px 이라
//   무엇이 그려졌는지 알 수 없고, `object-fit: cover` 라 가장자리까지 잘렸다.
//   2026-08-28 에 이미 적어 둔 건이고(OUTSTANDING.md), ③은 2026-08-25 에 같은 문제를
//   고쳤는데 ⑤에만 안 왔다. **CSS 는 처음부터 ⑤를 기다리고 있었다** —
//   `.sheet-view` 주석에 "④·⑤에서 쓰는 기본 크기(68vh)" 라고 적혀 있다.
//   ⚠️ 이 판이 없으면 같은 자리가 조용히 되돌아간다 — 이 파일의 머리말은 ⑤도 크게
//     보여 준다고 **글로만** 말하고 있었고, 그 사이 ⑤는 86px 인 채였다.
// ────────────────────────────────────────────────────────────────────────
describe("⑤영상 — 굽기 직전의 한 장은 크게 본다", () => {
  const video = strip(readFileSync("app/reel/[id]/video/page.js", "utf8"));
  // 통짜 갈래만 잘라서 잰다 — 컷별 갈래의 86px 칸은 **고르는 자리**라 그대로 산다.
  const 끝 = video.indexOf(") : cuts.length > 0 && (");
  const 처음 = 끝 < 0 ? -1 : video.lastIndexOf("{oneShot ? (", 끝);
  const 통짜 = 처음 < 0 ? "" : video.slice(처음, 끝);

  it("두 갈래를 가르는 모양이 그대로다 — 못 자르면 아래 단정들이 빈 글을 잰다", () => {
    expect(처음, "통짜 갈래의 시작을 못 찾았다 — 화면 모양이 바뀌었나").toBeGreaterThan(-1);
    expect(끝, "컷별 갈래로 넘어가는 자리를 못 찾았다").toBeGreaterThan(처음);
  });

  it("★★★ 통짜 갈래는 스토리보드를 **크게** 그린다 — 86px 칸이 아니다", () => {
    expect(통짜, "⑤가 스토리보드를 크게 안 그린다").toContain("sheet-view");
    expect(통짜, "⑤가 스토리보드를 아직 86px 칸에 넣는다").not.toContain("up photo-mark");
  });

  it("★★ 굽는 중 표시는 그 위에 그대로 얹힌다 — 덮개를 잃으면 멈춘 화면으로 보인다", () => {
    expect(통짜, "도는 표시가 사라졌다").toContain("frame-busy");
  });

  it("★ 컷별 갈래의 칸은 남는다 — 그것은 중복이 아니라 고르는 자리다", () => {
    expect(video.slice(끝), "컷별 갈래의 썸네일 칸까지 걷어냈다").toContain("up photo-mark");
  });
});
