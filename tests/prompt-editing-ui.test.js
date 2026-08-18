// ④이미지 화면 — 프롬프트를 보이고 고친다.
//
// 이 저장소는 화면을 **파일 내용**으로 잰다(tests/step-advance-race.test.js 와 같은 방식).
// 그 방식의 한계는 분명하다 — 문자열이 있는지만 보는 단정은 아무것도 안 재기 쉽다.
// 그래서 이 파일은 **깨졌을 때 사장님이 겪는 일**을 하나씩 골라 잰다:
//   ① 화면이 자기 규칙으로 프롬프트를 다시 만들면 보는 것과 나가는 것이 갈린다
//      → 서버와 같은 함수를 부르는지, 조립 함수를 흉내내지 않는지
//   ② 꼬리를 텍스트칸에 넣으면 저장할 때마다 꼬리가 두 벌이 된다
//      → 텍스트칸은 본문 씨앗(promptBodyOf)에서 오고, 꼬리는 떼어 낸 문자열로 보여 주는지
//   ③ 고치면 값이 든다는 말이 없으면 사장님이 모르고 유료 버튼을 누른다
//   ④ "원래대로"가 빈 값을 안 보내면 되돌릴 길이 없다(빈 값이 곧 구현이다)
//   ⑤ 화면이 `fs` 를 끄는 모듈을 import 하면 **테스트가 전부 초록인 채 앱이 안 뜬다**
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const PAGE = "app/create/[id]/images/page.js";
const images = readFileSync(PAGE, "utf8");
const VIDEO_PAGE = "app/create/[id]/video/page.js";
const video = readFileSync(VIDEO_PAGE, "utf8");
const BRIEFING_PAGE = "app/create/[id]/briefing/page.js";
const briefing = readFileSync(BRIEFING_PAGE, "utf8");
// 첫 화면 — 길이·사이즈·모델·화질·컨셉·공통 지시를 **한 자리에서** 받는다(2026-08-18).
const CREATE_PAGE = "app/create/page.js";
const create = readFileSync(CREATE_PAGE, "utf8");

// ── 범위를 좁혀 재는 헬퍼 ────────────────────────────────────────────────
// ★ 파일 전체를 훑는 정규식은 **아무것도 안 잰다** — 주석·다른 함수·다른 버튼에 걸려서
//   재려는 것을 통째로 지워도 초록이다. Task 7 에서 이 함정을 네 번 밟았다. 그래서 잴 자리를
//   먼저 잘라 낸다. 갈래가 셋(④이미지·⑤영상·①자료)이라 소스를 인자로 받는다.
// 못 찾으면 빈 문자열이다 — 여기서 던지면 수집 단계에서 죽어 이 파일의 다른 단정까지
// 함께 사라지고, 무엇이 깨졌는지 안 보인다.
const foldIn = (src) => {
  const start = src.indexOf("<details");
  const end = src.indexOf("</details>");
  if (start < 0 || end < start) return "";
  return src.slice(start, end).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
};
// 컴포넌트 안의 함수는 들여쓰기 2칸에서 닫힌다(`\n  }`). `//` 주석은 걷는다 —
// 주석에 적힌 필드 이름에 걸리면 함수를 통째로 지워도 초록이다.
const fnIn = (src, name) => {
  const start = src.indexOf(`async function ${name}(`);
  if (start < 0) return "";
  const end = src.indexOf("\n  }", start);
  if (end < 0) return "";
  return src.slice(start, end).replace(/\/\/[^\n]*/g, "");
};
// `const 이름 = (` … `\n  );` 로 묶인 JSX 덩어리. ①자료가 화면 조각을 그렇게 담는다
// (sizePicker·stylePicker·resolutionPicker). 사장님이 읽는 글만 남기려고 JSX 주석을 걷는다.
const jsxBlockIn = (src, name) => {
  const start = src.indexOf(`const ${name} = (`);
  if (start < 0) return "";
  const end = src.indexOf("\n  );", start);
  if (end < 0) return "";
  return src.slice(start, end).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
};
// marker 를 품은 useEffect 의 본문. 초기값을 **한 번만** 채우는지 보려면 그 자리가
// 빗장(noteLoadedFor) 안쪽인지 봐야 한다 — 밖이면 매 렌더마다 덮어 타이핑이 끊긴다.
// 최상위 컴포넌트 함수의 본문(`function 이름(` … `\n}`). 프롬프트 편집 컴포넌트가 그렇게 산다
// (video 의 ClipPromptEdit · images 의 PreviewPane).
// ★ 왜 파일 전역 정규식으로는 못 재는가 — `/buildClipPrompt/` 는 **import 문**에 걸린다.
//   그래서 호출을 promptBodyOf 로 바꿔 꼬리를 빈 문자열로 만들어도 초록이었다(리뷰 실측).
//   창(`{0,N}`)으로 좁히는 것도 안 된다: 위쪽 긴 주석이 창을 통째로 먹어 무엇을 재는지
//   아무도 모르는 단정이 된다. 그래서 **함수 본문만** 잘라 낸다.
const compIn = (src, name) => {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return "";
  const end = src.indexOf("\n}", start);
  if (end < 0) return "";
  return src.slice(start, end).replace(/\/\/[^\n]*/g, "");
};
// JSX 요소 하나의 속성 부분(`<Tag` … `/>`). key 처럼 **그 요소에 달려야만 뜻이 있는** 속성을
// 재려면 여기까지 좁혀야 한다 — 파일 전역에서 `/key=\{/` 를 찾으면 컷 목록의 `key={c.idx}`
// 에 걸려, 프롬프트 편집기의 key 를 지워도 초록이다.
const elementIn = (src, tag) => {
  const start = src.indexOf(`<${tag}`);
  if (start < 0) return "";
  const end = src.indexOf("/>", start);
  if (end < 0) return "";
  return src.slice(start, end);
};
const effectIn = (src, marker) => {
  const at = src.indexOf(marker);
  if (at < 0) return "";
  const start = src.lastIndexOf("useEffect(", at);
  const end = src.indexOf("]);", at);
  if (start < 0 || end < 0) return "";
  return src.slice(start, end).replace(/\/\/[^\n]*/g, "");
};

