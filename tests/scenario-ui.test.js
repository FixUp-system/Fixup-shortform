// 이 저장소에는 컴포넌트 렌더 테스트 인프라가 없다 — 소스 문자열로 계약을 잰다.
// ⚠️ 이 방식은 문법이 깨진 파일을 못 잡는다. 그래서 화면을 고치면 반드시 굽는다
//    (SHOTFORM_DIST_DIR=.next-verify npx next build).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("app/create/[id]/scenario/page.js", "utf8");

describe("②시나리오 화면", () => {
  it("★ 판정을 화면이 손으로 다시 적지 않는다 — 같은 함수를 쓴다", () => {
    expect(page).toMatch(/from ["'].*lib\/scenario-rules["']/);
    expect(page).toContain("checkScenario");
  });

  it("★ 초 합계를 늘 보여 준다", () => {
    expect(page).toContain("scenarioSeconds");
  });

  it("★ 고칠 수 있는 칸이 넷이다 — beat·line·speaker·seconds", () => {
    for (const f of ["beat", "line", "speaker", "seconds"]) {
      expect(page, `${f} 를 고치는 칸이 없다`).toContain(f);
    }
  });

  it("★ 장면을 더하고 지울 수 있다", () => {
    expect(page).toMatch(/장면 추가|추가하기/);
    expect(page).toMatch(/삭제|지우기/);
  });

  it("★ 규칙에 걸리면 다음으로 못 간다", () => {
    expect(page).toMatch(/disabled=\{[^}]*ok/);
  });

  it("★ 무엇이 틀렸는지 화면이 말한다", () => {
    expect(page).toContain("problems");
  });

  // 이 저장소는 setInterval 을 화면에서 직접 돌리는 것을 금지한다(lib/poll.js 한 벌)
  // ★ 옛 ②대본 화면이 POST /cuts 를 불렀다. 그 화면이 지워지므로 이 자리가 물려받지 않으면
  //   컷을 만드는 자리가 저장소에서 사라진다.
  it("★ 확정한 뒤 컷 분할을 시작한다", () => {
    expect(page).toMatch(/\/cuts`/);
    expect(page, "409(이미 나눈 컷)를 정상으로 봐야 한다").toContain("409");
  });

  // ★ 다시 나누면 그 컷의 그림·영상이 사라진다. 서버의 409 는 이제 낡은 컷을 막지 않으므로
  //   (Task 7 의 각인) 여기서 안 물어보면 산 것이 말없이 날아간다.
  it("★ 낡은 컷을 다시 나누기 전에 물어본다", () => {
    expect(page).toContain("areCutsStale");
    expect(page).toMatch(/useDialog|confirm\(\{/);
    expect(page, "무엇을 잃는지 말해야 한다").toMatch(/사라져요|사라집니다/);
  });

  // ★★ 2026-08-16 최종 리뷰 Important 3 — 이 화면은 시나리오 단계의 **유일한 품질 관문**이다
  //    (원고 시절의 되돌리기·채점이 없다). 그런데 규칙이 어긋나면 [확정]이 잠기고, 그것이
  //    유일한 저장 경로라 고친 것을 남길 방법이 하나도 없었다 — 자리를 뜨면 통째로 사라졌다.
  it("★ 확정하지 않고도 저장할 수 있다 — 한 자리에서 다 맞추지 못해도 된다", () => {
    expect(page, "임시저장 버튼이 없다").toMatch(/임시저장/);
    // 라우트의 PATCH 는 confirmed 없이 부르면 저장만 한다(확정만 규칙을 강제한다)
    expect(page).toMatch(/body: JSON\.stringify\(\{ scenario \}\)/);
    // 규칙이 어긋나도 눌려야 한다 — ok 로 잠그면 저장할 길이 다시 없어진다
    expect(page).toMatch(/onClick=\{saveDraft\} disabled=\{busy\}/);
  });

  // ★★ 같은 리뷰 Important 3 — 생성이 실패하면 오류 문구만 남고, madeFor 각인 때문에
  //    자동 생성도 다시 안 돈다. 새로고침이 유일한 복구였다.
  it("★ 생성이 실패하면 다시 시도할 수 있다", () => {
    expect(page).toMatch(/다시 시도/);
    expect(page, "madeFor 를 풀지 않으면 버튼이 아무 일도 못 한다").toMatch(/madeFor\.current = null/);
  });

  // ★★ 같은 리뷰 Important 5 — angle 은 컷 각인에 안 들어간다(산 그림·클립을 지킨다).
  //    그래서 컷이 이미 있으면 고쳐도 아무 일도 안 일어난다. 말 안 하면 "고칠 수 있는 척하는 칸"이다.
  it("★ 컷이 있으면 전달 방식 칸이 언제 반영되는지 말한다", () => {
    expect(page).toMatch(/다음에 컷을 나눌 때/);
  });

  it("★ setInterval 을 직접 돌리지 않는다", () => {
    expect(page).not.toContain("setInterval");
  });

  // 다음 주소를 손으로 적으면 말하는 프로젝트(③목소리가 없는 흐름)를 없어진 단계로 민다.
  it("★ 다음 주소를 가드와 같은 표에서 판다", () => {
    expect(page).toContain("currentStepKey");
    expect(page).toContain("stepHref");
    expect(page, "없어질 수 있는 단계 주소를 손으로 적었다").not.toMatch(/\/voice`/);
  });
});

// ★ ①자료는 더 이상 되묻지 않는다(Task 9). 되묻던 자리가 남아 있으면 사장님은 시나리오를
//   보기도 전에 빈칸을 채우라는 요구를 먼저 받는다 — 무엇이 부족한지는 시나리오를 만들어
//   봐야 알 수 있는데도.
describe("①자료 — 되묻지 않는다", () => {
  const briefing = readFileSync("app/create/[id]/briefing/page.js", "utf8");

  it("★ 되물어 답을 받던 칸이 없다", () => {
    expect(briefing).not.toContain("asked");
    expect(briefing).not.toMatch(/여쭤|질문/);
  });

  it("★ 다음 버튼이 시나리오로 간다 — 없어질 ②대본이 아니라", () => {
    expect(briefing).toContain("/scenario");
    expect(briefing, "없어질 ②대본 화면으로 민다").not.toMatch(/\/script`/);
  });
});

// ★ 말하는 모델(기본 Seedance)에는 ③목소리가 없다 — ②에서 확정하면 컷이 나뉘는 중인 채로
//   ④이미지에 온다. 그 화면이 기다려 주지 않으면 "컷이 없다"는 안내가 뜨고, 그 안내가
//   가리키던 단계는 이제 저장소에 없다. 곁길이 아니라 주경로다.
describe("④이미지 — 컷 분할을 기다린다", () => {
  const images = readFileSync("app/create/[id]/images/page.js", "utf8");

  it("★ 나누는 중이면 그렇게 말한다", () => {
    expect(images).toMatch(/splitting/);
    expect(images).toMatch(/나누/);
  });

  it("★ 없어진 ②대본으로 사장님을 돌려보내지 않는다", () => {
    expect(images, "화면이 대본 단계를 시킨다").not.toContain("대본을 먼저 만들어 주세요");
  });

  it("★ 분할이 실패하면 사유와 다시 시도를 보여 준다", () => {
    expect(images).toContain("cuts_error");
    expect(images).toMatch(/다시 시도/);
  });

  it("★ 폴링은 한 벌에서 온다(setInterval 금지)", () => {
    expect(images).toMatch(/startPolling/);
    expect(images).not.toMatch(/setInterval\(/);
  });
});
