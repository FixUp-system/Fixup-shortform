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

  it("상태 넷을 실제로 가른다 — status 값과 비교하는 자리가 있다", () => {
    // "draft"라는 낱말이 주석에만 있어도 toContain은 통과한다. 그 상태의 화면이
    // 실제로 존재한다는 증거는 status 를 그 값과 비교(===)하는 조건문이다.
    for (const s of ["draft", "scenario", "rendering", "done"]) {
      expect(detailSrc, `"${s}" 라는 낱말이 없다`).toContain(s);
      expect(detailSrc, `status === "${s}" 비교가 없다 — 그 상태를 실제로 안 다룰 수 있다`)
        .toMatch(new RegExp(`status\\s*===\\s*["']${s}["']`));
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
    const doneBlockIdx = detailSrc.indexOf('status === "done" && video');
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
    const mapIdx = src.indexOf("AD_MODELS.map(");
    expect(mapIdx, "AD_MODELS.map( 을 못 찾았다 — 표에서 그리지 않는다").toBeGreaterThan(-1);
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
    const modelChipIdx = src.indexOf("AD_MODELS.map(");
    const modelChipBlock = src.slice(modelChipIdx, modelChipIdx + 300);
    expect(modelChipBlock, "모델 칩 onClick 이 onModelChange 를 안 부른다").toMatch(/onClick=\{[^}]*onModelChange/);
  });

  it("길이 칩마다 정가를 priceLabel(adVideoPrice(...)) 로 보여준다 — 숫자를 박지 않는다", () => {
    expect(src).toMatch(/priceLabel\(adVideoPrice\(s,\s*model\)\)/);
    // 65(2.0/15초)·120(2.5/15초)·240(2.5/30초) — 계획 문서에 적힌 세 정가가 소스에 문자 그대로
    // 없어야 "가격은 pricing.js 하나뿐"이 실제로 지켜진다.
    expect(src).not.toMatch(/\b65\b/);
    expect(src).not.toMatch(/\b120\b/);
    expect(src).not.toMatch(/\b240\b/);
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
    expect(detailSrc, "shot.lighting 가드가 없다").toMatch(/\{shot\.lighting\s*&&/);
    expect(detailSrc, "shot.sound 가드가 없다").toMatch(/\{shot\.sound\s*&&/);
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

  it("가격 계산에 모델을 함께 넘긴다 — 안 넘기면 2.5 프로젝트에 2.0(더 싼) 가격이 뜬다", () => {
    expect(detailSrc).toMatch(/adVideoPrice\(settings\?\.seconds,\s*settings\?\.model\)/);
  });
});
