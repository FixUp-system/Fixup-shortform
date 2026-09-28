// 홈 — **제품 도해로 여는 밝은 랜딩** (2026-09-14 사장님이 시안 둘 중 이쪽을 골랐다).
//
// 이력이 짧게 여섯 번 바뀌었다. 무엇을 되돌리는지 알고 있으라고 적어 둔다:
//   · 08-28 "만드는 방식을 고르는" 도해 두 장 — 만들어 본 적 없는 사람이 고를 근거가 없었다
//   · 09-08 결과물로 여는 **밝은** 화면 — 만든 것을 먼저 보였다
//   · 09-09 아침 손님에게 열고 결과물을 맨 위로
//   · 09-09 저녁 어두운 무대 + 히어로 자리 + 비율 섞인 벽
//   · 09-09 밤 덮개가 화면을 채우고 껍데기가 그 위에 얹힌다
//   · 09-14 **제품 도해**(입력 → 두 갈래 → 같은 영상) + 밝은 벌  ← 지금
//
// ★★★ 09-14 회차는 앞 회차의 결정 **셋을 뒤집는다.** 뒤집힌 줄 모르고 되돌리지 마라:
//   ① **머리글이 돌아왔다** — 09-09 저녁에 "결과물이 유일한 주인공"이라며 큰 제목과 리드를
//     걷었는데, 시안 검토에서 사장님이 *"무엇을 해 주는 곳인지 먼저 말해야 한다"* 로 돌아섰다.
//   ② **걸음 띠가 돌아왔다** — 09-10 에 지운 세 걸음(소재·시나리오·영상 생성)이 아니라
//     **다른 세 걸음**(적는다 → 두 길 → 규격대로 나온다)이다. 옛 절을 되살린 것이 아니다.
//   ③ **화면 전체를 채우던 어두운 덮개를 걷었다** — 첫 화면이 사진 한 장이면 "무엇을
//     만들어 주는 곳인가"가 안 보인다. 어두운 면은 이제 **두 갈래 절 하나**만 쓴다.
//
// ★★ 그래서 랜딩은 **밝은 벌**이다(앱 화면과 같은 벌). 어두운 것은 `.land-two` 절뿐이고,
//   그 절의 색도 `:root` 의 무대 토큰(--stage-dark·--stage-ink·--stage-chrome)을 쓴다 —
//   이 저장소는 `:root` 밖 hex 를 금지한다(tests/design-system.test.js).
//
// ★★ **손님도 같은 화면을 본다**(09-09 아침 확정). 화면은 한 벌이고 문만 신원에 따라
//   갈린다 — 손님은 가입의 문(/login), 들어온 사람은 만드는 문(/ads/new).
//   ⚠️ 손님이 여기 닿으려면 `/home` 이 손님 목록(lib/auth/guest.js)에 있어야 한다.
//
// ★ 이 파일은 **서버 컴포넌트**다. 신원은 middleware 가 요청 헤더에 넣어 준 값을 읽기만
//   한다 — 여기서 세션을 다시 확인하면 그 판정이 두 벌이 된다(app/page.js 와 같은 규율).
//   랜딩 전체가 서버에서 한 번에 그려져 내려간다(09-10: 첫 방문 7.5초 → 1.6초).
//
// ★★ **영상 태그를 두지 마라.** 표지 그림만 걸고 진짜 영상은 누른 뒤 상세에서 튼다 —
//   손님이 오는 화면이라 한 자리라도 물면 방문 수만큼 바이트가 나간다(2026-09-07 사고).
//   판이 이 파일과 components/HomeMade.jsx 를 함께 잰다.
//
// ★ 도해의 입력 칸·자막·재생 표시는 **그림이다**(조작하는 물건이 아니다). 진짜 입력은
//   [시작하기] 뒤에 있다 — 여기서 누르게 만들면 랜딩이 앱 흉내를 내다 말게 된다.
import Link from "next/link";
import { headers } from "next/headers";
import { USER_HEADER } from "../../lib/auth/headers.js";
import HomeCollage from "../../components/HomeCollage.jsx";
import HomeMade from "../../components/HomeMade.jsx";
import UserMenu from "../../components/UserMenu.jsx";

