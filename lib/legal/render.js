// 문서 본문의 `{자리}` 를 회사 값으로 채운다 — **한 함수**.
//
// ★ 왜 문서에 값을 박지 않고 자리를 두는가. 상호·번호가 문서마다 손으로 적히면 사업자
//   정보를 바꿀 때 **한쪽만 고쳐진다**. 법률 문서에서 갈린 값은 그냥 틀린 문서다.
//
// ★★ **못 채운 자리가 화면에 나가면 안 된다.** 형제 제품 MCS 가 그 상태다 — 대괄호 빈칸이
//   이용자 눈에 그대로 보인다. 그래서 이 함수는 빈 값을 만나면 **글자로 메우지 않고 던진다.**
//   화면은 `legalReady()` 로 먼저 확인하고 그릴지 말지 정한다(그래서 여기 도달하면 이미
//   다 차 있어야 한다). 던지는 쪽이 "(미기재)"를 렌더하는 쪽보다 안전하다.
//
// ★ import 는 company 하나뿐이다(순수).
import { COMPANY } from "./company.js";

const SLOTS = {
  service: () => COMPANY.service,
  name: () => COMPANY.name,
  owner: () => COMPANY.owner,
  bizNo: () => COMPANY.bizNo,
  mailOrderNo: () => COMPANY.mailOrderNo,
  address: () => COMPANY.address,
  email: () => COMPANY.email,
  privacyOfficerName: () => COMPANY.privacyOfficer?.name,
  privacyOfficerEmail: () => COMPANY.privacyOfficer?.email,
  effectiveOn: () => COMPANY.effectiveOn,
};

export function fillCompany(text) {
  return String(text ?? "").replace(/\{([a-zA-Z]+)\}/g, (whole, key) => {
    const get = SLOTS[key];
    // 모르는 자리는 **그대로 둔다** — 조용히 지우면 문장이 말이 안 되는 채로 나간다.
    if (!get) return whole;
    const value = get();
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`법률 문서의 «${key}» 값이 비어 있어요 — lib/legal/company.js 를 채워 주세요`);
    }
    return value;
  });
}

// 문서 한 장을 화면이 그릴 모양으로 — 제목과 채워진 문단들.
export function renderDocument(doc) {
  return {
    id: doc.id,
    title: doc.title,
    sections: (doc.sections || []).map((s) => ({
      title: fillCompany(s.title),
      body: (s.body || []).map(fillCompany),
    })),
  };
}
