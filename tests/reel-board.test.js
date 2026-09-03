// 스토리보드 **보드** — 사람이 보고 내려받는 한 장(2026-09-02 사장님 요청).
//
// ★★ 출력이 둘이고 원천은 하나다. 같은 cuts 에서
//   · **모델용** = r2v 시트(lib/reel/storyboard.js) — 격자 그림 한 장, 글자 없음
//   · **사람용** = 이 보드 — 번호·타임코드·카메라·연기·대사가 붙은 카드 격자
//   이 판이 지키는 것은 **둘이 안 섞이는 것**이다. r2v 경로를 한 줄도 안 건드린다.
//
// ★ 비율이 배치를 정한다(사장님 지시: "16:9로 생성을 했으면 스토리보드 자체도 16:9 안에서").
//   열 수를 표로 박지 않고 **기하로 고른다** — 목표 비율에 가장 가까워지는 열 수를 고르면
//   9:16 은 자연히 적은 열, 16:9 는 많은 열이 된다. 표로 박으면 컷 수가 바뀔 때 어긋난다.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { boardLayout, boardSvg, paletteFor, accentFrom, MIN_CARD_W } from "../lib/reel/board.js";

const cut = (idx, over = {}) => ({
  idx,
  seconds: 3,
  camera: `camera-${idx}`,
  action: `action-${idx}`,
  lighting: `lighting-${idx}`,
  sentence: "",
  image: { url: `/api/uploads/cut-${idx}.jpg` },
  ...over,
});
const cuts = (n, over) => Array.from({ length: n }, (_, i) => cut(i, over));

const project = (aspect = "9:16") => ({
  settings: { aspect_ratio: aspect, target_seconds: 15, style: "photo", mood: "premium" },
  scenario: { narration: { text: "해 질 무렵 한강 위로 서울이 깨어납니다." } },
});

describe("보드 배치 — 비율이 정한다", () => {
  // ★★★ 2026-09-02 최종(사장님 강조 지시) — **보드도 이미지도 정확히 영상 비율**이다.
  //   같은 날 세로를 내용에 맞춰 줄였다가(위아래 여백 제거) 보드 비율이 깨져 되돌렸다.
  //   위아래 여백 제거는 유지된다 — 격자가 세로를 꽉 채우고 자투리는 좌우로 간다.
  it("★★ 캔버스 비율이 **정확히 영상 비율**이다 — 세 비율 모두", () => {
    for (const [aspect, want] of [["9:16", 9 / 16], ["1:1", 1], ["16:9", 16 / 9]]) {
      const L = boardLayout(8, aspect);
      expect(L.width / L.height, `${aspect} 보드가 그 비율이 아니다`).toBeCloseTo(want, 2);
    }
  });

  // ★ 2026-09-02 후속 지시("비율 유지하고 이미지 컷 자체 크기를 키우면 안 돼?") — 계약이
  //   "세로 꽉 채움"에서 **카드 최대화 + 공백 균등 분배**로 바뀌었다. 9:16 5컷이 2열
  //   445px(꽉 참)에서 3열 505px(위·아래 221px 균등)로 커진 것이 그 값이다.
  it("★★ 카드가 최대다 — 5컷 9:16 이 두 줄(3+2)에 500px 를 넘는다", () => {
    const L = boardLayout(5, "9:16");
    expect(L.cols).toBe(3);
    expect(L.rows).toBe(2);
    expect(L.card.w).toBeGreaterThan(500);
  });

  it("★★ 줄 사이는 붙고, 남는 공백은 위아래로 **똑같이** 나뉜다 (사장님 최종)", () => {
    for (const [n, aspect] of [[5, "9:16"], [8, "9:16"], [6, "1:1"], [5, "16:9"]]) {
      const L = boardLayout(n, aspect);
      const top = L.origin.y - L.pad - L.header.h;
      const gridBottom = L.origin.y + L.rows * L.card.h + (L.rows - 1) * L.gapY;
      const bottom = L.height - gridBottom - L.pad;
      expect(Math.abs(top - bottom), `${aspect} ${n}컷 위아래가 안 맞다`).toBeLessThanOrEqual(2);
      // 줄 사이는 기본 간격 그대로 — 잉여를 줄 사이에 끼우지 않는다.
      expect(Math.abs(L.gapY - L.gap), `${aspect} ${n}컷 줄 사이가 벌어졌다`).toBeLessThanOrEqual(0.01);
    }
  });

  it("★ 가로 보드의 열이 세로 보드보다 적지 않다 — 표가 아니라 기하에서 나온다", () => {
    // 세로 채움 규칙에서는 두 비율이 같은 열 수에 이를 수 있다(8컷이 실제로 3x3 동률).
    expect(boardLayout(8, "16:9").cols).toBeGreaterThanOrEqual(boardLayout(8, "9:16").cols);
    expect(boardLayout(4, "16:9").cols).toBeGreaterThanOrEqual(boardLayout(4, "9:16").cols);
  });

  it("★ 컷이 모두 격자에 들어간다 — 빠지는 컷이 없다", () => {
    for (const n of [1, 3, 4, 5, 6, 8, 9, 10, 12, 16]) {
      for (const a of ["9:16", "1:1", "16:9"]) {
        const L = boardLayout(n, a);
        expect(L.cols * L.rows, `${a} ${n}컷이 격자를 넘친다`).toBeGreaterThanOrEqual(n);
      }
    }
  });

  it("★★ 카드가 최소 크기 아래로 절대 안 내려간다 — 실제 쓰는 컷 수 전부", () => {
    // 고를 수 있는 칸 수(reelCutChoicesFor)와 그 언저리를 훑는다.
    for (const n of [3, 4, 5, 6, 8, 9, 10, 12, 15, 16]) {
      for (const a of ["9:16", "1:1", "16:9"]) {
        expect(boardLayout(n, a).card.w, `${a} ${n}컷의 카드가 너무 작다`).toBeGreaterThanOrEqual(MIN_CARD_W);
      }
    }
  });

  it("★★ 그래도 못 지킬 만큼 많으면 **캔버스가 커진다** — 카드 최소 크기가 이긴다", () => {
    // ★ 실측으로 배운 것: 16컷까지는 열이 늘며 흡수돼 기본 폭(1600)이 그대로다. 이 가드가
    //   실제로 도는 것은 그보다 훨씬 많을 때다 — 그래도 규칙은 규칙이라 판으로 잡아 둔다.
    //   (세로가 내용에 맞춰 줄어드는 계약이라 "비율 그대로"는 더는 재지 않는다 — 재는 것은
    //    영상 비율보다 길어지지 않는 것뿐이다.)
    const few = boardLayout(4, "9:16");
    const many = boardLayout(36, "9:16");
    expect(many.card.w).toBeGreaterThanOrEqual(MIN_CARD_W);
    expect(many.width).toBeGreaterThan(few.width);
    expect(many.width / many.height).toBeCloseTo(9 / 16, 2); // 커져도 비율은 정확히 그대로
  });

  it("컷이 0이어도 안 던진다", () => {
    const L = boardLayout(0, "9:16");
    expect(L.width).toBeGreaterThan(0);
    expect(L.height).toBeGreaterThan(0);
  });

  it("모르는 비율은 기본(9:16)으로 떨어진다 — 여기서 멈추면 보드를 못 만든다", () => {
    expect(boardLayout(6, "3:7")).toEqual(boardLayout(6, "9:16"));
  });
});

