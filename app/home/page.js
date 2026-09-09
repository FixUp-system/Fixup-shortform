// 홈 — **어두운 무대**로 여는 첫 화면 (2026-09-09 사장님 확정).
//
// 이력이 짧게 세 번 바뀌었다. 무엇을 되돌리는지 알고 있으라고 적어 둔다:
//   · 08-28 "만드는 방식을 고르는" 도해 두 장 — 만들어 본 적 없는 사람이 고를 근거가 없었다
//   · 09-08 결과물로 여는 **밝은** 화면 — 만든 것을 먼저 보였다
//   · 09-09 아침 손님에게 열고 결과물을 맨 위로
//   · 09-09 저녁 **어두운 무대 + 히어로 영상 자리 + 비율 섞인 벽**  ← 지금
//
// ★★★ **랜딩만 어둡다. 작업 화면은 밝은 벌 그대로다.**
//   09-08 에 화면을 밝은 벌 한 벌로 바꾸고 어두운 벌을 파일째 지웠는데, 랜딩은 다시
//   어두워졌다. 되돌린 것이 아니라 **경계가 하나 생긴 것**이다 — 자막 무대에만 살던
//   규칙("보는 면은 어둡게, 조작하는 면만 밝게")이 여기까지 넓어졌다.
//   그래서 색은 `.stage` **뿌리 아래에서만** 쓴다(app/globals.css). 이름 앞자리로 면제를
//   주면 앱층 화면이 딸려 나간다 — 09-08 에 `.home-header` 로 이미 겪은 함정이다.
//   설계: docs/superpowers/specs/2026-09-09-dark-showcase-landing-design.md
//
// ★★ **손님도 같은 화면을 본다**(09-09 아침 확정). 화면은 한 벌이고 버튼만 신원에 따라
//   갈린다 — 손님은 가입의 문(/login), 들어온 사람은 만드는 문(/ads/new).
//   ⚠️ 손님이 여기 닿으려면 `/home` 이 손님 목록(lib/auth/guest.js)에 있어야 한다.
//
// ★ 이 파일은 **서버 컴포넌트**다. 신원은 middleware 가 요청 헤더에 넣어 준 값을 읽기만
//   한다 — 여기서 세션을 다시 확인하면 그 판정이 두 벌이 된다(app/page.js 와 같은 규율).
//
// ★★ 히어로 자리에도 **영상 태그를 두지 마라.** 표지 그림과 재생 표시만 걸고 진짜 영상은
//   누른 뒤 상세에서 튼다. 손님이 오는 화면이라 한 자리라도 물면 방문 수만큼 바이트가
//   나간다(2026-09-07 사고). 판이 두 파일을 함께 잰다.
//
// ★ 전시층(.display)은 **여기서만** 쓴다 — 작업 화면이 같이 굵어지면 화면 전체가 소리를
//   질러 사장님이 지금 눌러야 할 것을 못 고른다(tests/design-system.test.js).
// ★ 사이드바는 AppShell 이 이미 그린다(여기서 안 그린다).
import Link from "next/link";
import { headers } from "next/headers";
import { USER_HEADER } from "../../lib/auth/headers.js";
import HomeMade from "../../components/HomeMade.jsx";

// 만드는 법은 **세 걸음**이다. 셋이 하나의 흐름으로 읽혀야 한다(2026-09-09 사장님 지적):
// 준비한다 → 보고 고친다 → 고친 그대로 나온다.
// ★ 셋째 줄이 둘째를 받는다 — "고친 그대로"가 이 제품의 뼈대다(컷을 이어붙이면 원고와
//   글자 그대로 같다는 보장). 시스템 쪽 말("확정합니다")이 아니라 사장님이 하는 일로 쓴다.
const STEPS = [
  { n: "01", name: "소재", sub: "글과 사진을 준비합니다" },
  { n: "02", name: "시나리오", sub: "보고 고칠 수 있습니다" },
  { n: "03", name: "영상 생성", sub: "고친 그대로 만들어집니다" },
];

export default async function HomePage() {
  const signedIn = Boolean((await headers()).get(USER_HEADER));

  // ★ 뿌리 클래스는 `home` 이다 — 액센트 면제(showcase)가 그 뿌리에 묶여 있고
  //   (tests/design-system.test.js), 그 클래스를 다는 화면은 이 파일 하나여야 한다.
  return (
    <section className="home">
      <div className="stage-top">
        <div>
          <h1 className="display">소재만 적으면<br /><em>한 편이 나옵니다</em></h1>
          <p className="lede">시나리오·목소리·그림·영상이 한 줄기로 이어집니다.</p>
        </div>
        <Link className="cta" href={signedIn ? "/ads/new" : "/login"}>
          {signedIn ? "만들러 가기" : "무료로 시작하기"}
        </Link>
      </div>

      {/* 히어로 영상 자리와 결과물 벽은 **같은 부품**이 그린다 — 둘 다 같은 목록을 쓰므로
          나누면 요청이 두 번 나간다(그 자체가 전송량이다). */}
      <HomeMade />

      <p className="eyebrow">이렇게 만듭니다</p>
      <div className="stage-steps">
        {STEPS.map((s) => (
          <div key={s.n} className="stage-step">
            <span className="stage-n">{s.n}</span>
            <h3>{s.name}</h3>
            <p>{s.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
