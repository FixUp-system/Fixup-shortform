// 화면 배선을 소스에서 판정한다(이 저장소에 React 렌더 테스트가 없다 —
// staleness-ui.test.js·quick-create-ui.test.js 와 같은 방식).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sidebar = strip(readFileSync("components/Sidebar.jsx", "utf8"));
const menu = strip(readFileSync("components/UserMenu.jsx", "utf8"));
const ctxSrc = strip(readFileSync("components/MeContext.jsx", "utf8"));
const quick = strip(readFileSync("components/QuickCreate.jsx", "utf8"));
const admin = strip(readFileSync("app/admin/page.js", "utf8"));
const create = strip(readFileSync("app/create/page.js", "utf8"));
const voice = strip(readFileSync("app/create/[id]/voice/page.js", "utf8"));
const images = strip(readFileSync("app/create/[id]/images/page.js", "utf8"));
const video = strip(readFileSync("app/create/[id]/video/page.js", "utf8"));
const script = strip(readFileSync("app/create/[id]/script/page.js", "utf8"));

describe("화면 — 크레딧", () => {
  it("편수로 말하지 않는다 — 정가가 길이마다 달라 'N편'은 거짓말이 된다", () => {
    expect(sidebar).not.toMatch(/편 남음/);
    expect(sidebar).not.toMatch(/videos_left/);
    expect(quick).not.toMatch(/videos_left/);
    expect(admin).not.toMatch(/videos_left/);
  });
  // 2026-08-07: 크레딧이 사이드바에서 상단 계정 바로 옮겨갔다. 판정 대상만 옮긴다 —
  // 이 단정을 지우면 "크레딧이 화면에서 사라지는" 회귀를 아무도 못 잡는다.
  // 2026-08-07(2차): 읽는 자리가 또 옮겨갔다 — 이제 GET /api/me 는 공유본
  // (components/MeContext.jsx)이 한 번만 읽고 상단 바가 그 값을 받는다.
  // 판정 대상만 따라 옮긴다: 잔액이 **서버 값**이라는 것과 화면에 남아 있다는 것.
  it("상단 계정 바가 잔액을 서버에서 읽어 크레딧으로 보여준다", () => {
    expect(menu).toMatch(/useMe\(\)/);
    expect(menu).toMatch(/me\.balance/);
    expect(ctxSrc).toMatch(/\/api\/me/);
  });
  it("요약 카드가 이 영상의 정가를 보여준다", () => {
    expect(quick).toMatch(/videoPrice/);
    expect(quick).toMatch(/크레딧/);
  });
  it("부족하면 만들기를 막는다 — 판정은 서버의 gated 와 정가를 함께 본다", () => {
    expect(quick).toMatch(/noCredits\s*=[^;]*credits\.gated/);
    expect(quick).toMatch(/credits\.balance\s*<\s*price/);
  });
  it("백오피스가 크레딧 단위로 충전한다", () => {
    expect(admin).toMatch(/credits/);
    expect(admin).toMatch(/reason/);
    expect(admin).toMatch(/DEFAULT_GRANT/);
  });
});

