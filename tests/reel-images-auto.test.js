// ③이미지 — **누르지 않아도 그려지고, 보이는 것은 한 장이다** (2026-08-27 사장님 지시).
//
// 뿌리 둘:
//  ① 그리기 전 화면에 **빈 컷 상자가 N개** 서 있었다(오늘 프로젝트: 컷 4개 · 그림 0개).
//     그래서 만드는 방식이 "컷별로 나눠 그려 합친다"처럼 읽혔다 — 실제로는 스토리보드
//     **한 장**을 사서 칸을 자른다(app/api/reel/[id]/images/route.js). 사장님 말:
//     "최종적으로 이미지 1컷을 생성하는거지 5~6컷 분할 생성에서 합치는 방식이 아니니까".
//  ② 그림을 **버튼으로** 시작하게 되어 있었다. ②시나리오처럼 들어오면 스스로 그린다.
//
// ⚠️ 이것은 **돈이 나가는 자동화다**($0.401 한 장). 그래서 이 판은 "자동으로 도는가"만
//   재지 않는다 — **한 번만 도는가**(auto 표식 · 이미 있으면 안 부름 · 상한)를 함께 잰다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const raw = readFileSync("app/reel/[id]/images/page.js", "utf8");
// 주석은 뺀다 — 주석에 적힌 말이 단정을 통과시키면 그물이 아니다.
const src = raw
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "");

describe("③이미지가 스스로 그린다", () => {
  it("화면이 뜨면 부른다 — useEffect 를 쓴다", () => {
    expect(src).toContain("useEffect");
    expect(src).toMatch(/draw\(null, \{ auto: true \}\)/);
  });

  it("★ auto 표식을 실어 보낸다 — 이것이 '평생 한 번'의 근거다", () => {
    expect(src, "auto 를 몸통에 안 싣는다").toMatch(/opts\.auto \? \{ auto: true \}/);
  });

  it("★ 이미 한 번 돌았으면 안 부른다 — 새로고침마다 $0.401 이 나가면 안 된다", () => {
    const at = src.indexOf("autoRef.current = true");
    expect(at, "자동 생성 자리를 못 찾았다").toBeGreaterThan(-1);
    const guards = src.slice(Math.max(0, at - 500), at);
    expect(guards, "문서의 표식을 안 본다").toContain("reel.autoImaged");
    expect(guards, "이미 있는 그림을 안 본다").toContain("hasImages");
    expect(guards, "그리는 중·굽는 중을 안 본다").toMatch(/drawingNow/);
    expect(guards, "회차 상한을 안 본다").toContain("canDraw");
  });

  it("중복 실행을 막는 자물쇠가 있다 — 개발 모드는 effect 를 두 번 돌린다", () => {
    expect(src).toMatch(/useRef/);
  });

  it("버튼은 남는다 — 자동이 실패했을 때 다시 누를 유일한 길이다", () => {
    expect(src).toContain("const drawBtn");
  });
});

