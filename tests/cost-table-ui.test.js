// 실제 비용 화면 — **내부 테스트 단계에서 모든 사용자가 본다**(2026-08-25 사장님 지시:
// "지금 비용표 실제 비용이라고 사이드바에 만들어서 모든 사용자가 볼 수 있게").
//
// ★ 여기서 못 박는 것은 셋이다:
//   ① 값을 **손으로 안 적는다**(estimateCost 한 자리에서 뽑는다)
//   ② 사이드바 링크가 **운영자 전용이 아니다**
//   ③ 크레딧을 말하지 않는다 — 이 화면은 원가만 말한다(두 장부는 단위부터 다르다)
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { estimateCost } from "../lib/costs.js";
import { costTableSections, IMAGE_ENDPOINT, IMAGE_QUALITY } from "../lib/cost-table.js";
import { FLOWS } from "../lib/costs-filter.js";
import { AD_MODELS, adSecondsFor, adResolutionsFor } from "../lib/ad/models.js";
import { REEL_MODEL_IDS, secondsForModel, resolutionsForModel } from "../lib/clip-limits.js";

const strip = (src) =>
  src
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const page = strip(readFileSync("app/cost-table/page.js", "utf8"));
const sidebar = strip(readFileSync("components/Sidebar.jsx", "utf8"));
const css = readFileSync("app/globals.css", "utf8");

describe("값의 출처", () => {
  it("★ 표를 손으로 적지 않는다 — estimateCost 에서 뽑는다", () => {
    expect(page).toContain("estimateCost");
    // 달러 숫자를 본문에 박아 두면 단가가 바뀌는 날 이 화면만 낡는다.
    expect(page, "값을 손으로 적은 자리가 있다").not.toMatch(/\$\d+\.\d\d/);
  });

  it("서버 컴포넌트다 — lib/costs.js 는 화면이 import 할 수 없다", () => {
    expect(page).not.toContain('"use client"');
    // 빌드 시점에 미리 굽지 않는다(그 사슬이 env 를 요구할 수 있다).
    expect(page).toContain('dynamic = "force-dynamic"');
  });
});

describe("무엇을 말하는 화면인가", () => {
  it("★ 크레딧 **값**을 보여 주지 않는다 — 원가만 말한다", () => {
    // ★ "크레딧이 아니라 원가예요"라고 **말하는 것**은 맞다 — 두 장부를 가르는 문장이다.
    //   막으려는 것은 크레딧 **숫자**가 이 표에 섞이는 것이다(단위가 달라 섞여 읽힌다).
    expect(page, "크레딧 값이 표에 섞였다").not.toMatch(/\d\s*크레딧/);
    expect(page).not.toContain("videoPrice");
    expect(page).not.toContain("priceLabel");
  });

  it("환율은 **기준일과 함께** 적는다 — 참고값이라 언제 것인지가 정확도보다 중요하다", () => {
    expect(page).toContain("USD_KRW");
    expect(page).toContain("RATE_AT");
    expect(page).toMatch(/기준/);
  });

  it("스토리보드가 한 장이라는 것을 말한다 — 컷 수와 무관하다", () => {
    expect(page).toContain("한 장");
  });
});

describe("사이드바", () => {
  it("★★ 운영자 전용이 아니다 — 모든 사용자가 본다", () => {
    const at = sidebar.indexOf('href="/cost-table"');
    expect(at, "사이드바에 링크가 없다").toBeGreaterThan(-1);
    // 앞 200자 안에 isAdmin 게이트가 있으면 지시가 통째로 무효가 된다.
    expect(sidebar.slice(Math.max(0, at - 200), at), "운영자 전용으로 잠겼다").not.toContain("isAdmin");
  });

  it("운영자 전용 [비용 기록](/costs)과 다른 자리다", () => {
    expect(sidebar).toContain('href="/costs"');
    expect(sidebar).toContain('href="/cost-table"');
  });
});

describe("표가 실제로 값을 낸다", () => {
  it("이미지 + 영상 = 합계다", () => {
    const img = estimateCost("openai/gpt-image", 1, "high");
    const vid = estimateCost("bytedance/seedance-2.0/reference-to-video", 15, "480p");
    expect(img).toBeGreaterThan(0);
    expect(vid).toBeGreaterThan(0);
    // 이 값이 화면의 첫 줄이 된다 — 표가 비면 여기서 먼저 걸린다.
    expect(img + vid).toBeCloseTo(2.42, 1);
  });
});

