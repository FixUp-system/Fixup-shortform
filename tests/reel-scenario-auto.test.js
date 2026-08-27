// ②시나리오 — **누르지 않아도 만들어진다**(2026-08-25 사장님 지시).
//
// ★★ 왜 ①입력이 아니라 여기서 만드는가: 시나리오는 LLM 호출이라 수십 초가 걸린다.
//   ①에서 기다리게 하면 [시작하기]를 누른 뒤 화면이 멈춘 것처럼 보인다. 먼저 이 화면으로
//   보내고 여기서 "쓰는 중…"을 보여 주는 편이 사장님에게 무슨 일이 일어나는지 말해 준다.
//
// ★ 실패해도 이 화면에 남는다 — 오류와 [다시 쓰기]가 그대로 있다(사장님 결정).
//   그래서 버튼을 지우지 않는다. 자동 생성은 **첫 방문의 한 번**이고 버튼은 그 폴백이다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const src = readFileSync("app/reel/[id]/scenario/page.js", "utf8");
const clean = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("시나리오 자동 생성", () => {
  it("화면이 뜨면 스스로 만든다 — useEffect 를 쓴다", () => {
    expect(clean).toContain("useEffect");
  });

  // ★★ 이미 있으면 다시 만들지 않는다. 이것이 없으면 ②로 되돌아올 때마다 시나리오가
  //   새로 쓰이고, 그때마다 **이미 값을 치른 그림·클립이 통째로 낡는다**(각인이 바뀐다).
  //   게다가 MAX_SCENARIO_TRIES 회차까지 먹는다.
  it("이미 시나리오가 있으면 자동 생성하지 않는다", () => {
    expect(clean).toMatch(/scenario\?\.text|scenario &&|hasScenario/);
  });

  // ★★ 잠금(scenarioLock)을 존중한다 — 클립을 이미 구운 뒤에는 다시 쓰면 안 된다.
  //   화면과 서버가 같은 판정을 본다는 이 저장소 규율(파일 머리말 참고).
  // ★★ 2026-08-27 — 재는 자리를 바꿨다. 옛 판정은 **첫 `useEffect` 부터 700자**를 봤는데,
  //   그 첫 매치는 effect 가 아니라 `import { useEffect … }` 줄이라 실제로는 "파일 머리에서
  //   700바이트 안에 lock 이 있나"를 재고 있었다(경계에서 9자 남아 있었고, 무관한 주석 한
  //   줄에 깨졌다). 재려던 것은 **자동 생성이 잠금을 보는가**이므로 그 effect 를 본다.
  it("잠겨 있으면 자동 생성하지 않는다", () => {
    const at = clean.indexOf("autoRef.current = true");
    expect(at, "자동 생성 effect 를 못 찾았다").toBeGreaterThan(-1);
    const body = clean.slice(Math.max(0, at - 400), at);
    expect(body, "자동 생성이 잠금을 안 본다").toContain("lock");
  });

  // ★★ 두 번 부르지 않는다. React 개발 모드는 effect 를 두 번 돌린다 — 막지 않으면
  //   시나리오가 두 번 쓰이고 회차도 두 번 먹는다(무료지만 LLM 실비는 나간다).
  it("중복 실행을 막는 자물쇠가 있다", () => {
    expect(clean).toMatch(/useRef|startedRef|autoRef/);
  });

  // ★ 버튼은 남는다 — 실패했을 때 사장님이 다시 누를 유일한 길이다.
  it("다시 쓰기 버튼이 그대로 있다", () => {
    expect(clean).toContain("makeScenario");
    expect(src).toMatch(/다시 쓰기|시나리오 만들기/);
  });
});

describe("자동 생성 중의 문구", () => {
  // ★ 자동으로 만드는데 "만들어 주세요"라고 하면 사장님이 무엇을 해야 하는지
  //   모른다 — 지금은 **기다리면 된다**고 말해야 한다.
  it("만드는 동안은 기다리라고 말한다", () => {
    expect(src).toMatch(/쓰고 있어요|만드는 중|잠시만/);
  });

  // ★ "만들어 주세요"는 누를 것을 전제한 문구다 — 자동이 되면 거짓이 된다.
  it("누르라는 안내가 사라졌다", () => {
    expect(src).not.toContain("시나리오를 만들어 주세요");
  });
});
