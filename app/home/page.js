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
import { SHOWCASE } from "../../lib/showcase.js";
import { DIAGRAM_ID } from "../../lib/landing.js";
import HomeMade from "../../components/HomeMade.jsx";
import UserMenu from "../../components/UserMenu.jsx";

// 도해 오른쪽의 "두 길이 모이는 결과".
// ★★ **왼쪽에 적은 이야기로 나온 편**이어야 한다 — 주스 세 가지를 적어 놓고 딴 그림이
//   나오면 도해가 거짓말을 한다(09-14 사장님 지적). 고르는 자리는 lib/landing.js 한 곳이고,
//   벽은 같은 편을 빼고 그린다(components/HomeMade.jsx).
const OUT = SHOWCASE.find((t) => t.id === DIAGRAM_ID) || SHOWCASE[0] || null;

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

      <div className="land-wrap">
        {/* 머리글 — 09-14 에 돌아왔다(위 ①). 한 줄이 제품을 말하고, 아래 도해가 그것을 보인다. */}
        <div className="land-head">
          <p className="land-slate"><b>SHORTFORM</b><span /> 숏폼 영상 스튜디오</p>
          <h1 className="display">간단한 입력이면<br />영상 한 편이 됩니다</h1>
          <p className="land-lede">시나리오 · 화면 · 자막 · 목소리까지 한 번에. 원하는 규격으로 뽑아드립니다.</p>
        </div>

        {/* 걸음 띠 — **순서가 정보다.** 01·02·03 이 진짜 순서라서 번호를 단다
            (장식으로 번호를 다는 자리가 아니다). 가운데 걸음이 아래 도해의 주제와 같다. */}
        <div className="land-steps">
          <div className="land-step">
            <span className="land-ic" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </span>
            <span className="land-step-tx">
              <em>STEP 01</em>
              <strong>만들고 싶은 것을 몇 줄 적습니다</strong>
            </span>
          </div>
          <div className="land-step">
            <span className="land-ic" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 3 1.2 3.3L9.5 7.5 6.2 8.7 5 12 3.8 8.7.5 7.5l3.3-1.2Z" /><path d="m16 9 1.8 4.7L22.5 15l-4.7 1.8L16 21.5l-1.8-4.7L9.5 15l4.7-1.3Z" /></svg>
            </span>
            <span className="land-step-tx">
              <em>STEP 02</em>
              <strong>원클릭으로 한 번에,<br />또는 단계별로 보고 고치며</strong>
            </span>
          </div>
          <div className="land-step">
            <span className="land-ic" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
            </span>
            <span className="land-step-tx">
              <em>STEP 03</em>
              <strong>고른 규격으로, 자막과 소리까지 붙어 나옵니다</strong>
            </span>
          </div>
        </div>

        {/* 도해 — **입력 → 두 갈래 → 같은 결과.** 시안에서 사장님이 고른 구조가 이것이다
            (*"레퍼런스처럼 시나리오 입력 후 두가지 갈래로 퍼지는걸로"*). */}
        <div className="land-diagram">
          {/* 왼쪽 — 적는 자리. 그림이라 진짜 입력칸을 쓰지 않는다(위 머리말 참고). */}
          <div className="land-panel">
            <div className="land-field-set">
              <span className="land-label">무엇을 만들까요</span>
              <div className="land-field">여름 신제품 3종 소개 영상</div>
            </div>
            <div className="land-field-set">
              <span className="land-label">이야기 · 자료</span>
              <div className="land-field land-field--ta">
                직접 짜서 만든 생과일 주스 세 가지를 소개합니다. 수박·자몽·키위, 여름 한정. 시원한 느낌으로 짧게.
                <span className="land-count">72 / 2000</span>
              </div>
            </div>
            <div className="land-field-set">
              <span className="land-label">화풍</span>
              <div className="land-chips">
                <span className="land-chip land-chip--on">실사</span>
                <span className="land-chip">브이로그</span>
                <span className="land-chip">일러스트</span>
                <span className="land-chip">제품컷</span>
              </div>
            </div>
            <div className="land-field-set">
              <span className="land-label">사이즈</span>
              <div className="land-chips">
                <span className="land-chip land-chip--on">세로 · 9:16</span>
                <span className="land-chip">정사각 · 1:1</span>
                <span className="land-chip">가로 · 16:9</span>
              </div>
            </div>
            <div className="land-field-set">
              <span className="land-label">길이</span>
              <div className="land-chips">
                <span className="land-chip land-chip--on">15초</span>
              </div>
              {/* ★★ 칩 아래 설명 두 줄은 **걷었다**(2026-09-14 사장님 지시 — 칩이 이미 말한다).
                  ⚠️ 그래도 **사실은 이것이다**: 길이 칩이 하나뿐인 것은 고른 모델의 한 번
                  상한에서 뽑히기 때문이고, 규격은 셋 중 **고르는** 것이지 한 번에 셋이
                  나오는 것이 아니다. 이 설명을 되살릴 때도, 다른 문구를 새로 적을 때도
                  그 사실을 넘어서는 약속을 쓰지 마라(시안 검토에서 한 번 틀리게 적었다). */}
            </div>
          </div>

          {/* 가운데 — 두 갈래로 퍼진다. 이것이 이 제품의 차별점이라고 사장님이 꼽았다:
              *"중간을 보고 고칠 수 있다"*. 다만 그것만 내밀면 약해서 **두 길을 나란히** 보인다. */}
          <div className="land-fork">
            <div className="land-branch">
              <div className="land-bhead">
                <span className="land-btag">원클릭</span>
                <strong>적어주시면 끝까지 알아서</strong>
              </div>
              <p>중간에 멈추지 않고 완성까지 한 번에. 빨리 한 편 필요할 때.</p>
              <div className="land-trail">
                <span className="land-node land-node--plain"><em>이야기 적기</em><b>한 번만</b></span>
                <span className="land-arw" aria-hidden="true">┈▸</span>
                <span className="land-node land-node--fin"><em>완성 영상</em><b>멈춤 없이</b></span>
              </div>
            </div>

            <div className="land-branch land-branch--pick">
              <div className="land-bhead">
                <span className="land-btag">단계별</span>
                <strong>보면서 고치며 만들기</strong>
              </div>
              <p>시나리오와 화면을 먼저 보여드립니다. 원하는 것과 다르면 그 자리에서 고칩니다.</p>
              <div className="land-trail">
                <span className="land-node"><em>시나리오</em><b>고칠 수 있어요</b></span>
                <span className="land-arw" aria-hidden="true">┈▸</span>
                <span className="land-node"><em>화면</em><b>고칠 수 있어요</b></span>
                <span className="land-arw" aria-hidden="true">┈▸</span>
                <span className="land-node land-node--fin"><em>완성 영상</em><b>확인 뒤에</b></span>
              </div>
            </div>
          </div>

          {/* 오른쪽 — 두 길이 모이는 결과. 시안은 여기에 스토리보드 판도 걸었는데, 그 판은
              굽힌 표지(public/showcase)에 없어서 **이 회차에서는 안 건다.**
              걸려면 scripts/showcase-refresh.mjs 가 판도 함께 굽게 해야 한다. */}
          {OUT && (
            <div className="land-out">
              <img
                src={`/showcase/${OUT.file}`}
                alt="shortform 으로 만든 숏폼 영상"
                width={OUT.w}
                height={OUT.h}
                fetchPriority="high"
              />
              {/* 자막은 우리가 ffmpeg 로 태워 넣는 것이라 그림 위에 그대로 얹는다.
                  ★ 색을 입히지 않는다 — 지금 제공하지 않는 기능을 랜딩이 약속하면 안 된다
                    (09-14 사장님 지시로 시안에서 색 자막을 걷었다). */}
              {/* ★ 자막은 **아래**에 깐다(09-14 사장님 지시). 가운데 있으면 사람 얼굴이나
                  물건을 덮는다 — 실제 우리가 태우는 자리도 화면 아래다. */}
              <p className="land-burn">매일 아침 직접 짭니다<br />여름 한정 3종</p>
              <div className="land-scrub" aria-hidden="true">
                <span className="land-pb" />
                <span className="land-track"><i /></span>
                <span className="land-time">00:07 / 00:15</span>
              </div>
            </div>
          )}
        </div>

        {/* 규격 — 비율을 **고르는** 것이지 셋이 한 번에 나오는 것이 아니다(시안 정정 셋 중 하나). */}
        <div className="land-fits">
          <p className="land-fits-t">급하면 원클릭, 제대로 만들려면 단계별 — 두 가지 다 있습니다</p>
          <div className="land-fitrow">
            <span className="land-fit"><b>9:16</b> 인스타 릴스 · 유튜브 쇼츠 · 틱톡</span>
            <span className="land-fit"><b>16:9</b> 유튜브 · 홈페이지 · 화면 광고</span>
            <span className="land-fit"><b>1:1</b> 인스타 피드 · 네이버 배너</span>
          </div>
        </div>
      </div>

      {/* ★★ 2026-09-14 — 아래 절들을 한 겹으로 묶는다. [맨 위로] 버튼이 **이 묶음 안에서**
          sticky 로 떠 있어야 두 갈래 절부터 마무리까지 따라온다 — 벽 안에 두었더니 벽을
          지나는 순간 같이 사라져 페이지 맨 아래에서는 보이지 않았다(사장님 지적).
          ★ 히어로·도해는 이 묶음 **밖**이다 — 맨 위에서 "맨 위로"는 할 말이 없다. */}
      <div className="land-below">
      {/* ★★ 어두운 면은 **여기 하나뿐이다.** 랜딩에서 가장 할 말이 많은 절이라 바탕을 갈아
          시선을 끊는다 — 색으로 소리치는 자리를 하나로 몰아 둔 것이다. */}
      <section className="land-two" id="two">
        <div className="land-wrap">
          <p className="land-slate"><b>SC 02</b><span /> 원클릭 · 단계별</p>
          <h2 className="land-h2">급할 땐 한 번에,<br />다듬을 땐 단계별로</h2>
          <p className="land-lede">
            오늘 당장 올릴 게 필요한 날이 있고, 원하는 그림이 또렷해 손봐가며 만들고 싶은 날이 있습니다.
            그래서 길을 둘로 열어두었습니다.
          </p>

          {/* ★ 두 카드는 **같은 크기**다(09-14 사장님 지시). 내용 길이가 달라도 늘여서 맞추고
              마지막 "이럴 때" 줄을 바닥에 붙인다 — 한쪽만 길면 그쪽이 정답처럼 읽힌다. */}
          <div className="land-paths">
            <div className="land-path">
              <span className="land-ptag">원클릭</span>
              <h3 className="land-path-h">적어두면 끝까지 알아서</h3>
              <ul className="land-plist">
                <li><b>중간에 멈추는 곳이 없습니다.</b> 적고 나면 더 손댈 일이 없어요.</li>
                <li>시나리오 · 화면 · 자막 · 소리까지 한 번에 붙습니다.</li>
                <li>기다렸다가 완성된 영상만 받아보면 됩니다.</li>
              </ul>
              <p className="land-pwhen"><b>이럴 때</b> — 소재는 정해졌고, 빨리 한 편만 있으면 될 때</p>
            </div>

            <div className="land-path land-path--deep">
              <span className="land-ptag">단계별</span>
              <h3 className="land-path-h">보면서 고치며 만들기</h3>
              <ul className="land-plist">
                <li><b>시나리오와 화면을 먼저 보여드립니다.</b> 영상을 만들기 전이에요.</li>
                <li>원하는 것과 다르면 <b>그 자리에서 고칩니다.</b> 처음부터 다시 돌릴 필요가 없어요.</li>
                <li>마음에 들 때 마지막으로 영상을 만듭니다.</li>
              </ul>
              <div className="land-editbox">
                <span className="land-editlbl">고치고 싶은 것을 적어주세요</span>
                <p className="land-typed">두 번째 장면을 더 밝게, 마지막에 로고도 넣어줘</p>
                <span className="land-send">이대로 고치기</span>
              </div>
              <p className="land-pwhen"><b>이럴 때</b> — 머릿속에 그림이 있고, 그대로 나와야 할 때</p>
            </div>
          </div>
        </div>
      </section>

      {/* 만든 영상 — 굽힌 표지에서 그린다(components/HomeMade.jsx). */}
      <div className="land-wrap land-made-head">
        <p className="land-slate"><b>SC 03</b><span /> 만든 영상</p>
        <h2 className="land-h2">shortform 으로 만들었습니다</h2>
        <p className="land-lede">전부 실제로 이 서비스에서 나온 영상입니다.</p>
      </div>
      <HomeMade />

      {/* 마무리 — 이 화면에서 가장 큰 문. 위의 [시작하기]와 **같은 곳**으로 간다. */}
      <section className="land-final">
        <div className="land-wrap">
          <h2 className="land-h2">머릿속에 있는 장면을<br />다음 영상으로</h2>
          <p className="land-lede">몇 줄만 적으면 됩니다. 나머지는 같이 만들어 갑니다.</p>
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
