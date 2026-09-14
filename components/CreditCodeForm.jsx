"use client";

// 크레딧 코드 등록 입력칸 — 승인 대기 화면(/pending)과 마이페이지(/me)가 같이 쓴다(2026-09-14).
// 와디즈 서포터가 메일로 받은 코드를 넣는다. 설계: docs/superpowers/specs/2026-09-14-credit-codes-design.md
import { useState } from "react";
import { formatCredits } from "../lib/pricing";

export default function CreditCodeForm({ pending = false, onRedeemed }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [bad, setBad] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setMsg("");
    setBad(false);
    try {
      const r = await fetch("/api/credits/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await r.json().catch(() => ({}));
      // ★ 서버 문구를 그대로 쓴다 — "없는 코드"와 "이미 사용된 코드"는 사장님이 할 일이 다르다.
      if (!r.ok) throw new Error(body.error || "코드를 등록하지 못했어요");
      setCode("");
      setMsg(
        pending
          ? `${formatCredits(body.credits)} 크레딧이 들어왔어요. 승인되면 바로 쓰실 수 있어요.`
          : `${formatCredits(body.credits)} 크레딧이 들어왔어요.`
      );
      onRedeemed?.(body);
    } catch (err) {
      setBad(true);
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="me-row">
        <input
          className={`sent-input${bad ? " sent-input--bad" : ""}`}
          placeholder="크레딧 코드 (예: ABCD-2345-EFGH)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-label="크레딧 코드"
        />
        <button className="cta" disabled={busy || !code.trim()}>
          {busy ? "등록 중…" : "코드 등록"}
        </button>
      </div>
      {msg && <p className={`pgsub${bad ? " warn" : ""}`}>{msg}</p>}
    </form>
  );
}
