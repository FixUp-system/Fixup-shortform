"use client";

import { useEffect, useState } from "react";
// 기본값은 가격표에서 온다 — 운영자가 매번 고르는 값이라도 출처는 한 곳이다.
import { DEFAULT_GRANT } from "../../lib/pricing";
// 내역의 말·부호는 사장님 화면과 **같은 표**를 쓴다 — 둘이 다른 말을 하면 안 된다
import { ledgerLabel } from "../../lib/ledger";
import { useDialog } from "../../components/DialogProvider";

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
  const [openId, setOpenId] = useState(null);
  const [ledger, setLedger] = useState(null);   // null = 불러오는 중

  async function toggleLedger(id) {
    if (openId === id) { setOpenId(null); return; }
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

  // 크레딧과 사유를 받아 넣는다. 값을 두 번 묻는 이유는 **장부에 사유가 함께 남아야**
  // 하기 때문이다 — 나중에 "이 500 은 왜 들어갔나"에 답할 수 있는 유일한 자리다.
  async function grant(id) {
    const raw = await prompt({
      title: "크레딧 넣기",
      body: "회수하려면 음수를 넣어 주세요. 소수점은 쓰지 않습니다.",
      defaultValue: String(DEFAULT_GRANT),
      numeric: true,
      confirmLabel: "다음",
    });
    if (raw === null) return;
    const credits = Number(raw);
    if (!Number.isInteger(credits) || credits === 0) return;
    const reason = await prompt({
      title: "사유",
      body: "장부에 그대로 남습니다.",
      defaultValue: "체험",
      confirmLabel: "넣기",
    });
    if (!reason || !reason.trim()) return;
    setBusy(id);
    setErr("");
    try {
      const r = await fetch(`/api/admin/users/${id}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits, reason }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "충전 실패");
      await load();
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

  return (
    <>
      <h1 className="pgtitle">사용자 관리</h1>
      <p className="pgsub">
        크레딧을 넣고, 승인하거나 막을 수 있어요. 승인·차단은 상대의 다음 요청부터 바로
        반영돼요 — 다시 로그인할 필요는 없어요.
      </p>

      {err && <p className="pgsub warn">{err}</p>}

      {users === null ? (
        <p className="pgsub">불러오는 중…</p>
      ) : users.length === 0 ? (
        <p className="pgsub">사용자가 없어요.</p>
      ) : (
        <div className="cost-table-wrap">
          <table className="cost-table">
            <thead>
              <tr>
                <th>이메일</th>
                <th>상태</th>
                <th>역할</th>
                <th>가입일</th>
                <th>크레딧</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.flatMap((u) => (
                [<tr key={u.id}>
                  <td className="mono">{u.email}</td>
                  <td>
                    <span className={`st-badge st-${u.status === "approved" ? "done" : u.status === "blocked" ? "error" : "submitted"}`}>
                      {STATUS_LABEL[u.status] || u.status}
                    </span>
                  </td>
                  <td>{u.role}</td>
                  {/* 언제 들어온 사람인지 — 승인 대기가 쌓였을 때 먼저 볼 줄을 고르는 근거다.
                      날짜 규칙은 마이페이지·크레딧 내역과 같다(ymd: 사장님 시계). */}
                  <td className="mono">{u.created_at ? ymd(u.created_at) : "—"}</td>
                  <td>
                    <span className="st-badge">{u.balance ?? 0}</span>
                  </td>
                  <td>
                    <button className="mini" onClick={() => toggleLedger(u.id)}>
                      {openId === u.id ? "내역 닫기" : "내역"}
                    </button>{" "}
                    <button className="mini" disabled={busy === u.id} onClick={() => grant(u.id)}>
                      크레딧 넣기
                    </button>{" "}
                    <button className="mini" disabled={busy === u.id} onClick={() => resetPassword(u.id)}>
                      비밀번호 재설정
                    </button>{" "}
                    {u.status !== "approved" && (
                      <button className="mini" disabled={busy === u.id} onClick={() => setStatus(u.id, "approved")}>
                        승인
                      </button>
                    )}{" "}
                    {u.status !== "blocked" && (
                      <button className="mini" disabled={busy === u.id} onClick={() => setStatus(u.id, "blocked")}>
                        차단
                      </button>
                    )}
                  </td>
                </tr>,
              ].concat(openId === u.id ? [(
                <tr key={`${u.id}-ledger`}>
                  <td colSpan={6}>
                    {ledger === null ? (
                      <p className="pgsub">불러오는 중…</p>
                    ) : ledger.length === 0 ? (
                      <p className="pgsub">아직 쓰거나 충전한 내역이 없어요.</p>
                    ) : (
                      <ul className="ledger">
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
                  </td>
                </tr>
              )] : [])
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
