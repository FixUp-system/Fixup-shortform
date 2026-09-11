// 이용약관·개인정보처리방침 화면 (2026-09-11).
//
// ★ 한 파일이 문서 둘을 그린다 — 모양이 같기 때문이다. 두 벌로 나누면 한쪽만 고쳐진다.
// ★ **로그인 전에 보여야 하는 화면**이다(가입할 때 읽고 동의한다). 그래서 lib/auth/paths.js
//   의 PUBLIC_PATHS 에 `/legal` 이 들어간다. 그 목록에 들어가면 BARE_PATHS 도 따라와
//   사이드바 없이 그려진다 — 아직 들어오지 않은 사람에게 앱 틀을 보여 줄 이유가 없다.
// ★★ 회사 정보가 **덜 차 있으면 문서를 안 그린다.** 형제 제품 MCS 는 빈칸이 그대로
//   렌더돼 `게시 전 확인용 초안`이 이용자에게 보인다(조사 보고서 §3). 우리는 그 자리에서
//   막는다 — 못 채웠으면 안 보여 주는 것이 맞다.
import { notFound } from "next/navigation";
import { DOCUMENTS } from "../../../lib/legal/documents.js";
import { COMPANY, companyFilled } from "../../../lib/legal/company.js";
import { renderDocument } from "../../../lib/legal/render.js";

export function generateStaticParams() {
  return DOCUMENTS.map((d) => ({ doc: d.id }));
}

export default async function LegalPage({ params }) {
  const { doc: id } = await params;
  const found = DOCUMENTS.find((d) => d.id === id);
  if (!found) notFound();

  if (!companyFilled()) {
    // ★ 무엇이 비었는지는 **적지 않는다** — 공개 화면이라 운영 정보를 흘릴 자리가 아니다.
    //   운영자는 tests/legal.test.js 가 빨개지는 것으로 안다.
    return (
      <>
        <h1 className="pgtitle">{found.title}</h1>
        <p className="pgsub">아직 준비 중이에요. 곧 올려 두겠습니다.</p>
      </>
    );
  }

  const doc = renderDocument(found);
  return (
    <article className="legal">
      {/* ★★★ 초안 띠 — 2026-09-11. 지금 사업자 정보는 **0 으로만 된 등록번호와 example.com**
          이다(사장님 지시로 임의 작성). 그것이 진짜처럼 보이면 **허위 사업자 정보를 표시하는
          것**이 되므로, 문서 맨 위에서 먼저 말한다.
          ★ `COMPANY.draft` 를 false 로 내리는 순간 이 띠는 사라진다 — 띠를 지우는 것이
            아니라 **값을 진짜로 바꾸는 것**이 이 자리의 할 일이다. */}
      {COMPANY.draft && (
        <p className="legal-draft" role="status">
          이 문서는 <strong>초안</strong>입니다. 아래 사업자 정보는 실제 값이 아니며,
          정식 공개 전에 교체됩니다.
        </p>
      )}
      <h1 className="pgtitle">{doc.title}</h1>
      <p className="pgsub">시행일 {COMPANY.effectiveOn}</p>
      {doc.sections.map((s) => (
        <section key={s.title} className="legal-sec">
          <h2 className="legal-h">{s.title}</h2>
          {s.body.map((line, i) => (
            <p key={i} className="legal-p">{line}</p>
          ))}
        </section>
      ))}

      {/* 전자상거래법이 표시하라고 정한 사업자 정보. 두 문서 아래에 같은 블록이 선다 —
          값은 COMPANY 한 자리에서 온다(문서마다 손으로 적지 않는다). */}
      <section className="legal-sec legal-biz">
        <h2 className="legal-h">사업자 정보</h2>
        <dl className="legal-dl">
          <dt>상호</dt><dd>{COMPANY.name}</dd>
          <dt>대표자</dt><dd>{COMPANY.owner}</dd>
          <dt>사업자등록번호</dt><dd>{COMPANY.bizNo}</dd>
          <dt>통신판매업 신고번호</dt><dd>{COMPANY.mailOrderNo}</dd>
          <dt>주소</dt><dd>{COMPANY.address}</dd>
          <dt>문의</dt><dd>{COMPANY.email}</dd>
        </dl>
      </section>
    </article>
  );
}
