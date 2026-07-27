"use client";

// ⑤ 영상 — 컷 이미지를 시작 프레임으로 클립을 만든다.
// 길이는 ④에서 확정된 낭독 길이를 따르되, i2v 상한(10초)을 넘는 컷은 잘린다.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import BackButton from "../../../../components/BackButton";

export default function VideoStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project, setProject, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const pollRef = useRef(null);

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
        setErr("상태 확인이 오래 걸리고 있어요 — 새로고침하거나 다시 시도해 주세요");
      }
    };
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > 5 * 60 * 1000) return stop(true);
      try {
        const res = await fetch(`/api/projects/${id}/clips/status`);
        if (!res.ok) throw new Error();
        failures = 0;
        const st = await res.json();
        setProject((p) => ({ ...p, status: st.status, cuts: st.cuts, video_error: st.video_error }));
        if (st.video_error) { stop(false); setErr(st.video_error); return; }
        const pending = (st.cuts || []).some((c) => !c.video && !c.video_error);
        if (!pending) stop(false);
      } catch {
        failures += 1;
        if (failures >= 5) stop(true);
      }
    }, 2000);
  }

  // 진입·새로고침 복원 — 아직 만들지 않은 컷이 남아 있으면 폴링을 잇는다
  useEffect(() => {
    const cuts = project?.cuts || [];
    const waiting = cuts.length > 0 && cuts.some((c) => !c.video && !c.video_error);
    if (project?.status === "video" && !pollRef.current && !pollTimedOut && waiting) {
      setBusy(true);
      startPolling();
    }
  }, [project?.status, project?.cuts]);

  async function start() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/clips`, { method: "POST" });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "시작하지 못했어요");
      setBusy(false);
      return;
    }
    await load(id).catch(() => {});
    startPolling();
  }

  async function regen(idx) {
    setErr("");
    const res = await fetch(`/api/projects/${id}/clips/${idx}/regen`, { method: "POST" });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "다시 만들지 못했어요");
      return;
    }
    await load(id).catch(() => {});
  }

  const cuts = project?.cuts || [];
  const madeAny = cuts.some((c) => c.video);
  const doneCount = cuts.filter((c) => c.video).length;
  const truncatedCount = cuts.filter((c) => c.video?.truncated).length;
  const selected = cuts.find((c) => c.idx === selectedIdx) || cuts.find((c) => c.video) || cuts[0];

  if (!cuts.length) return <p className="pgsub">이미지를 먼저 만들어 주세요.</p>;
  if (!cuts.some((c) => c.audio)) return <p className="pgsub">목소리를 먼저 만들어 주세요.</p>;

  return (
    <section className="panel">
      <h2>컷을 영상으로 만듭니다 <span className="badge vlm">⑤ 영상</span></h2>
      {err && <p className="pgsub warn">{err}</p>}
      <p className="pgsub">
        {madeAny
          ? `${doneCount}/${cuts.length}개 컷을 만들었어요`
          : "이미지가 각 컷의 시작 프레임이 되고, 읽은 길이만큼 움직여요."}
        {truncatedCount > 0 && ` · ${truncatedCount}개 컷은 10초까지만 움직여요`}
      </p>

      <div className="images-layout">
        <div className="images-col">
          {cuts.map((c) => (
            <div key={c.idx} className="scene">
              <div
                className={`thumb${selectedIdx === c.idx ? " selected" : ""}`}
                onClick={() => setSelectedIdx(c.idx)}
              >
                {c.image?.url ? <img src={c.image.url} alt="" /> : <span className="ph">컷 {c.idx + 1}</span>}
                <span className="num">{c.idx + 1}</span>
              </div>
              <div>
                <div className="preview-sentence">{c.sentence}</div>
                <div className="badges">
                  {c.audio && <span className="badge ai">{c.audio.seconds}초 낭독</span>}
                  {c.video && <span className="badge photo">클립 {c.video.seconds}초</span>}
                  {c.video?.truncated && (
                    <span className="badge warn">10초까지만 움직이고 나머지는 멈춰 있어요</span>
                  )}
                  {(c.clip_regen_count || 0) > 0 && (
                    <span className="badge ai">다시 만듦 {c.clip_regen_count}/3</span>
                  )}
                </div>
                {c.video_error ? (
                  <div className="script-src warn">{c.video_error}</div>
                ) : !c.video ? (
                  <div className="script-src">{busy ? "만드는 중…" : "아직 만들지 않았어요"}</div>
                ) : null}
                {(c.video || c.video_error) && (
                  <div className="res-ops">
                    <button className="mini" disabled={busy} onClick={() => regen(c.idx)}>
                      다시 만들기
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="preview-pane">
          <div className="preview-frame">
            {selected?.video?.url ? (
              <video className="preview-video" controls src={selected.video.url} />
            ) : selected?.image?.url ? (
              <img src={selected.image.url} alt="" />
            ) : (
              <span className="ph">컷을 고르면 여기서 크게 봅니다</span>
            )}
          </div>
          {selected && <p className="preview-note">컷 {selected.idx + 1} · {selected.sentence}</p>}
        </div>
      </div>

      <div className="step-actions">
        <BackButton stepKey="video" />
        <div className="fwd">
          {!madeAny ? (
            <>
              <span className="hint">컷 {cuts.length}개를 각각 움직이는 영상으로 만들어요</span>
              <button className="cta" disabled={busy} onClick={start}>
                {busy ? "만드는 중…" : "영상 만들기"}
              </button>
            </>
          ) : (
            <>
              <span className="hint">이어 붙이고 소리와 자막을 얹으면 완성이에요</span>
              <button
                className="cta"
                disabled={busy || doneCount === 0}
                onClick={() => router.push(`/create/${id}/done`)}
              >
                ⑥ 완성하러 가기 →
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
