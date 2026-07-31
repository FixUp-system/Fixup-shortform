"use client";

// 로그인 화면 — 비밀번호 없이 메일 링크 하나로 들어온다(매직링크).
// 이 저장소의 다른 화면과 같은 패널·버튼 클래스를 쓴다(app/globals.css, tests/design-system.test.js).
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

// useSearchParams를 쓰는 컴포넌트는 Suspense로 감싸야 한다 — 안 감싸면
// Next 15가 빌드 시 정적 생성을 거부한다. 그래서 이 컴포넌트를 따로 떼어 낸다.
function LoginForm() {
  const searchParams = useSearchParams();
  // /auth/callback이 세션 교환에 실패하면 여기로 /login?error=1 리다이렉트한다 — 그
  // 신호를 화면이 안 읽으면 사장님 눈에는 그냥 평범한 로그인 화면일 뿐 왜 안 됐는지 모른다.
  const cameFromFailedCallback = searchParams.get("error") === "1";

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError("메일을 보내지 못했어요 — 주소를 확인해 주세요");
    else setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <>
        <h1 className="pgtitle">메일함을 확인해 주세요</h1>
        <p className="pgsub">
          {email} 로 로그인 링크를 보냈어요. 링크를 누르면 바로 들어옵니다.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="pgtitle">shotform</h1>
      <p className="pgsub">이메일 주소를 넣으면 로그인 링크를 보내드려요. 비밀번호는 없습니다.</p>

      {cameFromFailedCallback && (
        <p className="pgsub warn">
          링크가 만료됐거나 이미 사용됐어요. 아래에서 다시 요청해 주세요.
        </p>
      )}

      <section className="panel panel--narrow">
        <form onSubmit={send}>
          <input
            type="email"
            required
            className="sent-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <button type="submit" className="cta" disabled={busy}>
            {busy ? "보내는 중…" : "로그인 링크 받기"}
          </button>
        </form>
        {error && <p className="pgsub warn">{error}</p>}
      </section>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
