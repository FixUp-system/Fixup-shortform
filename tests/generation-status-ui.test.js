// 렌더 테스트 인프라가 없어 소스에서 잰다(tests/video-preview-ui.test.js 와 같은 수법).
// 재는 것은 "화면이 판정을 스스로 하지 않고 lib 에 맡겼는가" 하나다 — 그래야 경계는
// tests/progress.test.js 가 잰 것으로 보장된다.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const images = readFileSync("app/create/[id]/images/page.js", "utf8");

// 소스에서 재는 이상 잘라내는 범위가 곧 테스트의 정확도다. 글자 수로 자르면 무관한
// 서식 변경이 재는 대상을 조용히 바꾸므로, 시작·끝 표식으로 **구조**를 잡고 둘 다 먼저 확인한다.
function block(startMark, endMark) {
  const from = images.indexOf(startMark);
  expect(from, `소스에 ${startMark} 이 없다`).toBeGreaterThan(-1);
  const to = images.indexOf(endMark, from + startMark.length);
  expect(to, `${startMark} 뒤에 ${endMark} 이 없다`).toBeGreaterThan(from);
  return images.slice(from, to);
}

describe("④이미지 — 생성 상태 표시", () => {
  it("판정을 lib/progress 에 맡긴다", () => {
    expect(images).toMatch(/generationState/);
  });

  it("끝난 컷을 손으로 세지 않고 파이프라인과 같은 술어를 쓴다", () => {
    // 손으로 적었을 때 실제로 갈렸다: image 없이 needs_attention 인 컷을 안 세서
    // 정상 종료한 실행이 영구히 "멈춤"으로 읽혔다.
    expect(images).toMatch(/isCutDone\(\s*c\s*,\s*"images"\s*\)/);
  });

  it("오류 필드를 손으로 고르지 않고 표에서 가져온다", () => {
    expect(images).toMatch(/firstError/);
  });

  it("폴링을 손으로 돌리지 않는다", () => {
    expect(images).toMatch(/startPolling/);
    expect(images, "setInterval 이 화면에 남아 있다").not.toMatch(/setInterval\(/);
  });

  it("폴링이 스스로 끝나면 손잡이를 비운다 — 안 비우면 다시 시작할 수 없다", () => {
    // startPolling 이 돌려주는 것은 함수라 영원히 truthy 다. onStop 에서 비우지 않으면
    // "이미 돌고 있음" 가드에 걸려 폴링이 되살아나지 않는다.
    // 잘라내는 범위는 글자 수가 아니라 **구조**로 잡는다 — 고정 400자로 자르면 콜백을
    // 손보기만 해도 재는 대상이 조용히 달라진다.
    const onStop = block("onStop:", "});");
    expect(onStop, "onStop 안에서 ref 를 null 로 비우지 않는다").toMatch(/stopRef\.current\s*=\s*null/);
  });

  it("멈춤과 실패를 서로 다른 말로 알린다", () => {
    expect(images).toMatch(/stalled/);
    expect(images).toMatch(/멈춰/);
  });

  it("진척을 숫자로 보여준다", () => {
    expect(images).toMatch(/\bdone\b/);
    expect(images).toMatch(/\btotal\b/);
  });

  it("임계 시간을 화면에 손으로 적지 않는다", () => {
    expect(images, "120000 을 화면에 적었다").not.toMatch(/120_?000/);
  });

  // ── 접기(dismiss)는 **띠지를 감추는 일**이다. 그 이상을 하면 안 된다.
  //    서버에는 images_error 를 지우는 경로가 없어서, 접기가 판정까지 건드리면
  //    사장님을 실패에서 꺼내 주려던 버튼이 오히려 탈출구를 닫는다.

  it("★ 닫아도 컷별 [다시 생성]은 열려 있다 — 접기는 탈출구를 닫지 않는다", () => {
    // 접기가 판정에 끼어들면 stalled 가 꺼지고, 아직 generating 인 컷이 busyCut 으로 다시
    // 잠겨 "닫고 컷별로 다시 만들기"가 약속한 바로 그 일을 못 하게 된다.
    // 서버에는 images_error 를 지우는 경로가 없으니 접어도 파이프라인은 여전히 죽어 있다.
    const stalled = block("const stalled =", ";");
    expect(stalled, "stalled 계산에 접기 상태가 섞여 있다 — 접는 순간 탈출구가 닫힌다")
      .not.toMatch(/dismiss/i);
    // 판정 자체(generationState 의 error 인자)도 접기와 무관해야 한다. 접었다고 오류를
    // null 로 주면 판정이 running 으로 되살아나 죽은 파이프라인 옆에서 스피너가 돈다.
    const errArg = block("\n    error:", "\n");
    expect(errArg, "판정에 넘기는 오류가 접기로 지워진다 — 판정은 실제 상태여야 한다")
      .not.toMatch(/dismiss/i);
  });

  it("★ 닫은 뒤 새로 난 실패는 그대로 보인다 — 접기는 한 번 걸면 끝나는 빗장이 아니다", () => {
    // boolean 빗장이면 접은 뒤 도착한 진짜 실패가 영영 안 뜬다 — 이 계획이 드러내려는
    // 바로 그 실패가. 무엇을 접었는지 기억해 두고 그 문구만 감춘다.
    // 여는 중괄호까지 표식에 넣는다 — stalled 계산식 안의 같은 글귀에 걸리지 않게.
    const failedBanner = block('{gen.kind === "failed"', "</p>");
    expect(failedBanner, "무엇을 접었는지 기억하지 않는다 — 빗장 하나면 새 실패가 묻힌다")
      .toMatch(/dismissedMsg/);
    expect(failedBanner, "접어 둔 문구와 지금 실패를 견주지 않는다").toMatch(/!==/);
    // 다시 만들기를 시작하면 접어 둔 것은 무효다.
    const start = block("async function start()", "\n  }");
    expect(start, "다시 시작할 때 접어 둔 것을 풀지 않는다").toMatch(/setDismissedMsg\(\s*null\s*\)/);
  });

  it("★ 멈춤 안내에는 손댈 것이 없다 — 죽은 버튼을 두느니 살아 있는 곳을 가리킨다", () => {
    // 여기 버튼을 두면 반드시 거짓말이 된다: 멈춤은 폴링이 도는 동안에도 나므로 busy 로
    // 잠기고, 안 잠가도 오른쪽 미리보기는 이미 그 컷을 보고 있어 눌러도 아무 변화가 없다.
    // 그리고 dismiss 를 부르면 빗장이 걸려 뒤늦게 온 진짜 실패가 "멈췄어요"로 오진된다.
    // 살아 있는 탈출구는 오른쪽 컷별 [다시 만들기] 하나뿐이니, 안내는 그것을 가리키기만 한다.
    const stalledBanner = block('gen.kind === "stalled" && (', 'gen.kind === "failed"');
    expect(stalledBanner, "멈춤 안내가 dismiss 를 부른다 — 접기 빗장이 걸려 실패가 오진된다")
      .not.toMatch(/dismiss/);
    expect(stalledBanner, "멈춤 안내에 조작할 것이 있다 — 여기 둔 것은 죽은 버튼이 된다")
      .not.toMatch(/<button|onClick=|disabled=/);
  });

  it("★ 멈춤 안내가 가리키는 조작은 멈춤 중에 실제로 눌린다 — 회색 버튼을 가리키면 안 된다", () => {
    // 글자 하나를 박아 두지 않는다. **불변식**은 "안내가 [대괄호로] 이름을 부른 조작이
    // 컷별 미리보기에 실제로 있고, 멈춘 사장님이 그 자리에서 곧바로 누를 수 있다"는 것이다.
    // 이렇게 두면 라벨이 바뀌었을 때 조용히 어긋나지 않고 시끄럽게 깨진다.
    const stalledBanner = block('gen.kind === "stalled" && (', 'gen.kind === "failed"');
    const named = [...stalledBanner.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
    expect(named.length, "안내가 어떤 조작으로 이어가라는 것인지 이름을 대지 않는다")
      .toBeGreaterThan(0);

    const pane = images.slice(images.indexOf("function PreviewPane("));
    expect(pane, "PreviewPane 을 못 찾았다").toBeTruthy();
    const buttons = [...pane.matchAll(/<button[\s\S]*?<\/button>/g)].map((m) => m[0]);

    for (const label of named) {
      const owners = buttons.filter((b) => b.includes(label));
      expect(owners.length, `안내가 부른 [${label}] 이 컷별 미리보기에 없다`).toBeGreaterThan(0);
      for (const b of owners) {
        const disabled = (b.match(/disabled=\{([^}]*)\}/) || [, ""])[1];
        // 글을 써야 열리는 버튼(!instr.trim())은 멈춰서 온 사장님 눈에는 그냥 회색이다.
        expect(disabled, `[${label}] 은 뭔가를 입력해야 열린다 — 멈춤 안내가 회색 버튼을 가리킨다`)
          .not.toMatch(/instr/);
      }
    }
  });

  it("★ 멈춘 동안 컷별 [다시 만들기]는 눌린다 — 안내가 가리키는 곳이 실제로 살아 있어야 한다", () => {
    // 위 안내에서 버튼을 걷어낸 근거가 바로 이것이다. 이 잠금이 stalled 를 안 보게 되는 순간
    // 안내는 없는 문을 가리키는 말이 된다.
    const busyCut = block("const busyCut =", ";");
    expect(busyCut, "멈춤 중에도 컷이 generating 이라 컷별 버튼이 잠긴다 — 탈출구가 없어진다")
      .toMatch(/!stalled/);
  });

  it("서버가 잰 멈춤 시간을 읽는다 — 브라우저 시계로 빼지 않는다", () => {
    expect(images).toMatch(/stalled_for_ms/);
    expect(images, "화면이 stalledFor 를 직접 부른다 — 사장님 PC 시계가 판정에 끼어든다")
      .not.toMatch(/\bstalledFor\s*\(/);
  });
});
