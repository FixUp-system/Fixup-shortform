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

describe("④이미지 — 프롬프트 편집", () => {
  it("실제로 나가는 프롬프트를 보여 준다 — 서버와 같은 함수로 만든다", () => {
    expect(images, "화면이 buildImagePrompt 를 안 부른다 — 보는 것과 나가는 것이 갈린다")
      .toMatch(/buildImagePrompt/);
    expect(images, "본문 씨앗을 판정 함수에서 안 얻는다").toMatch(/promptBodyOf/);
    expect(images).toMatch(/from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/cuts"/);
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
    expect(images, "텍스트칸 씨앗이 본문 판정에서 오지 않는다").toMatch(/useState\([^)]*generated/);
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

  it("원래대로 버튼이 있다 — 빈 값을 보내는 것이 구현이다", () => {
    expect(images).toMatch(/원래대로/);
    expect(images, "빈 값을 보내는 자리가 없다 — 되돌릴 길이 없다").toMatch(/savePrompt\([^)]*""\s*\)|onSavePrompt\([^)]*""\s*\)/);
  });

  it("저장은 컷별 프롬프트 필드로 PATCH 한다 — 저장 경로가 하나다", () => {
    expect(images).toMatch(/image_prompt/);
    expect(images).toMatch(/method: "PATCH"/);
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

// ★ 화면이 끌어오는 사슬 어디에도 `fs`·`path` 가 없어야 한다. 이 저장소는 화면이 서버 전용
//   모듈을 끌어와 빌드가 깨진 사고를 세 번 겪었고, 그때 **테스트는 전부 초록**이었다.
//   프롬프트 때문에 lib/cuts 를 새로 끌어왔으니 그 사슬을 여기서 잰다.
describe("④이미지 화면의 import 사슬 — 서버 전용 모듈이 없다", () => {
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
        const hit = [base, `${base}.js`, `${base}.jsx`, `${base}/index.js`].find((p) => existsSync(p) && p.endsWith(".js"));
        if (hit) queue.push(hit);
      }
    }
    return [...seen];
  }

  it("★ 사슬에 fs·path 가 없다", () => {
    const chain = chainOf(resolve(PAGE));
    // 그물이 실제로 무언가를 훑는지 먼저 본다 — 사슬이 한 파일뿐이면 이 테스트는 헛돈다.
    expect(chain.length, "사슬을 못 따라갔다").toBeGreaterThan(5);
    expect(chain.some((f) => f.endsWith("cuts.js")), "lib/cuts.js 가 사슬에 없다").toBe(true);
    const bad = chain.filter((f) => SERVER_ONLY.test(readFileSync(f, "utf8")));
    expect(bad, `화면이 서버 전용 모듈을 끌어온다: ${bad.join(", ")}`).toEqual([]);
  });
});
