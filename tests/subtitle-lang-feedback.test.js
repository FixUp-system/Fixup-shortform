// 자막 언어를 고르면 **한참 걸린다** — 그 동안 화면이 말을 해야 한다.
//
// 라우트(app/api/projects/[id]/subtitle-lang/route.js)는 낡은 컷을 모아 LLM 을 한 번
// 부른다. 한 번이라 싸지만 **즉시 끝나지는 않는다**. 그런데 화면에서 그 시간 동안 바뀌는
// 것은 칩이 회색으로 잠기는 것 하나뿐이었다 — 사장님 눈에는 "눌렀는데 아무 일도 안 난다"다.
// 켜진 칩은 서버가 저장한 뒤에야 옮겨가므로, 기다리는 동안에는 **고른 언어조차 화면에
// 없다**(고른 것도 이전 언어도 아닌, 아무 대답 없는 상태).
//
// 이 저장소가 이미 쓰는 답이 있다: 재생성의 `regening` 은 boolean 이 아니라 **무엇을 하는
// 중인지**(컷 번호)를 든다. 언어도 같게 든다 — 그래야 "일본어로 옮기는 중"이라고 이름을
// 부를 수 있다. boolean 이면 화면은 뭘 누른 건지 모른 채 "옮기는 중"밖에 못 쓴다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const done = readFileSync("app/create/[id]/done/page.js", "utf8");

describe("자막 언어 — 옮기는 동안 화면이 말한다", () => {
  it("★ 무엇을 옮기는 중인지 들고 있다 — boolean 이면 이름을 못 부른다", () => {
    expect(done, "누른 언어를 안 기억한다").toMatch(/setLangBusy\(langId\)/);
    expect(done, "끝나고 안 내린다 — 칩이 영영 잠긴다").toMatch(/setLangBusy\(null\)/);
  });

  it("★ 옮기는 중이라고 글자로 말하고, 도는 표시도 함께 낸다", () => {
    // 글자만 있으면 멎은 화면과 구별되지 않고, 표시만 있으면 무엇을 기다리는지 모른다.
    const at = done.indexOf("langBusy &&");
    expect(at, "옮기는 중을 알리는 자리가 없다").toBeGreaterThan(-1);
    const block = done.slice(at, at + 500);
    expect(block, "옮기는 중이라고 말하지 않는다").toMatch(/옮기는 중/);
    expect(block, "도는 표시가 없다").toMatch(/spinner/);
  });

  it("★ 고른 언어의 이름을 부른다 — 어느 칩을 눌렀는지가 화면에 남는다", () => {
    const at = done.indexOf("langBusy &&");
    const block = done.slice(at, at + 500);
    // 켜진 칩(lang)은 아직 안 옮겨갔으므로, 이름은 반드시 langBusy 에서 찾아야 한다
    expect(block, "SUBTITLE_LANGS 에서 이름을 안 찾는다").toMatch(/SUBTITLE_LANGS[\s\S]*langBusy/);
  });

  it("★ 오래 걸리는 이유를 말한다 — 그래야 고장이 아니라 작업으로 읽힌다", () => {
    const at = done.indexOf("langBusy &&");
    const block = done.slice(at, at + 500);
    expect(block, "왜 걸리는지 안 말한다").toMatch(/컷/);
  });

  it("★ 옮기는 동안 칩은 잠겨 있다 — 연타로 번역을 두 번 사지 않는다", () => {
    expect(done, "칩 잠금이 langBusy 를 안 본다").toMatch(/disabled=\{[^}]*langBusy/);
  });
});
