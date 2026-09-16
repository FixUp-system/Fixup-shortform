// 보관함 카드·상세에 **모델 배지**를 붙인다(2026-09-16 사장님 지시).
//
// ★★★ 왜: 보관함에서 그 영상이 「기본」으로 만든 것인지 「프로」로 만든 것인지 알 수
//   없었다(2026-09-15 결정으로 카드는 썸네일만 남겼다). 모델을 비교하는 중이라 그 정보가
//   필요하다 — 사장님이 "카드와 상세 둘 다"를 골랐다.
//
// ★ 값이 사는 곳: 단계별(reel)은 settings.i2v_model(lib/clip-limits.js 의 I2V_MODELS),
//   원클릭(ad)은 settings.model(lib/ad/models.js 의 AD_MODELS). film·legacy 는 이 축이
//   없으므로 아무것도 그리지 않는다.
// ★ 옛 문서(값 없음)를 LEGACY_I2V_MODEL·LEGACY_AD_MODEL 로 추측하지 않는다 — 모르면 null.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { i2vModelLabelOf } from "../lib/clip-limits.js";
import { adModelLabelOf } from "../lib/ad/models.js";
import { createProject, listProjects } from "../lib/projects.js";
import { runWithActor } from "../lib/actor.js";

describe("i2vModelLabelOf — 있는 그대로만, 추측하지 않는다", () => {
  it("아는 모델은 표의 라벨 그대로다", () => {
    expect(i2vModelLabelOf("seedance-2.0")).toBe("기본");
    expect(i2vModelLabelOf("seedance-2.5")).toBe("프로");
    expect(i2vModelLabelOf("minimax-h3")).toBe("MiniMax H3");
    expect(i2vModelLabelOf("kling-v3")).toBe("Kling v3");
  });

  it("★ 값이 없거나 모르는 값은 null이다 — LEGACY_I2V_MODEL(kling-v3)로 떨어지지 않는다", () => {
    expect(i2vModelLabelOf(undefined)).toBeNull();
    expect(i2vModelLabelOf(null)).toBeNull();
    expect(i2vModelLabelOf("모르는모델")).toBeNull();
  });
});

describe("adModelLabelOf — 있는 그대로만, 추측하지 않는다", () => {
  it("아는 모델은 표의 라벨 그대로다", () => {
    expect(adModelLabelOf("minimax-h3")).toBe("기본");
    expect(adModelLabelOf("seedance-2.5")).toBe("프로");
  });

  it("★ 값이 없거나 모르는 값은 null이다 — LEGACY_AD_MODEL(seedance-2.0)로 떨어지지 않는다", () => {
    expect(adModelLabelOf(undefined)).toBeNull();
    expect(adModelLabelOf(null)).toBeNull();
    expect(adModelLabelOf("모르는모델")).toBeNull();
  });
});

describe("목록(listProjects)이 모델 값을 싣는다 — memory", () => {
  const U1 = "00000000-0000-4000-8000-0000000000b1";
  const U2 = "00000000-0000-4000-8000-0000000000b2";

  it("reel 은 i2v_model, ad 는 ad_model 을 값 그대로 돌려준다", async () => {
    const reel = await runWithActor(U1, () =>
      createProject({ ownerId: U1, kind: "reel", material: { text: "자료" }, settings: { i2v_model: "seedance-2.5" } })
    );
    const ad = await runWithActor(U1, () =>
      createProject({ ownerId: U1, kind: "ad", material: { text: "자료" }, settings: { model: "minimax-h3" } })
    );
    const rows = await runWithActor(U1, () => listProjects(U1));
    expect(rows.find((r) => r.id === reel.id).i2v_model).toBe("seedance-2.5");
    expect(rows.find((r) => r.id === ad.id).ad_model).toBe("minimax-h3");
  });

  it("값이 없는 프로젝트는 null 이다 — 추측하지 않는다", async () => {
    const p = await runWithActor(U2, () =>
      createProject({ ownerId: U2, kind: "reel", material: { text: "자료" }, settings: {} })
    );
    const rows = await runWithActor(U2, () => listProjects(U2));
    const row = rows.find((r) => r.id === p.id);
    expect(row.i2v_model ?? null).toBeNull();
    expect(row.ad_model ?? null).toBeNull();
  });
});

