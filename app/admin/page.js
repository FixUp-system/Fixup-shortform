"use client";

import { useEffect, useState } from "react";

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

  return (
    <>
      <h1 className="pgtitle">사용자 승인</h1>
      <p className="pgsub">
        승인은 상대가 다시 로그인할 때 반영돼요. 차단은 즉시 적용됩니다.
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
