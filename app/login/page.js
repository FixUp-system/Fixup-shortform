"use client";

// 로그인 화면 — 비밀번호 없이 메일 링크 하나로 들어온다(매직링크).
// 이 저장소의 다른 화면과 같은 패널·버튼 클래스를 쓴다(app/globals.css, tests/design-system.test.js).
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
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
