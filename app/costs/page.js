"use client";

import { useEffect, useState } from "react";
import { loadCostsRecords } from "../../lib/costs-client.js";
// ★ 좁히는 판정과 흐름 구분은 **순수 모듈 한 벌**이다 — 화면에서 다시 세면 표와 합계가
//   갈린다(lib/costs-filter.js 머리말).
import {
  actorOptions, sumCost, sumByFlow, flowOf, flowLabel, FLOWS,
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
  // ★ 사람은 **찾는다**(고르지 않는다) — 목록이 길어지면 훑는 것이 일이 된다.
  const [person, setPerson] = useState("");
  const [flow, setFlow] = useState("");
  // 얼마나 걸렸는지 · 잘렸는지 — 서버가 말해 준다(app/api/costs/route.js).
  const [matched, setMatched] = useState(0);
  const [truncated, setTruncated] = useState(false);
  // 몇 쪽째인가. 조건이 바뀌면 첫 쪽으로 돌아간다(아래 useEffect).
  const [page, setPage] = useState(0);

  // ★★ 좁히는 일은 **서버가 한다**(2026-08-27) — 원장은 계속 쌓이는 표라 전부 받아
  //   화면에서 거르면 행이 늘수록 그대로 느려진다.
  // ★ 사람 검색은 **한 박자 늦춘다**(300ms) — 글자마다 요청을 보내면 타자 한 번에
  //   대여섯 번이 나간다. 날짜·종류는 한 번에 정해지는 값이라 바로 보낸다.
  useEffect(() => {
    let alive = true;
    const go = () => {
      loadCostsRecords(fetch, { from, to, person, flow }).then((r) => {
        if (!alive) return;
        setRecords(r.records);
        setErr(r.err);
        setMatched(r.matched);
        setTruncated(r.truncated);
        setPage(0);
      });
    };
    const t = setTimeout(go, person ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [from, to, person, flow]);

  // 서버가 이미 걸렀다 — 화면은 그대로 그린다.
  // ★ 여기서 한 번 더 거르지 않는다: 같은 판정을 두 곳에서 하면 "서버는 300개를 줬는데
  //   화면에는 280개"처럼 두 수가 갈린다.
  const shown = records || [];
  const all = shown;
  const narrowed = !!(from || to || person || flow);
  const total = sumCost(shown);
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayTotal = sumCost(shown.filter((r) => r.ts >= todayStart));
  // ★★ **광고와 영상 만들기를 갈라 본다**(2026-08-27 사장님 요청). 한 페이지에 두되
  //   합계는 흐름마다다 — 뭉뚱그린 한 숫자로는 어느 제품이 돈을 쓰는지 알 수 없다.
  const byFlow = sumByFlow(shown);
  const people = actorOptions(all);
  // 고를 수 있는 흐름은 **원장에 실제로 있는 것만**이다 — 빈 칸을 고르게 두지 않는다.
  const flowsInLedger = FLOWS.filter((f) => all.some((r) => flowOf(r) === f.id));

  // ★★ 100개씩 넘긴다(2026-08-27 사장님 지시). 한 쪽에 수백 줄을 쌓으면 눈으로 못 훑고
  //   브라우저도 무겁다. 더 많은 것을 보려면 **좁히는 것**이 답이다(위 필터).
  const PER_PAGE = 100;
  const pageCount = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  // ★ 쪽 번호를 범위 안으로 묶는다 — 조건이 바뀌어 줄이 줄면 빈 쪽에 서 있게 된다.
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = shown.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE);

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
              {/* ★ 적어서 찾는다 — 이름·이메일 조각이면 된다(부분일치). 아래 목록은
                  거들어 주는 것일 뿐이고, 목록에 없는 글자도 그대로 좁힌다. */}
              <input
                className="field cost-filter-q"
                type="search"
                list="cost-people"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                placeholder="이름 또는 이메일"
              />
              <datalist id="cost-people">
                {people.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label>
              <small>종류</small>
              {/* ★★★ 2026-09-01 사장님 지시 — **한눈에 갈아 끼운다.** 그전에는 드롭다운이라
                  무엇을 고를 수 있는지 열어 봐야 알았다. 보관함에서 쓰는 그 세그먼트를
                  그대로 쓴다(같은 일에 두 벌을 만들지 않는다).
                  ★ 판정은 `aria-pressed` 다 — 보이는 상태와 스크린리더가 읽는 상태가
                    갈릴 수 없다(보관함과 같은 규율).
                  ★ 옛 흐름(한 번에 굽기·기타)도 칸으로 남긴다 — 원장에 그 지출이 실제로
                    있고, 고르는 길을 없애면 그 돈을 들여다볼 방법이 사라진다. */}
              <span className="seg" role="group" aria-label="종류">
                <button
                  type="button"
                  className="seg-btn"
                  aria-pressed={flow === ""}
                  onClick={() => setFlow("")}
                >
                  전체
                </button>
                {flowsInLedger.map((f) => (
                  <button
                    type="button"
                    key={f.id}
                    className="seg-btn"
                    aria-pressed={flow === f.id}
                    onClick={() => setFlow(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </span>
            </label>
            {/* 되돌리는 길을 남긴다 — 조건 넷을 손으로 되돌리게 두지 않는다. */}
            {narrowed && (
              <button
                type="button"
                className="mini"
                onClick={() => { setFrom(""); setTo(""); setPerson(""); setFlow(""); }}
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

      {/* ★ 잘렸으면 **그 사실을 말한다** — 말 안 하면 사장님은 그것이 전부인 줄 안다. */}
      {truncated && (
        <p className="pgsub warn">
          조건에 맞는 {matched}건 중 최근 {shown.length}건만 불러왔어요 — 기간·사용자·종류로 좁혀 주세요.
        </p>
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
              {pageRows.map((r) => (
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

      {/* 쪽 넘기기 — 한 쪽이면 안 그린다(누를 것이 없는 줄을 두지 않는다). */}
      {pageCount > 1 && (
        <div className="cost-pager">
          <button className="mini" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            이전
          </button>
          <span className="pgsub">
            {safePage + 1} / {pageCount}
          </span>
          <button
            className="mini"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            다음
          </button>
        </div>
      )}
    </>
  );
}
