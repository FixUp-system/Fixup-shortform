"use client";

import { useEffect, useRef, useState } from "react";
// 기본값은 가격표에서 온다 — 운영자가 매번 고르는 값이라도 출처는 한 곳이다.
import { DEFAULT_GRANT } from "../../lib/pricing";
// 내역의 말·부호는 사장님 화면과 **같은 표**를 쓴다 — 둘이 다른 말을 하면 안 된다
import { ledgerLabel } from "../../lib/ledger";
// 등급 표와 판정은 lib/tiers.js 한 벌이다 — 화면이 등급 이름을 복사하면 서버와 갈린다.
import { TIERS, tierOf } from "../../lib/tiers";
// 표시명 규칙 한 벌 — /me·원장과 같은 값을 써야 한다(이름이 없으면 이메일 앞부분).
import { displayNameOf } from "../../lib/display-name";
import { useDialog } from "../../components/DialogProvider";
import { useMe } from "../../components/MeContext";

const STATUS_LABEL = {
  pending: "대기 중",
  approved: "승인됨",
  blocked: "차단됨",
};

// 그 사람의 시계로 본 날짜 — 마이페이지와 같은 규칙이다(toISOString 은 UTC 라
// 한국에서 오전에 쓴 내역이 하루 전으로 보인다).
function ymd(ts) {
  // 장부는 숫자(ts)로, 프로필은 ISO 문자열로 온다 — 둘 다 받는다.
  const d = new Date(ts);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export default function AdminPage() {
  const [users, setUsers] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  // 펼쳐 본 사람의 내역. 문의는 "크레딧이 왜 줄었냐"로 오는데, 운영자가 같은 화면을
  // 못 보면 답할 수가 없었다(잔액 숫자 하나만 보였다).
  const { confirm, prompt } = useDialog();
  // 상단바가 보는 공유본. 내 계정에 넣었으면 그 자리에서 다시 읽는다 —
  // 안 읽으면 크레딧을 넣고도 상단바가 옛 숫자를 들고 있어 "안 들어갔나" 싶다.
  const { me: myself, load: reloadMe } = useMe();
  // 찾기와 줄 수 — 사용자가 늘면 표를 눈으로 훑을 수 없다.
  // ★ 서버가 아니라 화면에서 거른다: listProfiles 가 이미 500명까지 한 번에 주고,
  //   그 위에서 거르는 것이 왕복 없이 즉시 반응한다. 500을 넘기 시작하면 그때 서버로 옮긴다.
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(null);
  const [ledger, setLedger] = useState(null);   // null = 불러오는 중

  // ★★ 고른 계정 — 모달이 이 값으로 열린다(2026-08-20). **id 가 아니라 줄 전체**를 든다:
  //   모달이 이메일·상태·잔액을 함께 보여 줘야 하는데, id 만 들면 그때마다 목록을 다시
  //   뒤져야 하고 목록이 갱신되는 사이에 못 찾는 순간이 생긴다.
  // ★ 그래서 화면에 그릴 때는 **목록의 최신 줄**로 다시 맞춘다(아래 panelUser) — 크레딧을
  //   넣으면 목록이 갱신되는데, 든 값이 낡으면 모달만 옛 잔액을 보여 준다.
  const [panelId, setPanelId] = useState(null);

  // ★★ 2026-08-27 — **이 두 줄이 없었다.** 모달 개편(dd223aa)에서 크레딧 입력칸을 모달
  //   안으로 옮기면서 값은 쓰는데 선언을 안 했다 — 그래서 [관리]를 누르는 순간
  //   `ReferenceError: setGrantAmount is not defined` 로 화면이 통째로 죽었다
  //   (프로덕션에서 "Application error: a client-side exception" 로 보였다).
  // ★ 열 때마다 기본값으로 되돌린다(openPanel) — 앞 계정에 적던 값이 남으면 **엉뚱한
  //   사람에게** 그 값이 들어간다. 그래서 초깃값도 그 기본값과 같은 것을 쓴다.
  const [grantAmount, setGrantAmount] = useState(String(DEFAULT_GRANT));
  const [grantReason, setGrantReason] = useState("체험");
  const panelUser = panelId ? (users || []).find((u) => u.id === panelId) || null : null;
  // ★ showModal() 로 연다 — `open` 속성만 두면 **모달이 아니라 인라인**으로 뜬다(배경도
  //   Esc 도 포커스 가둠도 없다). DialogProvider 와 같은 방식이다.
  const panelRef = useRef(null);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (panelUser && !el.open) el.showModal();
    if (!panelUser && el.open) el.close();
  }, [panelUser]);

  // 계정을 연다 — 여는 순간 내역도 함께 읽는다(모달 안에서 또 한 번 누르게 하지 않는다).
  function openPanel(u) {
    setPanelId(u.id);
    setErr("");
    // ★ 앞 계정에 적던 값이 남으면 **엉뚱한 사람에게** 그 값이 들어간다. 열 때마다 기본값이다.
    setGrantAmount(String(DEFAULT_GRANT));
    setGrantReason("체험");
    loadLedger(u.id);
  }
  function closePanel() {
    setPanelId(null);
    setOpenId(null);
    setLedger(null);
  }

  async function loadLedger(id) {
    setOpenId(id);
    setLedger(null);
    const r = await fetch(`/api/admin/users/${id}/ledger`);
    if (!r.ok) { setErr("내역을 읽지 못했어요"); setOpenId(null); return; }
    setLedger((await r.json()).rows || []);
  }

  async function load() {
    const r = await fetch("/api/admin/users");
    if (!r.ok) {
      setErr(r.status === 403 ? "운영자만 볼 수 있어요" : "목록을 불러오지 못했어요");
      setUsers([]);
      return;
    }
    setUsers((await r.json()).users);
  }
  useEffect(() => {
    load();
  }, []);

  // 등급 — status·role 과 **같은 문**(PATCH)을 쓴다. 문을 새로 내면 승인·차단과 갈린다.
  // ★ 무엇을 보낼지는 lib/tiers.js 의 표가 정한다 — 여기에 등급 이름을 손으로 적으면
  //   서버가 400 을 내는 값을 화면이 보낼 수 있다.
  async function setTier(id, tier) {
    setBusy(id);
    setErr("");
    const r = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      setErr(body.error || "등급을 바꾸지 못했어요");
    }
    await load();
    setBusy("");
  }

  // 역할 — 등급과 **같은 문**(PATCH)을 쓴다. 문을 새로 내면 승인·차단과 갈린다.
  // ★★ 내 줄은 화면에서 잠근다(아래 `u.self`). 다만 그것은 가림막이라 **서버도 막는다**
  //   (app/api/admin/users/[id]/route.js 의 blocksSelfRoleChange) — 이 저장소가 2.5 에서
  //   "화면에서만 거른 것은 잠금이 아니다"를 이미 겪었다.
  async function setRole(id, role) {
    setBusy(id);
    setErr("");
    const r = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      setErr(body.error || "역할을 바꾸지 못했어요");
    }
    await load();
    setBusy("");
  }

  async function setStatus(id, status) {
    setBusy(id);
    setErr("");
    const r = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      setErr(body.error || "반영하지 못했어요");
    }
    await load();
    setBusy("");
  }

  // 크레딧과 사유를 받아 넣는다.
  //
  // ★★ 2026-08-20 — **모달 안에서** 받는다. 그전에는 prompt 를 두 번 불렀는데(값·사유),
  //   계정 모달이 이미 떠 있는 상태라 dialog 가 둘 겹쳤다. 한 계정에 관한 일을 한자리에
  //   모으려고 모달을 만들어 놓고, 정작 가장 자주 하는 일이 그 자리를 벗어나 있었다.
  // ★ **사유를 받는 규칙은 그대로다.** 장부에 사유가 함께 남아야 나중에 "이 500 은 왜
  //   들어갔나"에 답할 수 있다 — 묻는 자리만 옮긴 것이지 규칙을 뺀 것이 아니다.
  async function grant(id) {
    const credits = Number(grantAmount);
    // 0 과 소수는 안 받는다 — 크레딧은 정수 단위다(lib/pricing.js). 회수는 음수로 한다.
    if (!Number.isInteger(credits) || credits === 0) {
      setErr("크레딧은 0 이 아닌 정수로 넣어 주세요 (회수는 음수).");
      return;
    }
    const reason = grantReason.trim();
    if (!reason) {
      setErr("사유를 적어 주세요 — 장부에 그대로 남습니다.");
      return;
    }
    setBusy(id);
    setErr("");
    try {
      const r = await fetch(`/api/admin/users/${id}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits, reason }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "충전 실패");
      setErr("");
      // ★ 넣고 나면 입력칸을 기본값으로 되돌린다 — 안 되돌리면 같은 값이 남아 있어
      //   두 번째로 누를 때 실수로 또 넣기 쉽다.
      setGrantAmount(String(DEFAULT_GRANT));
      setGrantReason("체험");
      // 내역도 함께 다시 읽는다 — 방금 넣은 줄이 그 자리에서 보여야 "들어갔다"를 안다.
      await Promise.all([load(), loadLedger(id)]);
      // 남에게 넣었으면 상단바를 흔들 이유가 없다 — 내 것일 때만 다시 읽는다.
      if (id === myself?.id) await reloadMe();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  async function resetPassword(id) {
    const pw = await prompt({
      title: "비밀번호 재설정",
      body: "새 비밀번호를 정해 주세요 (6자 이상). 상대에게는 따로 알려 주셔야 합니다.",
      password: true,
      confirmLabel: "재설정",
    });
    if (!pw) return;
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/users/${id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "재설정 실패");
      setErr("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  // 이름·이메일·id 로 찾는다 — 문의는 대개 이메일로 오지만, 로그·장부에는 id 만 남고,
  // 사람 이야기를 할 때는 이름으로 부른다(2026-08-27 사장님 요청으로 이름이 열렸다).
  const q = query.trim().toLowerCase();
  const found = (users || []).filter(
    (u) =>
      !q ||
      displayNameOf(u).toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.id?.toLowerCase().includes(q)
  );

  return (
    <>
      <h1 className="pgtitle">사용자 관리</h1>
      <p className="pgsub">
        크레딧을 넣고, 승인하거나 막을 수 있어요. 승인·차단은 상대의 다음 요청부터 바로
        반영돼요 — 다시 로그인할 필요는 없어요.
      </p>

      {users !== null && (
        <div className="admin-tools">
          <input
            className="sent-input admin-search"
            type="search"
            placeholder="이메일이나 id 로 찾기"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {err && <p className="pgsub warn">{err}</p>}

      {users === null ? (
        <p className="pgsub">불러오는 중…</p>
      ) : found.length === 0 ? (
        <p className="pgsub">{query ? "찾는 사용자가 없어요." : "사용자가 없어요."}</p>
      ) : (
        <div className="cost-table-wrap">
          <table className="cost-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>이메일</th>
                <th>상태</th>
                <th>역할</th>
                <th>등급</th>
                <th>가입일</th>
                <th>크레딧</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {found.flatMap((u) => (
                [<tr key={u.id}>
                  {/* ★ 이름이 먼저다 — 사람을 부르는 말이고, 이메일은 신원이다.
                      이름을 안 적은 사람은 이메일 앞부분이 뜬다(displayNameOf). */}
                  <td>{displayNameOf(u)}</td>
                  <td className="mono">{u.email}</td>
                  <td>
                    <span className={`st-badge st-${u.status === "approved" ? "done" : u.status === "blocked" ? "error" : "submitted"}`}>
                      {STATUS_LABEL[u.status] || u.status}
                    </span>
                  </td>
                  {/* 역할 — 2026-09-01 사장님 지시로 **읽기 전용 글자에서 고르는 자리로**
                      바뀌었다. 등급과 같은 모양(드롭다운)이라 줄이 안 넘친다.
                      ★ 내 줄은 잠근다 — 마지막 운영자가 자기를 내리면 아무도 못 들어온다.
                        서버도 같은 것을 막는다(가림막이 아니라 잠금이다). */}
                  <td>
                    <select
                      className="dlg-input tier-pick"
                      value={u.role === "admin" ? "admin" : "user"}
                      disabled={busy === u.id || u.self === true}
                      onChange={(e) => setRole(u.id, e.target.value)}
                      aria-label={`${u.email} 역할`}
                      title={u.self ? "자기 역할은 바꿀 수 없어요" : undefined}
                    >
                      <option value="user">사용자</option>
                      <option value="admin">운영자</option>
                    </select>
                  </td>
                  {/* 등급 — 드롭다운으로 고른다(2026-08-20 사장님 지시). 칩을 나열하면
                      등급이 늘 때 줄이 넘치고, 지금 무엇인지도 한눈에 안 들어온다.
                      ★ 보기는 표(TIERS)에서 나온다 — 화면에 이름을 복사하면 표와 갈린다.
                      ★ 지금 등급 판정은 lib/tiers.js 의 tierOf 하나다(컬럼이 없던 시절
                        계정은 값이 없고, 그때도 기본 등급으로 읽힌다). */}
                  <td>
                    <select
                      className="dlg-input tier-pick"
                      value={tierOf(u)}
                      disabled={busy === u.id}
                      onChange={(e) => setTier(u.id, e.target.value)}
                      aria-label={`${u.email} 등급`}
                    >
                      {TIERS.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </td>
                  {/* 언제 들어온 사람인지 — 승인 대기가 쌓였을 때 먼저 볼 줄을 고르는 근거다.
                      날짜 규칙은 마이페이지·크레딧 내역과 같다(ymd: 사장님 시계). */}
                  <td className="mono">{u.created_at ? ymd(u.created_at) : "—"}</td>
                  <td>
                    <span className="st-badge">{u.balance ?? 0}</span>
                  </td>
                  {/* ★★ 줄에는 **여는 버튼 하나**만 둔다(2026-08-20 사장님 지시). 그전에는
                      줄마다 버튼이 다섯이라 가로가 좁고, 어느 줄의 버튼인지 눈으로 좇아야
                      했다. 한 계정에 관한 일은 그 계정을 연 뒤 한자리에서 한다. */}
                  <td>
                    <button className="mini" disabled={busy === u.id} onClick={() => openPanel(u)}>
                      관리
                    </button>
                  </td>
                </tr>,
              ]
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* ★★ 한 계정에 관한 일은 여기 한자리에 모인다(2026-08-20 사장님 지시).
          ★ 새 모달 장치를 만들지 않는다 — components/DialogProvider.jsx 가 쓰는 <dialog>
            + .dlg 계열을 그대로 쓴다. 두 벌이면 배경·닫기·포커스 규칙이 갈린다.
          ★ 닫는 길을 둘 준다: [닫기] 버튼과 Esc(dialog 가 기본으로 준다). 모달에 갇히면
            사장님이 할 수 있는 일이 0 이 된다. */}
      {panelUser && (
        <dialog
          ref={panelRef}
          className="dlg dlg--wide"
          onClose={closePanel}
          aria-label={`${panelUser.email} 관리`}
          /* ESC 는 브라우저가 준다 — DialogProvider 와 같은 규약이다 */
          onCancel={(e) => { e.preventDefault(); closePanel(); }}
          /* 배경을 눌러 닫는다. <dialog> 자체가 배경까지 차지하므로 눌린 자리가
             상자 밖이면 배경을 누른 것이다(저쪽과 같은 판정). */
          onClick={(e) => { if (e.target === panelRef.current) closePanel(); }}
        >
          <div className="dlg-box admin-panel">
            {/* ★ 이름이 제목, 이메일은 그 아래 신원이다(2026-08-27) — 사람을 부르는 말과
                계정을 가리키는 값은 다른 축이다. */}
            <h2 className="dlg-title">{displayNameOf(panelUser)}</h2>
            <p className="dlg-body">
              {panelUser.email} · {STATUS_LABEL[panelUser.status] || panelUser.status} ·
              {" "}{panelUser.role} · 잔액 {panelUser.balance ?? 0} 크레딧
            </p>

            {/* ★★ 크레딧 넣기 — **여기서 끝난다**(2026-08-20). 그전에는 prompt 를 두 번
                불러 모달 위에 모달이 겹쳤다. 사유를 받는 규칙은 그대로다 — 장부에 사유가
                함께 남아야 나중에 "이 500 은 왜 들어갔나"에 답할 수 있다. */}
            <form
              className="admin-grant"
              onSubmit={(e) => { e.preventDefault(); grant(panelUser.id); }}
            >
              <input
                className="dlg-input admin-grant-amt"
                type="number"
                step="1"
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
                disabled={busy === panelUser.id}
                aria-label="넣을 크레딧"
              />
              <input
                className="dlg-input"
                type="text"
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
                disabled={busy === panelUser.id}
                placeholder="사유 — 장부에 그대로 남아요"
                aria-label="사유"
              />
              <button type="submit" className="mini confirm-btn" disabled={busy === panelUser.id}>
                크레딧 넣기
              </button>
            </form>
            <p className="pgsub admin-grant-note">회수하려면 음수를 넣어 주세요. 소수점은 쓰지 않습니다.</p>

            <div className="step-actions">
              <button className="mini" disabled={busy === panelUser.id} onClick={() => resetPassword(panelUser.id)}>
                비밀번호 재설정
              </button>
              {panelUser.status !== "approved" && (
                <button className="mini" disabled={busy === panelUser.id} onClick={() => setStatus(panelUser.id, "approved")}>
                  승인
                </button>
              )}
              {panelUser.status !== "blocked" && (
                <button className="mini" disabled={busy === panelUser.id} onClick={() => setStatus(panelUser.id, "blocked")}>
                  차단
                </button>
              )}
            </div>

            {/* 내역 — 여는 순간 함께 읽는다. 합계로는 "누가 왜"를 확인할 수 없다. */}
            <h3 className="dlg-title admin-panel-sub">내역</h3>
            {ledger === null ? (
              <p className="pgsub">불러오는 중…</p>
            ) : ledger.length === 0 ? (
              <p className="pgsub">아직 쓰거나 충전한 내역이 없어요.</p>
            ) : (
              <ul className="ledger admin-panel-ledger">
                {ledger.map((r, i) => (
                  <li className="ledger-row" key={`${r.ts}-${i}`}>
                    <span className="ledger-date mono">{ymd(r.ts)}</span>
                    <span className="ledger-what">
                      {ledgerLabel(r.kind)}
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

            <div className="dlg-actions">
              <button className="mini confirm-btn dlg-go" onClick={closePanel}>닫기</button>
            </div>
          </div>
        </dialog>
      )}
      {/* ★ 수는 표 감싸개(.cost-table-wrap) **밖**이다. 그 안은 가로 스크롤 상자라
          (overflow-x: auto) 오른쪽 끝에 붙인 글자가 잘려 보인다(2026-08-13 실측). */}
      {users !== null && found.length > 0 && (
        <p className="pgsub admin-count">
          {found.length === users.length
            ? `전체 ${users.length}명`
            : `찾은 ${found.length}명 (전체 ${users.length}명)`}
        </p>
      )}
    </>
  );
}
