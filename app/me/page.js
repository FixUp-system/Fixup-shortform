"use client";

// 마이페이지 — 이용자가 스스로 고칠 수 있는 것만 둔다(이름·비밀번호).
//
// 보관함은 흡수하지 않는다. listProjects(ownerId) 가 이미 소유자를 필수 인자로 요구해
// 회원별로 갈려 있다 — 잘 도는 화면을 옮기면 회귀 위험만 생긴다. 링크로만 잇는다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NAME_MAX } from "../../lib/display-name";

export default function MePage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [name, setName] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [busy, setBusy] = useState("");

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  async function load() {
    const r = await fetch("/api/me");
    if (!r.ok) return;
    const d = await r.json();
    setMe(d);
    setName(d.name);
  }
  useEffect(() => { load(); }, []);

  async function saveName(e) {
    e.preventDefault();
    setBusy("name");
    setNameMsg("");
    try {
      const r = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "저장하지 못했어요");
      setNameMsg("저장했어요");
      await load();
    } catch (err) {
      setNameMsg(err.message);
    } finally {
      setBusy("");
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    // 두 번 받은 값을 화면에서 먼저 맞춰 본다 — 서버까지 갔다 오지 않아도 아는 실수다.
    if (next !== confirm) {
      setPwMsg("새 비밀번호가 서로 달라요");
      return;
    }
    setBusy("pw");
    setPwMsg("");
    try {
      const r = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "바꾸지 못했어요");
      setCurrent(""); setNext(""); setConfirm("");
      // ★ 서버가 살아 있는 세션을 전부 끊는다(scope: global) — 자리를 비운 사이 이미
      // 들어와 있던 사람을 쫓아내려면 그래야 한다. 지금 브라우저도 함께 끊기므로
      // 그 사실을 먼저 알리고 로그인 화면으로 보낸다. 이 안내가 없으면 사장님은
      // "바꿨어요"를 본 직후 아무 설명 없이 튕긴다.
      if (d.signedOut) {
        setPwMsg("비밀번호를 바꿨어요 — 안전을 위해 모든 기기에서 로그아웃했어요. 다시 로그인해 주세요.");
        setTimeout(() => router.push("/login"), 1500);
        return;
      }
      setPwMsg("비밀번호를 바꿨어요");
    } catch (err) {
      setPwMsg(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <h1 className="pgtitle">내 정보</h1>
      <p className="pgsub">이름과 비밀번호를 여기서 바꿀 수 있어요.</p>

      <section className="panel me-panel">
        <h2 className="me-h">내 정보</h2>
        <form className="me-form" onSubmit={saveName}>
          <label className="me-row">
            <span className="me-label">이름</span>
            <input
              className="sent-input"
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="화면에 보일 이름"
            />
          </label>
          <button className="cta" disabled={busy === "name"}>저장</button>
        </form>
        {nameMsg && <p className="pgsub">{nameMsg}</p>}

        <div className="me-row">
          <span className="me-label">이메일</span>
          <span className="me-value mono">{me ? me.email : "…"}</span>
          <span className="me-note">바꿀 수 없어요</span>
        </div>
        <div className="me-row">
          <span className="me-label">가입일</span>
          <span className="me-value">{me?.created_at ? me.created_at.slice(0, 10) : "…"}</span>
        </div>
      </section>

      <section className="panel me-panel">
        <h2 className="me-h">비밀번호 변경</h2>
        <p className="pgsub">
          지금 쓰는 비밀번호를 함께 넣어 주세요 — 자리를 비운 사이 다른 사람이 바꾸지 못하게 합니다.
          바꾸면 <b>모든 기기에서 로그아웃</b>되니 다시 로그인해 주세요.
        </p>
        <form className="me-form" onSubmit={changePassword}>
          <label className="me-row">
            <span className="me-label">현재 비밀번호</span>
            <input className="sent-input" type="password" autoComplete="current-password"
              value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <label className="me-row">
            <span className="me-label">새 비밀번호</span>
            <input className="sent-input" type="password" autoComplete="new-password"
              value={next} onChange={(e) => setNext(e.target.value)} />
          </label>
          <label className="me-row">
            <span className="me-label">새 비밀번호 확인</span>
            <input className="sent-input" type="password" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <button className="cta" disabled={busy === "pw"}>바꾸기</button>
        </form>
        {pwMsg && <p className="pgsub">{pwMsg}</p>}
      </section>

      <section className="panel me-panel">
        <div className="me-row">
          <span className="me-value">내 영상 {me ? me.projectCount : "…"}편</span>
          <Link href="/archive" className="back-link">보관함 열기</Link>
        </div>
      </section>
    </>
  );
}