export default async function HomePage() {
  const signedIn = Boolean((await headers()).get(USER_HEADER));

  // ★ 뿌리 클래스는 `home` 이다 — 액센트 면제(showcase)가 그 뿌리에 묶여 있고
  //   (tests/design-system.test.js), 그 클래스를 다는 화면은 이 파일 하나여야 한다.
  // ★ `id="top"` 은 벽의 [맨 위로] 버튼이 가리키는 자리다(HomeMade 의 stage-top).
  // ⚠️ 설명을 `return (` **안에** JSX 주석으로 넣지 마라 — 루트가 둘이 되어 문법이 깨진다.
  //    그런데 이 저장소의 화면 판은 소스 문자열만 훑어서 **전부 초록인 채 앱만 안 뜬다**
  //    (2026-09-10 에 이 파일과 Sidebar.jsx 에서 두 번 밟았다).
  return (
    <section className="home" id="top">
      {/* 껍데기 — 사이드바가 그리던 브랜드와 띠가 그리던 신원 영역이 여기로 온다.
          ★ 신원 영역은 **UserMenu 하나**가 손님(로그인 문)과 들어온 사람(메뉴)을 다 그린다.
            여기서 갈래를 또 만들면 같은 판정이 두 벌이 된다.
          ★ 09-14 — 덮개가 사라져 껍데기가 **화면 맨 위에 따라다니는 띠**가 됐다(sticky). */}
      <div className="stage-nav">
        <Link href="/home" className="stage-brand">shortform</Link>
        <div className="stage-nav-right">
          <Link className="land-navlink" href="#made">만든 영상</Link>
          <Link className="land-navlink" href="#two">원클릭 · 단계별</Link>
          {/* ★ 서버가 이미 손님인 줄 안다 — 그 답을 넘겨 첫 그림부터 맞는 버튼을 세운다
              (안 넘기면 손님도 "내 계정"이 잠깐 보였다가 [로그인] 으로 바뀐다). */}
          <UserMenu initialGuest={!signedIn} />
          {/* ★ 손님은 로그인으로 보내되 **돌아올 자리를 실어서** 보낸다(2026-09-14).
              그전에는 로그인을 마쳐도 첫 화면으로 돌아와 버튼을 한 번 더 눌러야 했다. */}
          <Link className="cta" href={signedIn ? "/ads/new" : "/login?next=/ads/new"}>
            {signedIn ? "만들러 가기" : "시작하기"}
          </Link>
        </div>
      </div>

      {/* 첫 화면 — **흩뿌린 콜라주 위에 머리글을 얹는다** (2026-09-28, 사장님이 고른 시안).
          ★ 머리글은 09-14 의 그것을 **자리만 옮긴 것**이다(문구 그대로). 위 ① 은 그대로 유효하다 —
            "무엇을 해 주는 곳인지 먼저 말해야 한다"가 첫 화면 한가운데에 선다.
          🔴 **여기에만 영상 태그가 있다.** 2026-09-07 사고 뒤로 랜딩에서는 그 태그가 금지였는데
            09-28 에 사장님이 그 자리를 열었다 — 무엇이 그때와 다른지(정적 파일 · 표지 우선 ·
            줄인 클립)는 components/HomeCollage.jsx 머리말에 적어 두었다. **거기부터 읽어라.**
            아래 벽(components/HomeMade.jsx)은 **여전히 금지**이고 판이 그대로 지킨다.
          ★ 칸은 **장식**이다(aria-hidden · alt 빈 문자열) — 읽히는 목록은 아래 벽 하나다.
            누르는 곳도 아니다: 남의 영상 상세는 운영자만 열 수 있어 손님에게는 막다른 길이다
            (components/HomeMade.jsx 가 같은 이유로 09-14 에 링크를 걷었다). */}
      <div className="land-hero">
        <HomeCollage />
        <div className="land-hero-haze" aria-hidden="true" />
        <div className="land-hero-copy">
          <p className="land-slate"><b>SHORTFORM</b><span /> 숏폼 영상 스튜디오</p>
          <h1 className="display">몇 줄만 적으면<br />영상 한 편이 나옵니다</h1>
          <p className="land-lede">장면도 자막도 목소리도 함께 나옵니다. 15초부터 60초까지, 올릴 곳에 맞는 크기로.</p>
        </div>
      </div>

      {/* ★★ 아래 절들은 2026-09-28 에 **통째로 갈렸다**(사장님: "전체 페이지를 갈아 끼울거야").
          걷어낸 것: 걸음 띠(STEP 01~03) · **제품 도해**(09-14 에 사장님이 시안 둘 중 고른 그것) ·
          규격 띠(land-fits) · 어두운 두 갈래 절(land-two) · 옛 마무리(land-final).
          ⚠️ 특히 **도해는 09-14 의 결정 그 자체였다** — 되살릴 값은 git 이력에 있고,
            이 파일 머리말 ①~③ 이 왜 그것을 놓았는지 말한다. 되살리려거든 **뒤집힌 줄 알고** 해라.
          남긴 것: 만든 영상 벽(아래)과 보관함 문. 벽은 목업에 없지만 2026-08-27 사장님 지시
            ("기본으로 보관함 바로 확인")가 여기 말고는 걸릴 데가 없어서 남겼다. */}
      <div className="land-below">

      {/* SC 01 — 적은 글이 그대로 장면과 자막이 된다. 이 서비스의 유일한 구조적 보장이라
          가장 먼저 말한다(컷을 이어붙이면 원고와 글자 그대로 같다). */}
      <section className="land-tell">
        <div className="land-wrap land-say">
          <p className="land-slate land-say-slate"><b>01</b><span /> 글이 영상이 되는 방식</p>
          <p className="land-statement">적으신 글이 그대로<br /><b>장면과 자막</b>이 됩니다.</p>
          <div className="land-quote">
            <p className="land-qsrc">
              가게 이야기를 적으면 그 글에서 장면이 나옵니다. 자막은 다시 쓰지 않습니다 —
              <b>적으신 문장 그대로</b> 화면에 올라갑니다. 위 영상의 자막이 전부 그렇게 들어간 것입니다.
            </p>
            <p className="land-qout">
              예 — “어느 오후, 시간이 멈췄습니다.” · “빛이 먼저 들어와, 자리를 잡습니다.”
            </p>
          </div>
        </div>
      </section>

      {/* SC 02 — 두 갈래. 둘 다 같은 자료로 시작하고, 중간을 손보고 싶은지만 고른다. */}
      <section className="land-tell" id="two">
        <div className="land-wrap">
          <div className="land-tellhead">
            <div>
              <p className="land-slate"><b>02</b><span /> 만드는 방법</p>
              <h2 className="land-h2">맡기거나, 보면서 고치거나</h2>
              <p className="land-lede">둘 다 같은 자료로 시작합니다. 중간을 손보고 싶은지 아닌지만 고르시면 됩니다.</p>
            </div>
            <Link className="cta" href={signedIn ? "/ads/new" : "/login?next=/ads/new"}>
              {signedIn ? "만들러 가기" : "시작하기"}
            </Link>
          </div>
          <div className="land-ways">
            <div className="land-way">
              <h3 className="land-way-h">원클릭 — 맡기고 받기</h3>
              <p className="land-way-who">오늘 올릴 한 편이 급할 때</p>
              <ul className="land-way-list">
                <li>적고 버튼 한 번이면 끝</li>
                <li>시나리오 · 그림 · 영상 · 자막이 이어서 나옵니다</li>
                <li>다 되면 내 목록에 쌓입니다</li>
              </ul>
              <p className="land-way-foot">누르는 횟수 1번</p>
            </div>
            <div className="land-way">
              <h3 className="land-way-h">단계별 — 보면서 고치기</h3>
              <p className="land-way-who">문구와 장면을 내 손으로 잡고 싶을 때</p>
              <ul className="land-way-list">
                <li>시나리오를 읽고 고친 뒤 다음으로</li>
                <li>마음에 안 드는 장면만 다시 그리기</li>
                <li>장면마다 첫 번째 다시 만들기는 무료</li>
              </ul>
              <p className="land-way-foot">멈추는 자리 6곳</p>
            </div>
          </div>
        </div>
      </section>

      {/* SC 03 — 단계별로 멈추는 여섯 자리. 표는 lib/steps.js 의 STEPS 와 **같은 순서**다.
          ⚠️ 그 표가 바뀌면 여기도 바꿔라(랜딩은 그 파일을 읽지 않는다 — 화면이 서버 전용
            모듈을 끌어오면 빌드가 깨진 사고가 이 저장소에 세 번 있었다). */}
      <section className="land-tell">
        <div className="land-wrap">
          <div className="land-tellhead">
            <div>
              <p className="land-slate"><b>03</b><span /> 단계별로 만들면</p>
              <h2 className="land-h2">여섯 자리에서 멈춰 볼 수 있어요</h2>
              <p className="land-lede">앞을 고치면 뒤가 바뀌어야 한다고 알려 줍니다. 바뀐 것만 다시 만들면 됩니다.</p>
            </div>
          </div>
          <ol className="land-six">
            <li><b>01</b><strong>입력</strong><span>가게 이야기와 사진</span></li>
            <li><b>02</b><strong>시나리오</strong><span>장면 · 대사 · 초</span></li>
            <li><b>03</b><strong>그림</strong><span>장면마다 한 장</span></li>
            <li><b>04</b><strong>움직임</strong><span>무엇이 어떻게 움직일지</span></li>
            <li><b>05</b><strong>영상</strong><span>장면이 움직입니다</span></li>
            <li><b>06</b><strong>완성</strong><span>자막 얹어 한 편으로</span></li>
          </ol>
        </div>
      </section>

      {/* 만든 영상 — 굽힌 표지에서 그린다(components/HomeMade.jsx). */}
      <div className="land-wrap land-made-head">
        <p className="land-slate"><b>04</b><span /> 만든 영상</p>
        <h2 className="land-h2">여기 있는 건 전부 이걸로 만들었습니다</h2>
        <p className="land-lede">카페 · 미용실 · 건강식품 · 제품 광고 — 업종은 달라도 만든 방법은 같습니다.</p>
      </div>
      <HomeMade />

      {/* SC 05 — 크레딧. ⚠️⚠️ **금액이 비어 있다**(“가격 미정”). 목업 그대로 옮긴 것이고,
          팩 크기는 정해진 값이지만 **판매가는 결제를 붙일 때 정한다**(OUTSTANDING.md 크레딧 절).
          손님에게 열기 전에 채우거나, 못 채우면 이 절을 내려라 — 빈 가격표는 안 파는 것보다 나쁘다. */}
      <section className="land-tell">
        <div className="land-wrap">
          <div className="land-tellhead">
            <div>
              <p className="land-slate"><b>05</b><span /> 크레딧</p>
              <h2 className="land-h2">쓴 만큼만,<br />한 가지 단위로</h2>
              <p className="land-lede">영상도 다시 만들기도 전부 크레딧 하나로 셉니다. 월 구독이 아니라 필요할 때 채우는 방식입니다.</p>
            </div>
          </div>
          <div className="land-packs">
            <div className="land-pack">
              <span className="land-pack-n">스타터</span>
              <span className="land-pack-c">1,000<i> 크레딧</i></span>
              <span className="land-pack-p">가격 미정</span>
              <span className="land-pack-g">15초 한 편씩 가볍게 시험해 보는 크기</span>
            </div>
            <div className="land-pack land-pack--pick">
              <span className="land-pack-n">베이직 · 추천</span>
              <span className="land-pack-c">3,000<i> 크레딧</i></span>
              <span className="land-pack-p">가격 미정</span>
              <span className="land-pack-g">한 달에 몇 편씩 꾸준히 올리는 가게</span>
            </div>
            <div className="land-pack">
              <span className="land-pack-n">프로</span>
              <span className="land-pack-c">5,000<i> 크레딧</i></span>
              <span className="land-pack-p">가격 미정</span>
              <span className="land-pack-g">채널을 본격적으로 돌리는 경우</span>
            </div>
            <div className="land-pack">
              <span className="land-pack-n">비즈니스</span>
              <span className="land-pack-c">10,000<i> 크레딧</i></span>
              <span className="land-pack-p">가격 미정</span>
              <span className="land-pack-g">여러 매장 · 여러 제품을 한꺼번에</span>
            </div>
          </div>
          <p className="land-note">※ 팩 크기는 정해진 값이고, 금액은 결제를 붙일 때 채웁니다. 위 갤러리의 영상은 실제로 만든 것입니다.</p>
        </div>
      </section>

      {/* 마무리 — 이 화면에서 가장 큰 문. 위의 [시작하기]와 **같은 곳**으로 간다. */}
      <section className="land-final">
        <div className="land-wrap">
          <h2 className="land-h2">오늘 올릴 한 편,<br />지금 만들어 보세요</h2>
          <p className="land-lede">준비할 자료는 없습니다. 가게 이야기 몇 줄이면 시작할 수 있어요.</p>
          <Link className="cta land-cta-big" href={signedIn ? "/ads/new" : "/login?next=/ads/new"}>
            {signedIn ? "만들러 가기" : "시작하기"}
          </Link>
        </div>
      </section>

      {/* ★★ 맨 위로 (2026-09-10 사장님 지시 · 09-14 자리 옮김). **자바스크립트를 안 쓴다** —
          이 화면은 서버가 통째로 그려 내려주는 자리라(첫 방문 7.5초 → 1.6초), 스크롤을
          감지하려고 "use client" 를 들이면 그 최적화가 깨진다. 자리는 CSS 의 sticky 가
          잡는다: 위 묶음(.land-below) 안에서만 떠 있어 히어로에서는 안 보인다. */}
      <a href="#top" className="stage-top" aria-label="맨 위로">
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
          <path d="M1 9l7-7 7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
      </div>
    </section>
  );
}