// ★★★ 2026-09-02 — **모드별로 가른다**(사장님 지시: "비용테이블도 갱신해줘 각 모드별로").
//
// 그전 표는 **손으로 적은 세 줄**이었고 **단계별만** 담고 있었다 — 원클릭이 통째로 빠져
// 있었다. 게다가 모델 이름이 "Seedance 2.0" 으로 박혀 있어, 08-31 에 이름을 등급으로
// 바꾼 뒤(기본·프로) 화면만 옛 이름을 말했다. 표를 손으로 적으면 그 표만 낡는다는 것을
// 이 화면 머리말이 이미 경고하고 있었는데 ROWS 가 정확히 그 상태였다.
//
// ★ 두 모드는 **드는 값이 다르다**: 단계별은 스토리보드를 한 장 굽고(편당 한 번),
//   원클릭은 사장님이 올린 사진을 그대로 넘긴다 — 이미지값이 아예 없다.
//   (lib/ad/ 에는 generateImage 호출이 없다. 굽는 자리는 lib/reel/storyboard.js 하나다.)
describe("비용표가 모드별로 갈린다", () => {
  const sections = costTableSections(estimateCost);
  const byId = (id) => sections.find((s) => s.id === id);

  it("★ 두 모드다 — 이름은 lib/costs-filter.js 의 FLOWS 하나에서 온다", () => {
    expect(sections.map((s) => s.id)).toEqual(["ad", "reel"]);
    for (const s of sections) {
      expect(s.label, `${s.id} 이름이 FLOWS 와 갈렸다`).toBe(FLOWS.find((f) => f.id === s.id).label);
    }
  });

  it("★★ 원클릭은 이미지값이 없다 — 사장님 사진을 그대로 쓴다(스토리보드를 안 굽는다)", () => {
    const ad = byId("ad");
    expect(ad.hasImage).toBe(false);
    for (const r of ad.rows) expect(r.image, `${r.label} ${r.seconds}초 에 이미지값이 붙었다`).toBe(0);
  });

  it("★★ 단계별은 스토리보드 **한 장**이 든다 — 컷 수와 무관하다", () => {
    const reel = byId("reel");
    const image = estimateCost(IMAGE_ENDPOINT, 1, IMAGE_QUALITY);
    expect(reel.hasImage).toBe(true);
    expect(image).toBeGreaterThan(0);
    for (const r of reel.rows) expect(r.image).toBeCloseTo(image, 6);
  });

  it("★★★ 각 모드는 **그 모드가 여는 모델만** 담는다 — 은퇴한 2.0 이 원클릭에 없다", () => {
    const open = AD_MODELS.filter((m) => !m.hidden).map((m) => m.id);
    expect([...new Set(byId("ad").rows.map((r) => r.modelId))]).toEqual(open);
    expect(byId("ad").rows.map((r) => r.modelId)).not.toContain("seedance-2.0");

    expect([...new Set(byId("reel").rows.map((r) => r.modelId))]).toEqual([...REEL_MODEL_IDS]);
    expect(byId("reel").rows.map((r) => r.modelId)).not.toContain("minimax-h3");
  });

  it("★ 길이·화질이 **그 모드의 표**와 같다 — 화면이 여는 조합과 어긋나면 안 된다", () => {
    for (const m of AD_MODELS.filter((x) => !x.hidden)) {
      const rows = byId("ad").rows.filter((r) => r.modelId === m.id);
      expect([...new Set(rows.map((r) => r.seconds))]).toEqual([...adSecondsFor(m.id)]);
      expect([...new Set(rows.map((r) => r.resolution))]).toEqual([...adResolutionsFor(m.id)]);
    }
    for (const id of REEL_MODEL_IDS) {
      const rows = byId("reel").rows.filter((r) => r.modelId === id);
      expect([...new Set(rows.map((r) => r.seconds))]).toEqual([...secondsForModel(id)]);
      expect([...new Set(rows.map((r) => r.resolution))]).toEqual([...resolutionsForModel(id)]);
    }
  });

  it("합계 = 이미지 + 영상이고, 영상값은 0 이 아니다", () => {
    for (const s of sections) {
      expect(s.rows.length).toBeGreaterThan(0);
      for (const r of s.rows) {
        expect(r.video, `${s.id} ${r.modelId} 영상값이 0`).toBeGreaterThan(0);
        expect(r.total).toBeCloseTo(r.image + r.video, 6);
      }
    }
  });

  it("★ 모델은 **등급 이름**으로 부른다 — 08-31 에 표에서 바꾼 그 이름이다", () => {
    for (const s of sections) for (const r of s.rows) {
      expect(r.label, `${r.modelId} 에 라벨이 없다`).toBeTruthy();
      expect(r.label, "옛 엔진 이름이 남았다").not.toMatch(/Seedance|MiniMax/i);
    }
  });

  it("★★ 화면이 조합을 손으로 안 적는다 — 엔드포인트·모델 id 가 화면에 없다", () => {
    expect(page).toContain("costTableSections");
    expect(page, "엔드포인트를 손으로 적었다").not.toContain("reference-to-video");
    expect(page, "모델 id 를 손으로 적었다").not.toMatch(/seedance-\d|minimax-h3/);
  });
});

