// reel 도 **영상 비율(사이즈)을 고른다** (2026-08-25 사장님 지시: "영상 사이즈 선택
// 부분도 빠졌어" · "영상 비율이 빠졌어").
//
// ★★ 그전에는 화면이 DEFAULT_ASPECT_ID(9:16)를 **박아서** 보냈다. 주석에 "reel 은 숏폼이
//   표제 기능이라 하나로 보낸다"고 적혀 있었는데, 사장님이 그 결정을 뒤집었다.
//
// ★★ **뒷단은 이미 비율을 받아 돌아간다** — 열어 주기만 하면 됐다:
//   · 라우트가 isAspect 로 검증한다(app/api/reel/route.js)
//   · 스토리보드 치수가 비율에서 나온다(storyboardImageSize(grid, aspect_ratio))
//   · 칸 자르기도 비율을 받는다(cropStoryboardCells(…, { aspect }))
//   막혀 있던 것은 화면 하나였다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { ASPECTS, DEFAULT_ASPECT_ID } from "../lib/aspects.js";
import { storyboardImageSize } from "../lib/reel/storyboard.js";
import { reelGridFor, reelCutChoicesFor } from "../lib/reel/scenario-rules.js";

const strip = (src) =>
  src
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const read = (p) => strip(readFileSync(p, "utf8"));

describe("①입력에서 비율을 고른다", () => {
  const nw = read("app/reel/new/page.js");

  it("고르는 칸이 있다 — 표를 손으로 적지 않는다", () => {
    expect(nw).toContain("ASPECTS");
  });

  // ★ 2026-08-25 사장님 지적 "라벨 부분이 안맞아" — 광고는 `세로 · 9:16` 처럼
  //   **비율까지** 적는데 reel 만 이름만 적었다. "세로"만으로는 9:16 인지 4:5 인지 모른다.
  it("칩이 이름과 비율을 같이 적는다 — 광고 화면과 같은 모양", () => {
    expect(nw).toContain("{a.label} · {a.id}");
  });

  it("★ 고른 값을 보낸다 — 예전에는 기본값을 박아 보냈다", () => {
    expect(nw).toContain("aspect_ratio: aspect");
    expect(nw, "기본값을 아직 박아 보낸다").not.toContain("aspect_ratio: DEFAULT_ASPECT_ID");
  });

  it("기본은 여전히 세로다 — 숏폼이 표제 기능이다", () => {
    expect(nw).toContain("useState(DEFAULT_ASPECT_ID)");
    expect(DEFAULT_ASPECT_ID).toBe("9:16");
  });
});

describe("고른 비율이 화면까지 간다", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const images = read("app/reel/[id]/images/page.js");

  // ★ 컷 썸네일이 9/16 로 **박혀** 있었다. 가로 영상을 그 상자에 넣으면 잘려 보인다.
  //   비율의 출처는 프로젝트 하나여야 한다 — components/SubtitleEditor.jsx 가 먼저
  //   같은 처방을 썼다(--ar 을 화면이 실어 준다).
  it("컷 상자가 --ar 을 읽는다 — 9:16 은 그 기본값으로 남는다", () => {
    const at = css.indexOf(".cut-shot {");
    expect(at).toBeGreaterThan(-1);
    const body = css.slice(at, at + 400);
    expect(body).toMatch(/aspect-ratio:\s*var\(--ar/);
    expect(body, "옛 화면이 갑자기 넓어지면 안 된다").toMatch(/9\s*\/\s*16/);
  });

  it("③이미지 화면이 프로젝트 비율을 실어 준다", () => {
    expect(images).toContain("--ar");
  });
});

describe("격자는 비율마다 성립한다 — 열기 전에 실제로 잰다", () => {
  // ★★ 이것이 이 변경의 유일한 진짜 위험이었다. REEL_GRIDS 는 "칸이 9:16 일 때" 를
  //   전제로 전수조사한 표라, 다른 비율에서 칸이 깨지면 통짜 갈래의 근거가 무너진다.
  //   재 보니 성립한다 — 치수가 비율에서 나오기 때문이다(storyboardImageSize).
  it("어느 비율·화질에서도 캔버스가 모델 상한(3840) 안에 든다", () => {
    for (const a of ASPECTS) {
      for (const res of ["480p", "720p", "1080p"]) {
        for (const n of reelCutChoicesFor(res, a.id)) {
          const g = reelGridFor(n, { resolution: res, aspect: a.id });
          const { width, height } = storyboardImageSize(g, a.id, res);
          expect(Math.max(width, height), `${a.id} ${res} ${n}칸이 상한을 넘는다`).toBeLessThanOrEqual(3840);
        }
      }
    }
  });

  // ★★ 2026-08-25 — 옛 단정은 **결함을 기록한 것**이었다: 정사각·가로에서 10칸만 칸이
  //   768px 로 480p(854)에 못 미쳤다. 격자를 계산으로 바꾸면서 **그 결함 자체가 사라졌다**
  //   — 담기지 않는 칸 수는 애초에 목록에 안 들어간다. 그래서 단정을 뒤집는다:
  //   "미달이 이만큼 있다"가 아니라 **"미달이 없다"** 를 잰다.
  it("★★ 어느 비율·화질에서도 칸이 굽기 해상도 이상이다 — 미달이 0 이다", () => {
    const NEED = { "480p": 854, "720p": 1280, "1080p": 1920 };
    for (const a of ASPECTS) {
      for (const [res, need] of Object.entries(NEED)) {
        for (const n of reelCutChoicesFor(res, a.id)) {
          const g = reelGridFor(n, { resolution: res, aspect: a.id });
          const { width, height } = storyboardImageSize(g, a.id, res);
          const cellLong = Math.max(Math.round(width / g.cols), Math.round(height / g.rows));
          expect(cellLong, `${a.id} ${res} ${n}칸의 칸이 굽기보다 작다`).toBeGreaterThanOrEqual(need - 8);
        }
      }
    }
  });
});