// ★★ 2026-08-27 (같은 날 두 번째 지시) — **통합 한 장을 화면에서 뺐다.**
//   먼저 "그리기 전 빈 컷 상자 N개" 를 한 장짜리 자리로 바꿨고(그 사고: 만드는 방식이
//   컷별 분할처럼 읽혔다), 그 다음 사장님이 "기존에 4컷을 통합한건 제거해줘" 라고 했다.
//   지금 ③이미지가 보여 주는 것은 **컷마다 [그림 · 그 칸에 실린 지문]** 한 줄씩이다.
//   ★ 만드는 방식은 안 바뀌었다 — 여전히 한 장을 사서 칸을 자른다. 바뀐 것은 보여 주는
//     방식뿐이고, 그 사실은 tests/reel-storyboard*.test.js 가 계속 잰다.
describe("보여 주는 것은 컷별 [그림 · 지문] 이다", () => {
  // ★★ 이 자리는 하루에 두 번 뒤집혔다(2026-08-27) — 기록을 남겨 둔다:
  //   ① "그리기 전 빈 컷 상자 N개" 를 한 장짜리 자리로 바꿈(만드는 방식이 분할처럼 읽혔다)
  //   ② "기존에 4컷을 통합한건 제거해줘" — 통합본을 뺌
  //   ③ "전체 4컷도 상단에 배치해줘 4컷도 다운 받을 수 있게" — **맨 위로 되돌림**
  //   지금의 뜻: 통합본은 **전체 흐름을 한눈에** 보는 자리이고, "어느 칸이 어느 문장인가"는
  //   아래 컷별 목록이 맡는다. 둘 다 있어야 각자 제 일만 한다.
  it("통합 한 장이 **맨 위**에 있다 — 컷별 목록보다 앞이다", () => {
    const sheet = src.indexOf("sheet-view");
    const lines = src.indexOf("panel-lines");
    expect(sheet, "통합본이 없다").toBeGreaterThan(-1);
    expect(lines, "컷별 목록이 없다").toBeGreaterThan(-1);
    expect(sheet, "통합본이 컷별 목록보다 아래에 있다").toBeLessThan(lines);
  });

  it("★ 통합본도 내려받을 수 있다 — 그 한 장은 fal 에 있어 링크만으로는 저장이 안 된다", () => {
    expect(src).toContain("전체 내려받기");
    expect(src).toMatch(/\/sheet`/);
    const route = readFileSync("app/api/reel/[id]/sheet/route.js", "utf8");
    expect(route, "내려받기 헤더가 없다").toContain("Content-Disposition");
    // ★ 화면이 준 주소를 그대로 열면 아무 URL 이나 받아 오는 문이 된다(SSRF).
    expect(route, "주소를 문서에서 안 판다").toContain("reelSheetUrl");
  });

  it("컷마다 한 줄씩 선다", () => {
    expect(src).toContain("panel-lines");
    expect(src).toContain("panel-thumb");
    expect(src).toContain("panel-body");
  });

  it("★ 지문은 굽기와 **같은 함수**가 만든다 — 화면이 조립하면 실제와 갈린다", () => {
    expect(src, "panelBody 를 안 쓴다").toContain("panelBody");
    // shows 를 화면에서 직접 그리면 카메라가 빠져 실제 지문과 달라진다.
    expect(src, "shows 를 화면이 직접 그린다").not.toMatch(/c\.shows/);
  });

  it("그림이 없어도 그린다 — 굽기 전에도 무엇을 그릴지 읽을 수 있다", () => {
    const at = src.indexOf("panel-lines");
    const cond = src.slice(Math.max(0, at - 200), at);
    expect(cond, "그림이 있을 때만 그린다").not.toMatch(/hasImages &&\s*\(?\s*$/);
  });

  it("여기에는 버튼이 없다 — 칸 하나만 다시 그리면 그 칸만 딴 사람이 된다", () => {
    const at = src.indexOf("panel-lines");
    const block = src.slice(at, src.indexOf("</ol>", at));
    expect(block).not.toContain("<button");
  });

  it("CSS 에 그 줄이 있다 — 클래스만 적고 스타일이 없으면 아무렇게나 쌓인다", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/^\.panel-lines \{/m);
    expect(css).toMatch(/^\.panel-thumb \{/m);
  });

  it("컷별 갈래의 상자는 남는다 — 거기에는 칸마다 [다시 만들기] 가 붙어 있다", () => {
    expect(src).toContain("cut-shots");
  });
});

describe("②시나리오의 다음 버튼", () => {
  const scenario = readFileSync("app/reel/[id]/scenario/page.js", "utf8");

  it("가서 무엇이 되는지 말한다 — '이미지 생성'", () => {
    expect(scenario).toContain("이미지 생성 →");
  });
});

// ★★ 2026-08-27 (셋째 지시) — 컷별 줄만 보여 주니 **그것이 지문의 전부처럼** 읽혔다.
//   사장님: "이미지 생성 프롬프트가 내용이 훨씬 긴데 기본적으로 들어가는 내용도 포함시켜줘".
//   실제 지문에는 판형·인물 유지·화풍·글자 금지·첨부 사진 설명이 함께 나간다.
describe("지문 전체를 볼 수 있다", () => {
  it("접힌 자리에 지문 전체가 있다", () => {
    expect(src).toContain("이미지 생성 지문 전체");
    expect(src).toContain("lib-fold");
  });

  it("★ 그린 뒤에는 **각인된 그 글**을 보여 준다 — 다시 조립하면 실제와 갈린다", () => {
    expect(src).toMatch(/c\.image\?\.of/);
    // 저장된 것이 먼저이고, 미리보기는 그것이 없을 때만이다.
    expect(src).toMatch(/savedPrompt \|\|/);
  });

  it("아직 안 그렸으면 같은 함수로 미리보기를 만든다", () => {
    expect(src).toContain("buildStoryboardPrompt");
    expect(src).toContain("미리보기");
  });
});

describe("이미지를 내려받을 수 있다", () => {
  it("컷마다 내려받기가 있다", () => {
    expect(src).toContain("내려받기");
    expect(src).toMatch(/download=/);
  });

  // ★ 같은 일을 하는 버튼은 화면마다 같은 모양이어야 한다(2026-08-27 사장님 지적).
  //   처음에 `.tag` 로 뒀는데 그 클래스는 컷 상자(.up) 안에서만 스타일이 붙어서,
  //   여기서는 아무 모양 없는 맨 글자로 떴다.
  it("★ 보관함·⑥완성의 [내려받기]와 같은 모양이다(.mini)", () => {
    const at = src.indexOf("내려받기");
    const block = src.slice(Math.max(0, at - 500), at);
    expect(block, "mini 가 아니다").toContain('className="mini');
    const archive = readFileSync("app/archive/[id]/page.js", "utf8");
    expect(archive, "보관함 쪽이 다른 모양이 됐다").toMatch(/className="mini"[^>]*download/);
  });

  it("★ 우리 버킷 주소에는 ?dl=1 을 붙인다 — 안 붙이면 파일 이름이 uuid 로 저장된다", () => {
    expect(src).toContain("?dl=1");
    const route = readFileSync("app/api/uploads/[name]/route.js", "utf8");
    expect(route, "라우트가 dl 을 모른다").toContain("dl=1");
    expect(route, "내려받기 헤더가 없다").toContain("Content-Disposition");
  });

  it("★ 주소를 파싱하다 던지지 않는다 — 사진 한 장이 500 이 되면 안 된다", () => {
    // 주석은 뺀다 — 왜 안 쓰는지 적어 둔 그 문장이 단정에 걸린다.
    const route = readFileSync("app/api/uploads/[name]/route.js", "utf8")
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(route, "new URL 로 파싱한다").not.toMatch(/new URL\(req\.url\)/);
  });
});