describe("좁은 화면", () => {
  it("표만 옆으로 구른다 — 본문이 가로로 구르면 안 된다", () => {
    expect(css).toContain(".tablewrap");
    const at = css.indexOf(".tablewrap");
    expect(css.slice(at, at + 120)).toContain("overflow-x: auto");
  });
});

// ★★★ 2026-09-02 사장님 지적 — "원클릭과 단계별 영상의 ui 영역이 겹친다".
//
// 실측(개발 서버 · getBoundingClientRect): 원클릭 카드의 bottom 과 단계별 카드의 top 이
// **둘 다 619** 였다. 간격이 0 인 데다 배경이 둘 다 var(--surface) 라 두 모드가 한 덩어리로
// 읽혔고, 원클릭 표의 마지막 줄은 아래 선까지 없어서(costtable tbody tr:last-child)
// 단계별 제목이 그 표에 딸린 줄처럼 붙었다.
//
// 뿌리는 `.panel` 에 margin 이 아예 없다는 것이다 — 카드를 하나만 쓰는 화면이 대부분이라
// 그동안 안 드러났고, 이 화면이 카드 둘을 세로로 쌓는 첫 자리다.
//
// ★ 여기서 못 박는 것은 **떼어 놓는다는 사실**이지 픽셀이 아니다. 값은 사다리(--sp-*)가
//   정하고, 그 사다리를 쓰는지는 tests/control-scale.test.js 가 따로 잰다.
describe("두 모드는 떨어져 있다", () => {
  // ★ 선택자는 **줄 맨 왼쪽부터** 잡는다 — 주석 안에 같은 글자가 있어도 규칙으로 오인하지
  //   않는다(2026-09-01 에 소스 문자열 판이 하루 다섯 번 틀린 그 함정).
  const rule = (sel) => {
    const at = css.indexOf(`\n${sel} {`);
    return at === -1 ? "" : css.slice(at, css.indexOf("}", at));
  };

  it("★★ 모드 카드가 서로 붙지 않는다 — 간격 0 이면 한 덩어리로 읽힌다", () => {
    const r = rule(".cost-mode + .cost-mode");
    expect(r, "모드 카드를 떼어 놓는 규칙이 사라졌다").toBeTruthy();
    expect(r, "간격이 사다리(--sp-*)를 안 쓴다").toMatch(/margin-top:\s*var\(--sp-/);
  });

  it("★ 화면이 그 표시를 실제로 붙인다 — 규칙만 있고 안 붙이면 아무 일도 안 일어난다", () => {
    expect(page, "section 에 cost-mode 가 없다").toMatch(/className="panel panel--wide cost-mode"/);
  });

  it("★★ 전역 패널 간격을 건드려 푼 것이 아니다 — 다른 화면까지 함께 벌어진다", () => {
    // 패널을 여러 개 쌓는 화면이 여럿이다(app/reel/[id]/images 만 해도 10개).
    expect(rule(".panel + .panel"), "전역 패널 형제 규칙이 생겼다 — 다른 화면이 함께 바뀐다").toBe("");
  });
});
