"use client";

// 마이페이지 — 이용자가 스스로 고칠 수 있는 것만 둔다(이름·비밀번호).
//
// 보관함은 흡수하지 않는다. listProjects(ownerId) 가 이미 소유자를 필수 인자로 요구해
// 회원별로 갈려 있다 — 잘 도는 화면을 옮기면 회귀 위험만 생긴다. 링크로만 잇는다.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NAME_MAX } from "../../lib/display-name";

export default function MePage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [name, setName] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState("");

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");

  // 1.5초 뒤 로그인 화면으로 보내는 타이머. 그 사이에 사장님이 화면을 떠나면
  // 이미 사라진 화면이 이동을 시킨다 — 언마운트 때 반드시 끈다.
  const goLoginTimer = useRef(null);
  useEffect(() => () => clearTimeout(goLoginTimer.current), []);

  // 내 정보 읽기. 실패를 **삼키지 않는다** — 조용히 돌아가면 이메일·가입일이 영원히 "…" 로
  // 남아 "불러오는 중"과 "못 읽었다"를 구분할 수 없고, 무엇보다 이름칸이 빈 채로 남아
  // [저장] 을 누르면 저장돼 있던 이름이 지워진다.
  async function load() {
    setLoadErr("");
    try {
      const r = await fetch("/api/me");
      if (!r.ok) throw new Error("내 정보를 읽지 못했어요");
      const d = await r.json();
      setMe(d);
      setName(d.name);
    } catch {
      setLoadErr("내 정보를 읽지 못했어요 — 잠시 뒤 다시 시도해 주세요.");
    }
  }
  useEffect(() => { load(); }, []);

  async function saveName(e) {
    e.preventDefault();
    // ★ 아직 못 읽었으면 저장하지 않는다. 이때 name 은 "" 라서 그대로 보내면 라우트가
    // display_name 을 null 로 덮어 **저장돼 있던 이름이 지워진다**. 응답이 오기 전에
    // [저장] 을 먼저 누르는 정상 경로도 같은 결과라 버튼만 막아서는 부족하다.
    if (!me) {
      setNameMsg("아직 내 정보를 못 읽었어요 — 먼저 다시 불러와 주세요");
      return;
    }
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
        goLoginTimer.current = setTimeout(() => router.push("/login"), 1500);
        return;
      }
      // ★ 세션 끊기가 실패한 자리다. 위 안내문이 "모든 기기에서 로그아웃된다"고 약속했으므로
      // 여기서 아무 말도 안 하면 사장님은 쫓아냈다고 믿는다 — 비밀번호를 바꾼 이유 자체가
      // 조용히 실패한 것이다. 바꾸기는 성공했으니 실패처럼 보이게 하지 말고,
      // 다음에 할 일(다른 기기에서 직접 로그아웃)을 알린다.
      setPwMsg("비밀번호는 바꿨어요. 다만 다른 기기의 로그인을 끊지 못했어요 — 이미 로그인돼 있던 기기는 그대로 남아 있을 수 있어요. 쓰던 기기에서 직접 로그아웃해 주세요.");
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
        {loadErr && (
          <p className="pgsub">
            {loadErr}{" "}
            <button type="button" className="back-link" onClick={load}>다시 불러오기</button>
          </p>
        )}
        <form className="me-form" onSubmit={saveName}>
          <div className="me-row">
            <label className="me-label" htmlFor="me-name">이름</label>
            <input
              id="me-name"
              className="sent-input"
              value={name}
              maxLength={NAME_MAX}
              disabled={!me}
              onChange={(e) => setName(e.target.value)}
              placeholder={me ? "화면에 보일 이름" : "불러오는 중…"}
            />
            <button className="cta" disabled={busy === "name" || !me}>저장</button>
          </div>
        </form>
        {nameMsg && <p className="pgsub">{nameMsg}</p>}

        <div className="me-row">
          <span className="me-label">이메일</span>
          <span className="me-value mono">{me ? me.email : "…"}</span>
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
          {/* 마지막 칸과 [바꾸기]를 같은 줄에 둔다 — 이름 쪽과 같은 모양이라야
              두 폼이 따로 놀지 않는다. label 로 감싸면 버튼을 눌러도 입력칸이
              포커스를 가져가므로 여기만 div + htmlFor 로 푼다. */}
          <div className="me-row">
            <label className="me-label" htmlFor="me-pw-confirm">새 비밀번호 확인</label>
            <input id="me-pw-confirm" className="sent-input" type="password" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button className="cta" disabled={busy === "pw"}>바꾸기</button>
          </div>
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
