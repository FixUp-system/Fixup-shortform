import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { TIERS } from "../lib/tiers.js";

// 주석은 판정이 아니다 — 코드에서만 찾는다(오늘 이 저장소에서 주석을 재는 거짓 통과를
// 여러 번 밟았다).
const src = readFileSync("app/admin/page.js", "utf8").replace(/\/\/[^\n]*/g, "");

// ★★ 사용자 관리 화면 개편(2026-08-20 사장님 지시).
//
//   · 등급은 **드롭다운**으로 고른다 — 칩 둘은 등급이 늘면 줄이 넘친다.
//   · 내역·크레딧 넣기는 **계정을 고른 뒤 모달**에서 한다 — 줄마다 버튼 다섯이 서 있어
//     가로가 좁고, 어느 줄의 버튼인지 눈으로 좇아야 했다.
describe("등급은 드롭다운이다", () => {
  it("★ select 로 고른다 — 칩을 나열하지 않는다", () => {
    expect(src).toMatch(/<select[^>]*onChange=\{[^}]*setTier/);
  });

  it("★ 보기는 표에서 나온다 — 화면에 등급 이름을 복사하지 않는다", () => {
    expect(src).toMatch(/TIERS\.map\(/);
    for (const t of TIERS) expect(src, t.label).not.toContain(`>${t.label}<`);
  });

  it("★ 지금 등급이 골라져 있다 — 판정은 tierOf 하나다", () => {
    expect(src).toMatch(/value=\{tierOf\(/);
  });

  it("★ 바꾸는 동안 잠긴다 — 두 번 누르면 요청이 둘 나간다", () => {
    expect(src).toMatch(/<select[\s\S]{0,200}disabled=\{/);
  });
});

describe("계정을 고르면 모달이 열린다", () => {
  it("★ 고른 계정을 들고 있다", () => {
    expect(src).toMatch(/setPanel\(|panelUser|setOpenUser/);
  });

  it("★ 새 모달 장치를 만들지 않는다 — 이 저장소의 dialog 규약을 그대로 쓴다", () => {
    expect(src).toMatch(/<dialog/);
    expect(src).toMatch(/className="dlg/);
  });

  it("★ 줄에서 [내역]·[크레딧 넣기] 버튼이 사라졌다 — 모달로 옮겼다", () => {
    // 줄에 남는 것은 계정을 여는 버튼 하나다.
    const rowStart = src.indexOf("st-badge");
    const row = src.slice(rowStart, rowStart + 2500);
    expect(row).not.toMatch(/>\s*크레딧 넣기\s*</);
    expect(row).not.toMatch(/>\s*비밀번호 재설정\s*</);
  });

  it("★ 모달 안에 내역·크레딧 넣기·비밀번호 재설정이 있다", () => {
    const at = src.indexOf("<dialog");
    const modal = src.slice(at);
    for (const label of ["크레딧 넣기", "비밀번호 재설정"]) {
      expect(modal, label).toContain(label);
    }
    expect(modal).toMatch(/ledger|내역/);
  });

  it("★ 승인·차단도 모달에서 한다 — 한 계정에 관한 일은 한 자리에 모은다", () => {
    const at = src.indexOf("<dialog");
    const modal = src.slice(at);
    expect(modal).toMatch(/setStatus\(/);
  });

  it("★ 닫는 길이 있다 — 모달에 갇히면 할 수 있는 일이 0 이 된다", () => {
    const at = src.indexOf("<dialog");
    expect(src.slice(at)).toMatch(/close\(\)|setPanel\(null\)|onClose/);
  });
});

// ★★ 크레딧 넣기가 **모달 위에 모달**을 띄우고 있었다(2026-08-20 사장님 지적).
//   그전에는 prompt 를 두 번 불러 값과 사유를 물었는데(DialogProvider), 계정 모달이 이미
//   떠 있는 상태라 dialog 가 둘 겹쳤다. 한 계정에 관한 일을 한자리에 모으려고 모달을
//   만들었는데, 정작 가장 자주 하는 일이 그 자리를 벗어났다.
//
// ★ 사유를 계속 받는 규칙은 **그대로다** — 장부에 사유가 함께 남아야 나중에 "이 500 은
//   왜 들어갔나"에 답할 수 있다. 묻는 자리만 모달 안으로 들어온다.
describe("크레딧은 그 모달 안에서 넣는다", () => {
  const modal = () => src.slice(src.indexOf("<dialog"));

  it("★ 값과 사유를 모달 안 입력칸으로 받는다", () => {
    const m = modal();
    expect(m).toMatch(/<input[^>]*value=\{grantAmount\}/);
    expect(m).toMatch(/<input[^>]*value=\{grantReason\}/);
  });

  it("★ 크레딧 넣기가 prompt 를 부르지 않는다 — 모달 위에 모달이 뜬다", () => {
    const at = src.indexOf("async function grant(");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body, "grant 가 아직 prompt 를 부른다").not.toMatch(/await prompt\(/);
  });

  it("★ 기본값은 가격표에서 온다 — 화면이 숫자를 짓지 않는다", () => {
    expect(src).toMatch(/DEFAULT_GRANT/);
  });

  it("★ 사유가 비면 넣지 않는다 — 장부에 사유가 남아야 한다", () => {
    const at = src.indexOf("async function grant(");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).toMatch(/grantReason/);
  });

  it("★ 0 이나 소수는 넣지 않는다 — 크레딧은 정수 단위다", () => {
    const at = src.indexOf("async function grant(");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).toMatch(/Number\.isInteger/);
  });
});
