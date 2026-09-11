// 사업자 정보 — **유일한 자리**.
//
// ★★★ 왜 별도 파일인가. 약관·개인정보처리방침·푸터·문의 안내가 전부 같은 값을 말한다.
//   한 군데라도 손으로 적으면 상호나 번호가 갈리고, **법률 문서에서 갈린 값은 그냥 틀린
//   문서**다(CLAUDE.md 「값이 사는 곳 — 두 벌이면 갈린다」).
//
// ★★★ 비어 있는 채로 **공개하면 안 된다.** 형제 제품 MCS 의 처리방침이 정확히 그 상태다 —
//   제목이 `게시 전 확인용 초안`이고 대괄호 빈칸 31개와 편집자 지시문이 **화면에 그대로
//   렌더된다**(2026-09-11 조사, docs/mcs-frontend-report-2026-09-11.md §3).
//   그래서 이 저장소는 그 사고를 **판으로** 막는다:
//     · 값이 하나라도 비면 `legalReady()` 가 false 다.
//     · false 면 화면이 법률 문서로 가는 **링크를 그리지 않는다**.
//     · 판(tests/legal.test.js)이 "링크가 있으면 값이 다 차 있다"를 못 박는다.
//   즉 **덜 채운 문서가 사람 눈에 닿는 길이 없다.**
//
// ★ import 0 개의 순수 모듈이다 — 화면("use client")과 서버가 같은 값을 본다.
//
// ⚠️ 채울 때 주의: 번호는 **하이픈까지 실제 표기 그대로** 적는다. 표시용으로 다시 가공하지
//   않는다(가공하면 또 한 벌이 생긴다).

export const COMPANY = {
  // 서비스 이름 — 화면에 보이는 브랜드(app/layout.js 의 title 과 같아야 한다)
  service: "shortform",
  // 상호(사업자등록증 그대로)
  name: "",
  // 대표자
  owner: "",
  // 사업자등록번호 — 예: "123-45-67890"
  bizNo: "",
  // 통신판매업 신고번호 — 예: "2026-서울강남-01234"
  mailOrderNo: "",
  // 사업장 주소
  address: "",
  // 고객 문의 — 이용자가 실제로 닿을 수 있는 주소여야 한다
  email: "",
  // 개인정보 보호책임자
  privacyOfficer: { name: "", email: "" },
  // 이 문서들이 효력을 갖는 날 — 예: "2026-09-15"
  effectiveOn: "",
};

// 법률 문서를 **내보내도 되는가**. 하나라도 비면 false 다.
//
// ★ 빈 값을 "(미기재)" 같은 글자로 메우지 않는다 — 그것이 바로 MCS 가 빠진 자리다.
//   못 채웠으면 **안 보여 주는 것**이 맞다.
export function legalReady() {
  const filled = (v) => typeof v === "string" && v.trim() !== "";
  return (
    filled(COMPANY.service) &&
    filled(COMPANY.name) &&
    filled(COMPANY.owner) &&
    filled(COMPANY.bizNo) &&
    filled(COMPANY.mailOrderNo) &&
    filled(COMPANY.address) &&
    filled(COMPANY.email) &&
    filled(COMPANY.privacyOfficer?.name) &&
    filled(COMPANY.privacyOfficer?.email) &&
    filled(COMPANY.effectiveOn)
  );
}

// 아직 안 채운 칸의 이름들 — 운영자에게 무엇이 남았는지 알려 줄 때 쓴다.
export function missingCompanyFields() {
  const out = [];
  const check = (key, value) => {
    if (typeof value !== "string" || value.trim() === "") out.push(key);
  };
  check("상호", COMPANY.name);
  check("대표자", COMPANY.owner);
  check("사업자등록번호", COMPANY.bizNo);
  check("통신판매업 신고번호", COMPANY.mailOrderNo);
  check("사업장 주소", COMPANY.address);
  check("문의 이메일", COMPANY.email);
  check("보호책임자 이름", COMPANY.privacyOfficer?.name);
  check("보호책임자 이메일", COMPANY.privacyOfficer?.email);
  check("시행일", COMPANY.effectiveOn);
  return out;
}
