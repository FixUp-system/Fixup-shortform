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