// 화면은 lib/pricing.js 만 import 한다. lib/charges.js 는 스토어(fs·supabase)를 끌고 와
// 클라이언트 번들을 오염시킨다 — pricing 은 import 0 개의 순수 모듈이라 안전하다.
describe("화면 — 가격표만 가져온다", () => {
  for (const [name, src] of [["QuickCreate", quick], ["admin", admin],
    ["voice", voice], ["images", images], ["video", video], ["script", script]]) {
    it(`${name} 는 lib/charges 를 import 하지 않는다`, () => {
      expect(src).not.toMatch(/from\s+["'][^"']*lib\/charges/);
    });
  }
});

// 서버(lib/pipeline.js·regen 라우트)는 이미 한 벌인데 화면만 3 을 손으로 적고 있었다.
// 상한이 바뀌면 화면이 조용히 거짓말을 한다 — 같은 표를 보게 한다.
describe("재생성 상한 — 화면도 가격표를 본다", () => {
  for (const [name, src] of [["voice", voice], ["images", images], ["video", video]]) {
    it(`${name} 화면이 MAX_REGEN_PER_CUT 를 쓴다`, () => {
      expect(src).toMatch(/MAX_REGEN_PER_CUT/);
      expect(src).not.toMatch(/>=\s*3\b/);
    });
  }
});

// ★ /voice 에 문이 생겨(requireVideoCharge) 과금 시점이 ④그림 → ③목소리로 앞당겨졌다.
// 화면이 그것을 알려야 한다 — 여기서 눌러야 돈이 나가기 때문이다.
describe("③목소리 — 과금 시점이 여기로 왔다", () => {
  it("시작 버튼에 정가를 적는다", () => {
    expect(voice).toMatch(/videoPrice/);
    expect(voice).toMatch(/크레딧/);
  });
  it("이미 산 프로젝트에는 적지 않는다 — 두 번 받는 것처럼 보인다", () => {
    expect(voice).toMatch(/charged/);
  });
  it("정가를 냈는지는 서버가 알려 준다 — 화면이 장부를 추측하지 않는다", () => {
    const route = strip(readFileSync("app/api/projects/[id]/route.js", "utf8"));
    expect(route).toMatch(/alreadyChargedVideo/);
    expect(route).toMatch(/charged/);
  });
});

describe("④이미지 — 정가·재생성 값", () => {
  it("시작 버튼에 정가를, 재생성 버튼에 재생성 값을 적는다", () => {
    expect(images).toMatch(/videoPrice/);
    expect(images).toMatch(/regenPrice/);
  });
});


// ★ 영상 모델은 **프로젝트를 만들 때 한 번** 고른다. 그 뒤로는 어디서도 못 바꾼다
// (2026-08-13 사용자 결정: "처음에 선택하면 변경할 수 없는 걸로").
//
// 왜 뒤에서 못 바꾸나: 모델이 정가를 정하는데(길이 × 모델) 정가는 ③목소리·④이미지에서
// 걷힌다. 뒤에서 바꾸면 낸 값과 만드는 값이 어긋난다 —
//   · Seedance 로 160 을 내고 Kling 으로 바꾸면 사장님이 110 크레딧을 잃는다
//   · Kling 으로 50 을 내고 Seedance 로 바꾸면 우리가 편당 ~$6 를 태운다
// 차액 정산은 만들지 않기로 했다(청구 장부가 회차·멱등키 기반이라 차액 개념이 없다).
// 게다가 만드는 중에 바뀌면 한 편에 두 모델이 섞인다.
describe("영상 모델은 만들 때 한 번 고른다", () => {
  it("자료 화면이 모델을 고르고 만들 때 함께 보낸다", () => {
    expect(create).toMatch(/I2V_MODELS/);
    expect(create).toMatch(/i2v_model/);
  });

  it("값·이름을 화면이 손으로 적지 않는다 — 표와 가격표에서 온다", () => {
    expect(create).toMatch(/videoPrice/);
    expect(create, "모델 이름을 화면에 박았다").not.toMatch(/Seedance|Kling/);
  });

  // ★ 뒤 단계는 모델을 **말하지도 않는다**(2026-08-13). 자료 화면에서 이미 골랐고,
  // 사장님에게 "Seedance 2.0" 이라는 이름은 아무 뜻이 없다 — 할 일 없는 줄을 지웠다.
  it("②대본은 모델을 말하지 않는다", () => {
    expect(script).not.toMatch(/saveModel/);
    expect(script).not.toMatch(/I2V_MODELS/);
  });

  it("⑤영상도 모델을 말하지 않는다", () => {
    expect(video).not.toMatch(/saveModel/);
    expect(video).not.toMatch(/i2v_model/);
    expect(video).not.toMatch(/I2V_MODELS/);
  });
});
