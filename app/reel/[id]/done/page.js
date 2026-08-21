"use client";

// 6 완성 — 컷마다 만든 클립을 이어 붙이고 자막을 태운다(POST render, 로컬 ffmpeg라
// 0원 — app/api/reel/[id]/render/route.js 머리말). app/film/[id]/[mode]/video/page.js 의
// 폴링 배선을 본으로 삼되, **10분 상한**을 명시로 준다(기본값 5분을 그대로 받지 않는다 —
// 합성은 컷 여럿을 잇고 자막을 태우느라 그보다 오래 걸릴 수 있다).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useReelProject } from "../layout";
import { reelOf, isReelRendering } from "../../../../lib/reel/doc";
import { startPolling } from "../../../../lib/poll";
import { REEL_STEPS, reelStepHref } from "../../../../lib/reel/steps";

const DONE_TIMEOUT_MS = 10 * 60 * 1000;

export default function ReelDonePage() {
  const { id } = useParams();
  const { project, reload } = useReelProject();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const stopRef = useRef(null);

  useEffect(() => () => { stopRef.current?.(); stopRef.current = null; }, []);

  function beginPolling() {
    stopRef.current?.();
    stopRef.current = startPolling({
      url: `/api/reel/${id}/status`,
      timeoutMs: DONE_TIMEOUT_MS,
      // ★ await 한다. 완성 여부(reel.video.url)는 상태 라우트에 안 실린다
      //   (app/api/reel/[id]/status/route.js 의 계약 — status·error·cuts 뿐이다) —
      //   그래서 멈춘 뒤가 아니라 **멈추기로 정하는 바로 그 자리**에서 전체 문서를
      //   다시 읽어야, onStop 이 오기 전에도 최신 값을 화면에 반영할 수 있다.
      onTick: async (st) => {
        if (st?.status === "rendering") return false;
        await reload(id).catch((e) => setErr(e.message));
        return true;
      },
      onStop: ({ timedOut }) => {
        stopRef.current = null;
        if (timedOut) setErr("상태 확인이 오래 걸리고 있어요 — 새로고침해 주세요");
      },
    });
  }

  async function startRender() {
    setBusy("render"); setErr("");
    const res = await fetch(`/api/reel/${id}/render`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "완성하지 못했어요"); setBusy(""); return; }
    await reload(id).catch((e) => setErr(e.message));
    setBusy("");
    beginPolling();
  }

  const reel = reelOf(project);
  const rendering = isReelRendering(reel);
  const cuts = project?.cuts || [];
  const hasClips = cuts.some((c) => c?.video?.url);

  // 진입·새로고침 복원 — 합성 중이면 폴링을 잇는다.
  useEffect(() => {
    if (!id) return;
    if (rendering && !stopRef.current) beginPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, rendering]);

  const videoStep = REEL_STEPS.find((s) => s.key === "video");

  return (
    <section className="panel panel--wide">
      <h2>완성</h2>
      {err && <p className="pgsub warn">{err}</p>}
      {reel.error && <p className="pgsub warn">{reel.error}</p>}
      {rendering && <p className="pgsub">영상을 이어 붙이는 중이에요 — 다 되면 여기에 나타나요.</p>}

      {reel.video?.url && (
        <div className="preview-pane done-preview">
          <div className="preview-frame">
            <video className="preview-video" controls src={reel.video.url} />
          </div>
        </div>
      )}

      <div className="step-actions">
        <Link className="mini" href={reelStepHref(videoStep, id)}>← 영상으로</Link>
        <div className="fwd">
          <span className="hint">
            {rendering ? "만드는 중에는 다시 누를 수 없어요" : "합성은 무료예요 — 컷을 잇고 자막을 태워요"}
          </span>
          <button className="cta" disabled={rendering || !!busy || !hasClips} onClick={startRender}>
            {busy === "render" ? "시작하는 중…" : reel.video?.url ? "다시 만들기 →" : "이대로 완성하기 →"}
          </button>
        </div>
      </div>

      {reel.video?.url && (
        <div className="step-actions">
          <div className="fwd">
            <Link className="cta" href="/archive">보관함으로 →</Link>
          </div>
        </div>
      )}
    </section>
  );
}
