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
// ★ 비밀번호 규칙도 **라우트와 같은 자리**에서 온다(lib/password.js). 화면이 먼저 막고
//   라우트가 다시 막는다 — 둘이 다른 수를 보면 "화면은 통과인데 서버가 거절"이 난다.
import { passwordProblem, PASSWORD_MISMATCH } from "../../lib/password.js";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState("login");     // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // 가입에서만 쓴다 — 로그인 탭에서는 칸도 안 뜨고 몸통에도 안 실린다.
  const [name, setName] = useState("");
  // ★★ 2026-09-11 — 비밀번호 확인 칸(형제 제품 MCS 의 가입 폼에서 가져왔다).
  //   **가입 화면에만 있는 값**이라 라우트로 보내지 않는다 — 서버가 안 읽는 값을 몸통에
  //   실으면 다음 사람이 "서버도 확인 칸을 보나" 하고 헷갈린다(이름 칸과 같은 판단).
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = tab === "signup";
  // ★ 적는 도중에 알리는 값. 확인 칸이 비어 있으면 잰 적 없는 것으로 둔다.
  const mismatch = isSignup && confirm.length > 0 && password !== confirm;

  async function submit(e) {
    e.preventDefault();
    // ★★ 화면에서 **먼저** 막는다 — 눌러 보고 서버 왕복을 기다린 뒤에야 "짧아요"를 듣는
    //   것보다 낫다. 다만 이것은 예의이고 **문지기는 라우트**다(같은 함수를 본다).
    //   ★ 확인 칸은 가입일 때만 잰다 — 로그인 탭에는 그 칸이 없다.
    if (isSignup) {
      const problem = passwordProblem(password, confirm);
      if (problem) { setError(problem); return; }
    }
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
          ★★ **가입 탭에만 뜬다**(2026-09-11 사장님 지시: "로그인 부분에서는 없어도 될 것
            같아"). 이미 가입한 사람에게 절차는 정보가 아니다 — 로그인하러 온 사람에게
            "다음에 승인이 남았다"를 보여 줄 이유가 없고, 그 사람은 이미 승인을 받았거나
            /pending 으로 간다.
          ★ 그래서 강조는 늘 **첫 걸음**이다(탭이 하나뿐이므로 자리를 계산할 것이 없다).
            지난 걸음에 완료 표시를 달지 않는다 — 여기는 아직 아무것도 안 끝난 자리다.
          ★ 번호는 **숫자 글리프**다. 원문자는 판이 막는다(design-system 의 글리프 판).
          ★ 색은 액센트가 아니라 먹색이다 — 이 저장소는 액센트를 **사이드바 스테퍼 하나**에만
            허락한다("앱에서 가장 강한 색은 지금 몇 단계인가를 가리킨다"). 로그인 화면이
            그것을 빌려 쓰면 그 규칙이 흐려진다. */}
      {isSignup && (
        <ol className="login-steps login-head">
          {["가입 신청", "운영자 승인", "이용 시작"].map((label, i) => (
            <li key={label} className={`login-step${i === 0 ? " on" : ""}`} aria-current={i === 0 ? "step" : undefined}>
              <span className="login-step-no">{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      )}

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
          {/* ★★★ 2026-09-11 사장님 지시 — 칸 순서는 **이름 → 이메일 → 비밀번호 → 확인**이다.
              (옛 주석은 "이름은 비밀번호 아래다: 눈이 익은 두 칸을 먼저" 였다. 뒤집혔으니
               그 문장을 근거로 되돌리지 마라.)
              ★ 이름은 **가입일 때만** 뜬다. 로그인 탭에서는 첫 칸이 이메일이다.
              ★ 이름은 필수다(2026-09-10 지시). 화면의 `required` 는 브라우저가 지키는 예의이고
                진짜 문지기는 라우트다 — app/api/auth/signup/route.js 의 400. */}
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
          {/* ★★★ 2026-09-11 사장님 지시 — "비밀번호가 일치하지 않으면 사용자가 인지할 수
              있도록". 제출해 봐야 아는 것이 아니라 **적는 도중에** 알린다:
              · 칸 테두리가 경고색이 된다(.sent-input--bad)
              · 칸 바로 아래에 한 줄이 뜬다
              ★ 빈 칸에는 안 띄운다 — 두 글자 적자마자 "다르다"고 하면 아직 다 안 적은 사람을
                꾸짖는 꼴이다. 확인 칸에 무언가 적힌 뒤부터 잰다.
              ★ 문구는 lib/password.js 하나에서 온다 — 제출을 막을 때도 같은 말을 쓴다. */}
          {isSignup && (
            <input
              type="password"
              required
              autoComplete="new-password"
              className={`sent-input sent-input--lg${mismatch ? " sent-input--bad" : ""}`}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="비밀번호 확인"
              aria-label="비밀번호 확인"
              aria-invalid={mismatch || undefined}
            />
          )}
          {mismatch && <p className="login-field-warn warn" role="alert">{PASSWORD_MISMATCH}</p>}
          <button type="submit" className="cta cta--block" disabled={busy}>
            {busy ? "확인 중…" : isSignup ? "가입하기" : "로그인"}
          </button>
        </form>
        {/* ★ 2026-09-11 — `role="alert"` 을 단다. 화면을 읽어 주는 도구가 이 줄이 새로
            생긴 것을 그 자리에서 알린다(MCS 의 오류 줄과 같은 계약). */}
        {error && <p className="pgsub warn" role="alert">{error}</p>}
      </section>

      {/* 두 사이트 다 이 자리에 "비밀번호 찾기"를 둔다. 우리는 자가 재설정이 없어
          운영자에게 보낸다 — 없는 화면으로 보내지 않는 것이 요점이다. */}
      <p className="login-help">비밀번호를 잊으셨다면 운영자에게 문의해 주세요.</p>

      {/* ★★ **나가는 문**. 이 화면에 닿는 길이 여럿이라(로그아웃 직후 · 주소창 자동완성 ·
          만들기 화면에서 튕겨 옴) 나갈 길이 없으면 로그인이 **유일한 문**처럼 보인다.
          ★★★ 2026-09-11 — 문이 **하나**가 됐다(사장님 지시). 그전에는 둘이었고, 걷어낸 쪽은
            보관함 지름길이다. 그것은 2026-08-27 지시로 생긴 자리였는데 같은 분이 뒤집었으니
            **옛 지시를 근거로 되살리지 마라.**
          ★ 손님에게 보관함이 닫힌 것이 아니다 — 그 화면은 그대로 열려 있고(lib/auth/guest.js)
            메인을 거쳐 간다. 즉 길이 사라진 것이 아니라 **한 번 더 거치는 길**이 됐다. */}
      <p className="login-help">
        {/* ★★ 2026-09-01 사장님 지적 — 맨 <Link> 라 브라우저 기본 밑줄이 그어져
            "링크"로 보였다. 이 저장소가 2026-08-25 에 같은 지적을 받고 `.mini` 에
            밑줄 해제를 넣어 두었다(app/globals.css) — 새 스타일을 만들지 않고
            그것을 쓴다. 테두리·높이까지 옆 화면들과 같은 모양이 된다. */}
        <Link className="mini" href="/home">메인 화면 보기 →</Link>
      </p>
    </>
  );
}
