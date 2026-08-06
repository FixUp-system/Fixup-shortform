"use client";

// 로그인·회원가입 — 이메일과 비밀번호로 들어온다.
// 매직링크(메일 왕복)를 걷어낸 자리다. 가입은 누구나 되지만 **운영자 승인 전에는**
// /pending 에서 아무것도 못 한다 — 그 사실을 가입 탭이 미리 알린다.
//
// 이 저장소의 다른 화면과 같은 패널·버튼 클래스를 쓴다(app/globals.css, tests/design-system.test.js).
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState("login");     // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        body: JSON.stringify({ email, password }),
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
      {/* login-head — 제목·부제를 카드와 같은 420px 기둥에 세운다(정렬 축을 하나로). */}
      <h1 className="pgtitle login-head">shotform</h1>
      <p className="pgsub login-head">
        {isSignup
          ? "이메일과 비밀번호로 가입해요. 운영자 승인 뒤에 쓸 수 있어요."
          : "이메일과 비밀번호를 넣어 주세요."}
      </p>

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
          <button type="submit" className="cta cta--block" disabled={busy}>
            {busy ? "확인 중…" : isSignup ? "가입하기" : "로그인"}
          </button>
        </form>
        {error && <p className="pgsub warn">{error}</p>}
      </section>

      {/* 두 사이트 다 이 자리에 "비밀번호 찾기"를 둔다. 우리는 자가 재설정이 없어
          운영자에게 보낸다 — 없는 화면으로 보내지 않는 것이 요점이다. */}
      <p className="login-help">비밀번호를 잊으셨다면 운영자에게 문의해 주세요.</p>
    </>
  );
}