describe("보드 SVG — 무엇이 실리나", () => {
  const svg = (n = 4, over, aspect = "9:16") =>
    boardSvg({ project: project(aspect), cuts: cuts(n, over), layout: boardLayout(n, aspect) });

  it("★ 컷의 카메라·연기가 실제로 들어간다", () => {
    const s = svg(3);
    for (const i of [0, 1, 2]) {
      expect(s).toContain(`camera-${i}`);
      expect(s).toContain(`action-${i}`);
    }
  });

  it("★★ 타임코드가 **누적**이다 — 3초짜리 셋이면 0:00·0:03·0:06 에서 시작한다", () => {
    const s = svg(3);
    expect(s).toContain("0:00");
    expect(s).toContain("0:03");
    expect(s).toContain("0:06");
  });

  it("★★ 셋째 칸 — 대사가 있으면 대사다", () => {
    // ★ 글자는 칸 폭에 맞춰 **접힌다** — 한 문장을 통째로 찾으면 접히는 순간 판이 거짓으로
    //   깨진다(2026-09-02 에 실제로 그랬다). 낱말이 실렸는지를 본다.
    const s = svg(2, { sentence: "오늘도 수고했어" });
    expect(s).toContain("오늘도");
    expect(s).toContain("수고했어");
    expect(s).toContain("대사");
  });

  it("★★ 셋째 칸 — 대사가 없으면 조명으로 채운다(빈 칸을 두지 않는다)", () => {
    // 지금 흐름은 내레이션을 **영상 전체 한 벌**로 뽑아서(2026-08-27) 컷별 sentence 가
    // 비어 있다. 대사 칸을 그대로 두면 모든 카드에서 빈 칸이 된다 — 실데이터로 확인했다.
    const s = svg(2);
    expect(s).toContain("lighting-0");
    expect(s).toContain("lighting-1");
  });

  // ★★ 2026-09-02 — **이 판은 뒤집힌 것이다.** 내레이션을 머리글에 싣던 판이었는데,
  //   사장님 지시("초·사이즈·컷수·내레이션 전부 제거, 이미지컷들로 가득")로 머리글이
  //   제목 한 줄이 됐다. 내레이션·메타가 보드에 **안 실리는 것**이 이제 계약이다.
  it("★ 머리글은 제목뿐이다 — 내레이션·메타 상자가 안 실린다", () => {
    const s = svg(3);
    expect(s).not.toContain("해 질 무렵 한강 위로");
    expect(s).not.toContain("DURATION");
    expect(s).not.toContain("내레이션");
    expect(s).toContain("STORYBOARD");
  });

  // ★★★ 2026-09-02 — **@font-face 심기는 안 먹힌다는 것을 실측으로 확인했다.**
  //   서로 다른 폰트 6종을 base64 로 심어 렌더했더니 전부 같은 모양이 나왔다 — sharp 의
  //   SVG 렌더러가 심은 폰트를 무시하고 시스템 폰트로 그린다(Windows 는 한글 폰트가 가려
  //   줬지만 배포 리눅스에는 없어 두부가 된다). 그래서 글자를 **윤곽선(path)** 으로 굽는다.
  it("★★ 글자가 윤곽선이다 — <text> 없이 path + data-text 만 있다", () => {
    const s = svg(2);
    expect(s, "폰트 시스템에 기대는 <text> 가 남았다").not.toMatch(/<text[\s>]/);
    expect(s).toContain("data-text=");
    expect(s, "죽은 처방(@font-face)이 돌아왔다").not.toContain("@font-face");
  });

  it("★ 꺾쇠·앰퍼샌드가 SVG 를 깨뜨리지 않는다", () => {
    const s = svg(1, { camera: 'wide <shot> & "close"', sentence: "a < b & c" });
    expect(s).not.toContain("<shot>");
    expect(s).toContain("&lt;");
    expect(s).toContain("&amp;");
  });

  it("컷이 없어도 SVG 를 낸다", () => {
    expect(boardSvg({ project: project(), cuts: [], layout: boardLayout(0, "9:16") })).toContain("<svg");
  });
});


