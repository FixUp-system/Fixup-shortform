// 법률 문서(이용약관·개인정보처리방침) — 2026-09-11.
//
// ★★★ 이 판이 막는 사고는 **하나**다: **덜 채운 문서가 이용자 눈에 닿는 것.**
//   형제 제품 MCS 의 개인정보 처리방침이 정확히 그 상태다 — 제목이 `게시 전 확인용 초안`이고
//   대괄호 빈칸 31개와 편집자용 지시문이 **화면에 그대로 렌더된다**
//   (docs/mcs-frontend-report-2026-09-11.md §3). 조항 뼈대는 참고하되 그 사고는 물려받지 않는다.
//
// ★ 그래서 규칙을 이렇게 건다:
//     회사 정보가 다 차 있지 않으면 → 화면은 문서를 안 그리고, 어디에도 링크하지 않는다.
//   즉 **"반쯤 채운 문서"라는 상태가 제품에 존재하지 않는다.**
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { COMPANY, legalReady, missingCompanyFields } from "../lib/legal/company.js";
import { TERMS, PRIVACY, DOCUMENTS } from "../lib/legal/documents.js";
import { fillCompany, renderDocument } from "../lib/legal/render.js";

const page = readFileSync("app/legal/[doc]/page.js", "utf8");
const login = readFileSync("app/login/page.js", "utf8");

describe("법률 문서 — 덜 채운 채로 나가지 않는다", () => {
  it("★★★ 회사 정보가 덜 차면 legalReady 가 false 다", () => {
    // 이 판은 값이 차 있든 비어 있든 **둘 다 옳게** 동작해야 한다.
    const missing = missingCompanyFields();
    expect(legalReady()).toBe(missing.length === 0);
  });

  it("★★★ 화면이 legalReady 를 보고 그릴지 정한다 — 안 보면 빈칸이 렌더된다", () => {
    expect(page, "화면이 준비 여부를 안 본다").toMatch(/legalReady\(\)/);
  });

  it("★★★ 빈 값을 글자로 메우지 않는다 — 던진다", () => {
    // "(미기재)" 같은 것으로 메우면 그 문서는 **틀린 채로 게시된다**.
    if (legalReady()) {
      expect(() => fillCompany("{name}")).not.toThrow();
    } else {
      expect(() => fillCompany("{name}")).toThrow(/비어 있어요/);
    }
  });

  it("★★★ 회사 정보가 준비되기 전에는 **어디에서도 링크하지 않는다**", () => {
    // 링크가 있는데 문서가 준비 안 됐으면, 누른 사람이 "준비 중" 화면을 만난다.
    // 그것은 MCS 의 빈칸 렌더보다는 낫지만 여전히 나쁘다 — 아예 안 보여 준다.
    const linked = /href=["']\/legal\//.test(login);
    if (!legalReady()) {
      expect(linked, "회사 정보가 비었는데 로그인 화면이 법률 문서를 링크한다").toBe(false);
    }
  });
});

describe("문서 본문 — 사실과 맞는가", () => {
  const text = (doc) =>
    doc.sections.map((s) => `${s.title}\n${s.body.join("\n")}`).join("\n");

  it("문서가 둘이고 각각 조항을 갖는다", () => {
    expect(DOCUMENTS.map((d) => d.id).sort()).toEqual(["privacy", "terms"]);
    for (const d of DOCUMENTS) {
      expect(d.sections.length, `${d.title} 에 조항이 없다`).toBeGreaterThan(5);
      for (const s of d.sections) {
        expect(s.body.length, `${d.title} 의 «${s.title}» 이 비었다`).toBeGreaterThan(0);
      }
    }
  });

  it("★★★ **승인제**를 적는다 — 가입만으로 못 쓰는 것이 이 서비스의 성질이다", () => {
    expect(text(TERMS), "약관이 운영자 승인제를 안 적는다").toMatch(/승인/);
  });

  it("★★★ **국외 이전**과 수탁자를 이름으로 적는다", () => {
    const t = text(PRIVACY);
    for (const w of ["Supabase", "Vercel", "fal.ai", "OpenAI", "Anthropic"]) {
      expect(t, `수탁자 ${w} 가 빠졌다`).toContain(w);
    }
    expect(t, "국외 이전을 안 적는다").toMatch(/국외/);
  });

  it("★★★ **fal 중간물이 공개로 남는다**는 사실을 숨기지 않는다", () => {
    // 고치기 전까지는 적는 것이 정직한 처리다(고치는 방법은 OUTSTANDING.md 의 A-3).
    expect(text(PRIVACY), "처리방침이 그 사실을 안 적는다").toMatch(/주소를 아는 사람/);
    expect(text(TERMS), "약관이 그 사실을 안 적는다").toMatch(/주소를 아는 사람/);
  });

  it("★★ 비밀번호를 우리가 안 본다는 사실을 적는다", () => {
    expect(text(PRIVACY)).toMatch(/평문/);
  });

  it("★★ 회사 값을 문서에 **손으로 박지 않는다** — 자리만 둔다", () => {
    const raw = readFileSync("lib/legal/documents.js", "utf8");
    // 상호·번호를 문서에 직접 적으면 COMPANY 와 두 벌이 된다.
    expect(raw, "문서에 사업자등록번호를 손으로 적었다").not.toMatch(/\d{3}-\d{2}-\d{5}/);
    expect(raw, "회사 자리를 안 쓴다").toMatch(/\{name\}/);
  });

  it("★★★ 편집 흔적이 본문에 남아 있지 않다 — MCS 가 그 상태다", () => {
    const raw = readFileSync("lib/legal/documents.js", "utf8");
    const bodies = DOCUMENTS.map(text).join("\n");
    for (const bad of ["TODO", "초안", "여기에", "작성 필요", "[ ]"]) {
      expect(bodies, `본문에 편집 흔적 «${bad}» 이 남아 있다`).not.toContain(bad);
    }
    // 대괄호 빈칸(MCS 의 31개)이 본문에 있으면 안 된다.
    expect(bodies, "대괄호 빈칸이 본문에 있다").not.toMatch(/\[[^\]]{0,20}\]/);
    expect(raw).toBeTruthy();
  });

  it("★ 준비가 끝났으면 실제로 그려진다 — 자리가 하나라도 비면 던진다", () => {
    if (!legalReady()) return;
    for (const d of DOCUMENTS) {
      const out = renderDocument(d);
      const joined = out.sections.map((s) => s.body.join(" ")).join(" ");
      expect(joined, "채우지 못한 자리가 남았다").not.toMatch(/\{[a-zA-Z]+\}/);
    }
  });
});

describe("화면 — 전자상거래법이 표시하라는 것", () => {
  it("★★ 사업자 정보 블록이 문서 아래에 선다", () => {
    for (const w of ["상호", "대표자", "사업자등록번호", "통신판매업", "문의"]) {
      expect(page, `사업자 정보에 «${w}» 가 없다`).toContain(w);
    }
  });

  it("★ 화면이 회사 값을 COMPANY 에서 가져온다", () => {
    expect(page).toMatch(/COMPANY\./);
    expect(existsSync("lib/legal/company.js")).toBe(true);
  });
});
