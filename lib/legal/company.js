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
  // ★★★ 2026-09-11 — **지금 값은 전부 초안이다**(사장님 지시: "일단 임의로 작성해줘 초안으로,
  //   이건 최종 상용화 전 단계에서 입력"). 아래 `draft: true` 가 그 사실을 들고 있고,
  //   그것이 켜져 있는 한 이 문서는 **제품 어디에도 링크되지 않는다**(판이 지킨다).
  //   ⚠️ 값을 실제 것으로 바꿀 때 `draft` 를 **함께 false 로** 내려야 한다. 그 전까지는
  //     화면 맨 위에 초안 띠가 뜬다 — 허위 사업자 정보가 진짜처럼 보이는 일이 없게.
  draft: true,

  // 서비스 이름 — 화면에 보이는 브랜드(app/layout.js 의 title 과 같아야 한다)
  service: "shortform",
  // 상호(사업자등록증 그대로)
  name: "주식회사 픽스업(가칭)",
  // 대표자
  owner: "홍길동",
  // 사업자등록번호 — ★ 0 으로만 채웠다. 실제로 존재할 수 없는 번호라야 초안인 것이 분명하다.
  bizNo: "000-00-00000",
  // 통신판매업 신고번호 — 같은 이유로 0 이다
  mailOrderNo: "제0000-서울○○-00000호",
  // 사업장 주소
  address: "서울특별시 (주소 미정)",
  // 고객 문의 — ★ example.com 은 표준 예시 도메인이라 실제로 메일이 가지 않는다
  email: "support@example.com",
  // 개인정보 보호책임자
  privacyOfficer: { name: "홍길동", email: "privacy@example.com" },
  // 이 문서들이 효력을 갖는 날
  effectiveOn: "2026-01-01",
};

// 값이 **다 들어와 있는가** — 화면이 문서를 그릴 수 있는지의 기준이다.
// ★ 초안인지 아닌지는 안 본다. 초안이라도 **읽어 볼 수는 있어야** 검토가 된다.
export function companyFilled() {
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

// 법률 문서를 **내보내도 되는가**. 하나라도 비면 false 다.
//
// ★ 빈 값을 "(미기재)" 같은 글자로 메우지 않는다 — 그것이 바로 MCS 가 빠진 자리다.
//   못 채웠으면 **안 보여 주는 것**이 맞다.
export function legalReady() {
  // ★★★ 채워졌다고 끝이 아니다 — **초안이면 아직 아니다.** 지금 값은 0 으로만 된 사업자
  //   등록번호와 example.com 주소라, 이대로 공개하면 **허위 사업자 정보를 표시하는 것**이 된다.
  return companyFilled() && COMPANY.draft !== true;
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