describe("④이미지 — 프롬프트 편집", () => {
  it("실제로 나가는 프롬프트를 보여 준다 — 서버와 같은 함수로 만든다", () => {
    expect(images, "화면이 buildImagePrompt 를 안 부른다 — 보는 것과 나가는 것이 갈린다")
      .toMatch(/buildImagePrompt/);
    expect(images, "본문 씨앗을 판정 함수에서 안 얻는다").toMatch(/promptBodyOf/);
    expect(images).toMatch(/from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/cuts"/);
  });

  // ★★ 위 단정은 **import 문에 걸려** 아무것도 안 잰다(리뷰 실측: 호출을 바꿔도 초록).
  //    그래서 **컴포넌트 본문 안에서 두 값이 어느 함수로 만들어지는지**를 여기서 못 박는다.
  //      · generated = 본문 판정(promptBodyOf) — 전체 조립으로 바꾸면 씨앗이 전체 프롬프트가
  //        되어 한 번 저장할 때마다 꼬리가 한 벌씩 늘어난다(컷당 $0.08)
  //      · full = 전체 조립(buildImagePrompt) — 본문 판정으로 바꾸면 꼬리가 빈 문자열이 되어
  //        접힌 칸이 코드가 붙이는 문장을 **아무것도 안 보여 준다**
  it("★ 씨앗은 본문 판정으로, 꼬리는 전체 조립으로 만든다", () => {
    const comp = compIn(images, "PreviewPane").replace(/\s+/g, " ");
    expect(comp, "PreviewPane 본문을 못 찾았다").toBeTruthy();
    expect(comp, "씨앗을 본문 판정(promptBodyOf)으로 안 만든다 — 전체를 앉히면 꼬리가 두 벌이 된다")
      .toMatch(/const generated = promptBodyOf\("image", \{ \.\.\.cut, image_prompt: "" \}, project\)/);
    expect(comp, "꼬리를 전체 조립(buildImagePrompt)에서 떼지 않는다 — 꼬리가 빈 값이 된다")
      .toMatch(/const full = buildImagePrompt\(cut, project, \[\]\)/);
  });

  // ★★ 2026-08-18 — **전문을 한 덩어리로 복사한다**(사용자 요청). 접힌 칸은 본문(텍스트칸)과
  //    꼬리(문단)를 **따로** 보여 주므로, 사장님이 프롬프트 전체를 밖으로 가져가려면 두 곳을
  //    긁어 손으로 이어야 했다 — 이으면서 순서가 뒤바뀌거나 꼬리를 빠뜨리면, 밖에서 돌려 본
  //    결과가 우리 결과와 달라도 왜 다른지 알 수 없다.
  // ★ 재는 자리가 둘이다 — 버튼은 **접힌 칸 안**에 있어야 하고(다른 데 있으면 프롬프트를
  //   보지도 않고 복사하게 된다), 클립보드에 쓰는 일은 **copyAll 안**에 있다.
  //   한 자리에서 둘을 다 찾으면 아무것도 안 재는 단정이 된다(이 파일 머리말의 함정).
  it("★ 프롬프트 전문을 한 번에 복사할 수 있다", () => {
    const fold = foldIn(images);
    expect(fold, "접힌 칸을 못 찾았다").toBeTruthy();
    expect(fold, "복사 버튼이 없다").toMatch(/복사/);
    expect(fold, "버튼이 copyAll 을 부르지 않는다 — 이름만 복사다").toMatch(/onClick=\{copyAll\}/);
    expect(fnIn(images, "copyAll"), "클립보드에 쓰지 않는다").toMatch(/clipboard/);
  });

  // ★ 복사한 글이 **화면에 보이는 그대로**여야 한다. 여기서 buildImagePrompt 를 한 번 더
  //   부르면(혹은 문형을 손으로 다시 이으면) 사장님이 방금 고친 본문이 빠진 옛 프롬프트가
  //   복사된다 — 보는 것과 가져가는 것이 갈리는, 이 파일이 처음부터 재던 그 병이다.
  //   그래서 화면이 이미 쥔 두 값(prompt·fixedTail)을 그대로 이어야 한다.
  it("★ 복사하는 값은 화면에 보이는 두 토막을 그대로 이은 것이다", () => {
    const copy = fnIn(images, "copyAll") || foldIn(images);
    expect(copy, "본문(prompt)을 안 싣는다").toMatch(/prompt/);
    expect(copy, "꼬리(fixedTail)를 안 싣는다").toMatch(/fixedTail/);
  });

  // ★★ 2026-08-18 — **레퍼런스 절까지 정확하게.** 화면은 그 절을 만들 수 없다(그 판정이
  //    fs·Storage 를 끈다 — 아래 "import 사슬" describe 가 그 경계를 지킨다). 그래서 꼬리를
  //    서버에서 받아 온다. 이 단정이 없으면 누군가 fetch 를 걷어내고 다시 **레퍼런스 절이
  //    빠진** 프롬프트를 복사하게 만들어도 아무도 모른다.
  it("★ 정확한 꼬리를 서버에서 받아 온다 — 레퍼런스 절은 화면이 못 만든다", () => {
    const copy = fnIn(images, "copyAll");
    expect(copy, "프롬프트 꼬리 라우트를 안 부른다").toMatch(/cuts\/\$\{cut\.idx\}\/prompt/);
    // 못 받았을 때 화면 꼬리로 조용히 돌아가면 안 된다 — 그 복사본에는 레퍼런스 절이 없는데
    // 사장님은 "정확한 전문"으로 알고 밖에서 돌린다.
    expect(copy, "받지 못했을 때 그 사실을 안 알린다").toMatch(/레퍼런스/);
    // 고른 사진과 실린 사진이 다를 수 있다 — 그림에 안 실린 것을 실린 것처럼 보이면 안 된다
    expect(copy, "못 읽은 사진(missing)을 안 알린다").toMatch(/missing/);
  });

  // ★ 눌렀는지 알려 준다. 클립보드는 눌러도 화면이 안 변해서, 표시가 없으면 사장님은
  //   복사가 됐는지 몰라 여러 번 누르거나 손으로 긁는다(그러면 이 버튼이 있으나 없으나다).
  it("★ 복사했다고 알린다 — 실패도 알린다", () => {
    const copy = fnIn(images, "copyAll");
    expect(copy, "복사됐다는 표시가 없다").toMatch(/복사했어요|복사됐어요/);
    // 클립보드는 브라우저가 막을 수 있다(권한·비보안 컨텍스트). 조용히 실패하면 사장님은
    // 복사된 줄 알고 빈 것을 붙이고, 왜 프롬프트가 안 먹는지 우리에게 묻는다.
    expect(copy, "실패를 삼킨다 — 복사 안 됐는데 됐다고 보인다").toMatch(/복사하지 못했어요/);
    // 그리고 그 표시가 화면에 실제로 그려져야 한다
    expect(foldIn(images), "표시를 그리는 자리가 없다").toMatch(/copyMsg/);
  });

  // ★ 컷을 바꾸면 텍스트칸도 새로 시작해야 한다. key 가 없으면 앞 컷의 글이 남고, 그 글이
  //   이 컷의 image_prompt 로 저장된다 — 사장님이 고치지도 않은 프롬프트가 컷에 굳는다.
  it("★ 컷을 바꾸면 편집칸이 갈아 끼워진다 — key 가 그 구현이다", () => {
    const el = elementIn(images, "PreviewPane");
    expect(el, "PreviewPane 을 그리는 자리를 못 찾았다").toBeTruthy();
    expect(el, "key 가 없다 — 컷을 바꿔도 앞 컷 글이 남아 이 컷에 저장된다")
      .toMatch(/key=\{activeCut\.idx\}/);
  });

  // ★ 화면이 조립을 흉내내면 안 된다. 문형을 화면에 한 벌 더 적으면 그날부터 프롬프트가
  //   두 곳에서 만들어지고, 사장님은 화면의 것을 읽고 서버는 자기 것을 보낸다.
  it("★ 화면이 프롬프트 문형을 스스로 적지 않는다", () => {
    for (const forbidden of ["no text or letters", "for a short-form video", "Scene:"]) {
      expect(images, `화면이 프롬프트 문구("${forbidden}")를 직접 들고 있다`).not.toContain(forbidden);
    }
  });

  // ★ 텍스트칸에 **전체 프롬프트**를 넣으면 저장하는 순간 꼬리가 본문 안으로 들어가고
  //   코드가 꼬리를 또 붙여 두 벌이 된다. 그래서 본문과 꼬리를 갈라 쓴다 —
  //   꼬리는 전체에서 본문 길이만큼 떼어 낸 것이다(lib/cuts.js 가 그 불변을 테스트로 쥔다).
  it("★ 텍스트칸은 본문만 쥔다 — 꼬리는 떼어 내 보여 준다", () => {
    expect(images, "전체 프롬프트에서 꼬리를 떼어 내는 자리가 없다").toMatch(/\.slice\(/);
    // 꼬리는 고칠 수 없어야 한다 — 텍스트칸이 하나뿐인 것이 그 뜻이다(수정 지시 칸 + 프롬프트 칸).
    expect(images.match(/<textarea/g)?.length, "텍스트칸 수가 둘이 아니다 — 꼬리가 고쳐질 수 있다").toBe(2);
    // ★ 전체 프롬프트를 텍스트칸에 앉히면(씨앗으로든 값으로든) 저장하는 순간 꼬리가 두 벌이
    //   된다 — 이 태스크가 막으려는 바로 그 결함이라 이름으로 못 박는다.
    expect(images, "전체 프롬프트를 텍스트칸 값으로 쓴다 — 꼬리가 두 벌이 된다").not.toMatch(/value=\{\s*full\s*\}/);
    expect(images, "전체 프롬프트를 텍스트칸 씨앗으로 쓴다").not.toMatch(/useState\(\s*full\b/);
    expect(images, "텍스트칸 씨앗을 이름 하나로 두지 않았다").toMatch(/const seed = saved \|\| generated/);
    expect(images, "텍스트칸이 씨앗에서 출발하지 않는다").toMatch(/useState\(seed\)/);
  });

  // ★★ 돈에 닿는 자리다. 덮어쓰기가 없는 컷은 `saved === ""` 이므로, 잠금 판정을 `saved` 로
  //   재면 **텍스트칸이 코드가 만든 본문 그대로인 상태에서 [저장]이 눌린다.** 한 번 누르면
  //   그 본문이 덮어쓰기로 굳고 각인이 뒤집혀, 아무것도 안 고친 사장님에게
  //   "화면 설명이나 화풍을 고친 뒤라…"라는 **틀린 사유로 컷당 $0.08 재생성**을 권한다.
  //   그래서 비교 대상이 **텍스트칸 씨앗과 같은 값**인지 잰다.
  it("★ 덮어쓰기가 없고 텍스트칸을 안 건드렸으면 [저장]이 안 눌린다", () => {
    const fold = foldOf();
    // [저장] 버튼의 잠금 조건 — 접힌 칸의 첫 버튼이다.
    const disabled = fold.match(/disabled=\{([^}]*)\}[\s\S]*?>\s*저장/)?.[1];
    expect(disabled, "[저장] 버튼의 잠금 조건을 못 찾았다").toBeTruthy();
    const cond = disabled.replace(/\s+/g, " ");
    expect(cond, "[저장]이 씨앗과 비교하지 않는다 — 안 고쳐도 눌려 각인이 뒤집힌다")
      .toContain("prompt.trim() === seed");
    // `saved` 로 재면 안 된다. `=== saved || generated` 같은 형태도 막는다 —
    // `(a === b) || c` 로 읽혀 항상 잠기고, 그러면 이번엔 저장 자체가 죽는다.
    expect(cond, "잠금 판정이 저장된 값만 본다").not.toMatch(/prompt\.trim\(\) === saved\b/);
  });

  // ⚠️ 브리프의 단정(`toMatch(/유료|다시 만들/)`)은 파일 전체를 훑어서 **아무것도 안 잰다** —
  //    이 화면에는 주석의 "유료 호출"과 다른 버튼의 "다시 만들기"가 이미 있어서 경고를 통째로
  //    지워도 초록이다(뮤테이션으로 확인했다). 그래서 **접힌 칸 안의 사장님이 읽는 글**만
  //    잘라 내어 잰다(주석은 걷는다).
  // 없으면 빈 문자열이다 — 단정을 여기서 던지지 않는다(수집 단계에서 죽으면 이 파일의
  // 다른 단정까지 함께 사라져 무엇이 깨졌는지 안 보인다).
  const foldOf = () => {
    const start = images.indexOf("<details");
    const end = images.indexOf("</details>");
    if (start < 0 || end < start) return "";
    return images.slice(start, end).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  };

  it("★ 고치면 값이 든다고 미리 말한다", () => {
    const fold = foldOf();
    expect(fold, "유료 경고가 없다 — 사장님이 모르고 누른다").toMatch(/유료/);
    expect(fold, "지금 그림이 안 바뀐다는 말이 없다").toMatch(/다시 만들/);
  });

  // 버튼 이름은 **접힌 칸 안에서** 잰다 — 파일 전체를 훑으면 주석의 "원래대로"에 걸려
  // 버튼 이름을 바꿔도 초록이다(유료 경고에서 잡은 것과 같은 함정).
  it("원래대로 버튼이 있다 — 빈 값을 보내는 것이 구현이다", () => {
    const fold = foldOf();
    expect(fold, "[원래대로] 버튼 이름이 없다").toMatch(/원래대로/);
    expect(fold, "빈 값을 보내는 자리가 없다 — 되돌릴 길이 없다").toMatch(/onSavePrompt\([^)]*""\s*\)/);
  });

  // ★ `savePrompt` **함수 본문 안쪽만** 잘라서 잰다. 파일 전체를 훑는 단정은 아무것도 안
  //   쟀다(리뷰 실측): `/image_prompt/` 는 `cut.image_prompt` 판독과 주석에 걸리고
  //   `/method: "PATCH"/` 는 `editSentence` 에 걸려서, **함수를 통째로 지워도**(그러면
  //   `onSavePrompt={savePrompt}` 가 미정의 참조라 화면이 렌더에서 죽는다) 초록이었다.
  //   필드 이름을 `sentence` 로 바꿔도 초록이었다 — 그러면 프롬프트 저장이 **원고를
  //   덮어쓰고** ②대본에 거짓 경고가 뜬다(그 버튼이 유료다).
  const bodyOf = (name) => {
    const start = images.indexOf(`async function ${name}(`);
    if (start < 0) return "";
    // 컴포넌트 안의 함수라 들여쓰기 2칸에서 닫힌다.
    const end = images.indexOf("\n  }", start);
    if (end < 0) return "";
    return images.slice(start, end).replace(/\/\/[^\n]*/g, "");
  };

  it("저장은 컷별 프롬프트 필드로 PATCH 한다 — 저장 경로가 하나다", () => {
    const fn = bodyOf("savePrompt");
    expect(fn, "savePrompt 함수가 없다 — 화면이 미정의 참조로 죽는다").toBeTruthy();
    expect(fn, "PATCH 가 아니다").toMatch(/method: "PATCH"/);
    expect(fn, "프로젝트 저장 경로가 아니다").toMatch(/\/api\/projects\/\$\{id\}/);
    // ★ 담는 필드가 **image_prompt** 여야 한다. sentence 로 보내면 원고가 덮인다.
    expect(fn.replace(/\s+/g, " "), "컷의 image_prompt 로 안 보낸다")
      .toMatch(/cut: \{ idx, image_prompt \}/);
    // 화면에 실제로 배선돼 있어야 한다 — 함수만 있고 안 걸려 있으면 버튼이 죽는다.
    expect(images, "저장 함수가 미리보기에 안 걸려 있다").toMatch(/onSavePrompt=\{savePrompt\}/);
  });

  // 글자 수는 보여 준다. **상한 숫자는 화면에 안 적는다** — 값이 두 벌이면 갈린다
  // (상한은 lib/costs.js 의 LEDGER_PROMPT_MAX 하나이고, 넘으면 서버 문구가 뜬다).
  it("글자 수를 보여 주고, 상한 숫자는 화면에 적지 않는다", () => {
    expect(images, "글자 수 표시가 없다").toMatch(/length\}\s*자/);
    expect(images, "상한 숫자를 화면에 적었다 — 두 벌이면 갈린다").not.toMatch(/2000/);
  });

  // 기본 흐름을 어지럽히지 않는다 — 접어 둔다. 그리고 기존 "수정 지시" 입력칸은 살아 있어야
  // 한다(그쪽이 주경로다. 프롬프트 편집은 필요한 사람만 펼치는 곁길이다).
  it("접혀 있고, 기존 수정 지시 입력칸이 그대로 살아 있다", () => {
    expect(images).toMatch(/<details/);
    expect(images, "수정 지시 입력칸이 사라졌다").toMatch(/이 이미지에서 고치고 싶은 점/);
    expect(images).toMatch(/이 지시로 다시 만들기/);
  });
});

