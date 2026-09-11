"use client";

// 로그인·회원가입 — 이메일과 비밀번호로 들어온다.
// 매직링크(메일 왕복)를 걷어낸 자리다. 가입은 누구나 되지만 **운영자 승인 전에는**
// /pending 에서 아무것도 못 한다 — 그 사실을 가입 탭이 미리 알린다.
//
// 이 저장소의 다른 화면과 같은 패널·버튼 클래스를 쓴다(app/globals.css, tests/design-system.test.js).
import Link from "next/link";
import { useState } from "react";
// 길이 상한은 마이페이지와 **같은 자리**에서 온다 — 손으로 적으면 한쪽만 낡는다.
import { NAME_MAX } from "../../lib/display-name.js";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState("login");     // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // 가입에서만 쓴다 — 로그인 탭에서는 칸도 안 뜨고 몸통에도 안 실린다.
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = tab === "signup";

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(isSignup ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ★ 이름은 **가입일 때만** 싣는다. 로그인 몸통에 넣으면 라우트가 안 읽는 값이
        //   섞여 다음 사람이 "로그인도 이름을 보나" 하고 헷갈린다.
        body: JSON.stringify(isSignup ? { email, password, name } : { email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 서버가 준 문구를 그대로 보여 준다 — 화면이 원인을 추측해 갈라 쓰면
        // 계정 열거 차단(로그인 실패는 한 문구)이 화면에서 무너진다.
        setError(data.error || "다시 시도해 주세요");
        return;
      }
      // 세션 쿠키가 섰다. 어디로 갈지는 middleware 가 정한다(승인 전이면 /pending).
      // refresh 를 함께 부르는 이유: 서버 컴포넌트가 새 세션으로 다시 그려져야 한다.
      router.replace("/");
      router.refresh();
    } catch {
      setError("연결에 문제가 있어요 — 잠시 후 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* ★★ 2026-09-10 저녁 — 브랜드를 **화면 좌상단에 고정**한다(사장님 지시:
          "shortform 부분을 고정 위치로 적용해줘").
          그전에는 카드 위 가운데에 서 있었는데, 이 화면은 `.work--bare` 라 **세로 가운데
          정렬**이다 — 회원가입 탭으로 바꾸면 이름 칸(52+16px)이 늘어난 만큼 제목이 위로
          튀었다. 오류 한 줄이 떠도 같은 일이 났다. 흐름에서 빼면 아래가 무엇으로 늘든
          제목은 안 움직인다.
          ★ 그리고 이 자리가 **메인으로 가는 문**을 겸한다(사장님: "로그인 페이지에서 메인
            페이지로 이동할 방법이 없어서") — 로고를 누르면 첫 화면으로 가는 것은 웹의
            관례라, 새 낱말을 늘리지 않고 길이 하나 생긴다. 다만 그 관례는 **아는 사람만**
            아니까 아래 안내줄에 글자로 된 문도 함께 둔다.
          ⚠️ `/home` 이 손님에게 열리는 판정은 `SHOTFORM_PUBLIC_ARCHIVE` 다
            (lib/auth/guest.js). 스위치가 꺼지면 이 문은 로그인으로 되돌아온다 — 바로 아래
            보관함 문이 이미 같은 성질이라 새로 생기는 함정은 아니다. */}
      <h1 className="login-brand">
        <Link href="/home">shortform</Link>
      </h1>
      {/* login-head — 부제를 카드와 같은 420px 기둥에 세운다(정렬 축을 하나로). */}
      <p className="pgsub login-head">
        {isSignup
          ? "이메일과 비밀번호로 가입해요. 운영자 승인 뒤에 쓸 수 있어요."
          : "이메일과 비밀번호를 넣어 주세요."}
      </p>

      {/* ★★ 2026-09-10 — **가입 뒤에 무엇이 남았는지** 세 걸음으로 보여 준다.
          형제 제품 MCS 의 온보딩(가입 신청 → 이메일 인증 → 이용)을 **우리 흐름으로** 옮긴
          것이다. 가운데 칸을 그대로 쓰면 거짓말이 된다 — 우리는 이메일 인증을 안 쓰고
          (매직링크를 2026-08-06 에 걷어냈다), 가입 라우트는 그 설정이 켜져 있으면
          **설정 오류로 보고 500 을 낸다**. 우리의 가운데 칸은 **운영자 승인**이다.
          ★ 강조는 **지금 탭이 선 걸음 하나**뿐이다. 지난 걸음에 완료 표시를 달지 않는다 —
            로그인 탭에 선 사람이 승인을 받았는지 이 화면은 모른다(승인 대기자도 로그인한다).
          ★ 번호는 **숫자 글리프**다. 원문자는 판이 막는다(design-system 의 글리프 판).
          ★ 색은 액센트가 아니라 먹색이다 — 이 저장소는 액센트를 **사이드바 스테퍼 하나**에만
            허락한다("앱에서 가장 강한 색은 지금 몇 단계인가를 가리킨다"). 로그인 화면이
            그것을 빌려 쓰면 그 규칙이 흐려진다. */}
      <ol className="login-steps login-head">
        {["가입 신청", "운영자 승인", "이용 시작"].map((label, i) => {
          const here = (isSignup ? 0 : 2) === i;
          return (
            <li key={label} className={`login-step${here ? " on" : ""}`} aria-current={here ? "step" : undefined}>
              <span className="login-step-no">{i + 1}</span>
              {label}
            </li>
          );
        })}
      </ol>

      <section className="panel login-card">
        <div className="login-tabs">
          <button
            type="button"
            className={`login-tab${tab === "login" ? " on" : ""}`}
            disabled={busy}
            onClick={() => { setTab("login"); setError(""); }}
          >
            로그인
          </button>
          <button
            type="button"
            className={`login-tab${isSignup ? " on" : ""}`}
            disabled={busy}
            onClick={() => { setTab("signup"); setError(""); }}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={submit}>
          <input
            type="email"
            required
            autoComplete="email"
            className="sent-input sent-input--lg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="이메일"
          />
          <input
            type="password"
            required
            autoComplete={isSignup ? "new-password" : "current-password"}
            className="sent-input sent-input--lg"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            aria-label="비밀번호"
          />
          {/* ★★ 2026-09-10 저녁 — 이름은 **필수**다(사장님 지시: "이름 선택으로 두지 말고
              그냥 필수값으로 적용해줘"). 같은 날 오전에 넣을 때는 선택이었다 — "가입 문턱을
              올리지 않는다"는 판단이었는데 사장님이 뒤집었다. 그 옛 판단을 근거로 다시
              선택으로 되돌리지 마라.
              ★ 화면의 `required` 는 **문지기가 아니다** — fetch 로 직접 부르면 그냥 지나간다.
                진짜 판정은 라우트가 한다(app/api/auth/signup/route.js 의 400).
                이 저장소의 규율 그대로다: "판정만 하고 강제하지 않으면 안 된다"(CLAUDE.md).
              ★ 자리는 비밀번호 **아래**다: 눈이 익은 두 칸을 먼저 만나고, 새로 생긴
                칸이 마지막에 온다. */}
          {isSignup && (
            <input
              type="text"
              required
              autoComplete="name"
              maxLength={NAME_MAX}
              className="sent-input sent-input--lg"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              aria-label="이름"
            />
          )}
          <button type="submit" className="cta cta--block" disabled={busy}>
            {busy ? "확인 중…" : isSignup ? "가입하기" : "로그인"}
          </button>
        </form>
        {error && <p className="pgsub warn">{error}</p>}
      </section>

      {/* 두 사이트 다 이 자리에 "비밀번호 찾기"를 둔다. 우리는 자가 재설정이 없어
          운영자에게 보낸다 — 없는 화면으로 보내지 않는 것이 요점이다. */}
      <p className="login-help">비밀번호를 잊으셨다면 운영자에게 문의해 주세요.</p>

      {/* ★★ 2026-08-27 — **보관함으로 가는 문**(사장님 지적: "보관함을 확인할 수 있어야
          해"). 첫 화면은 이미 보관함으로 가지만, 이 화면에 닿는 길이 여럿이다 —
          로그아웃 직후 · 주소창 자동완성 · 만들기 화면에서 튕겨 온 경우.
          그때 여기서 나갈 길이 없으면 로그인이 **유일한 문**처럼 보인다.
          ★ 로그인은 그대로 위에 있다 — 이건 보는 길일 뿐 문을 대신하지 않는다. */}
      {/* ★★ 2026-09-10 저녁 — 문이 둘이 됐다. 위 로고가 이미 메인으로 가지만 그것은
          관례라 아는 사람만 안다 — 사장님이 "이동할 방법이 없다"고 한 것이 그 증거다.
          ⚠️ 두 문이 **한 줄에 붙어** 버리는 자리다: `.mini` 는 inline-flex 이고, 줄바꿈만
            둔 JSX 공백은 사라진다(이 저장소가 2026-09-01 에 "🗑정리" 로 겪었다).
            그래서 `.login-help--doors` 가 flex 로 사이를 벌린다. */}
      <p className="login-help login-help--doors">
        {/* ★★ 2026-09-01 사장님 지적 — 맨 <Link> 라 브라우저 기본 밑줄이 그어져
            "링크"로 보였다. 이 저장소가 2026-08-25 에 같은 지적을 받고 `.mini` 에
            밑줄 해제를 넣어 두었다(app/globals.css) — 새 스타일을 만들지 않고
            그것을 쓴다. 테두리·높이까지 옆 화면들과 같은 모양이 된다. */}
        <Link className="mini" href="/home">메인 화면 보기 →</Link>
        <Link className="mini" href="/archive">로그인 없이 보관함 보기 →</Link>
      </p>
    </>
  );
}
