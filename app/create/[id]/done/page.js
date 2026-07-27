"use client";

// ⑥ 완성 — 클립을 이어붙이고 소리와 자막을 얹어 내려받을 mp4 를 만든다.
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import BackButton from "../../../../components/BackButton";

export default function DoneStepPage() {
  const { id } = useParams();
  const { project, setProject, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
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
        setErr("합성이 오래 걸리고 있어요 — 새로고침하거나 다시 시도해 주세요");
      }
    };
    pollRef.current = setInterval(async () => {
      // 인코딩은 이미지 생성보다 오래 걸릴 수 있어 10분까지 기다린다
      if (Date.now() - startedAt > 10 * 60 * 1000) return stop(true);
      try {
        const res = await fetch(`/api/projects/${id}/render/status`);
        if (!res.ok) throw new Error();
        failures = 0;
        const st = await res.json();
        setProject((p) => ({ ...p, status: st.status, render: st.render, render_error: st.render_error }));
        if (st.render_error) { stop(false); setErr(st.render_error); return; }
        if (st.render) stop(false);
      } catch {
        failures += 1;
        if (failures >= 5) stop(true);
      }
    }, 2000);
  }

  // 진입·새로고침 복원 — 합성 중이면 폴링을 잇는다
  useEffect(() => {
    if (busy && !pollRef.current && !pollTimedOut) startPolling();
  }, [busy]);

  async function start() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/render`, { method: "POST" });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "시작하지 못했어요");
      setBusy(false);
      return;
    }
    await load(id).catch(() => {});
    startPolling();
  }

  const cuts = project?.cuts || [];
  const render = project?.render;
  const clipCount = cuts.filter((c) => c.video?.url).length;
  const totalSeconds = cuts.reduce((s, c) => s + (Number(c.seconds) || 0), 0);

  if (!clipCount) return <p className="pgsub">영상을 먼저 만들어 주세요.</p>;

  return (
    <section className="panel panel--narrow">
      <h2>완성본을 내려받습니다 <span className="badge vlm">⑥ 완성</span></h2>
      {err && <p className="pgsub warn">{err}</p>}

      {!render ? (
        <>
          <p className="pgsub">
            컷 {clipCount}개를 이어 붙이고 목소리와 자막을 얹어요 · 약 {Math.round(totalSeconds)}초
          </p>
          <div className="brief">
            <div className="brief-row"><b>이어붙이기</b><div className="val">컷 {clipCount}개를 순서대로</div></div>
            <div className="brief-row"><b>소리</b><div className="val">컷마다 읽은 목소리를 그대로</div></div>
            <div className="brief-row"><b>자막</b><div className="val">문장을 화면에 태워요 — 틱톡·릴스 버튼에 가리지 않는 위치에</div></div>
            <div className="brief-row"><b>비율</b><div className="val">{project?.settings?.aspect_ratio || "9:16"}</div></div>
          </div>
        </>
      ) : render.fake ? (
        <>
          <p className="pgsub">합성까지 마쳤어요 — 약 {Math.round(render.seconds || 0)}초짜리로.</p>
          <div className="brief">
            <div className="brief-row">
              <b>파일</b>
              <div className="val">
                가짜 모드라 파일은 만들어지지 않았어요.
                <br />실제로 만들려면 <code className="mono">SHOTFORM_FAKE</code> 를 끄고 다시 눌러 주세요.
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="pgsub">완성했어요 — 약 {Math.round(render.seconds || 0)}초.</p>
          {render.noSubtitles && (
            <div className="script-src warn">
              이 합성 방식에서는 자막이 들어가지 않아요 (SHOTFORM_COMPOSER=fal)
            </div>
          )}
          <div className="preview-pane done-preview">
            <div className="preview-frame">
              <video className="preview-video" controls src={render.url} />
            </div>
          </div>
        </>
      )}

      <div className="step-actions">
        <BackButton stepKey="done" />
        <div className="fwd">
          {render && !render.fake && render.url && (
            <a className="mini" href={render.url} download>
              내려받기
            </a>
          )}
          <span className="hint">
            {render ? "컷을 고쳤다면 다시 합쳐 주세요" : "합치는 데 조금 걸려요"}
          </span>
          <button className="cta" disabled={busy} onClick={start}>
            {busy ? "합치는 중…" : render ? "다시 합치기" : "완성본 만들기"}
          </button>
        </div>
      </div>
    </section>
  );
}
