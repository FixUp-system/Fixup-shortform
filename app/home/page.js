// 홈 — **화면을 가득 채우는 어두운 무대**로 여는 첫 화면 (2026-09-09 저녁 사장님 확정).
//
// 이력이 짧게 다섯 번 바뀌었다. 무엇을 되돌리는지 알고 있으라고 적어 둔다:
//   · 08-28 "만드는 방식을 고르는" 도해 두 장 — 만들어 본 적 없는 사람이 고를 근거가 없었다
//   · 09-08 결과물로 여는 **밝은** 화면 — 만든 것을 먼저 보였다
//   · 09-09 아침 손님에게 열고 결과물을 맨 위로
//   · 09-09 저녁 어두운 무대 + 히어로 자리 + 비율 섞인 벽
//   · 09-09 밤 **덮개가 화면을 채우고 껍데기가 그 위에 얹힌다**  ← 지금
//
// ★★★ 마지막 회차에 고친 것은 **색이 아니라 틀이다.** 색 토큰은 프로토타입과 이미
//   글자까지 같았는데(`--stage-bg`·`--stage-ink`·`--stage-chrome`·`--stage-panel`·
//   `--stage-line`, 그리고 버튼은 `--btn` — 값은 app/globals.css 의 `:root` 에 있다.
//   ⚠️ **여기에 그 값을 베껴 적지 마라** — 이 저장소는 `:root` 밖 색 리터럴을 금지하고,
//     판이 주석까지 날 것으로 훑는다. 실제로 이 자리에 값을 적었다가 잡혔다)
//   프로덕션 화면은 딴판이었다 — 프로토타입은 **검은 화면 전체**였고 여기는 **밝은 앱 틀
//   안에 뜬 검은 카드**였다. 사이드바와 띠가 랜딩을 액자에 넣고 있었다.
//   그래서 랜딩에서는 그 둘을 걷고(AppShell 의 isLandingPath 갈래) 브랜드와 신원 영역을
//   **덮개 위로** 올린다. 색을 더 맞출 것은 없었다.
//
// ★★★ **랜딩만 어둡다. 작업 화면은 밝은 벌 그대로다.**
//   09-08 에 화면을 밝은 벌 한 벌로 바꾸고 어두운 벌을 파일째 지웠는데, 랜딩은 다시
//   어두워졌다. 되돌린 것이 아니라 **경계가 하나 생긴 것**이다 — 자막 무대에만 살던
//   규칙("보는 면은 어둡게, 조작하는 면만 밝게")이 여기까지 넓어졌다.
//   그래서 색은 `.home` **뿌리 아래에서만** 쓴다(app/globals.css). 이름 앞자리로 면제를
//   주면 앱층 화면이 딸려 나간다 — 09-08 에 `.home-header` 로 이미 겪은 함정이다.
//   설계: docs/superpowers/specs/2026-09-09-dark-showcase-landing-design.md
//
// ★★ **손님도 같은 화면을 본다**(09-09 아침 확정). 화면은 한 벌이고 문만 신원에 따라
//   갈린다 — 손님은 가입의 문(/login), 들어온 사람은 만드는 문(/ads/new).
//   ⚠️ 손님이 여기 닿으려면 `/home` 이 손님 목록(lib/auth/guest.js)에 있어야 한다.
//
// ★ 이 파일은 **서버 컴포넌트**다. 신원은 middleware 가 요청 헤더에 넣어 준 값을 읽기만
//   한다 — 여기서 세션을 다시 확인하면 그 판정이 두 벌이 된다(app/page.js 와 같은 규율).
//   그래서 껍데기(nav)를 **여기서 만들어** 덮개 부품에 건넨다. 덮개는 목록을 무는
//   클라이언트 부품이라 신원을 모른다.
//
// ★★ 덮개에도 **영상 태그를 두지 마라.** 표지 그림과 재생 표시만 걸고 진짜 영상은
//   누른 뒤 상세에서 튼다. 덮개는 화면을 가득 채우므로 더더욱 그렇다 — 손님이 오는
//   화면이라 한 자리라도 물면 방문 수만큼 바이트가 나간다(2026-09-07 사고).
//   판이 두 파일을 함께 잰다.
//
// ★ 머리글(큰 제목·리드)은 **걷었다**(09-09 저녁 사장님 지시). 첫 화면에서 결과물이
//   유일한 주인공이 된다 — 말이 앞서면 무엇을 만들어 주는 곳인지 오히려 흐려진다.
import Link from "next/link";
import { headers } from "next/headers";
import { USER_HEADER } from "../../lib/auth/headers.js";
import HomeMade from "../../components/HomeMade.jsx";
import UserMenu from "../../components/UserMenu.jsx";

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

  // 덮개 위에 얹을 껍데기. 사이드바가 그리던 브랜드와 띠가 그리던 신원 영역이 여기로 온다.
  // ★ 신원 영역은 **UserMenu 하나**가 손님(로그인 문)과 들어온 사람(메뉴)을 다 그린다.
  //   여기서 갈래를 또 만들면 같은 판정이 두 벌이 된다.
  // ★ 브랜드는 사이드바 로고와 같은 곳으로 간다(/home) — 2026-08-28 지시를 잇는다.
  const nav = (
    <div className="stage-nav">
      <Link href="/home" className="stage-brand">shortform</Link>
      <div className="stage-nav-right">
        <UserMenu />
        <Link className="cta" href={signedIn ? "/ads/new" : "/login"}>
          {signedIn ? "만들러 가기" : "시작하기"}
        </Link>
      </div>
    </div>
  );

  // ★ 뿌리 클래스는 `home` 이다 — 액센트 면제(showcase)가 그 뿌리에 묶여 있고
  //   (tests/design-system.test.js), 그 클래스를 다는 화면은 이 파일 하나여야 한다.
  return (
    <section className="home">
      <HomeMade nav={nav} />

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
