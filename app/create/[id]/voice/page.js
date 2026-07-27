"use client";

// ④ 목소리 — 컷마다 문장을 읽혀 실제 길이를 확정한다.
// 대본 화면의 "약 N초"는 글자 수로 어림잡은 값이고, 여기서 나온 길이가 진짜다 —
// 클립 길이(⑤)와 자막 타이밍(⑥)이 이 값을 따른다.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import BackButton from "../../../../components/BackButton";
import { VOICES } from "../../../../lib/voices";

export default function VoiceStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project, setProject, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [picked, setPicked] = useState(project?.voice_label || VOICES[0].label);
  const pollRef = useRef(null);

  // 언마운트 정리 — ref까지 비운다(이미지 화면과 같은 이유: 재마운트 시 폴링이 되살아나게)
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
        const res = await fetch(`/api/projects/${id}/voice/status`);
        if (!res.ok) throw new Error();
        failures = 0;
        const st = await res.json();
        setProject((p) => ({ ...p, status: st.status, cuts: st.cuts, voice_error: st.voice_error }));
        if (st.voice_error) { stop(false); setErr(st.voice_error); return; }
        // 컷마다 소리가 붙었거나 실패 표시가 남았으면 끝난 것이다
        const pending = (st.cuts || []).some((c) => !c.audio && !c.voice_error);
        if (!pending) stop(false);
      } catch {
        failures += 1;
        if (failures >= 5) stop(true);
      }
    }, 2000);
  }

  // 진입·새로고침 복원 — 아직 읽지 않은 컷이 남아 있으면 폴링을 잇는다
  useEffect(() => {
    const cuts = project?.cuts || [];
    const waiting = cuts.length > 0 && cuts.some((c) => !c.audio && !c.voice_error);
    if (project?.status === "voice" && !pollRef.current && !pollTimedOut && waiting) {
      setBusy(true);
      startPolling();
    }
  }, [project?.status, project?.cuts]);

  async function start() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/voice`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceLabel: picked }),
    });
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
    const res = await fetch(`/api/projects/${id}/voice/${idx}/regen`, { method: "POST" });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "다시 만들지 못했어요");
      return;
    }
    await load(id).catch(() => {});
  }

  const cuts = project?.cuts || [];
  const madeAny = cuts.some((c) => c.audio);
  const doneCount = cuts.filter((c) => c.audio).length;
  const totalSeconds = cuts.reduce((s, c) => s + (Number(c.seconds) || 0), 0);

  if (!cuts.length) {
    return <p className="pgsub">이미지를 먼저 만들어 주세요.</p>;
  }

  return (
    <section className="panel panel--narrow">
      <h2>목소리를 입힙니다 <span className="badge vlm">④ 목소리</span></h2>
      {err && <p className="pgsub warn">{err}</p>}

      {!madeAny ? (
        <>
          <p className="pgsub">
            컷마다 따로 읽어요 — 읽은 길이가 그대로 영상 길이와 자막 타이밍이 됩니다.
          </p>
          <div className="eyebrow">목소리 고르기</div>
          <div className="chips">
            {VOICES.map((v) => (
              <button
                key={v.label}
                className={`chip${picked === v.label ? " on" : ""}`}
                onClick={() => setPicked(v.label)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="pgsub">
          {doneCount}/{cuts.length}개 컷을 읽었어요 · 다 이어서 약 {Math.round(totalSeconds)}초
          {project?.voice_label && ` · ${project.voice_label}`}
        </p>
      )}

      <div className="mt-md">
        {cuts.map((c) => (
          <div key={c.idx} className="scene">
            <div className="thumb">
              {c.image?.url ? <img src={c.image.url} alt="" /> : <span className="ph">컷 {c.idx + 1}</span>}
              <span className="num">{c.idx + 1}</span>
            </div>
            <div>
              <div className="preview-sentence">{c.sentence}</div>
              {c.audio ? (
                <>
                  <audio className="audio-row" controls src={c.audio.url} />
                  <div className="badges">
                    <span className="badge ai">{c.audio.seconds}초</span>
                    {(c.voice_regen_count || 0) > 0 && (
                      <span className="badge ai">다시 읽음 {c.voice_regen_count}/3</span>
                    )}
                  </div>
                  <div className="res-ops">
                    <button className="mini" disabled={busy} onClick={() => regen(c.idx)}>
                      다시 읽기
                    </button>
                  </div>
                </>
              ) : c.voice_error ? (
                <>
                  <div className="script-src warn">{c.voice_error}</div>
                  <div className="res-ops">
                    <button className="mini" disabled={busy} onClick={() => regen(c.idx)}>
                      다시 읽기
                    </button>
                  </div>
                </>
              ) : (
                <div className="script-src">{busy ? "읽는 중…" : "아직 읽지 않았어요"}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="step-actions">
        <BackButton stepKey="voice" />
        <div className="fwd">
          {!madeAny ? (
            <>
              <span className="hint">컷 {cuts.length}개를 골라주신 목소리로 읽어요</span>
              <button className="cta" disabled={busy} onClick={start}>
                {busy ? "읽는 중…" : "목소리 만들기"}
              </button>
            </>
          ) : (
            <>
              <span className="hint">읽은 길이만큼 컷이 움직여요</span>
              <button
                className="cta"
                disabled={busy || doneCount === 0}
                onClick={() => router.push(`/create/${id}/video`)}
              >
                ⑤ 영상 만들러 가기 →
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
