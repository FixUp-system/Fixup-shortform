// 크레딧 코드 — 순수 함수(생성·정규화·붙여 넣기·CSV). 설계: docs/superpowers/specs/2026-09-14-credit-codes-design.md
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  CODE_ALPHABET, CODE_LENGTH, generateCode, normalizeCode, isCodeShape, formatCode,
  redeemReason, parsePasted, toCsv,
} from "../lib/credit-codes.js";

describe("코드 생성", () => {
  it("12자이고 헷갈리는 글자(0 O 1 I L)가 없다", () => {
    expect(CODE_LENGTH).toBe(12);
    expect(CODE_ALPHABET).toHaveLength(31);
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
    let i = 0;
    const code = generateCode(() => i++ % CODE_ALPHABET.length);
    expect(code).toHaveLength(12);
    expect(code).toBe(CODE_ALPHABET.slice(0, 12));
  });

  it("randomInt 에 알파벳 크기를 넘긴다", () => {
    const seen = new Set();
    generateCode((n) => { seen.add(n); return 0; });
    expect([...seen]).toEqual([CODE_ALPHABET.length]);
  });

  it("화면이 import 하는 파일이라 import 문이 없다", () => {
    expect(readFileSync("lib/credit-codes.js", "utf8")).not.toMatch(/^\s*import\s/m);
  });
});

describe("정규화 · 모양 · 표시", () => {
  it("소문자·하이픈·공백을 무시한다", () => {
    expect(normalizeCode(" abcd-2345 efgh ")).toBe("ABCD2345EFGH");
    expect(normalizeCode(null)).toBe("");
  });
  it("모양 판정 — 길이와 알파벳", () => {
    expect(isCodeShape("ABCD2345EFGH")).toBe(true);
    expect(isCodeShape("ABCD2345EFG")).toBe(false);
    expect(isCodeShape("ABCD2345EFG0")).toBe(false);
  });
  it("표시형은 4자씩 하이픈", () => {
    expect(formatCode("ABCD2345EFGH")).toBe("ABCD-2345-EFGH");
    expect(redeemReason("ABCD2345EFGH")).toBe("크레딧 코드 ABCD-2345-EFGH");
  });
});

describe("붙여 넣기 파싱 — 엑셀에서 복사한 탭 구분 텍스트", () => {
  it("첫 줄이 머리글이고 빈 줄은 버린다", () => {
    const { headers, rows } = parsePasted("발송번호\t리워드\r\n101\tBASIC\r\n\r\n102\tPRO\r\n");
    expect(headers).toEqual(["발송번호", "리워드"]);
    expect(rows).toEqual([
      { 발송번호: "101", 리워드: "BASIC" },
      { 발송번호: "102", 리워드: "PRO" },
    ]);
  });

  it("따옴표로 싼 칸 안의 줄바꿈·탭·따옴표를 한 칸으로 읽는다", () => {
    const text = '이름\t주소\n홍길동\t"서울\n강남 ""A""\t동"\n';
    const { rows } = parsePasted(text);
    expect(rows).toEqual([{ 이름: "홍길동", 주소: '서울\n강남 "A"\t동' }]);
  });

  it("같은 머리글이 둘이면 뒤엣것에 번호를 붙인다", () => {
    const { headers } = parsePasted("연락처\t연락처\n1\t2");
    expect(headers).toEqual(["연락처", "연락처 (2)"]);
  });

  it("빈 머리글은 열 번호로 채운다 · 모자란 칸은 빈 문자열", () => {
    const { headers, rows } = parsePasted("A\t\tC\n1");
    expect(headers).toEqual(["A", "열 2", "C"]);
    expect(rows[0]).toEqual({ A: "1", "열 2": "", C: "" });
  });

  it("비어 있으면 빈 결과", () => {
    expect(parsePasted("  \n ")).toEqual({ headers: [], rows: [] });
  });
});

describe("CSV", () => {
  it("BOM 으로 시작하고 CRLF 로 줄을 나눈다", () => {
    const csv = toCsv(["a", "b"], [{ a: "1", b: 2 }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toBe("\uFEFFa,b\r\n1,2\r\n");
  });
  it("쉼표·따옴표·줄바꿈이 든 칸은 따옴표로 싼다", () => {
    const csv = toCsv(["x"], [{ x: 'a,"b"\nc' }, { x: null }]);
    expect(csv).toBe('\uFEFFx\r\n"a,""b""\nc"\r\n\r\n');
  });
});
