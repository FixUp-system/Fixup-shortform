// ⑥완성 화면의 자막 조절 — 소스를 직접 훑는다.
// 이 저장소에는 화면 단위 테스트가 없고(tests/staleness-ui.test.js·credits-ui.test.js 가 선례),
// 이 기능의 실패 모드는 "화면이 값을 손으로 다시 적는 것"이라 소스에서 잡힌다.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { SUBTITLE_FONTS } from "../lib/subtitles.js";

const src = readFileSync("app/create/[id]/done/page.js", "utf8");

describe("⑥완성 — 자막 조절", () => {
  // ★ 필드 이름은 **camelCase 다**(render.rawUrl). 문서가 대체로 snake_case 라 `raw_url` 로
  // 적기 쉬운데 그런 필드는 없고, 그러면 화면이 **항상** 옛 프로젝트 갈래로 떨어져 조절 UI 가
  // 아무에게도 안 보인다 — 조용히 실패한다. 그래서 둘 중 하나가 아니라 rawUrl 만 재고,
  // raw_url 은 아예 금지한다.
  it("원본을 재생한다 — 자막 구운 것 위에 미리보기를 얹지 않는다", () => {
    expect(src).toMatch(/rawUrl/);
    expect(src, "render.raw_url 은 없는 필드다 — 이름은 render.rawUrl 이다")
      .not.toMatch(/render\??\.\??raw_url|["']raw_url["']/);
  });

  it("가격표·설정을 화면이 손으로 적지 않는다", () => {
    expect(src).toMatch(/SUBTITLE_FONTS/);
    expect(src).toMatch(/DEFAULT_SUBTITLE|normalizeSubtitle/);
  });

  it("외곽선을 화면이 스스로 정하지 않는다 — 같은 규칙을 쓴다", () => {
    expect(src).toMatch(/outlineFor/);
  });

  it("드래그로 위치를 옮긴다", () => {
    expect(src).toMatch(/onPointerDown|onPointerMove/);
  });

  it("적용하면 다시 굽는다", () => {
    expect(src).toMatch(/subtitle/);
  });
});

describe("⑥완성 — 두 벌이 되지 않게", () => {
  // 폰트 목록·기본값·되돌리기는 lib/subtitles.js 하나에서 온다.
  it("lib/subtitles 에서 가져온다", () => {
    expect(src).toMatch(/from ["'][./]*lib\/subtitles["']/);
  });

  // 폰트 이름을 화면에 박으면 lib 의 목록과 갈린다.
  it("폰트 이름을 화면에 박지 않는다", () => {
    expect(src).not.toMatch(/Black Han Sans|Gowun Dodum|Pretendard/);
  });

  // 크기 범위도 lib 이 쥔다 — 두 벌이면 슬라이더 끝과 저장되는 값이 갈린다.
  it("크기 범위를 화면에 박지 않는다", () => {
    expect(src).toMatch(/min=\{SIZE_MIN\}/);
    expect(src).toMatch(/max=\{SIZE_MAX\}/);
    expect(src).not.toMatch(/min="0\.7"|max="1\.6"/);
  });

  // 화면 밖으로 끌어도 되돌아와야 한다 — 규칙은 lib 의 clampPos 하나다.
  it("드래그 자리를 clampPos 로 되돌린다", () => {
    expect(src).toContain("clampPos");
  });

  // 미리보기 글자 크기가 ffmpeg 와 같은 식에서 나와야 최종과 비슷해진다.
  it("글자 크기를 subtitleStyle 로 잰다", () => {
    expect(src).toContain("subtitleStyle");
  });
});

// settings.subtitle 이 생기는 순간 subtitleHead·toAss 는 옛 subtitle_position 을 통째로
// 무시한다. 그래서 화면이 기본값으로 씨를 뿌리면 "위"에 두었던 자막이 사장님 몰래 아래로
// 내려간다 — 옮긴 적 없는 사람에게는 사고다.
describe("⑥완성 — 옛 위치를 이어받는다", () => {
  it("settings.subtitle 이 없으면 옛 subtitle_position 에서 씨를 뿌린다", () => {
    expect(src).toContain("subtitle_position");
    const at = src.indexOf("function seedSubtitle");
    expect(at, "seedSubtitle 이 없다").toBeGreaterThan(-1);
    const fn = src.slice(at, src.indexOf("\n}", at));
    expect(fn, "씨를 뿌릴 때 옛 위치를 안 본다").toMatch(/posFromLegacyPosition/);
    expect(fn, "초기값도 lib 의 정규화를 지나야 한다").toContain("normalizeSubtitle");
  });

  // 비율(0.12·0.18)은 lib 의 POSITIONS 표에 있고, 정렬 기준까지 감안한 변환도 lib 이 한다.
  // 화면이 손으로 적으면 표가 바뀔 때 갈린다.
  it("위치 비율을 화면에 박지 않는다 — lib 에서 가져온다", () => {
    expect(src, "화면이 변환을 다시 구현했다").not.toContain("function posFromLegacyPosition");
    expect(src, "posFromLegacyPosition 을 lib 에서 안 가져온다").toContain("posFromLegacyPosition");
    expect(src, "여백 비율을 손으로 적었다").not.toMatch(/0\.12|0\.18|0\.82/);
  });
});

// C3 — 프로젝트 비율이 셋(9:16·1:1·16:9)이다. 미리보기 상자를 9:16 으로 고정하고 영상을
// cover 로 채우면 16:9·1:1 에서 영상이 잘려 보여, 드래그한 자리가 **잘린 프레임 기준**이 된다.
describe("⑥완성 — 미리보기 비율이 프로젝트를 따른다", () => {
  const css = readFileSync("app/globals.css", "utf8");

  it("상자 비율을 lib/aspects 에서 뽑는다 — 화면에 손으로 적지 않는다", () => {
    expect(src, "lib/aspects 를 안 본다").toMatch(/from ["'][./]*lib\/aspects["']/);
    expect(src).toContain("aspectFor");
    const at = src.indexOf("const frameStyle");
    expect(at, "frameStyle 이 없다").toBeGreaterThan(-1);
    const block = src.slice(at, src.indexOf("};", at));
    expect(block, "비율을 aspect 에서 안 뽑는다").toMatch(/aspectRatio[\s\S]*aspect\.width[\s\S]*aspect\.height/);
    expect(block, "9:16 을 손으로 적었다").not.toMatch(/9 ?\/ ?16/);
  });

  // ★ 2026-08-13: ⑤영상도 같은 규칙이 됐다. 거기만 9:16 고정 틀에 cover 라, 16:9·1:1
  // 프로젝트의 클립이 잘려 보였고 키우면 그 잘림이 그대로 커졌다(사용자 지적).
  it("영상을 잘라 보여 주지 않는다 — 미리보기는 전부 contain", () => {
    const base = css.match(/\.preview-frame \.preview-video \{[^}]*\}/)?.[0];
    expect(base, ".preview-frame .preview-video 규칙이 없다").toBeTruthy();
    expect(base, "미리보기 영상이 잘린다(cover)").toContain("object-fit: contain");

    const done = css.match(/\.done-preview \.preview-video \{[^}]*\}/)?.[0];
    expect(done, ".done-preview .preview-video 규칙이 없다").toBeTruthy();
    expect(done).toContain("object-fit: contain");
  });
});

// 위/중간/아래 칩은 자유 위치가 생긴 뒤 무시되는 버튼이 됐었다 — 눌러도 아무 일이
// 안 일어나면 사장님은 "고장 났나"로 읽는다. 지우지 않고 pos 프리셋으로 살렸다.
describe("⑥완성 — 빠른 위치 칩", () => {
  it("칩이 pos 를 세팅한다 — 비율 리터럴을 다시 만들지 않는다", () => {
    const at = src.indexOf("POSITION_PRESETS");
    expect(at, "빠른 위치 프리셋이 없다").toBeGreaterThan(-1);
    const block = src.slice(at, src.indexOf(";", src.indexOf("=", at)));
    expect(block, "프리셋 자리가 posFromLegacyPosition 에서 오지 않는다").toContain("posFromLegacyPosition");
    expect(block, "위치 목록을 화면이 손으로 적었다").toContain("SUBTITLE_POSITIONS");
    // 고른 자리는 **프리셋의 pos** 를 clampPos 로 통과시켜 세팅한다(화면이 비율을 새로 적지 않는다)
    expect(src).toMatch(/pos: clampPos\((p|preset)\.pos\)/);
  });

  it("켜진 칩을 pos 에서 거꾸로 판정한다 — subtitle_position 을 읽지 않는다", () => {
    expect(src).toMatch(/samePos\(sub\.pos, p\.pos\)/);
    // settings.subtitle_position 은 이제 옛 프로젝트의 씨앗일 뿐이다. 그 밖에서 읽으면
    // 드래그로 옮긴 뒤에도 칩이 켜진 채라 화면이 거짓말을 한다.
    const chipIdx = src.indexOf("POSITION_PRESETS.map");
    expect(chipIdx, "칩을 프리셋 표에서 그리지 않는다").toBeGreaterThan(-1);
    const chipBlock = src.slice(chipIdx, src.indexOf("</select>", chipIdx));
    expect(chipBlock, "고른 자리를 subtitle_position 으로 판정한다").not.toContain("subtitle_position");
    expect(src, "옛 위치를 다시 저장하지 않는다").not.toContain("subtitle_position:");
  });
});

// 미리보기가 진짜 폰트로 그려지려면 브라우저도 폰트 파일을 받아야 한다(assets/ 는 못 읽는다).
// 이름이 한 글자라도 어긋나면 브라우저는 오류 없이 **대체 폰트로 그린다** — 사장님이 "강조"를
// 골랐는데 미리보기는 기본 글씨고, 완성본에서야 달라진 것을 본다.
describe("⑥완성 — 자막 웹폰트", () => {
  const css = readFileSync("app/globals.css", "utf8");
  // @font-face 블록을 통째로 떠서 그 안에서만 본다 — 낱말 등장 순서로는 어느 블록의
  // font-family 인지 알 수 없다.
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);

  // ★ 이름이 둘이다. @font-face 와 화면은 cssFamily 를, ffmpeg 는 family(폰트 파일 내부
  // 이름)를 쓴다. 둘이 **같아지면** next/font/local 의 UI 폰트와 가족이 겹친다
  // (CSS 패밀리 매칭은 대소문자를 안 가린다) — 어느 쪽이 이길지가 빌드 순서에 달린다.
  it("cssFamily 는 family 와 다르다 — UI 폰트와 겹치지 않게", () => {
    for (const f of SUBTITLE_FONTS) {
      expect(f.cssFamily, `${f.id} 에 cssFamily 가 없다`).toBeTruthy();
      expect(f.cssFamily.toLowerCase(), `${f.id} 의 cssFamily 가 파일 내부 이름과 같다`)
        .not.toBe(f.family.toLowerCase());
    }
  });

  it("화면은 cssFamily 로 그린다 — ffmpeg 의 family 가 아니다", () => {
    expect(src).toContain("font.cssFamily");
    expect(src, "화면이 폰트 파일 내부 이름을 쓴다").not.toMatch(/font\.family/);
  });

  for (const f of SUBTITLE_FONTS) {
    it(`${f.id}(${f.label}) 의 @font-face 가 목록의 cssFamily 와 같은 이름이다`, () => {
      const face = faces.find((b) => b.includes(`font-family: "${f.cssFamily}"`));
      expect(face, `"${f.cssFamily}" 를 선언한 @font-face 가 없다 — 브라우저가 대체 폰트로 그린다`)
        .toBeTruthy();
      expect(face, `${f.id} 의 @font-face 가 /fonts/ 파일을 안 가리킨다`).toMatch(/url\("\/fonts\/[^"]+"\)/);
      // 받는 동안 자막이 안 보이면 안 된다
      expect(face, `${f.id} 에 font-display: swap 이 없다`).toContain("font-display: swap");
    });

    it(`${f.id} 의 public 폰트 파일이 실제로 있다`, () => {
      const face = faces.find((b) => b.includes(`font-family: "${f.cssFamily}"`)) || "";
      const url = face.match(/url\("(\/fonts\/[^"]+)"\)/)?.[1];
      expect(url, `${f.id} 의 url 을 못 찾았다`).toBeTruthy();
      const path = `public${url}`;
      expect(existsSync(path), `${path} 가 없다 — 브라우저가 조용히 대체 폰트로 그린다`).toBe(true);
      // 오류 HTML 을 받아 놓고 폰트라고 믿는 것을 막는다(assets.test.js 와 같은 하한)
      expect(statSync(path).size).toBeGreaterThan(50_000);
    });
  }

  // ★ 용량 규칙 — 미리 받지 않는다. @font-face 는 그 폰트가 화면에 실제로 쓰일 때만
  // 내려받는다. preload 를 붙이면 아무도 안 고른 7.2MB 를 모두가 받는다.
  it("폰트를 미리 받지 않는다", () => {
    for (const [name, text] of [
      ["⑥완성 화면", src],
      ["globals.css", css],
      ["layout.js", readFileSync("app/layout.js", "utf8")],
    ]) {
      expect(text, `${name} 이 폰트를 미리 받는다`).not.toMatch(/rel=["']preload["']|fonts\.load\(/);
    }
  });
});

describe("⑥완성 — 미리보기 기준점", () => {
  // toAss 는 \pos 를 Alignment 2(하단) 기준으로 쓴다. 화면이 가운데 기준으로 그리면
  // 미리보기와 완성본의 자막 높이가 어긋나고, 줄 수가 바뀔 때마다 덜컹거린다.
  it("pos 는 글자 블록의 아랫변이다", () => {
    expect(src).toContain("translate(-50%, -100%)");
    expect(src, "가운데 기준으로 그리면 완성본과 어긋난다").not.toContain("translate(-50%, -50%)");
  });
});

describe("⑥완성 — 원본이 없는 옛 프로젝트", () => {
  // 자막이 구워진 완성본 위에 미리보기를 얹으면 자막이 둘로 보인다.
  // 그래서 원본이 없으면 조절 UI 자체가 없어야 한다.
  it("원본이 있을 때만 조절 UI 를 그린다", () => {
    const at = src.indexOf("const rawUrl");
    expect(at, "rawUrl 정의가 없다").toBeGreaterThan(-1);
    const line = src.slice(at, src.indexOf(";", at));
    expect(line, "rawUrl 이 render.rawUrl 에서 오지 않는다").toContain("render?.rawUrl");
    // 조절 UI 는 rawUrl 조건 안에서만 렌더된다
    expect(src).toMatch(/\{rawUrl &&/);
  });

  // 숨기기만 하면 사장님은 이 기능이 있는지조차 모른다 — 다시 만들 길을 알려야 한다.
  it("원본이 없으면 다시 만들라고 안내한다", () => {
    expect(src).toMatch(/\{!rawUrl &&/);
    expect(src).toContain("다시 합치기]로 완성본을 한 번 다시 만들어 주세요");
  });

  // 옛 프로젝트는 완성본을 그대로 재생한다(원본이 없으니 재생할 것이 그것뿐이다)
  it("원본이 없으면 완성본을 재생한다", () => {
    // 재생기는 previewSrc 하나를 본다. 그 식이 원본이 없을 때 완성본으로 떨어져야 한다
    // (rawUrl 이 없으면 미리보기를 얹을 수 없으니 구워진 자막이 있는 완성본을 튼다).
    expect(src).toMatch(/const previewSrc =[^;]*rawUrl \|\| finalSrc/);
    expect(src).toContain("src={previewSrc}");
  });
});

describe("⑥완성 — 자막만 낡았을 때는 있던 완성본을 받을 수 있다", () => {
  // 자막 재굽기가 실패해도 설정 PATCH 는 이미 저장돼 낡음으로 잡힌다. 그때 [내려받기]까지
  // 치우면, 색만 바꿔 보려던 사장님이 **멀쩡한 옛 완성본조차** 못 받는다(옛 자막이 구워져
  // 있을 뿐 클립·소리는 지금 것이다). 경고는 그대로 띄우고 버튼만 남긴다.
  it("낡음이 자막뿐이면 내려받기가 남는다", () => {
    expect(src).toContain("(!stale || subtitleOnlyStale)");
  });

  // 라우트가 render_error 에 사유를 남기는데 읽는 화면이 없으면 그 필드는 거짓말이다.
  it("지난 실패 사유(render_error)를 화면이 읽는다", () => {
    expect(src).toContain("project?.render_error");
  });
});

describe("⑥완성 — 고르는 것을 그 모습대로 보여 준다", () => {
  // 글꼴을 이름으로만 고르면 사장님은 "부드럽게"가 어떤 글씨인지 모른 채 고른다.
  // 웹폰트는 이미 실려 있으니 칩 자체를 그 글꼴로 그린다 — 이름은 lib 의 label 그대로다.
  it("글꼴 칩을 그 글꼴로 그린다", () => {
    const chips = src.match(/SUBTITLE_FONTS\.map\([\s\S]{0,700}?\)\)\}/);
    expect(chips, "글꼴 칩을 그리는 자리를 못 찾았다").toBeTruthy();
    expect(chips[0], "칩이 cssFamily 로 안 그려진다 — 이름만 보고 고르게 된다")
      .toContain("cssFamily");
  });

  // 미리보기 테두리가 상수면, 새 규칙(글자를 따라가는 테두리)과 어긋나 고른 것과 다른 결과가 나온다.
  it("미리보기 테두리도 lib 이 정한다 — rimFor 를 쓴다", () => {
    expect(src).toMatch(/rimFor/);
  });

  // [적용]이 켜진 칩과 같은 옷을 입으면 실행이 선택으로 읽힌다.
  it("[적용]은 선택 칩이 아니다", () => {
    const apply = src.match(/<button[^>]*applyToVideo[^>]*>/);
    expect(apply, "적용 버튼을 못 찾았다").toBeTruthy();
    expect(apply[0], "실행 버튼이 켜진 칩(chip on)으로 그려진다").not.toMatch(/chip on/);
  });
});

// 미리보기가 문장을 통째로 흘리면 여섯 줄이 되는데 완성본은 두 줄이다 — 자리(아랫변 기준)도
// 크기도 그만큼 다르게 보인다. 나누는 규칙은 lib 하나여야 한다.
describe("⑥완성 — 미리보기는 완성본과 같이 나눈다", () => {
  it("문장을 buildCues 로 나눈다 — 화면이 따로 흘리지 않는다", () => {
    expect(src).toMatch(/buildCues/);
  });
});

// 사장님 눈에 "적용했는데 영상이 그대로"로 보이던 자리들이다.
// 실제로는 구워지고 있었는데(2026-08-13 실측: 완성본 프레임이 설정을 정확히 반영),
// ①화면이 늘 **자막 없는 원본**을 재생해서 볼 자리가 없었고 ②영상을 만드는 버튼이
// [자막 적용]·[다시 합치기] 둘이라 어느 것이 반영하는 것인지 알 수 없었다.
describe("⑥완성 — 적용하면 그 영상을 보여 준다", () => {
  it("고치는 중이 아니면 완성본을 재생한다", () => {
    // 원본은 자막이 없다 — 늘 원본을 틀면 적용 결과를 화면에서 볼 수 없다.
    expect(src).toMatch(/dirty/);
  });

  it("다시 구우면 새 파일을 받는다 — 각인을 URL 에 싣는다", () => {
    // URL 이 늘 같아서(/api/renders/<id>.mp4) 그대로 두면 <video> 가 옛 파일을 계속 쓴다.
    expect(src).toMatch(/render\.ts/);
  });

  it("영상을 만드는 버튼은 하나다 — 조절 패널이 있으면 하단 버튼은 안 그린다", () => {
    // 하단의 재합성 버튼(onClick={start})은 조절 패널이 없을 때만 나온다.
    // 패널이 있으면 [영상에 적용] 하나가 자막 굽기와 전체 재합성을 다 맡는다.
    for (const m of src.matchAll(/<button[^>]*onClick=\{start\}/g)) {
      const before = src.slice(Math.max(0, m.index - 200), m.index);
      expect(before, "재합성 버튼이 rawUrl 갈래로 가려지지 않는다").toMatch(/!rawUrl|!\(render && rawUrl\)/);
    }
  });

  it("자막만 바뀐 것과 컷이 낡은 것을 한 버튼이 갈라 처리한다", () => {
    expect(src).toMatch(/applyToVideo/);
  });
});

// 자막을 고치는 자리와 그 결과가 **한눈에** 들어와야 한다 — 아래위로 두면 조절판을
// 만질 때 영상이 화면 밖으로 밀린다(2026-08-13 사용자 요청: 영상 왼쪽에 배치).
describe("⑥완성 — 자막 조절판과 영상을 나란히", () => {
  const css = readFileSync("app/globals.css", "utf8");

  it("둘을 한 줄에 세운다", () => {
    const at = css.indexOf(".done-stage {");
    expect(at, ".done-stage 규칙이 없다").toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf("}", at))).toMatch(/display:\s*flex/);
  });

  it("조절판이 영상보다 먼저 온다 — 왼쪽이다", () => {
    const stage = src.indexOf('className="done-stage"');
    expect(stage, "done-stage 를 안 그린다").toBeGreaterThan(-1);
    const editor = src.indexOf('className="sub-editor"', stage);
    const preview = src.indexOf("done-preview", stage);
    expect(editor).toBeGreaterThan(-1);
    expect(editor, "영상이 조절판보다 앞에 있다").toBeLessThan(preview);
  });

  // 좁은 화면에서까지 나란히 두면 둘 다 못 쓰게 좁아진다.
  it("좁아지면 위아래로 쌓는다", () => {
    expect(css).toMatch(/\.done-stage \{[\s\S]*?\}[\s\S]*?@media[^{]*\{[\s\S]*?\.done-stage[\s\S]*?column/);
  });
});
