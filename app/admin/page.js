"use client";

import { useEffect, useState } from "react";
// 기본값은 가격표에서 온다 — 운영자가 매번 고르는 값이라도 출처는 한 곳이다.
import { DEFAULT_GRANT } from "../../lib/pricing";

const STATUS_LABEL = {
  pending: "대기 중",
  approved: "승인됨",
  blocked: "차단됨",
};

export default function AdminPage() {
  const [users, setUsers] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

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

  // 크레딧과 사유를 받아 넣는다. prompt 를 쓰는 이유는 운영자 전용 화면이고 이 동작이
  // 드물기 때문이다 — 전용 모달을 만들 만큼의 빈도가 아니다(필요해지면 그때 만든다).
  // ⚠️ window.prompt 는 브라우저 모달이라 자동화 도구(E2E·스크립트)를 막는다.
  // 운영자 전용 화면이라 그 대가를 받아들인 것이다.
  async function grant(id) {
    const raw = window.prompt("몇 크레딧을 넣을까요? (회수는 음수)", String(DEFAULT_GRANT));
    if (raw === null) return;
    const credits = Number(raw);
    if (!Number.isInteger(credits) || credits === 0) return;
    const reason = window.prompt("사유를 적어 주세요", "체험");
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

  // 운영자 전용 화면이고 드문 동작이라 prompt 로 받는다(크레딧 넣기와 같은 이유).
  async function resetPassword(id) {
    const pw = window.prompt("새 비밀번호를 정해 주세요 (6자 이상)");
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
      <h1 className="pgtitle">사용자 승인</h1>
      <p className="pgsub">
        승인·차단 모두 상대의 다음 요청부터 바로 반영돼요 — 다시 로그인할 필요는 없어요.
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
                <th>크레딧</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.email}</td>
                  <td>
                    <span className={`st-badge st-${u.status === "approved" ? "done" : u.status === "blocked" ? "error" : "submitted"}`}>
                      {STATUS_LABEL[u.status] || u.status}
                    </span>
                  </td>
                  <td>{u.role}</td>
                  <td>
                    <span className="st-badge">{u.balance ?? 0}</span>
                  </td>
                  <td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