describe("목록(listProjects) — supabase 셀렉트에 모델 두 칸이 있다", () => {
  it("★ i2v_model·ad_model 을 doc.settings 에서 실어 온다", async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role";
    const src = readFileSync("lib/store/supabase.js", "utf8");
    // listProjects 함수 본문만 잘라 본다 — listAllProjects 와 섞여 다른 함수까지
    // 통과한 것처럼 보이면 안 된다.
    const at = src.indexOf("async listProjects(ownerId");
    expect(at, "listProjects 를 못 찾았다").toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("\n  },", at));
    expect(body).toMatch(/i2v_model:doc->settings->>i2v_model/);
    expect(body).toMatch(/ad_model:doc->settings->>model/);
    expect(body).toMatch(/i2v_model:\s*r\.i2v_model \|\| null/);
    expect(body).toMatch(/ad_model:\s*r\.ad_model \|\| null/);
  });
});

describe("카드 — 썸네일에 모델 배지를 그린다", () => {
  const strip = (s) => s
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const cards = strip(readFileSync("components/ProjectCards.jsx", "utf8"));
  const css = readFileSync("app/globals.css", "utf8");
  const rule = (sel) => {
    const at = css.indexOf(`${sel} {`);
    return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
  };

  it("★ 화면이 표의 라벨 접근자를 쓴다 — 화면에 id→라벨 표를 새로 짓지 않는다", () => {
    expect(cards).toMatch(/i2vModelLabelOf/);
    expect(cards).toMatch(/adModelLabelOf/);
  });

  it("★ film·legacy(kind 가 reel·ad 가 아님)는 배지가 없다", () => {
    // reel·ad 갈래로만 라벨을 구하고, 그 밖은 null 로 떨어지는 삼항이어야 한다.
    const at = cards.indexOf("modelLabel");
    expect(at, "modelLabel 계산을 못 찾았다").toBeGreaterThan(-1);
    const expr = cards.slice(at, cards.indexOf(";", at) + 1);
    expect(expr).toMatch(/kind === "reel"/);
    expect(expr).toMatch(/kind === "ad"/);
  });

  it("★ 상태 태그(왼쪽 위)·지우기/체크(오른쪽 위)와 겹치지 않는 자리다", () => {
    // 기존 두 자리는 top:8px 다(왼쪽·오른쪽). 모델 배지는 인라인 스타일이 아니라
    // .thumb-tag 를 재사용하는 CSS 수식자(model-badge)로 top 을 비우고 bottom 으로 옮긴다
    // (이 저장소는 인라인 style 총량을 10곳으로 막는다 — tests/design-system.test.js).
    const at = cards.indexOf("model-badge");
    expect(at, "모델 배지 자리를 못 찾았다(model-badge 표시가 없다)").toBeGreaterThan(-1);
    const span = cards.slice(cards.lastIndexOf("<span", at), cards.indexOf(">", at) + 1);
    expect(span, "기존 thumb-tag 배지 모양을 재사용한다").toMatch(/className="thumb-tag model-badge"/);
    expect(span, "인라인 스타일로 자리를 옮기지 않는다").not.toMatch(/style=/);
    const mod = rule(".thumb-tag.model-badge");
    expect(mod, "model-badge 수식자 규칙이 없다").toMatch(/bottom:\s*8px/);
  });

  it("★ .thumb-tag 규칙 자체는 새로 안 만든다 — 이미 있는 배지 모양을 그대로 쓴다", () => {
    expect(rule(".thumb-tag")).toContain("position: absolute");
  });
});

describe("상세 — reel 도 모델 칩을 그린다(원클릭과 같은 값 규칙)", () => {
  const src = readFileSync("app/archive/[id]/page.js", "utf8");
  const code = src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("★ modelLabel 계산이 reel 갈래에서 i2vModelLabelOf(s.i2v_model)을 쓴다", () => {
    const at = code.indexOf("const modelLabel");
    expect(at, "modelLabel 을 못 찾았다").toBeGreaterThan(-1);
    const expr = code.slice(at, code.indexOf(";", at));
    expect(expr).toMatch(/isReel/);
    expect(expr).toMatch(/i2vModelLabelOf\(s\.i2v_model\)/);
  });

  it("film·legacy 는 여전히 null 이다", () => {
    const at = code.indexOf("const modelLabel");
    const expr = code.slice(at, code.indexOf(";", at));
    expect(expr).toMatch(/isFilm/);
    expect(expr.trim().endsWith(": null")).toBe(true);
  });
});
