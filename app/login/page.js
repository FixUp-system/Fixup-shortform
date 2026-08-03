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
    // ★ 최종 리뷰 Minor 5 — NEXT_PUBLIC_* 이 없으면 createBrowserClient 가 여기서 던지고
    // setBusy(false)가 안 돌아 버튼이 "보내는 중…"에 영원히 멈췄다(오류 표시도 없었다).
    // try/finally 로 감싸 어떤 경로로 끝나든 버튼이 풀리게 한다.
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      // ★ 원인을 감추지 않는다. 예전에는 무슨 오류든 "주소를 확인해 주세요" 하나만 띄워서,
      // 실제로는 전송 한도에 걸린 것인데 사장님이 이메일 주소를 의심하며 계속 다시
      // 눌렀다(그 재시도가 한도를 더 깎았다). 흔한 원인은 문장으로 풀고, 그 밖의 것은
      // 원문을 함께 보여 준다 — 클라이언트 코드라 서버 로그에 안 남기 때문이다.
      if (error) {
        console.error("매직링크 전송 실패:", error);
        const msg = error.message || "";
        const rateLimited =
          error.status === 429 ||
          /rate limit|too many|for security purposes/i.test(msg);
        if (rateLimited) {
          setError(
            "메일 전송 한도에 걸렸어요 — 잠시(보통 1분, 무료 플랜은 더 길 수 있어요) 뒤에 다시 눌러 주세요."
          );
        } else if (/invalid|email/i.test(msg)) {
          setError(`메일을 보내지 못했어요 — 주소를 확인해 주세요. (${msg})`);
        } else {
          setError(`메일을 보내지 못했어요 — ${msg || "알 수 없는 오류"}`);
        }
      } else setSent(true);
    } catch (e) {
      console.error("로그인 요청 실패:", e);
      setError(`로그인 기능을 쓸 수 없어요 — ${e?.message || "알 수 없는 오류"}`);
    } finally {
      setBusy(false);
    }
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
