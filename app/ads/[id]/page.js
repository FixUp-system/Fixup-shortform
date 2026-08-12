"use client";

// /ads/[id] — 광고 영상 한 방 만들기의 마지막 화면. 페이지 넷이 아니라, doc.status 에 따라
// 한 화면이 넷으로 변한다: draft(시나리오 없음) · scenario(승인 대기) · rendering(굽는 중) · done(완성).
// (docs/superpowers/specs/2026-08-12-ad-video-oneshot-design.md:184)
//
// 이 화면이 유료 버튼([이대로 만들기]·[다시 만들기])을 든다 — 가격은 반드시 lib/pricing.js
// 에서 읽는다. 숫자를 여기 박으면 /ads/new · 이 화면 · 서버가 각자 다른 값을 말하게 된다.
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { priceLabel, adVideoPrice } from "../../../lib/pricing";

// 폴링 주기 — 기존 단계 화면들(app/create/[id]/*/page.js)과 같다.
const POLL_MS = 2000;
// fal 생성은 느리다(탐침 실측 4초 클립에 134초) — 15초 분량은 더 걸릴 수 있어
// 완성 화면(app/create/[id]/done/page.js)과 같은 10분을 상한으로 둔다.
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export default function AdDetailPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null); // null = 아직 못 불러왔다
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const pollRef = useRef(null);

  async function load() {
    const res = await fetch(`/api/ads/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setLoadErr(data.error || "찾을 수 없어요"); return null; }
    setProject(data);
    return data;
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  useEffect(() => () => { clearInterval(pollRef.current); pollRef.current = null; }, []);

  function startPolling() {
    clearInterval(pollRef.current);
    setPollTimedOut(false);
    let failures = 0;
    const startedAt = Date.now();
    const stop = (timedOut) => {
      clearInterval(pollRef.current);
      pollRef.current = null;
      setBusy(false);
      if (timedOut) {
        setPollTimedOut(true);
        setErr("만드는 데 오래 걸리고 있어요 — 새로고침하거나 다시 시도해 주세요");
      }
    };
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) return stop(true);
      try {
        const res = await fetch(`/api/ads/${id}/status`);
        if (!res.ok) throw new Error();
        failures = 0;
        const st = await res.json();
        // doc 통짜가 아니라 상태·완성본·오류만 온다(app/api/ads/[id]/status/route.js) —
        // 굽기가 fire-and-forget 이라 실패가 여기로만 온다.
        setProject((p) => ({
          ...p,
          status: st.status,
          videos: st.video ? [st.video] : p?.videos || [],
          video_error: st.error || null,
        }));
        if (st.status !== "rendering") stop(false);
      } catch {
        failures += 1;
        if (failures >= 5) stop(true);
      }
    }, POLL_MS);
  }

  // 진입·새로고침 복원 — 굽는 중이었으면 폴링을 잇는다
  useEffect(() => {
    if (project?.status === "rendering" && !pollRef.current && !pollTimedOut) {
      setBusy(true);
      startPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.status]);

  // 시나리오 만들기·다시 쓰기 — 같은 라우트다. LLM 만 쓰고 무료다.
  async function makeScenario() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/ads/${id}/scenario`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "시나리오를 만들지 못했어요"); setBusy(false); return; }
    setProject(data);
    setBusy(false);
  }

  // 이대로 만들기·다시 만들기 — 같은 라우트다. ★ 여기서 크레딧이 나간다.
  async function startRender() {
    setBusy(true); setErr(""); setPollTimedOut(false);
    const res = await fetch(`/api/ads/${id}/render`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "시작하지 못했어요");
      setBusy(false);
      return;
    }
    // 굽기는 fire-and-forget 이라 이 202 응답에는 최신 status 가 안 실린다 —
    // 낙관적으로 먼저 옮기고, 폴링이 실제 값(완성 또는 실패)으로 덮는다.
    setProject((p) => ({ ...p, status: "rendering", video_error: null }));
    startPolling();
  }

  if (project === null) {
    if (loadErr) return <p className="pgsub warn">{loadErr}</p>;
    return <p className="pgsub">불러오는 중…</p>;
  }

  const { status, settings, scenario, videos, video_error } = project;
  const video = videos?.[0] || null;
  // 이 프로젝트 길이의 정가 — 숫자는 여기서 만들지 않는다, pricing.js 가 만든다.
  const price = priceLabel(adVideoPrice(settings?.seconds));

  // 아래 네 갈래(draft·scenario·rendering·done+video) 중 어디에도 안 걸리는 경우 —
  // 모르는 status 이거나(나중에 상태가 하나 늘 수 있다), status 는 "done"인데 videos 가
  // 비어 있는 저장 어긋남이다. 둘 다 지금 파이프라인에서는 안 생기지만, 안 생긴다는 것과
  // 화면이 그 경우를 다룰 수 있다는 것은 다른 얘기다 — 막히면 이 화면에는 비개발자만 있다.
  const handled =
    status === "draft" ||
    status === "scenario" ||
    status === "rendering" ||
    (status === "done" && !!video);

  return (
    <>
      <h1 className="pgtitle">광고 영상</h1>
      {err && <p className="pgsub warn">{err}</p>}
      {/* 배경에서 굽다 실패한 것 — 위치를 status 마다 가르지 않는다. 사장님이 못 보면 안 된다. */}
      {video_error && <p className="pgsub warn">{video_error}</p>}

      {status === "draft" && (
        <section className="panel panel--wide">
          <p className="pgsub">시나리오를 만들어 주세요 — 무료예요. 마음에 안 들면 몇 번이든 다시 쓸 수 있어요.</p>
          <button className="cta" disabled={busy} onClick={makeScenario}>
            {busy ? "쓰는 중…" : "시나리오 만들기 →"} <span className="cr">무료</span>
          </button>
        </section>
      )}

      {status === "scenario" && (
        <section className="panel panel--wide">
          <h2>시나리오를 확인해 주세요</h2>
          <p className="script-src">{scenario?.text}</p>

          <div className="plan-list">
            {(scenario?.shots || []).map((shot, i) => (
              <div className="plan-row" key={i}>
                <span className="num">{i + 1}</span>
                <div className="plan-body">
                  <div className="plan-field"><b>비트</b><span className="editable">{shot.beat || "(없음)"}</span></div>
                  <div className="plan-field"><b>카메라</b><span className="editable">{shot.camera || "(없음)"}</span></div>
                  <div className="plan-field"><b>동작</b><span className="editable">{shot.action || "(없음)"}</span></div>
                  {shot.line && (
                    <div className="plan-field"><b>대사</b><span className="editable">{shot.line}</span></div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="step-actions">
            {/* 다시 쓰기 — 싼 문. LLM 만 쓰고 무료다(위 도입 문구와 같은 값). */}
            <button className="mini" disabled={busy} onClick={makeScenario}>
              {busy ? "쓰는 중…" : "다시 쓰기 · 무료"}
            </button>
            <div className="fwd">
              <span className="hint">이대로 만들면 크레딧이 나가요 — 되돌릴 수 없어요</span>
              {/* 이대로 만들기 — 비싼 문. .cta .cr 이 버튼 안에서 값을 강조한다(app/ads/new/page.js 와 같은 자리). */}
              <button className="cta" disabled={busy} onClick={startRender}>
                {busy ? "시작하는 중…" : "이대로 만들기 →"} <span className="cr">{price}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {status === "rendering" && (
        <section className="panel panel--wide">
          <p className="pgsub">영상을 만드는 중이에요 — 몇 분 걸릴 수 있어요…</p>
        </section>
      )}

      {status === "done" && video && (
        <section className="panel panel--narrow">
          <h2>완성했어요 <span className="badge vlm">완성</span></h2>
          <div className="preview-pane done-preview">
            <div className="preview-frame">
              <video className="preview-video" controls src={video.url} />
            </div>
          </div>
          <div className="step-actions">
            <div className="fwd">
              {/* 다시 만들기 — 이것도 같은 유료 라우트다. 정가가 또 나간다는 것을 문구로 밝힌다. */}
              <button className="mini" disabled={busy} onClick={startRender}>
                {busy ? "만드는 중…" : `다시 만들기 · ${price}`}
              </button>
              <a className="cta" href={video.url} download>
                내려받기
              </a>
            </div>
          </div>
        </section>
      )}

      {/* 기본 갈래 — 위 넷 중 어디에도 안 걸렸을 때. 화면이 비면 안 되고, 누를 것이 하나는
          있어야 한다(리뷰 지적). 시나리오가 있으면 다시 쓰게, 없으면 새로 쓰게 하고,
          그것도 못 미더우면 최소한 보관함으로는 나갈 수 있게 한다. */}
      {!handled && (
        <section className="panel panel--wide">
          <p className="pgsub warn">
            지금 상태({status || "알 수 없음"})를 이 화면이 몰라요 — 그래도 나갈 길은 있어요.
          </p>
          <div className="step-actions">
            <button className="mini" disabled={busy} onClick={makeScenario}>
              {busy ? "쓰는 중…" : scenario?.text ? "다시 쓰기 · 무료" : "시나리오 만들기 · 무료"}
            </button>
            <div className="fwd">
              <Link href="/archive" className="cta">보관함으로</Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
