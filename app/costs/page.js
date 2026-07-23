"use client";

import { useEffect, useState } from "react";

function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function modelName(endpoint) {
  return endpoint.replace(/^fal-ai\//, "").split("/").slice(0, 2).join("/");
}

const STATUS_LABEL = {
  submitted: "진행 중",
  done: "완료",
  error: "실패",
};

export default function CostsPage() {
  const [records, setRecords] = useState(null);

  useEffect(() => {
    fetch("/api/costs")
      .then((r) => r.json())
      .then((d) => setRecords(d.records || []))
      .catch(() => setRecords([]));
  }, []);

  const total = (records || []).reduce((s, r) => s + (r.est_cost_usd || 0), 0);
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayTotal = (records || [])
    .filter((r) => r.ts >= todayStart)
    .reduce((s, r) => s + (r.est_cost_usd || 0), 0);

  return (
    <>
      <h1 className="pgtitle">비용 기록</h1>
      <p className="pgsub">
        영상 생성 요청(fal 제출) 시점마다 기록돼요. 금액은 단가표 기반{" "}
        <b>추정치</b> — fal 대시보드의 실청구액으로 검증하세요.
      </p>

      <div className="cost-summary">
        <div className="cost-tile">
          <small>오늘</small>
          <b>${todayTotal.toFixed(2)}</b>
        </div>
        <div className="cost-tile">
          <small>누적</small>
          <b>${total.toFixed(2)}</b>
        </div>
        <div className="cost-tile">
          <small>생성 횟수</small>
          <b>{records ? records.length : "–"}회</b>
        </div>
      </div>

      {records === null ? (
        <p className="pgsub">불러오는 중…</p>
      ) : records.length === 0 ? (
        <p className="pgsub">아직 기록이 없어요 — 홈에서 영상을 만들면 여기에 쌓여요.</p>
      ) : (
        <div className="cost-table-wrap">
          <table className="cost-table">
            <thead>
              <tr>
                <th>시각</th>
                <th>모델</th>
                <th>사양</th>
                <th>상태</th>
                <th>예상 비용</th>
                <th>프롬프트</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.request_id}>
                  <td className="mono">{fmtTime(r.ts)}</td>
                  <td>{modelName(r.endpoint)}</td>
                  <td className="mono">
                    {r.duration}s · {r.aspect_ratio}
                  </td>
                  <td>
                    <span className={`st-badge st-${r.status}`}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                  </td>
                  <td className="mono">${(r.est_cost_usd || 0).toFixed(2)}</td>
                  <td className="prompt-cell">
                    <details>
                      <summary>보기</summary>
                      <div className="prompt-full">{r.prompt}</div>
                      {r.video_url && (
                        <a href={r.video_url} target="_blank" rel="noreferrer">
                          영상 열기 ↗
                        </a>
                      )}
                    </details>
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
