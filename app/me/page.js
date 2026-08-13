"use client";

// 마이페이지 — 이용자가 스스로 고칠 수 있는 것과 자기 크레딧만 둔다.
//
// 보관함은 흡수하지 않는다(목록을 여기 그리지 않는다). 링크조차 두지 않는 이유는
// **사이드바에 늘 있기 때문**이다 — "내 영상 25편 · 보관함 열기" 줄은 같은 말을 한 번 더
// 하는 자리였다(2026-08-13 사용자 결정).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NAME_MAX } from "../../lib/display-name";
// 말·부호 규칙은 lib 하나가 쥔다 — 화면이 다시 적으면 언젠가 한쪽이 뒤집힌다
import { ledgerLabel } from "../../lib/ledger";
import { useMe } from "../../components/MeContext";

// 그 사람의 시계로 본 날짜. Intl 로 돌리면 기기 설정에 따라 "2026. 8. 13." 처럼 나와
// 열 폭이 흔들린다 — 자리수를 고정한다.
function ymd(ts) {
  const d = new Date(ts);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export default function MePage() {
  const router = useRouter();
  // 내 정보는 화면 셋(상단바·사이드바·여기)이 함께 보는 공유본에서 받는다.
  // 여기서만 따로 읽으면 이름을 저장해도 상단바가 옛 이름을 그대로 보여준다
  // (components/MeContext.jsx — 이번 수정의 본체).
  const { me, failed, load } = useMe();
  const [name, setName] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [busy, setBusy] = useState("");

  // 못 읽었다는 사실을 화면에 드러낸다. 조용히 넘기면 이메일·가입일이 영원히 "…" 로 남아
  // "불러오는 중"과 "못 읽었다"를 구분할 수 없고, 무엇보다 이름칸이 빈 채로 남아
  // [저장] 을 누르면 저장돼 있던 이름이 지워진다.
  const loadErr = failed ? "내 정보를 읽지 못했어요 — 잠시 뒤 다시 시도해 주세요." : "";

  // 크레딧 내역 — 잔액 숫자 하나만으로는 "왜 줄었는지"를 알 수 없다. null 은 불러오는 중.
  const [ledger, setLedger] = useState(null);
  const [ledgerErr, setLedgerErr] = useState("");
  const [ledgerMore, setLedgerMore] = useState(false);
  const [ledgerBusy, setLedgerBusy] = useState(false);

  // before 를 주면 그 시각보다 앞선 것만 온다 — 이어 받는 동안 새 줄이 생겨도
  // 이미 본 줄이 다시 나오거나 건너뛰지 않는다(번호 커서였다면 밀린다).
  async function loadLedger(before) {
    setLedgerBusy(true);
    try {
      const q = before ? `?before=${before}` : "";
      const res = await fetch(`/api/credits/history${q}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      setLedger((prev) => (before ? [...(prev || []), ...d.rows] : d.rows));
      setLedgerMore(!!d.has_more);
    } catch {
      // 조용히 비우지 않는다 — 빈 목록과 "못 읽었다"가 같아 보이면 사장님이 내역이
      // 없는 줄 안다. 여기는 돈에 관한 화면이라 그 오해가 특히 나쁘다.
      setLedgerErr("내역을 읽지 못했어요 — 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setLedgerBusy(false);
    }
  }
  useEffect(() => { loadLedger(); }, []);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  // 비밀번호 칸은 접어 둔다 — 누른 사람에게만 편다.
  const [showPw, setShowPw] = useState(false);

  // 1.5초 뒤 로그인 화면으로 보내는 타이머. 그 사이에 사장님이 화면을 떠나면
  // 이미 사라진 화면이 이동을 시킨다 — 언마운트 때 반드시 끈다.
  const goLoginTimer = useRef(null);
  useEffect(() => () => clearTimeout(goLoginTimer.current), []);

  // 공유본이 바뀌면 이름칸을 서버 값으로 맞춘다 — 첫 진입과 저장 뒤 재조회 양쪽에서 돈다.
  // (읽기 자체는 MeProvider 가 한 번만 한다.)
  useEffect(() => { if (me) setName(me.name); }, [me]);

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
      // ★ 이번 수정의 본체 — 저장 뒤 **공유본을** 다시 읽는다. 그래야 상단 계정 바가
      // 새로고침 없이 새 이름으로 바뀐다(예전에는 이 화면의 상태만 갱신돼 상단바가 옛
      // 이름을 그대로 들고 있었다). 실패해도 던지지 않고 failed 로 화면에 드러난다 —
      // 저장은 이미 성공했으므로 "저장했어요"를 오류로 덮지 않는다.
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
      // ★ 서버는 **세션을 먼저 끊고** 비밀번호를 바꾼다. 그래서 실패해도 로그아웃은 이미
      // 됐을 수 있다(signedOut) — 그때 오류만 띄우고 화면에 남겨 두면 사장님은 다음
      // 이동에서 영문 모르고 튕긴다. 오류를 그대로 보여 주되 로그인 화면으로 안내한다.
      if (!r.ok) {
        if (d.signedOut) {
          setCurrent(""); setNext(""); setConfirm("");
          setPwMsg(d.error || "바꾸지 못했어요");
          goLoginTimer.current = setTimeout(() => router.push("/login"), 1500);
          return;
        }
        throw new Error(d.error || "바꾸지 못했어요");
      }
      setCurrent(""); setNext(""); setConfirm("");
      // ★ 여기서는 공유본을 **다시 읽지 않는다.** 세션이 이미 끊긴 상태라 GET /api/me 는
      // 401 이고, 공유본이 그 실패를 "못 읽었다"로 표시하면 로그인 화면으로 넘어가는
      // 1.5초 동안 "내 정보를 읽지 못했어요"가 함께 떠 화면이 시끄러워진다.
      // ★ 서버가 살아 있는 세션을 전부 끊는다(scope: global) — 자리를 비운 사이 이미
      // 들어와 있던 사람을 쫓아내려면 그래야 한다. 지금 브라우저도 함께 끊기므로
      // 그 사실을 먼저 알리고 로그인 화면으로 보낸다. 이 안내가 없으면 사장님은
      // "바꿨어요"를 본 직후 아무 설명 없이 튕긴다.
      //
      // ★ 200 이면 signedOut 은 **항상 참**이다 — 끊기에 실패하면 서버가 비밀번호를
      // 바꾸지 않고 502 로 멈춘다. 그래서 "못 끊었다"는 갈래가 없다. 예전에는 그 갈래가
      // 있었는데, 실물에서는 끊겼는데도 signedOut:false 가 나와 **거짓 경고**만 띄웠다
      // (2026-08-07 실측 — 라우트 주석 참고).
      setPwMsg("비밀번호를 바꿨어요 — 안전을 위해 모든 기기에서 로그아웃했어요. 다시 로그인해 주세요.");
      goLoginTimer.current = setTimeout(() => router.push("/login"), 1500);
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
        <h2 className="me-h">크레딧 내역</h2>
        <p className="pgsub">지금 {me ? <b>{me.balance}</b> : "…"} 크레딧이 남았어요.</p>
        {ledgerErr && <p className="pgsub warn">{ledgerErr}</p>}
        {!ledgerErr && ledger === null && <p className="pgsub">불러오는 중…</p>}
        {!ledgerErr && ledger?.length === 0 && (
          <p className="pgsub">아직 쓰거나 충전한 내역이 없어요.</p>
        )}
        {ledger?.length > 0 && (
          <ul className="ledger">
            {ledger.map((r, i) => (
              <li className="ledger-row" key={`${r.ts}-${i}`}>
                {/* ★ 사장님 시계로 찍는다. toISOString 은 UTC 라 한국(+9)에서는 오전에 쓴
                    내역이 하루 전으로 보인다(08-13 08:00 KST = 08-12 23:00 UTC). */}
                <span className="ledger-date mono">{ymd(r.ts)}</span>
                <span className="ledger-what">
                  {ledgerLabel(r.kind)}
                  {/* 지운 영상의 내역은 장부에 남는다(지워도 환불하지 않는다) — 제목이
                      없다고 빈칸으로 두면 "무엇에 썼는지 모르는 줄"이 된다. */}
                  {r.project_id && (
                    <span className="ledger-of"> · {r.project_title || "지운 영상"}</span>
                  )}
                </span>
                <span className={`ledger-amt mono ${r.delta > 0 ? "led-plus" : ""}`}>
                  {r.delta > 0 ? `+${r.delta}` : r.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
        {ledgerMore && (
          <button
            className="mini"
            disabled={ledgerBusy}
            onClick={() => loadLedger(ledger[ledger.length - 1].ts)}
          >
            {ledgerBusy ? "불러오는 중…" : "더 보기"}
          </button>
        )}
      </section>

      <section className="panel me-panel">
        <h2 className="me-h">비밀번호 관리</h2>
        {/* ★ 평소에는 한 줄이다. 입력칸 셋을 늘 펼쳐 두면 바꿀 생각이 없는 사람에게도
            화면의 절반이 비밀번호가 된다 — 대부분의 서비스가 접어 두는 이유다.
            (2026-08-13 사용자 결정) */}
        {!showPw ? (
          <div className="me-row">
            <span className="me-value">로그인할 때 쓰는 비밀번호예요.</span>
            <button className="mini" onClick={() => setShowPw(true)}>변경</button>
          </div>
        ) : (
        <>
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
            {/* 접는 것은 지우는 것이다 — 쓰다 만 값을 남겨 두면 다음에 펼쳤을 때
                남의 눈에 띈 화면에 그대로 있다. */}
            <button
              type="button"
              className="mini"
              onClick={() => { setShowPw(false); setCurrent(""); setNext(""); setConfirm(""); setPwMsg(""); }}
            >
              취소
            </button>
            <button className="cta" disabled={busy === "pw"}>바꾸기</button>
          </div>
        </form>
        </>
        )}
        {pwMsg && <p className="pgsub">{pwMsg}</p>}
      </section>

    </>
  );
}