// ⑤영상 — ④이미지와 **같은 모양**이고, 다른 점이 하나다: 대사는 여기서 못 고친다.
//
// 왜 대사만 다른가: 같은 문자열을 ffmpeg 가 자막으로 태운다(lib/subtitles.js). 사장님이
// 영상 프롬프트에서 대사를 고칠 수 있으면 **들리는 말과 화면의 자막이 갈린다.** 그래서
// 대사 절은 꼬리에 있고(못 고친다), 화면이 그 사실을 말해 줘야 여기서 고치려 들지 않는다.
describe("⑤영상 — 프롬프트 편집", () => {
  // ★★ 2026-08-18 — ④이미지와 같은 [전문 복사]. **다만 서버에 묻지 않는다.**
  //    영상 프롬프트에는 레퍼런스 절이 없다(buildClipPrompt 는 refs 를 아예 안 받고, i2v 는
  //    그림 한 장과 프롬프트로 나가며 판형은 별도 요청 필드다) — 그래서 화면이 쥔
  //    `prompt + fixedTail` 이 이미 실제로 나가는 전문 그대로다.
  //    라우트를 부르면 **거짓 정확도**가 된다: 사장님이 방금 고친 본문이 서버의 옛 본문으로
  //    덮이는데, 얻는 것은 아무것도 없다.
  it("★ 프롬프트 전문을 한 번에 복사할 수 있다", () => {
    const fold = foldIn(video);
    expect(fold, "접힌 칸을 못 찾았다").toBeTruthy();
    expect(fold, "복사 버튼이 없다").toMatch(/복사/);
    expect(fold, "버튼이 copyAll 을 부르지 않는다 — 이름만 복사다").toMatch(/onClick=\{copyAll\}/);
    const copy = fnIn(video, "copyAll");
    expect(copy, "클립보드에 쓰지 않는다").toMatch(/clipboard/);
    expect(copy, "본문(prompt)을 안 싣는다").toMatch(/prompt/);
    expect(copy, "꼬리(fixedTail)를 안 싣는다").toMatch(/fixedTail/);
  });

  it("★ 서버에 묻지 않는다 — 영상 프롬프트에는 레퍼런스 절이 없다", () => {
    const copy = fnIn(video, "copyAll");
    expect(copy, "꼬리를 서버에서 받아 온다 — 방금 고친 본문이 옛 본문으로 덮인다")
      .not.toMatch(/fetch\(/);
  });

  it("★ 복사했다고 알린다 — 실패도 알린다", () => {
    const copy = fnIn(video, "copyAll");
    expect(copy, "복사됐다는 표시가 없다").toMatch(/복사했어요|복사됐어요/);
    expect(copy, "실패를 삼킨다 — 복사 안 됐는데 됐다고 보인다").toMatch(/복사하지 못했어요/);
    expect(foldIn(video), "표시를 그리는 자리가 없다").toMatch(/copyMsg/);
  });

  it("실제로 나가는 프롬프트를 보여 준다 — 서버와 같은 함수로 만든다", () => {
    expect(video, "화면이 buildClipPrompt 를 안 부른다 — 보는 것과 나가는 것이 갈린다")
      .toMatch(/buildClipPrompt/);
    expect(video, "본문 씨앗을 판정 함수에서 안 얻는다").toMatch(/promptBodyOf/);
    expect(video).toMatch(/from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/cuts"/);
  });

  // ★★ 돈에 가장 가까운 그물이다. 위 단정은 **import 문에 걸려** 아무것도 안 잰다 —
  //    호출을 서로 바꿔도 초록이었다(리뷰가 뮤테이션으로 실측했다). 그래서 컴포넌트 본문
  //    안에서 두 값이 **어느 함수로** 만들어지는지를 못 박는다:
  //      · generated = 본문 판정(promptBodyOf). 전체 조립으로 바꾸면 씨앗이 전체 프롬프트가
  //        되어, 한 번 고쳐 저장하는 순간 꼬리가 **두 벌**이 된다(Seedance 30초 회당 ~$9)
  //      · full = 전체 조립(buildClipPrompt). 본문 판정으로 바꾸면 fixedTail 이 빈 문자열이
  //        되어 접힌 칸이 **대사·립싱크·글자 금지를 아무것도 안 보여 준다** — 이 파일 첫
  //        단정이 막겠다고 적어 둔 바로 그 일이다
  it("★ 씨앗은 본문 판정으로, 꼬리는 전체 조립으로 만든다", () => {
    const comp = compIn(video, "ClipPromptEdit").replace(/\s+/g, " ");
    expect(comp, "ClipPromptEdit 본문을 못 찾았다").toBeTruthy();
    expect(comp, "씨앗을 본문 판정(promptBodyOf)으로 안 만든다 — 전체를 앉히면 꼬리가 두 벌이 된다")
      .toMatch(/const generated = promptBodyOf\("clip", \{ \.\.\.cut, clip_prompt: "" \}, project\)/);
    expect(comp, "꼬리를 전체 조립(buildClipPrompt)에서 떼지 않는다 — 꼬리가 빈 값이 된다")
      .toMatch(/const full = buildClipPrompt\(cut, project\)/);
  });

  // ★ 컷을 바꾸면 텍스트칸도 새로 시작해야 한다. key 를 지우면 앞 컷의 글이 남고, 그 글이
  //   이 컷의 clip_prompt 로 저장된다 — 구현자가 그 자리에 주석까지 달아 둔 결함이다.
  //   파일 전역으로 `/key=\{/` 를 찾으면 컷 목록의 key 에 걸려 아무것도 안 재므로
  //   **그 요소의 속성만** 잘라 낸다.
  it("★ 컷을 바꾸면 편집칸이 갈아 끼워진다 — key 가 그 구현이다", () => {
    const el = elementIn(video, "ClipPromptEdit");
    expect(el, "ClipPromptEdit 을 그리는 자리를 못 찾았다").toBeTruthy();
    expect(el, "key 가 없다 — 컷을 바꿔도 앞 컷 글이 남아 이 컷에 저장된다")
      .toMatch(/key=\{selected\.idx\}/);
  });

  // ★ 화면이 조립을 흉내내면 안 된다 — ④이미지와 같은 이유다. 문형을 화면에 한 벌 더 적으면
  //   그날부터 프롬프트가 두 곳에서 만들어지고, 사장님은 화면의 것을 읽고 서버는 자기 것을 보낸다.
  it("★ 화면이 프롬프트 문형을 스스로 적지 않는다", () => {
    for (const forbidden of [
      "The attached image is the first frame", "No text or letters", "natural lip sync",
    ]) {
      expect(video, `화면이 프롬프트 문구("${forbidden}")를 직접 들고 있다`).not.toContain(forbidden);
    }
  });

  it("★ 텍스트칸은 본문만 쥔다 — 꼬리는 떼어 내 보여 준다", () => {
    expect(video, "전체 프롬프트에서 꼬리를 떼어 내는 자리가 없다").toMatch(/\.slice\(/);
    // 텍스트칸이 하나뿐인 것이 "꼬리는 못 고친다"의 구현이다 — ⑤영상에는 수정 지시 칸이
    // 없으므로(컷별 [다시 만들기] 하나다) 프롬프트 칸 하나가 전부다.
    expect(video.match(/<textarea/g)?.length, "텍스트칸 수가 하나가 아니다 — 꼬리가 고쳐질 수 있다").toBe(1);
    // ★ 전체 프롬프트를 텍스트칸에 앉히면 저장할 때마다 꼬리가 한 벌씩 늘어난다.
    expect(video, "전체 프롬프트를 텍스트칸 값으로 쓴다 — 꼬리가 두 벌이 된다").not.toMatch(/value=\{\s*full\s*\}/);
    expect(video, "전체 프롬프트를 텍스트칸 씨앗으로 쓴다").not.toMatch(/useState\(\s*full\b/);
    // ★ 씨앗은 **사장님이 저장한 날 글자**다. 판정 결과(promptBodyOf)를 그대로 앉히면
    //   덮어쓰기 경로에서 코드가 붙인 절이 이미 들어 있어 저장할 때마다 한 벌씩 늘어난다.
    expect(video, "텍스트칸 씨앗을 이름 하나로 두지 않았다").toMatch(/const seed = saved \|\| generated/);
    expect(video, "텍스트칸이 씨앗에서 출발하지 않는다").toMatch(/useState\(seed\)/);
  });

  // ★★ 돈에 닿는 자리다(④이미지와 글자 그대로 같은 함정). 덮어쓰기가 없는 컷은
  //   `saved === ""` 이라, 잠금을 `saved` 로 재면 **아무것도 안 고쳤는데 [저장]이 눌린다.**
  //   한 번 눌리면 코드가 만든 본문이 덮어쓰기로 굳고 각인이 뒤집혀, 클립을 **틀린 사유로**
  //   다시 사게 된다(Seedance 30초 한 편이 회당 ~$9다).
  it("★ 덮어쓰기가 없고 텍스트칸을 안 건드렸으면 [저장]이 안 눌린다", () => {
    const fold = foldIn(video);
    const disabled = fold.match(/disabled=\{([^}]*)\}[\s\S]*?>\s*저장/)?.[1];
    expect(disabled, "[저장] 버튼의 잠금 조건을 못 찾았다").toBeTruthy();
    const cond = disabled.replace(/\s+/g, " ");
    expect(cond, "[저장]이 씨앗과 비교하지 않는다 — 안 고쳐도 눌려 각인이 뒤집힌다")
      .toContain("prompt.trim() === seed");
    // `=== saved || generated` 같은 형태도 막는다 — `(a === b) || c` 로 읽혀 **영원히 잠긴다**.
    expect(cond, "잠금 판정이 저장된 값만 본다").not.toMatch(/prompt\.trim\(\) === saved\b/);
  });

  // ★ 이 화면의 다른 점 하나. 파일 전체를 훑으면 위쪽 주석에 걸려 아무것도 안 재므로
  //   **접힌 칸 안의 사장님이 읽는 글**만 잘라 낸다.
  it("★ 대사는 여기서 못 고친다고 적는다 — 자막과 갈리기 때문이다", () => {
    const fold = foldIn(video);
    expect(fold, "대사 안내가 없다 — 사장님이 여기서 고치려 든다").toMatch(/대사/);
    expect(fold, "어디서 고치는지 안 알려 준다").toMatch(/대사[\s\S]*시나리오|시나리오[\s\S]*대사/);
  });

  it("★ 고치면 값이 든다고 미리 말한다", () => {
    const fold = foldIn(video);
    expect(fold, "유료 경고가 없다 — 사장님이 모르고 누른다").toMatch(/유료/);
    expect(fold, "지금 클립이 안 바뀐다는 말이 없다").toMatch(/다시 만들/);
  });

  it("원래대로 버튼이 있다 — 빈 값을 보내는 것이 구현이다", () => {
    const fold = foldIn(video);
    expect(fold, "[원래대로] 버튼 이름이 없다").toMatch(/원래대로/);
    expect(fold, "빈 값을 보내는 자리가 없다 — 되돌릴 길이 없다").toMatch(/onSavePrompt\([^)]*""\s*\)/);
  });

  it("저장은 컷별 프롬프트 필드로 PATCH 한다 — 저장 경로가 하나다", () => {
    const fn = fnIn(video, "savePrompt");
    expect(fn, "savePrompt 함수가 없다 — 화면이 미정의 참조로 죽는다").toBeTruthy();
    expect(fn, "PATCH 가 아니다").toMatch(/method: "PATCH"/);
    expect(fn, "프로젝트 저장 경로가 아니다").toMatch(/\/api\/projects\/\$\{id\}/);
    // ★ 담는 필드가 **clip_prompt** 여야 한다. sentence 로 보내면 원고가 덮이고,
    //   image_prompt 로 보내면 영상 편집이 그림을 낡게 만든다(컷당 $0.08).
    expect(fn.replace(/\s+/g, " "), "컷의 clip_prompt 로 안 보낸다")
      .toMatch(/cut: \{ idx, clip_prompt \}/);
    expect(video, "저장 함수가 미리보기에 안 걸려 있다").toMatch(/onSavePrompt=\{savePrompt\}/);
  });

  it("글자 수를 보여 주고, 상한 숫자는 화면에 적지 않는다", () => {
    expect(video, "글자 수 표시가 없다").toMatch(/length\}\s*자/);
    expect(video, "상한 숫자를 화면에 적었다 — 두 벌이면 갈린다").not.toMatch(/2000/);
  });

  it("접혀 있고, 기존 컷별 [다시 만들기]가 그대로 살아 있다", () => {
    expect(video).toMatch(/<details/);
    expect(video, "컷별 다시 만들기가 사라졌다").toMatch(/onClick=\{\(\) => regen\(c\.idx\)\}/);
  });
});

// ①자료 — 프로젝트 공통 지시 상자 둘.
//
// 컷별 덮어쓰기와 다른 값이다: 이쪽은 **전 컷의 프롬프트에 함께 실리는** 한 벌이다
// (lib/cuts.js promptNoteClause). 그래서 화면이 재야 할 것도 다르다 —
//   ① 칸이 **둘**이다(이미지·영상). 하나로 합치면 움직임 지시가 이미지 프롬프트에 붙어
//      정지 화면 설계가 망가진다(lib/cuts.js stillOnly 가 같은 이유로 존재한다)
//   ② 이미 있는 **화풍 보정(120자)을 건드리지 않는다** — 다른 값이고 다른 상한이다
//   ③ 저장이 화풍과 섞이면 안 된다(normalizeStyle 이 preset 을 함께 요구한다)
//   ④ 초기값을 매 렌더마다 덮으면 타이핑이 끊긴다
//   ⑤ 한 번 고치면 **전 컷이 낡는다** — 값이 든다고 미리 말해야 한다
// ★ 2026-08-17 리뷰 D3·D5 — 접힌 칸과 낡음 배지가 **사장님이 쓴 글**을 다룬 곳들이다.
//   둘 다 문구만 고친 것이지만, 문구가 틀리면 사장님이 엉뚱한 값을 되돌리며 찾는다.
describe("사장님이 쓴 글의 자리를 알려 준다", () => {
  // 배지 하나만 잘라 낸다 — 파일 전체를 훑으면 위쪽 주석에 걸려 배지를 지워도 초록이다.
  const staleBadge = (src, fn) => {
    const at = src.indexOf(`${fn}(c, project) && (`);
    if (at < 0) return "";
    const end = src.indexOf("</span>", at);
    return end < 0 ? "" : src.slice(at, end);
  };

  it("④이미지 낡음 배지가 사유를 화면 설명·화풍으로 좁혀 말하지 않는다", () => {
    const badge = staleBadge(images, "isImageStale");
    expect(badge, "낡음 배지를 못 찾았다").not.toBe("");
    // 프롬프트 덮어쓰기·프로젝트 공통 지시도 같은 배지를 띄운다(imageContextKey 가 각인한다)
    expect(badge, "프롬프트를 고쳐 낡은 컷에 틀린 사유를 보여 준다").toMatch(/프롬프트/);
    expect(badge, "공통 지시로 낡은 컷에 틀린 사유를 보여 준다").toMatch(/공통 지시/);
  });

  it("⑤영상 낡음 배지도 같은 사유를 다 말한다", () => {
    const badge = staleBadge(video, "isClipStale");
    expect(badge, "낡음 배지를 못 찾았다").not.toBe("");
    expect(badge, "프롬프트를 고쳐 낡은 컷에 틀린 사유를 보여 준다").toMatch(/프롬프트/);
    expect(badge, "공통 지시로 낡은 컷에 틀린 사유를 보여 준다").toMatch(/공통 지시/);
  });

  // 꼬리(`full.slice(seed.length)`)에는 코드의 계약뿐 아니라 **사장님이 직접 쓴 공통 지시**도
  // 들어 있다. "고칠 수 없어요"만 적혀 있으면 자기 글을 못 고치는 것으로 읽는다.
  //
  // ★★ 2026-08-18 — 그 칸이 ①자료에서 **첫 화면으로** 옮겼다. 그래서 "자료 단계에서 고칠 수
  //    있어요"는 그날부터 **거짓**이다. 옛 단정은 `자료` 라는 낱말만 봐서 초록인 채로 거짓을
  //    지켰다 — 낱말이 아니라 **지금 사실인지**를 재야 한다. 그래서 양쪽을 박는다:
  //    ① 언제 정하는지 말한다  ② ①자료를 가리키지 않는다(그 자리에 칸이 없다).
  // ★★★ 2026-08-18 (셋째 판) — 공통 지시 **칸 자체가 사라졌다**(사용자 지시로 첫 화면에서
  //    걷었다). 그래서 "만들 때 정하는 값"도 그날부터 거짓이다 — 이제 아무 데서도 못 정한다.
  //    같은 문장을 하루에 두 번 고쳤고, 두 번 다 **낱말이 아니라 사실**이 바뀐 것이다.
  //    지금 계약: 그 지시를 **가진 프로젝트에만** 그 줄이 뜬다(옛 프로젝트에는 값이 남아 있다).
  //    값이 없는 새 프로젝트에서 "함께 보내는 지시가 있다"고 말하면 없는 것을 설명하는 셈이다.
  // ★★★ 2026-08-18 (넷째 판, 사용자 지시) — 그 안내를 **아예 걷었다**:
  //    "고칠 수 없어요 부분은 사용자한테 안 보여줘도 될 것 같아."
  //    맞는 판단이다. 고칠 자리가 저장소 어디에도 없는 값이라면, 그것이 프롬프트에 실린다는
  //    사실은 **우리 사정**이다 — 사장님이 할 수 있는 일이 하나도 없는 안내는 화면을 무겁게만
  //    한다(이 저장소가 "폰트가 한 벌이라…"를 걷은 것과 같은 판단이다).
  //
  //    이 문장을 하루에 **세 번** 고쳤고 세 번 다 사실이 바뀐 것이다: 자료 단계에서 고친다 →
  //    만들 때 정한다 → 못 고친다 → **말하지 않는다**. 마지막이 가장 짧고 가장 정직하다.
  for (const [step, fold] of [["④이미지", () => foldIn(images)], ["⑤영상", () => foldIn(video)]]) {
    it(`${step} — 고칠 수 없는 값을 설명하지 않는다`, () => {
      const box = fold();
      expect(box, "공통 지시 안내가 남아 있다 — 사장님이 할 수 있는 일이 없는 말이다")
        .not.toMatch(/함께 보내는 지시/);
      // 값이 프롬프트에 실리는 것 자체는 그대로다 — 꼬리 문단이 그 글자를 이미 보여 준다.
      expect(box, "꼬리를 보여 주는 자리까지 사라졌다").toMatch(/fixedTail/);
    });
  }
});

// ★★ 2026-08-18 — 자리가 **첫 화면**으로 옮겼다(사용자 지시). ①자료가 첫 화면에서 이미
//    받은 값들과 함께 이 칸까지 다시 받고 있었다. 옮기면서 저장 방식이 바뀐다:
//    ①자료는 칸마다 blur 에 PATCH 를 쳤지만, 첫 화면은 **만들 때 한 번** 함께 보낸다.
//    그래서 "헛 PATCH"·"저장 중 포커스 날림" 같은 옛 못은 여기서 뜻을 잃고, 대신
//    **두 칸이 섞이지 않는가**와 **만들 때 실려 가는가**가 이 기능의 전부가 된다.
// ★★ 2026-08-18 (둘째 결정) — **공통 지시 칸을 걷었다.** 사장님 지시:
//    "사용자가 입력하는 첫번째 텍스트칸에서 처리할 수 있게 해줘. 구분해서 받으면 너무
//     복잡할 것 같고 그냥 맨 위 텍스트폼에서 모든 걸 처리하자."
//
//    같은 날 아침에 ①자료에서 첫 화면으로 **옮겨 온** 칸인데, 옮기고 보니 첫 화면이
//    자료 칸 + 지시 칸 둘이 되어 "무엇을 어디에 적어야 하는가"가 사장님 몫이 됐다.
//    바라는 화풍·촬영 느낌은 자료 칸에 함께 적으면 되고, 그 글이 시나리오·화면 설계를
//    거쳐 그림에 닿는다.
//
// ★ **값을 자동으로 뽑지 않는 이유**(자료에서 LLM 이 지시를 추출하는 길도 있었다):
//   `image_note` 는 그림 각인에 들어간다(lib/steps.js imageContextKey). 시나리오를 다시
//   만들 때마다 뽑힌 문장이 조금씩 달라지면 **전 컷 그림이 낡아 재구매가 열린다**
//   (컷당 $0.08 · 클립까지 낡으면 컷당 $0.674). 사장님이 손으로 적을 때는 안 흔들리던
//   값이라 이 위험이 없었다. 그래서 "안 받는다"를 골랐다 — 빈 값이면 절이 아예 안 붙어
//   프롬프트가 예전과 글자 그대로 같다.
//
// ⚠️ 서버(POST /api/projects · PATCH)는 여전히 이 값을 **받을 수 있다**(tests/routes.test.js).
//    화면만 안 보낸다 — 나중에 파워 유저용 자리를 다시 열 때 배관을 다시 깔지 않아도 된다.
describe("첫 화면 — 공통 지시를 따로 받지 않는다", () => {
  it("★ 지시 칸이 없다 — 자료 칸 하나로 받는다", () => {
    expect(create, "이미지 지시 칸이 남아 있다").not.toMatch(/이미지에 함께 보낼 지시/);
    expect(create, "영상 지시 칸이 남아 있다").not.toMatch(/영상에 함께 보낼 지시/);
    // 상태·전송까지 함께 사라져야 한다 — 칸만 지우고 상태가 남으면 다음 사람이 되살린다
    expect(create, "지시 상태가 남았다").not.toMatch(/imageNote|clipNote/);
    expect(create, "만들 때 여전히 지시를 보낸다").not.toMatch(/image_note|clip_note/);
  });

  it("★ 자료 칸이 그 자리를 대신한다고 말한다", () => {
    // 칸이 사라지면 사장님은 "화풍 요구를 어디에 적나"를 알 수 없다. 자료 칸이 그 자리다.
    expect(create, "자료 칸이 무엇까지 받는지 안 알려 준다").toMatch(/composer-text[\s\S]{0,900}(느낌|분위기|화풍|원하는)/);
  });

  it("★ 화풍 보정 입력은 그대로 남는다 — 다른 값이다", () => {
    expect(create, "화풍 보정을 지웠다").toMatch(/note=\{styleNote\}/);
    expect(create, "화풍 보정 입력이 상태를 안 고친다").toMatch(/onNote=\{setStyleNote\}/);
    expect(create, "화풍 고르는 자리가 사라졌다").toMatch(/<StylePicker(?=[\s/>])/);
  });
});

// ★★ 두 번 묻지 않는다(2026-08-18, 사용자 지시). ①자료가 첫 화면에서 이미 받은 값을 다시
//    받고 있었다 — 사이즈·컨셉은 글자 그대로 중복이었고, 화질·공통 지시는 그 화면에만 있어
//    "처음에 정한 것"과 "나중에 정하는 것"이 갈려 있었다. 지금은 전부 첫 화면 하나다.
//    이 묶음은 그 화면이 **입력을 다시 들이지 않는지** 지킨다.
describe("①자료 — 뒷단 값을 다시 묻지 않는다", () => {
  for (const [what, pattern] of [
    ["사이즈", /ASPECTS/],
    ["컨셉", /StylePicker/],
    ["화질", /resolutionsForProject/],
    ["이미지 공통 지시", /image_note/],
    ["영상 공통 지시", /clip_note/],
  ]) {
    it(`★ ${what}를 다시 받지 않는다`, () => {
      expect(briefing, `${what} 입력이 ①자료에 남아 있다 — 첫 화면에서 이미 받았다`)
        .not.toMatch(pattern);
    });
  }

  // 입력이 없어졌으니 저장할 것도 없다. PATCH 가 남아 있으면 그 자리에 칸이 다시 붙는다.
  it("★ 저장(PATCH)하는 자리가 없다", () => {
    expect(briefing, "①자료가 아직 프로젝트를 고친다").not.toMatch(/method: "PATCH"/);
  });

  // 남아야 하는 것 — 자료를 보여 주고 다음으로 보내는 일. 그것까지 지우면 흐름이 끊긴다.
  it("★ 자료를 보여 주고 시나리오로 보낸다", () => {
    expect(briefing, "적어 준 자료를 안 보여 준다").toMatch(/material\?\.text/);
    expect(briefing, "다음으로 가는 길이 없다").toMatch(/\/scenario/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// ②시나리오 — 칸마다 **누가 읽는가**로 언어가 갈린다(lib/scenario.js 의 SYSTEM).
//
// narrator_voice 는 번역 단계 없이 영상 모델에 실린다(lib/cuts.js speechFor 의 `Voice:` 절).
// 그런데 이 칸은 **사장님이 보고 고치는 칸**이라, 자리표시자가 한국어 예시를 권하면
// 사장님은 그 예시를 따라 한국어로 고치고 그 한국어가 그대로 fal 에 나간다 — 화면 스스로가
// "고칠 수 있는 척하는 칸"이라 부르며 경계한 것과 같은 종류의 거짓말이다.
// 반대로 beat·line·speaker·angle 은 한국어가 맞다(사장님과 다음 단계 LLM 이 읽고, line 은
// 그대로 자막이 된다). 다음 영문화 회차가 **어느 쪽으로도** 흔들지 못하게 양쪽을 박아 둔다.
const SCENARIO_PAGE = "app/create/[id]/scenario/page.js";
const scenarioPage = readFileSync(SCENARIO_PAGE, "utf8");

// `{조건 && (` … `\n      )}` 로 묶인 조건부 JSX 덩어리. 내레이터 칸이 그 안에 있다.
// ★ 파일 전체를 훑으면 아무것도 안 잰다 — 위 주석과 다른 칸의 자리표시자에 걸린다.
//   그래서 JSX 주석까지 걷어 **사장님이 실제로 보는 글자만** 남긴다.
const condBlockIn = (src, head) => {
  const start = src.indexOf(`{${head} && (`);
  if (start < 0) return "";
  const end = src.indexOf("\n      )}", start);
  if (end < 0) return "";
  return src.slice(start, end).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
};
// ★ 2026-08-18 — 조건에 `voiceOpen` 이 붙었다. 내레이터 칸을 사장님 화면에서 걷고
//   **값이 비어 확정이 막힐 때만** 열기 때문이다(tests/scenario-ui.test.js 가 그 계약을
//   지킨다). 여기서 재는 것은 "칸이 나타났을 때 무슨 글자가 보이는가"라 그대로 유효하다.
//   조건을 상수로 뺀 이유: 두 테스트가 같은 문자열을 손으로 적으면 한쪽만 고쳐지는 날
//   그 테스트는 빈 블록을 재며 조용히 통과한다.
const NARRATOR_COND = "hasNarration(scenario) && voiceOpen";
const HANGUL = /[가-힣]/;
const placeholdersIn = (block) => [...block.matchAll(/placeholder="([^"]*)"/g)].map((m) => m[1]);

describe("②시나리오 — 칸마다 언어가 다르다", () => {
  it("★ 내레이터 목소리 자리표시자는 영어다 — 그 글자가 영상 모델에 그대로 실린다", () => {
    const block = condBlockIn(scenarioPage, NARRATOR_COND);
    expect(block, "내레이터 목소리 블록을 못 찾았다").toBeTruthy();
    expect(block, "이 블록이 내레이터 칸이 아니다").toContain("narrator_voice");
    const holders = placeholdersIn(block);
    expect(holders.length, "자리표시자가 없다 — 사장님이 무엇을 적을지 모른다").toBe(1);
    expect(HANGUL.test(holders[0]), `자리표시자가 한국어를 권한다("${holders[0]}") — 사장님이 그대로 따라 적으면 그 한국어가 fal 에 나간다`).toBe(false);
  });

  it("★ 왜 영어인지 안내한다 — 이유가 없으면 사장님은 실수로 보고 한국어로 고친다", () => {
    const block = condBlockIn(scenarioPage, NARRATOR_COND);
    expect(block, "영어로 적어야 한다는 안내가 없다").toMatch(/영어/);
    // 안내 문구는 **사장님이 읽는 자리**에 있어야 한다 — 라벨·주석이 아니라 pgsub 문단이다.
    // 줄 단위로 본다: `<b>영어로</b>` 처럼 강조 태그가 끼어도 걸리게(태그 통과 정규식은
    // 강조를 넣는 순간 조용히 빨개져 안내를 지운 것과 구분되지 않는다).
    const guide = block.split("\n").find((l) => l.includes("영어") && l.includes('className="pgsub"'));
    expect(guide, "영어로 적으라는 안내가 화면 문단(pgsub)에 없다").toBeTruthy();
  });

  // ★ 반대 방향의 그물이다. beat·line·speaker 는 사장님과 다음 단계 LLM 이 읽고, line 은
  //   ffmpeg 가 그대로 자막으로 태운다(lib/subtitles.js) — 영어로 바꾸면 사장님 영상에
  //   영어 자막이 박힌다. speaker 는 "내레이션"이라는 그 낱말이 판정에 쓰인다.
  it("★ 장면 칸들은 한국어를 지킨다 — 영문화가 여기까지 번지면 자막이 영어가 된다", () => {
    const rows = scenarioPage.slice(scenarioPage.indexOf('<div className="plan-list">'));
    expect(rows, "장면 목록을 못 찾았다").toBeTruthy();
    for (const label of ["이 장면이 하는 일", "대사", "말하는 사람"]) {
      expect(rows, `장면 칸 라벨("${label}")이 사라졌다`).toContain(label);
    }
    for (const holder of placeholdersIn(rows)) {
      expect(HANGUL.test(holder), `장면 칸 자리표시자가 영어다("${holder}") — 이 칸들은 사장님과 다음 단계 LLM 이 읽는다`).toBe(true);
    }
  });
});

// ★ 화면이 끌어오는 사슬 어디에도 `fs`·`path` 가 없어야 한다. 이 저장소는 화면이 서버 전용
//   모듈을 끌어와 빌드가 깨진 사고를 세 번 겪었고, 그때 **테스트는 전부 초록**이었다.
//   프롬프트 때문에 lib/cuts 를 새로 끌어왔으니 그 사슬을 여기서 잰다.
const SERVER_ONLY = /\bfrom\s+"(fs|node:fs|fs\/promises|node:fs\/promises|path|node:path|child_process|node:child_process)"/;

function chainOf(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/from\s+"(\.[^"]+)"/g)) {
      const base = resolve(dirname(file), m[1]);
      // ★ `.jsx` 를 반드시 센다. 여기서 `.js` 로만 걸렀더니 `components/` 아래
      //   (ProjectContext·MeContext·BackButton — 전부 `.jsx`)가 사슬에 **한 파일도 안
      //   들어왔다.** 화면 컴포넌트가 서버 전용 모듈을 끌어와도 초록이었다(리뷰 실측).
      const hit = [base, `${base}.js`, `${base}.jsx`, `${base}/index.js`, `${base}/index.jsx`]
        .find((p) => existsSync(p) && /\.jsx?$/.test(p));
      if (hit) queue.push(hit);
    }
  }
  return [...seen];
}

describe("④이미지 화면의 import 사슬 — 서버 전용 모듈이 없다", () => {
  it("★ 사슬에 fs·path 가 없다", () => {
    const chain = chainOf(resolve(PAGE));
    // 그물이 실제로 무언가를 훑는지 먼저 본다 — 사슬이 짧으면 이 테스트는 헛돈다.
    expect(chain.length, "사슬을 못 따라갔다").toBeGreaterThan(15);
    expect(chain.some((f) => f.endsWith("cuts.js")), "lib/cuts.js 가 사슬에 없다").toBe(true);
    // ★ 화면 컴포넌트까지 닿았는가 — `.jsx` 를 건너뛰면 여기서 걸린다.
    for (const must of ["ProjectContext.jsx", "MeContext.jsx", "BackButton.jsx"]) {
      expect(chain.some((f) => f.endsWith(must)), `${must} 가 사슬에 없다 — .jsx 를 건너뛴다`).toBe(true);
    }
    const bad = chain.filter((f) => SERVER_ONLY.test(readFileSync(f, "utf8")));
    expect(bad, `화면이 서버 전용 모듈을 끌어온다: ${bad.join(", ")}`).toEqual([]);
  });
});

// ⑤영상도 같은 그물이 필요하다 — 프롬프트를 보여 주려고 lib/cuts 를 새로 끌어왔다.
// (④이미지와 따로 재는 이유: 사슬이 다르고, 한쪽만 깨져도 앱이 안 뜬다.)
describe("⑤영상 화면의 import 사슬 — 서버 전용 모듈이 없다", () => {
  it("★ 사슬에 fs·path 가 없다", () => {
    const chain = chainOf(resolve(VIDEO_PAGE));
    expect(chain.length, "사슬을 못 따라갔다").toBeGreaterThan(15);
    expect(chain.some((f) => f.endsWith("cuts.js")), "lib/cuts.js 가 사슬에 없다").toBe(true);
    for (const must of ["ProjectContext.jsx", "MeContext.jsx", "BackButton.jsx"]) {
      expect(chain.some((f) => f.endsWith(must)), `${must} 가 사슬에 없다 — .jsx 를 건너뛴다`).toBe(true);
    }
    const bad = chain.filter((f) => SERVER_ONLY.test(readFileSync(f, "utf8")));
    expect(bad, `화면이 서버 전용 모듈을 끌어온다: ${bad.join(", ")}`).toEqual([]);
  });
});