// ★★ 포인트 색은 **영상에서 나온다**(2026-09-02 사장님 선택 — 2번안).
//   규칙: **색상(hue)은 영상이, 명도·채도는 판이** 정한다 — 흰 글자가 항상 설 수 있는
//   어두운 범위로 죈다. 바탕·카드는 중립을 지킨다(어떤 색이 뽑혀도 판이 안 깨지게).
describe("포인트 색 — 영상에서 나온다", () => {
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  it("영상이 없으면(추출 실패) 기준 판 그대로다 — 레퍼런스의 초록", () => {
    const p = paletteFor(null);
    expect(p.green).toBe("#2F5D3F");
    expect(p.bg).toBe("#F5F1E6");
  });

  it("★★ 따뜻한 영상이면 포인트가 따뜻해진다 — 색상은 영상을 따른다", () => {
    const p = paletteFor({ r: 214, g: 138, b: 60 }); // 노을 앰버
    expect(p.green).not.toBe("#2F5D3F");
    const [r, g, b] = hexRgb(p.green);
    expect(r, "앰버 색상이 안 살았다").toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it("★★ 어떤 색이 뽑혀도 흰 글자가 선다 — 명도는 판이 죈다", () => {
    for (const rgb of [{ r: 250, g: 240, b: 120 }, { r: 40, g: 60, b: 200 }, { r: 220, g: 40, b: 40 }]) {
      const [r, g, b] = hexRgb(paletteFor(rgb).green);
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      expect(lum, `${JSON.stringify(rgb)} 의 포인트가 너무 밝다`).toBeLessThan(0.35);
    }
  });

  it("무채색 영상은 기준 판으로 떨어진다 — 잿빛의 색상값은 소음이다", () => {
    expect(paletteFor({ r: 128, g: 128, b: 131 }).green).toBe("#2F5D3F");
  });

  it("★ 바탕·카드·테두리는 영상과 무관하게 중립이다", () => {
    const p = paletteFor({ r: 214, g: 138, b: 60 });
    const base = paletteFor(null);
    for (const k of ["bg", "card", "line", "divider", "imgSlot"]) expect(p[k]).toBe(base[k]);
  });

  it("accentFrom 은 가장 진한(채도 높은) 색을 고른다 — 평균은 진흙이 된다", () => {
    const amber = { r: 214, g: 138, b: 60 };
    expect(accentFrom([{ r: 120, g: 120, b: 122 }, amber, { r: 90, g: 95, b: 100 }])).toEqual(amber);
    expect(accentFrom([{ r: 128, g: 128, b: 128 }])).toBe(null);
    expect(accentFrom([])).toBe(null);
  });

  it("★ boardSvg 가 그 판을 실제로 쓴다 — 만들기만 하고 안 꽂으면 아무 일도 없다", () => {
    const p = paletteFor({ r: 214, g: 138, b: 60 });
    const s2 = boardSvg({ project: project(), cuts: cuts(2), layout: boardLayout(2, "9:16"), palette: p });
    expect(s2).toContain(p.green);
  });
});

describe("화면·라우트 배선", () => {
  const page = readFileSync("app/reel/[id]/images/page.js", "utf8");
  const route = readFileSync("app/api/reel/[id]/board/route.js", "utf8");

  it("★ ③이미지의 [스토리보드 한 장 보기]가 **보드**를 보여 준다", () => {
    expect(page).toContain("/board");
    // 그 자리에서 옛 격자(sheet)를 그대로 보여 주던 배선은 사라졌다.
    expect(page, "아직 시트를 그 자리에 그린다").not.toContain('<img src={sheetUrl}');
  });

  it("★★ 미리보기와 내려받기가 **다른 주소**다", () => {
    // 한 주소로 겸할 수 없다 — `attachment` 를 늘 붙이면 <img> 가 아무것도 못 그린다
    // (2026-09-02, 화면을 실제로 열어 보고 알았다. 판도 빌드도 그때 그린이었다).
    // ★ 2026-09-03 — 주소를 **변수 하나**(boardHref)가 만든다. 내용 지문(`?v=`)을 실어
    //   캐시가 컷에 맞물리게 하려고 그렇게 바꿨다(lib/reel/board-key.js). 그래서 여기서는
    //   글자 그대로가 아니라 **뜻**을 잰다: 미리보기는 download 를 안 붙이고, 내려받기만 붙인다.
    expect(page, "보드 주소를 만드는 자리가 없다").toMatch(/const boardHref = `\/api\/reel\/\$\{id\}\/board\?v=\$\{boardKey\(/);
    expect(page, "미리보기가 그 주소를 안 쓴다").toMatch(/<img[\s\S]{0,120}?src=\{boardHref\}/);
    expect(page, "미리보기에 download 가 붙었다 — <img> 가 아무것도 못 그린다")
      .not.toMatch(/<img[\s\S]{0,200}?download=1/);
    // ★ 2026-09-02 — 토글을 걷어냈다(사장님: "그냥 고정 이미지로"). 항상 붙는다.
    expect(page, "토글이 남아 있다").not.toContain("boardOpen");
    expect(page, "내려받기가 download 인자를 안 준다").toMatch(/href=\{`\$\{boardHref\}[^`]*download=1`\}[^>]*download/);
    expect(route, "라우트가 그 인자를 안 본다").toContain('searchParams.has("download")');
  });

  it("★★ 라우트가 **우리 버킷의 그림만** 읽는다 — 아무 URL 이나 열면 SSRF 다", () => {
    // 주소에서 키만 떼어 uploads 버킷을 본다. 주소를 그대로 fetch 하면 안 된다.
    expect(route, "uploads 버킷을 안 읽는다").toMatch(/getObject\(\s*"uploads"/);
    expect(route, "주소를 그대로 여는 자리가 있다").not.toMatch(/fetch\(\s*url/);
  });

  it("★ 굽는 시간이 배포 기본값에 안 잘린다", () => {
    expect(route).toMatch(/maxDuration\s*=\s*\d+/);
  });
});

describe("로고", () => {
  it("★ 우측 하단 로고 — 파일이 저장소에 있고 drawBoard 가 그것을 읽는다", () => {
    // 다운로드 폴더를 읽으면 로컬에서만 돌고 배포에서 조용히 사라진다.
    expect(existsSync("public/board-logo.png"), "로고 파일이 저장소에 없다").toBe(true);
    const board = readFileSync("lib/reel/board.js", "utf8");
    expect(board).toContain("public/board-logo.png");
  });
});

// ★★ 모델이 보는 것과 사람이 보는 것을 **섞지 않는다**. 이 판이 그 경계다.
describe("r2v 경로를 안 건드린다", () => {
  const storyboard = readFileSync("lib/reel/storyboard.js", "utf8");
  const board = readFileSync("lib/reel/board.js", "utf8");

  it("★ 보드는 시트를 만드는 함수를 부르지 않는다 — 값(그림)이 나가는 자리다", () => {
    expect(board).not.toContain("drawStoryboardSheet");
    expect(board, "보드가 이미지 모델을 부른다").not.toContain("generateImage");
  });

  it("★ 시트 쪽은 보드를 모른다 — 의존이 한 방향이다", () => {
    expect(storyboard).not.toContain("board.js");
    expect(storyboard).not.toContain("drawBoard");
  });
});
