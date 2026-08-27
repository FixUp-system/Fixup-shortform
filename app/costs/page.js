"use client";

import { useEffect, useState } from "react";
import { loadCostsRecords } from "../../lib/costs-client.js";
// ★ 좁히는 판정과 흐름 구분은 **순수 모듈 한 벌**이다 — 화면에서 다시 세면 표와 합계가
//   갈린다(lib/costs-filter.js 머리말).
import {
  filterRecords, actorOptions, sumCost, sumByFlow, flowOf, flowLabel, FLOWS,
} from "../../lib/costs-filter.js";

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
  const [err, setErr] = useState("");
  // 좁히는 조건 셋 — 빈 값은 **조건 없음**이다(lib/costs-filter.js).
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actor, setActor] = useState("");
  const [flow, setFlow] = useState("");

  useEffect(() => {
    loadCostsRecords().then(({ records, err }) => {
      setRecords(records);
      setErr(err);
    });
  }, []);

  const all = records || [];
  // ★ 고른 것만 본다 — 표도 합계도 **같은 목록**을 쓴다. 화면에서 따로 더하면 갈린다.
  const shown = filterRecords(all, { from, to, actor, flow });
  const narrowed = !!(from || to || actor || flow);
  const total = sumCost(shown);
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayTotal = sumCost(shown.filter((r) => r.ts >= todayStart));
  // ★★ **광고와 영상 만들기를 갈라 본다**(2026-08-27 사장님 요청). 한 페이지에 두되
  //   합계는 흐름마다다 — 뭉뚱그린 한 숫자로는 어느 제품이 돈을 쓰는지 알 수 없다.
  const byFlow = sumByFlow(shown);
  const people = actorOptions(all);
  // 고를 수 있는 흐름은 **원장에 실제로 있는 것만**이다 — 빈 칸을 고르게 두지 않는다.
  const flowsInLedger = FLOWS.filter((f) => all.some((r) => flowOf(r) === f.id));

  return (
    <>
      <h1 className="pgtitle">비용 기록</h1>
      <p className="pgsub">
        영상 생성 요청(fal 제출) 시점마다 기록돼요. 금액은 단가표 기반{" "}
        <b>추정치</b> — fal 대시보드의 실청구액으로 검증하세요.
      </p>

      {err ? (
        <p className="pgsub warn">{err}</p>
      ) : (
        <>
          {/* ★ 좁히는 자리 — 날짜·사람·흐름. 판정은 lib/costs-filter.js 하나가 한다. */}
          <div className="cost-filters">
            <label>
              <small>시작일</small>
              <input className="field" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              <small>종료일</small>
              {/* ★ 그 날을 **포함한다** — 자정으로 자르면 고른 하루가 통째로 사라진다. */}
              <input className="field" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
            <label>
              <small>사용자</small>
              <select className="field" value={actor} onChange={(e) => setActor(e.target.value)}>
                <option value="">전체</option>
                {people.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label>
              <small>종류</small>
              <select className="field" value={flow} onChange={(e) => setFlow(e.target.value)}>
                <option value="">전체</option>
                {flowsInLedger.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </label>
            {/* 되돌리는 길을 남긴다 — 조건 넷을 손으로 되돌리게 두지 않는다. */}
            {narrowed && (
              <button
                type="button"
                className="mini"
                onClick={() => { setFrom(""); setTo(""); setActor(""); setFlow(""); }}
              >
                조건 지우기
              </button>
            )}
          </div>

          <div className="cost-summary">
            <div className="cost-tile">
              <small>오늘</small>
              <b>${todayTotal.toFixed(2)}</b>
            </div>
            <div className="cost-tile">
              {/* 좁혀 놓고 "누적"이라 적으면 거짓말이다 — 무엇의 합인지 말한다. */}
              <small>{narrowed ? "고른 범위" : "누적"}</small>
              <b>${total.toFixed(2)}</b>
            </div>
            <div className="cost-tile">
              <small>생성 횟수</small>
              <b>{records ? shown.length : "–"}회</b>
            </div>
          </div>

          {/* ★★ 흐름별 합계 — "둘을 구분해서 한 페이지에서"의 값이다.
              안 쓴 흐름은 칸을 안 만든다(sumByFlow). */}
          {byFlow.length > 1 && (
            <div className="cost-summary cost-summary--flow">
              {byFlow.map((f) => (
                <div className="cost-tile" key={f.flow}>
                  <small>{f.label}</small>
                  <b>${f.usd.toFixed(2)}</b>
                  <span className="cost-tile-sub">{f.count}건</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {err ? null : records === null ? (
        <p className="pgsub">불러오는 중…</p>
      ) : records.length === 0 ? (
        <p className="pgsub">아직 기록이 없어요 — 홈에서 영상을 만들면 여기에 쌓여요.</p>
      ) : shown.length === 0 ? (
        <p className="pgsub">고른 조건에 맞는 기록이 없어요 — 조건을 넓혀 보세요.</p>
      ) : (
        <div className="cost-table-wrap">
          <table className="cost-table">
            <thead>
              <tr>
                <th>시각</th>
                <th>종류</th>
                <th>단계</th>
                <th>사용자</th>
                <th>모델</th>
                <th>사양</th>
                <th>상태</th>
                <th>예상 비용</th>
                <th>프롬프트</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.request_id}>
                  <td className="mono">{fmtTime(r.ts)}</td>
                  <td>{flowLabel(flowOf(r))}</td>
                  <td>{r.stage || "–"}</td>
                  {/* 이름으로 읽고, 신원(이메일)은 곁들인다 — 같은 이름이 둘일 수 있다. */}
                  <td title={r.actor_label || ""}>{r.actor_name || r.actor_label || "–"}</td>
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
