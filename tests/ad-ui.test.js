// 화면 테스트 — 이 저장소는 렌더링 하네스가 없어 소스를 읽어 판정한다
// (tests/staleness-ui.test.js · tests/credits-ui.test.js 방식).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/ads/new/page.js", "utf8");
// /ads/[id] — 상태 넷(draft·scenario·rendering·done)을 한 화면이 다룬다.
const detailSrc = readFileSync("app/ads/[id]/page.js", "utf8");
// 보관함 카드 — 종류(kind)로 갈라 그리는지.
const cardsSrc = readFileSync("components/ProjectCards.jsx", "utf8");

describe("/ads/new 화면", () => {
  it("클라이언트 컴포넌트로 시작한다", () => {
    expect(src.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("옵션 세 축(포맷·분위기·언어)을 표에서 읽는다 — 라벨을 화면에 복사하지 않는다", () => {
    expect(src).toMatch(/from ["'][./]*lib\/ad\/options["']/);
    expect(src).toContain("AD_FORMATS");
    expect(src).toContain("AD_MOODS");
    expect(src).toContain("AD_LANGS");
    // 라벨을 복사하면 표와 갈린다 — 세 축에서 하나씩 대표로 확인한다
    expect(src).not.toContain("제품 히어로");
    expect(src).not.toContain("고급스러운");
    expect(src).not.toContain("한국어");
  });

  it("사이즈는 lib/aspects 의 ASPECTS 에서 읽는다", () => {
    expect(src).toMatch(/from ["'][./]*lib\/aspects["']/);
    expect(src).toContain("ASPECTS");
    // 라벨+id 조합을 손으로 적으면 아래 세 값이 늘거나 바뀔 때 화면만 낡는다
    expect(src).not.toContain("세로 · 9:16");
  });

  it("화풍은 STYLE_PRESETS 에서 라벨을 읽되 AD_STYLE_LINES 에 있는 id 로 실제로 거른다", () => {
    expect(src).toMatch(/from ["'][./]*lib\/styles["']/);
    expect(src).toContain("STYLE_PRESETS");
    // import 만 하고 그대로 다 보여주면, styles.js 에 화풍이 늘고 lib/ad/options.js 의
    // AD_STYLE_LINES 가 아직 안 따라온 순간 사장님이 고른 화풍을 서버가 400 으로 거절한다.
    // 그래서 "필터를 실제로 하는가"까지 구조로 확인한다(단순 import 존재만으로는 부족하다).
    const filterIdx = src.indexOf("STYLE_PRESETS.filter(");
    expect(filterIdx, "STYLE_PRESETS 를 거르지 않고 그대로 쓴다").toBeGreaterThan(-1);
    const filterCall = src.slice(filterIdx, filterIdx + 150);
    expect(filterCall, "필터 조건에 AD_STYLE_LINES 가 없다").toContain("AD_STYLE_LINES");
    // 화풍 라벨을 화면에 그대로 박지 않았는지도 확인한다
    expect(src).not.toContain("배경 없는 깔끔한 사진");
  });

  it("가격을 화면에 박지 않는다 — 이 화면은 무료다", () => {
    expect(src).not.toMatch(/\b65\b/);
  });

  it("새 CSS 파일을 만들지 않았다", () => {
    expect(src).not.toMatch(/\.css["']/);
  });

  it("사진은 서버와 같은 상한(4장)을 쓰고, 넘는 선택은 실제로 자른다", () => {
    expect(src).toMatch(/MAX_PHOTOS\s*=\s*4/);
    // 상수만 있고 안 쓰면 사장님이 5장을 골라도 전부 업로드된 뒤 서버 400 을 만난다.
    // slice 로 실제로 자르는지까지 구조로 확인한다.
    expect(src).toMatch(/files\.slice\(0,\s*Math\.max\(room,\s*0\)\)/);
    expect(src).toMatch(/disabled=\{photos\.length >= MAX_PHOTOS\}/);
  });

  it("사진은 기존 업로드 라우트(POST /api/uploads)로 올린다", () => {
    expect(src).toContain('fetch("/api/uploads"');
  });

  it("[시나리오 만들기]가 POST /api/ads → POST /api/ads/<id>/scenario → /ads/<id> 순서로 이어진다", () => {
    const adsPostIdx = src.indexOf('fetch("/api/ads"');
    const scenarioIdx = src.indexOf("/scenario`");
    const pushIdx = src.indexOf("router.push(`/ads/");
    expect(adsPostIdx, "POST /api/ads 호출이 없다").toBeGreaterThan(-1);
    expect(scenarioIdx, "POST /api/ads/<id>/scenario 호출이 없다").toBeGreaterThan(adsPostIdx);
    expect(pushIdx, "/ads/<id> 로 이동하는 코드가 없다").toBeGreaterThan(scenarioIdx);
  });

  it("둘 중 하나라도 실패하면 이동하지 않는다 — 실패 판정이 router.push 보다 앞에 있다", () => {
    const pushIdx = src.indexOf("router.push(`/ads/");
    const firstCheck = src.indexOf("if (!res.ok)");
    const secondCheck = src.indexOf("if (!res2.ok)");
    expect(firstCheck, "첫 번째 응답의 성공 여부를 안 본다").toBeGreaterThan(-1);
    expect(secondCheck, "두 번째 응답(시나리오)의 성공 여부를 안 본다").toBeGreaterThan(-1);
    expect(firstCheck).toBeLessThan(pushIdx);
    expect(secondCheck).toBeLessThan(pushIdx);
  });

  it("400 응답의 error 문구를 그대로 화면에 띄운다 — 두 호출 모두", () => {
    expect(src).toMatch(/setErr\(data\.error/);
    expect(src).toMatch(/setErr\(data2\.error/);
    expect(src).toContain("{err &&");
  });
});

describe("/ads/[id] 화면", () => {
  it("클라이언트 컴포넌트로 시작한다", () => {
    expect(detailSrc.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("가격 문구를 pricing 에서 읽는다 — 숫자를 화면에 박지 않는다", () => {
    expect(detailSrc).toMatch(/from ["'].*lib\/pricing/);
    expect(detailSrc).toMatch(/priceLabel|adVideoPrice/);
    expect(detailSrc).not.toMatch(/["']65 크레딧["']/);
    // 위 단정은 "따옴표로 감싼 65 크레딧" 문자열만 막는다 — 숫자 65 를 다른 모양
    // (템플릿 리터럴 조각·주석)으로 박아도 통과해 버린다. 화면 전체에서 그 숫자 자체를
    // 막아야 "가격은 pricing.js 하나뿐"이 실제로 지켜진다(app/ads/new/page.js 의
    // 같은 이름 테스트와 같은 강도로 맞춘다).
    expect(detailSrc).not.toMatch(/\b65\b/);
  });

  it("상태 넷을 실제로 가른다 — view 값과 비교하는 자리가 있다", () => {
    // "draft"라는 낱말이 주석에만 있어도 toContain은 통과한다. 그 상태의 화면이
    // 실제로 존재한다는 증거는 status 를 그 값과 비교(===)하는 조건문이다.
    for (const s of ["draft", "scenario", "rendering", "done"]) {
      expect(detailSrc, `"${s}" 라는 낱말이 없다`).toContain(s);
      // ★ 2026-08-13: 분기가 **보는 단계(view)** 를 본다 — 주소의 ?step 으로 지나온 단계를
      // 다시 볼 수 있게 됐기 때문이다. 진짜 status 는 폴링·자동 진행이 그대로 쓴다.
      expect(detailSrc, `view === "${s}" 비교가 없다 — 그 상태를 실제로 안 다룰 수 있다`)
        .toMatch(new RegExp(`view\\s*===\\s*["']${s}["']`));
    }
  });

  it("굽는 동안 status 를 2초마다 편다", () => {
    expect(detailSrc).toContain("/status");
    // "/status"라는 문자열만 있고 폴링 자체가 없거나 다른 주기를 쓸 수도 있다 —
    // 기존 화면들과 같은 2000ms 를 실제로 setInterval 에 넘기는지까지 본다.
    expect(detailSrc).toMatch(/POLL_MS\s*=\s*2000/);
    expect(detailSrc).toMatch(/setInterval\([\s\S]*?,\s*POLL_MS\)/);
  });

  it("[이대로 만들기]·[다시 만들기]가 유료 라우트(POST /api/ads/<id>/render)를 부른다", () => {
    expect(detailSrc).toMatch(/\/render`,\s*\{\s*method:\s*["']POST["']/);
  });

  it("[시나리오 만들기]·[다시 쓰기]가 같은 무료 라우트(POST /api/ads/<id>/scenario)를 쓴다", () => {
    expect(detailSrc).toMatch(/\/scenario`,\s*\{\s*method:\s*["']POST["']/);
  });

  it("[다시 쓰기]가 무료라고 밝힌다 — 값이 다른 버튼을 사장님이 구별해야 한다", () => {
    expect(detailSrc).toMatch(/다시\s*쓰기[\s\S]{0,20}무료|무료[\s\S]{0,20}다시\s*쓰기/);
  });

  it("video_error 를 화면에서 읽는다 — 배경 실패(fire-and-forget)가 사장님에게 보인다", () => {
    // doc 통짜가 아니라 /status 응답의 error 를 project.video_error 로 옮겨 담고,
    // 그 값을 실제로 화면에 그리는지를 함께 본다(단순 존재만으로는 안 그릴 수 있다).
    expect(detailSrc).toMatch(/video_error/);
    expect(detailSrc).toMatch(/\{video_error\s*&&/);
  });

  it("400/402 응답의 error 문구를 그대로 띄운다", () => {
    expect(detailSrc).toMatch(/setErr\(data\.error/);
  });

  it("새 CSS 파일을 만들지 않았다", () => {
    expect(detailSrc).not.toMatch(/\.css["']/);
  });
});

describe("보관함 카드", () => {
  it("종류를 실제로 갈라 그린다 — kind 값 비교가 href 를 가른다", () => {
    // "kind"라는 낱말은 주석에도 나올 수 있어 그것만으로는 증거가 안 된다.
    // kind 값을 실제로 비교하는 조건이 있고, 광고 문서용 경로와 기존 경로가 둘 다
    // 남아 있는지(기존 동작을 안 지웠는지)까지 구조로 확인한다.
    expect(cardsSrc).toMatch(/kind\s*===\s*["']ad["']/);
    expect(cardsSrc).toContain("/ads/${p.id}");
    expect(cardsSrc).toContain("/create/${p.id}");
  });

  it("광고 카드는 /ads/ 로 간다", () => {
    expect(cardsSrc).toContain("/ads/");
  });

  it("kind 가 없는(=옛) 문서는 기존 라벨 표(STATUS_LABEL)를 그대로 쓴다 — 새 표로 안 바꿔치기했다", () => {
    expect(cardsSrc).toContain("STATUS_LABEL[p.status]");
  });
});

describe("/ads/[id] 화면 — 모르는 status 에도 화면이 비지 않는다", () => {
  // 리뷰 지적: status===draft/scenario/rendering/(done&&video) 넷으로만 분기하면,
  // 다섯째 값이 생기거나 done인데 video가 없을 때 <h1>과 오류 배너만 남고 사장님이
  // 할 수 있는 게 없다. 기본(catch-all) 갈래가 있고, 그걸 지우면 이 테스트가 실패해야 한다.

  it("네 상태 판정이 draft·scenario·rendering·done+video 를 전부 부정해야 기본 갈래로 떨어진다", () => {
    // "handled" 라는 이름 자체가 아니라, 그 판정식이 실제로 네 상태를 전부 포함하는지가
    // 증거다 — 판정식에서 하나라도 빠지면 그 상태가 조용히 빈 화면으로 샌다.
    const handledIdx = detailSrc.search(/const\s+handled\s*=/);
    expect(handledIdx, "'handled' 판정식이 없다 — 기본 갈래를 무엇이 트리거하는지 알 수 없다").toBeGreaterThan(-1);
    const semiIdx = detailSrc.indexOf(";", handledIdx);
    const handledExpr = detailSrc.slice(handledIdx, semiIdx + 1);
    for (const s of ["draft", "scenario", "rendering", "done"]) {
      expect(handledExpr, `handled 판정에 "${s}" 가 없다 — 그 상태가 기본 갈래로 새는지 못 막는다`).toContain(s);
    }
    // 리뷰가 짚은 두 번째 함정: status==="done" 인데 video 가 없는 경우도 기본 갈래로 가야 한다.
    expect(handledExpr, "done 판정이 video 유무를 안 본다 — done인데 video 없으면 여전히 빈 화면이다")
      .toMatch(/video/);
  });

  it("기본 갈래(!handled)가 실제로 존재하고, 네 상태 블록보다 뒤에 있다", () => {
    // "!handled" 문자열은 이 파일에서 기본 갈래 렌더링 한 곳에서만 쓰인다 — 지우면 실패한다.
    const fallbackIdx = detailSrc.indexOf("!handled");
    expect(fallbackIdx, "!handled 로 그리는 기본 갈래가 없다").toBeGreaterThan(-1);
    // done 블록(JSX)의 조건은 "status === \"done\" && video"(느낌표 없이) — handled 판정식의
    // "&& !!video"와는 다른 문자열이라 서로 안 헷갈린다. 기본 갈래가 그보다 뒤에 있어야
    // "네 블록을 다 지나온 다음의 catch-all"이라는 구조가 성립한다.
    const doneBlockIdx = detailSrc.indexOf('view === "done" && video');
    expect(doneBlockIdx, "done 블록의 JSX 조건을 못 찾았다").toBeGreaterThan(-1);
    expect(fallbackIdx).toBeGreaterThan(doneBlockIdx);
  });

  it("기본 갈래에 누를 것이 하나는 있다 — 최소한 보관함으로 나갈 수 있다", () => {
    const fallbackIdx = detailSrc.indexOf("!handled");
    expect(fallbackIdx).toBeGreaterThan(-1);
    const fallbackBlock = detailSrc.slice(fallbackIdx);
    // 버튼이나 링크가 하나도 없으면 "화면이 안 비지만 누를 게 없다"는 반쪽짜리 수정이다.
    expect(fallbackBlock, "기본 갈래에 버튼도 링크도 없다").toMatch(/<button\b|<Link\b|<a\b/);
    // 그중 하나는 보관함으로 돌아가는 길이어야 한다 — 막다른 골목이면 안 된다.
    expect(fallbackBlock, "보관함으로 돌아가는 길이 없다").toMatch(/\/archive/);
  });

  it("기본 갈래도 지금 상태를 사장님이 알아볼 말로 보여준다", () => {
    const fallbackIdx = detailSrc.indexOf("!handled");
    const fallbackBlock = detailSrc.slice(fallbackIdx, fallbackIdx + 400);
    expect(fallbackBlock).toMatch(/status/);
  });
});

// Task 22 — /ads/new 에 모델·길이 선택을 붙인다. 백엔드(73b201c)는 이미
// lib/ad/models.js·lib/api/ads/route.js 가 model·seconds 를 받는데 화면에 고르는 자리가 없었다.
describe("/ads/new 화면 — 모델·길이 선택 (Task 22)", () => {
  it("모델 칩이 lib/ad/models 의 AD_MODELS 에서 온다 — 라벨을 화면에 복사하지 않는다", () => {
    expect(src).toMatch(/from ["'][./]*lib\/ad\/models["']/);
    expect(src).toContain("AD_MODELS");
    // ★ 숨김이 생기며 AD_MODELS.filter(...).map( 이 됐다(2026-08-13). "표에서 그린다"는
    // 계약은 그대로다 — 기준점만 넓힌다.
    const mapIdx = src.search(/AD_MODELS(\.filter\(.*?\))?\.map\(/);
    expect(mapIdx, "AD_MODELS 에서 그리지 않는다").toBeGreaterThan(-1);
    // 모델 표의 hint 문구(모델별로 다른 값)를 그대로 베끼면 모델이 하나 늘 때 화면만 낡는다
    expect(src).not.toContain("소리까지 한 번에");
    expect(src).not.toContain("네이티브 오디오");
  });

  it("길이 칩이 adSecondsFor(model) 에서 온다 — 배열을 손으로 적지 않는다", () => {
    expect(src).toMatch(/adSecondsFor\(model\)\.map\(/);
  });

  it("모델을 바꾸면 지금 고른 길이가 그 모델에서 유효한지 실제로 되돌린다", () => {
    // onModelChange 가 없으면 모델 칩이 setModel 만 부르고 끝나 — 2.5에서 30초를 고르고
    // 2.0으로 바꿔도 30초가 그대로 남아 [시나리오 만들기]가 서버 400을 받는다.
    const fnIdx = src.search(/function\s+onModelChange\s*\(/);
    expect(fnIdx, "onModelChange 함수가 없다").toBeGreaterThan(-1);
    const bodyEnd = src.indexOf("\n}", fnIdx);
    const body = src.slice(fnIdx, bodyEnd);
    expect(body, "되돌림 판정에 isAdSeconds 를 안 쓴다 — 무엇이 유효한지 직접 다시 만들었을 수 있다")
      .toContain("isAdSeconds");
    expect(body, "되돌릴 값이 adSecondsFor(id)[0] 가 아니다 — 그 모델이 실제로 받는 값이 아닐 수 있다")
      .toMatch(/adSecondsFor\(id\)\[0\]/);
    // 모델 칩의 onClick 이 이 함수를 실제로 부르는지 — 안 부르면 죽은 코드다
    const modelChipIdx = src.search(/AD_MODELS(\.filter\(.*?\))?\.map\(/);
    const modelChipBlock = src.slice(modelChipIdx, modelChipIdx + 300);
    expect(modelChipBlock, "모델 칩 onClick 이 onModelChange 를 안 부른다").toMatch(/onClick=\{[^}]*onModelChange/);
  });

  // ★ Task 24 — 해상도가 셋째 인자다. 길이 칩은 "지금 고른 해상도" 기준 정가를 보여준다.
  it("길이 칩마다 정가를 priceLabel(adVideoPrice(...)) 로 보여준다 — 숫자를 박지 않는다", () => {
    expect(src).toMatch(/priceLabel\(adVideoPrice\(s,\s*model,\s*resolution\)\)/);
    // 65(2.0-fast/15초)·35/80/175(standard/15초 480p·720p·1080p)·55/120(2.5/15초 480p·720p)·
    // 110/240(2.5/30초 480p·720p) — 정가 숫자가 소스에 문자 그대로 없어야 "가격은
    // pricing.js 하나뿐"이 실제로 지켜진다.
    for (const n of [65, 35, 80, 175, 55, 120, 110, 240]) {
      expect(src, `가격 ${n} 이 소스에 그대로 있다`).not.toMatch(new RegExp(`\\b${n}\\b`));
    }
  });

  // ★ Task 24 — 해상도 칩. 모델·길이 칩과 같은 결(표에서 읽고, 정가를 같이 보여준다).
  it("해상도 칩이 lib/ad/models 의 adResolutionsFor(model) 에서 온다 — 배열을 손으로 안 적는다", () => {
    expect(src).toMatch(/adResolutionsFor\(model\)\.map\(/);
  });

  it("해상도 칩마다 정가를 priceLabel(adVideoPrice(...)) 로 보여준다", () => {
    expect(src).toMatch(/priceLabel\(adVideoPrice\(seconds,\s*model,\s*r\)\)/);
  });

  it("모델을 바꾸면 지금 고른 해상도가 그 모델에서 유효한지 실제로 되돌린다", () => {
    const fnIdx = src.search(/function\s+onModelChange\s*\(/);
    expect(fnIdx, "onModelChange 함수가 없다").toBeGreaterThan(-1);
    const bodyEnd = src.indexOf("\n}", fnIdx);
    const body = src.slice(fnIdx, bodyEnd);
    expect(body, "되돌림 판정에 isAdResolution 을 안 쓴다").toContain("isAdResolution");
    expect(body, "되돌릴 값이 adResolutionsFor(id)[0] 가 아니다").toMatch(/adResolutionsFor\(id\)\[0\]/);
  });

  it("[시나리오 만들기]가 고른 resolution 을 서버로 보낸다", () => {
    const submitIdx = src.indexOf("async function submit()");
    expect(submitIdx, "submit 함수를 못 찾았다").toBeGreaterThan(-1);
    const bodyEnd = src.indexOf("async function", submitIdx + 10);
    const body = src.slice(submitIdx, bodyEnd === -1 ? undefined : bodyEnd);
    expect(body, "settings 에 resolution 을 안 보낸다").toMatch(/settings:\s*\{[^}]*\bresolution\b/);
  });

  it("[시나리오 만들기]가 고른 model·seconds 를 서버로 보낸다", () => {
    const submitIdx = src.indexOf("async function submit()");
    expect(submitIdx, "submit 함수를 못 찾았다").toBeGreaterThan(-1);
    const bodyEnd = src.indexOf("async function", submitIdx + 10);
    const body = src.slice(submitIdx, bodyEnd === -1 ? undefined : bodyEnd);
    expect(body, "settings 에 model 을 안 보낸다").toMatch(/settings:\s*\{[^}]*\bmodel\b/);
    expect(body, "settings 에 seconds 를 안 보낸다").toMatch(/settings:\s*\{[^}]*\bseconds\b/);
  });
});

// Task 22 — /ads/[id] 시나리오 카드에 연출 필드(조명·음향·초)를 붙이고, 모델을 보여준다.
describe("/ads/[id] 화면 — 연출 필드·모델 표시 (Task 22)", () => {
  it("초는 있을 때만 그린다 — Number.isFinite 가드", () => {
    expect(detailSrc).toMatch(/\{Number\.isFinite\(shot\.seconds\)\s*&&/);
  });

  it("조명·음향은 각각 있을 때만 한 줄로 그린다", () => {
    // ★ 컷 편집이 붙으며 가드가 (editing || shot.X) 로 넓어졌다 — **편집 중에만** 빈 줄을
    // 그린다(옛 시나리오에 조명·음향이 없으면 채워 넣을 길이 없어서다). 볼 때의 계약은
    // 그대로다: 값이 없으면 안 그린다.
    expect(detailSrc, "shot.lighting 가드가 없다").toMatch(/\(editing \|\| shot\.lighting\)\s*&&/);
    expect(detailSrc, "shot.sound 가드가 없다").toMatch(/\(editing \|\| shot\.sound\)\s*&&/);
  });

  it("기존 beat·camera·action·line 필드는 그대로 남아 있다", () => {
    for (const label of ["비트", "카메라", "동작", "대사"]) {
      expect(detailSrc, `"${label}" 필드가 사라졌다`).toContain(label);
    }
  });

  it("이 프로젝트의 모델을 lib/ad/models 의 adModel 로 읽어 보여준다", () => {
    expect(detailSrc).toMatch(/from ["'].*lib\/ad\/models["']/);
    expect(detailSrc).toMatch(/adModel\(settings\?\.model\)/);
  });

  it("가격 계산에 모델과 **화질**을 함께 넘긴다 — 안 넘기면 화면만 싼 값을 말한다", () => {
    // ★ 실사용에서 잡았다(2026-08-13): 1080p 를 골라도 이 화면은 720p 값을 띄웠다.
    // 실제 청구는 맞았다(app/api/ads/[id]/render/route.js·lib/charges.js 가 세 인자를
    // 다 넘긴다) — **화면만** 낮게 말해서, 사장님이 본 값과 빠져나간 값이 갈렸다.
    // 화면이 값을 스스로 만들지 않는다는 규약은 지켰는데도 인자 하나로 뚫린 자리다.
    expect(detailSrc).toMatch(
      /adVideoPrice\(settings\?\.seconds,\s*settings\?\.model,\s*settings\?\.resolution\)/
    );
  });
});

// ★ 컷 편집 — 사장님이 시나리오를 보고 그 자리에서 고친다.
//
// 이 저장소의 화면 계약은 소스 문자열을 읽어 잰다. 그래서 "편집이 실제로 동작하는가"는
// 못 재고, **편집을 여는 배선이 있는가**를 잰다. 아래 단정 하나하나가 사라지면 정확히
// 그 배선이 끊긴 것이다.
describe("/ads/[id] — 컷 편집", () => {
  it("[수정하기]가 장면 목록보다 위에 있다 — 1번 장면 앞이어야 손이 먼저 닿는다", () => {
    expect(detailSrc).toContain("수정하기");
    const editBtn = detailSrc.indexOf("수정하기");
    const shotList = detailSrc.indexOf("plan-list");
    expect(editBtn).toBeGreaterThan(-1);
    expect(shotList).toBeGreaterThan(-1);
    expect(editBtn, "[수정하기]가 장면 목록 아래에 있다").toBeLessThan(shotList);
  });

  it("★ 필드가 실제로 열린다 — contentEditable 없이 .editable 만 붙이면 모양만 편집이다", () => {
    // 이 화면은 편집 기능 이전에도 className="editable" 을 쓰고 있었다(스타일만).
    // 진짜 편집은 contentEditable 이 가른다 — app/create/[id]/script/page.js 와 같은 패턴.
    expect(detailSrc, "contentEditable 이 없다 — 모양만 편집이다").toContain("contentEditable");
    expect(detailSrc).toContain("suppressContentEditableWarning");
  });

  it("★ 초는 안 연다 — 합이 전체 길이를 깨는 자리다", () => {
    // 초 배지는 그리되(badge), 그 자리에 contentEditable 이 붙으면 안 된다
    const secondsLine = detailSrc.split("\n").find((l) => l.includes("shot.seconds") && l.includes("badge"));
    expect(secondsLine, "초 배지를 못 찾겠다").toBeTruthy();
    expect(secondsLine).not.toContain("contentEditable");
  });

  it("편집한 컷을 shots 로 실어 시나리오 라우트에 보낸다 — 안 보내면 화면 장식이다", () => {
    expect(detailSrc).toMatch(/\/api\/ads\/\$\{id\}\/scenario/);
    expect(detailSrc, "고친 shots 를 body 로 안 보낸다").toMatch(/body:.*shots/s);
  });

  it("되돌리기 라우트를 부른다", () => {
    expect(detailSrc).toMatch(/\/api\/ads\/\$\{id\}\/scenario\/undo/);
    expect(detailSrc).toContain("되돌리기");
  });

  it("★ 되돌리기는 되돌릴 것이 있을 때만 보인다 — 없는 길을 띄우지 않는다", () => {
    expect(detailSrc).toMatch(/scenario\?\.prev\s*&&/);
  });

  it("★ 편집 중에는 유료 버튼([이대로 만들기])을 감춘다 — 값이 나가는 문을 열어두지 않는다", () => {
    expect(detailSrc).toMatch(/!editing\s*&&[\s\S]{0,400}이대로 만들기/);
  });

  it("★ done 에서는 [수정하기]가 없다 — 완성본을 실수로 되돌리지 않는다", () => {
    // done 갈래에 편집 배선이 없어야 한다.
    // ★ 'view === "done"' 으로 자르면 안 된다 — 그 문자열은 위쪽 handled 계산에도 있어서
    //   시나리오 갈래까지 통째로 잘려 들어온다(처음에 그렇게 써서 헛되이 실패했다).
    const doneStart = detailSrc.indexOf('view === "done" && video &&');
    expect(doneStart).toBeGreaterThan(-1);
    expect(detailSrc.slice(doneStart)).not.toContain("수정하기");
  });
});

// ★ 실제 화면에서 잡은 결함(2026-08-13) — 편집을 켜면 같은 문구의 버튼이 둘이 됐고,
// 그중 하나는 편집분을 **안 싣고** 보내 사장님이 고친 것이 조용히 사라졌다.
// 소스 훑기도 빌드도 못 잡는 자리라(문법은 멀쩡하다) 계약으로 박아 둔다.
describe("/ads/[id] — 편집 중 버튼", () => {
  it("★ 편집 중에는 '그냥 다시 쓰기'가 없다 — 누르면 고친 것이 말없이 사라지는 문이다", () => {
    // 자유 재작성 버튼은 편집이 꺼져 있을 때만 그린다
    expect(detailSrc).toMatch(/\{!editing\s*&&[\s\S]{0,300}다시 쓰기 · 무료/);
  });

  it("편집 중 값을 보내는 버튼은 하나뿐이다 — 두 개면 어느 것이 반영하는지 알 수 없다", () => {
    // 라벨만 센다(화살표까지) — 주석에도 같은 말이 나와서 낱말만 세면 주석을 센다
    const labels = detailSrc.match(/고친 대로 다시 쓰기 →/g) || [];
    expect(labels.length, "'고친 대로 다시 쓰기' 버튼이 둘 이상이다").toBe(1);
  });
});

// ★ [수정하기]는 장면 목록 머리의 **오른쪽 끝**이다. 이 저장소는 실행 버튼을 오른쪽에
// 두고(.step-actions .fwd 가 margin-left:auto), 새 CSS 를 만들지 않고 그 규약을 그대로 쓴다.
describe("/ads/[id] — [수정하기] 자리", () => {
  it("오른쪽 끝에 붙는다 — .fwd 안에 있어야 margin-left:auto 를 탄다", () => {
    const head = detailSrc.slice(detailSrc.indexOf("plan-head"), detailSrc.indexOf("plan-list"));
    expect(head, "[수정하기]가 plan-head 머리 안에 없다").toContain("수정하기");
    expect(head, "[수정하기]가 .fwd 밖이라 왼쪽에 붙는다").toMatch(/className="fwd"/);
  });
});

// ★ 실제 화면에서 잡은 어긋남 — done 프로젝트를 ?step=scenario 로 열면 시나리오 갈래가
// 그려지고, 거기 [수정하기]가 같이 떴다. "done 에서는 숨긴다"는 **보는 화면(view)** 이
// 아니라 **실제 상태(status)** 로 판정해야 지켜진다. 고치면 완성본이 scenario 로 되돌아간다.
describe("/ads/[id] — done 은 못 고친다", () => {
  it("★ [수정하기]는 실제 status 로 잠근다 — view 로 판정하면 ?step=scenario 로 우회된다", () => {
    const head = detailSrc.slice(detailSrc.indexOf("plan-head"), detailSrc.indexOf("plan-list"));
    expect(head, "머리줄이 status 를 안 본다 — 완성본에서도 편집이 열린다")
      .toMatch(/status\s*===\s*["']scenario["']/);
  });
});

// ★ 숨긴 모델은 칩으로 안 그린다 — 표에 남아 있어도(옛 문서 보호) 새로 고를 수는 없다.
describe("/ads/new — 숨긴 모델은 안 보인다", () => {
  it("모델 칩이 hidden 을 거른다", () => {
    expect(src, "AD_MODELS 를 거르지 않고 그대로 그린다")
      .toMatch(/AD_MODELS\.filter\(\([^)]*\)\s*=>\s*![^)]*\.hidden\)/);
  });
});
