// 크레딧 코드 — 와디즈 서포터에게 크레딧을 건네는 일회용 코드(2026-09-14).
// 설계: docs/superpowers/specs/2026-09-14-credit-codes-design.md
//
// ★ 이 파일은 화면("use client")도 import 한다 — **import 문을 두지 마라**(lib/pricing.js 와 같은 규칙).
//   그래서 난수도 밖에서 받는다(generateCode 의 randomInt) — 서버는 crypto.randomInt 를 넘긴다.

// 헷갈리는 글자(0 O 1 I L)를 뺀 31자. 메일에서 옮겨 적다가 틀리는 자리를 없앤다.
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
// 31^12 ≈ 7.9×10^17 — 코드 1만 개를 뿌려도 한 번 추측이 맞을 확률이 10^-13 이라
// 시도 횟수 제한을 두지 않는다(설계 문서 「코드 모양 · 추측 방어」).
export const CODE_LENGTH = 12;
// 한 번에 만드는 행의 상한 — 와디즈 일괄 발송이 300건씩이라 넉넉하다. 실수로 붙인 거대한 표를 막는다.
export const MAX_CODE_ROWS = 2000;

export function generateCode(randomInt) {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

// 사람이 적은 코드를 저장형으로 — 대소문자·하이픈·공백을 무시한다.
export function normalizeCode(input) {
  return String(input ?? "").toUpperCase().replace(/[\s-]/g, "");
}

export function isCodeShape(code) {
  if (typeof code !== "string" || code.length !== CODE_LENGTH) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

export function formatCode(code) {
  return String(code).match(/.{1,4}/g)?.join("-") ?? "";
}

// 충전 장부의 사유 — 운영자 백오피스에서 어느 코드로 들어온 크레딧인지 읽힌다.
export function redeemReason(code) {
  return `크레딧 코드 ${formatCode(code)}`;
}

// 엑셀에서 복사한 표(탭 구분) → { headers, rows }.
// 엑셀은 칸 안에 줄바꿈·탭·따옴표가 있으면 그 칸을 "…" 로 싸고 안의 " 를 "" 로 적는다.
export function parsePasted(text) {
  const src = String(text ?? "");
  const lines = [];
  let cells = [];
  let cell = "";
  let quoted = false;
  let atCellStart = true;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && atCellStart) { quoted = true; atCellStart = false; continue; }
    if (ch === "\t") { cells.push(cell); cell = ""; atCellStart = true; continue; }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      cells.push(cell); lines.push(cells);
      cells = []; cell = ""; atCellStart = true;
      continue;
    }
    cell += ch;
    atCellStart = false;
  }
  cells.push(cell);
  lines.push(cells);

  const filled = lines.filter((l) => l.some((c) => c.trim() !== ""));
  if (filled.length === 0) return { headers: [], rows: [] };

  const seen = new Map();
  const headers = filled[0].map((raw, idx) => {
    const base = raw.trim() || `열 ${idx + 1}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
  const rows = filled.slice(1).map((l) =>
    Object.fromEntries(headers.map((h, idx) => [h, (l[idx] ?? "").trim()]))
  );
  return { headers, rows };
}

// CSV — 메일 머지에 넣는다. ★ BOM 이 없으면 한국어 엑셀이 UTF-8 을 CP949 로 읽어 글자가 깨진다.
export function toCsv(headers, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = [headers.map(esc).join(",")];
  for (const r of rows) out.push(headers.map((h) => esc(r?.[h])).join(","));
  return `\uFEFF${out.join("\r\n")}\r\n`;
}
