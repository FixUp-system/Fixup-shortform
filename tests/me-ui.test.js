// 화면 배선을 소스에서 판정한다(이 저장소에 React 렌더 테스트가 없다 —
// credits-ui.test.js·staleness-ui.test.js 와 같은 방식).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const me = strip(readFileSync("app/me/page.js", "utf8"));

// 이름 붙은 함수의 본문만 떼어낸다(topbar-ui.test.js 와 같은 방식).
// 못 찾으면 던진다 — 조용히 넘어가면 아래 단정이 엉뚱한 곳을 읽고 거짓으로 초록이 된다.
function body(src, fnName) {
  const at = src.indexOf(`function ${fnName}(`);
  if (at === -1) throw new Error(`함수 선언 \`function ${fnName}(\` 를 못 찾았다 — 이 헬퍼부터 고쳐라`);
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return src.slice(open + 1);
}

describe("마이페이지", () => {
  // ★ 읽기는 이제 공유본이 한다(components/MeContext.jsx). 여기서 따로 읽으면
  // 이름을 저장해도 상단바가 옛 이름을 그대로 보여준다 — 그게 이번 수정의 원인이었다.
  it("내 정보를 공유본에서 받는다 — 혼자 읽지 않는다", () => {
    expect(me).toMatch(/useMe\(\)/);
    expect(me).not.toMatch(/fetch\("\/api\/me"\)/);
  });

  // ★★ 이번 수정의 본체 — 이름을 저장한 뒤 **공유본을** 다시 읽는다.
  // 그래야 상단 계정 바가 새로고침 없이 새 이름으로 바뀐다. 저장 함수 안에서 PATCH 뒤에
  // load() 가 와야 하며(순서가 뒤집히면 옛 값을 다시 읽는다), 자기 상태만 갱신하면 안 된다.
  it("이름을 저장하면 공유본을 다시 읽는다 — 상단바가 함께 바뀐다", () => {
    const save = body(me, "saveName");
    expect(save).toMatch(/method:\s*["']PATCH["'][\s\S]*?await load\(\)/);
    // 공유본의 load 를 쓴다 — 이 화면만의 읽기를 새로 만들면 상단바는 또 모른다.
    expect(save).not.toMatch(/fetch\("\/api\/me"\)/);
    expect(me).toMatch(/const \{ me, failed, load \} = useMe\(\)/);
  });

  // ★ 비밀번호를 바꾸면 서버가 세션을 끊는다(scope: global). 그 뒤 GET /api/me 는 401 이라,
  // 공유본을 다시 읽으면 "내 정보를 읽지 못했어요"가 떠 로그인 화면으로 넘어가는 1.5초 동안
  // 화면이 시끄러워진다. 여기서는 다시 읽지 않는다.
  it("비밀번호를 바꾼 뒤에는 공유본을 다시 읽지 않는다", () => {
    expect(body(me, "changePassword")).not.toMatch(/load\(\)/);
  });

  it("이름을 PATCH 로 저장한다", () => {
    expect(me).toMatch(/method:\s*["']PATCH["']/);
  });

  it("비밀번호 변경에 **현재 비밀번호** 칸이 있다", () => {
    expect(me).toMatch(/current/);
    expect(me).toMatch(/현재 비밀번호/);
  });

  it("새 비밀번호를 두 번 받아 화면에서 먼저 맞춰 본다", () => {
    expect(me).toMatch(/confirm/);
  });

  // ★ 라우트가 비밀번호를 바꾸면서 **지금 브라우저 세션까지 끊는다**(scope: global).
  // 화면이 signedOut 을 안 읽으면 사장님은 "비밀번호를 바꿨어요"를 본 직후 아무 안내 없이
  // 로그인 화면으로 튕긴다 — 무슨 일이 났는지 알 방법이 없다.
  it("세션이 끊겼으면 다시 로그인해야 한다고 알리고 로그인 화면으로 보낸다", () => {
    expect(me).toMatch(/signedOut/);
    expect(me).toMatch(/다시 로그인/);
    expect(me).toMatch(/\/login/);
  });

  // 2026-08-07 사용자 요청으로 "바꿀 수 없어요" 문구를 뺐다. 원래 근거는 "빈 입력칸을
  // 두면 눌러 보게 된다"였는데, 이메일은 애초에 입력칸이 아니라 읽기 전용 텍스트라
  // 누를 것이 없다 — 근거가 실물과 안 맞았다. 대신 **입력칸이 되지 않았는지**를 문다.
  it("이메일은 읽기 전용이다 — 입력칸으로 두지 않는다", () => {
    expect(me).toMatch(/me-value mono/);
    expect(me).not.toMatch(/value=\{[^}]*email/);
  });

  it("보관함으로 잇는다 — 흡수하지 않는다", () => {
    expect(me).toMatch(/\/archive/);
  });

  it("이름 상한을 손으로 적지 않고 가격표처럼 한 곳에서 가져온다", () => {
    expect(me).toMatch(/NAME_MAX/);
  });

  // ★ 아직 못 읽었으면 name 이 "" 다. 그대로 PATCH 하면 라우트가 display_name 을 null 로
  // 덮어 **저장돼 있던 이름이 지워진다**. 버튼을 막는 것만으로는 부족하다 — 응답이 오기 전에
  // 누르는 정상 경로도 같은 결과라 저장 함수 초입에서도 막아야 한다.
  it("내 정보를 못 읽었으면 이름을 저장하지 않는다", () => {
    // 저장 함수가 me 없이는 일찍 돌아간다
    expect(me).toMatch(/if\s*\(!me\)\s*\{[\s\S]{0,200}?return;/);
    // 버튼도 함께 막힌다
    expect(me).toMatch(/disabled=\{[^}]*!me[^}]*\}/);
  });

  it("정보를 못 읽으면 그 사실을 알리고 다시 시도할 길을 준다", () => {
    expect(me).toMatch(/loadErr/);
    // 실패 여부는 공유본이 알려 준다 — 화면은 그것을 문구로 옮길 뿐이다.
    expect(me).toMatch(/failed \?/);
    expect(me).toMatch(/읽지 못했어요/);
    expect(me).toMatch(/다시 불러오기/);
  });

  // ★ 2026-08-07 라이브 실측으로 갈래가 하나 사라졌다. 예전에는 서버가 비밀번호를 바꾼
  // **뒤** 세션을 끊어서 signOut 이 매번 `400 Auth session missing!` 로 실패했고
  // (updateUserById 가 재검증 세션까지 무효화한다), 화면은 "다른 기기의 로그인을 끊지
  // 못했어요"라는 **거짓 경고**를 띄웠다 — 두 기기 실측 결과 실제로는 둘 다 끊겼다.
  // 이제 서버는 끊기를 먼저 하고, 못 끊으면 비밀번호를 바꾸지 않고 502 로 멈춘다.
  // 그러니 이 문구가 화면에 남아 있으면 안 된다.
  it("'끊지 못했어요' 거짓 경고 갈래가 없다", () => {
    expect(me).not.toMatch(/끊지 못했어요/);
    expect(me).not.toMatch(/직접 로그아웃/);
  });

  // ★ 세션을 먼저 끊으므로 **바꾸기가 실패해도 이미 로그아웃**됐을 수 있다. 그때 오류만
  // 띄우고 화면에 남겨 두면 사장님은 다음 이동에서 영문 모르고 튕긴다.
  it("바꾸기가 실패해도 이미 로그아웃됐으면 로그인 화면으로 보낸다", () => {
    expect(me).toMatch(/if \(!r\.ok\) \{[\s\S]{0,400}d\.signedOut/);
  });

  it("로그인 화면으로 보내는 타이머를 언마운트 때 정리한다", () => {
    expect(me).toMatch(/clearTimeout/);
  });
});
