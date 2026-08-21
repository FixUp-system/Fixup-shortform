"use client";

// 5 영상 — **컷별 굽기.** 여기서 크레딧이 나간다(app/film/[id]/[mode]/video/page.js 를
// 본으로 삼되, 굽는 문(POST clips)이 접수만 하고 백그라운드에서 돈다 — film 의 render 와
// 같은 결이라 그 화면의 폴링 배선을 그대로 옮긴다).
//
// ★ 폴링 루프는 lib/poll.js 한 벌이다 — 화면이 스스로 타이머를 돌리지 않는다.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useReelProject } from "../layout";
import { reelOf, canBakeReelClips, isReelRendering } from "../../../../lib/reel/doc";
import { isReelClipStale } from "../../../../lib/reel/steps";
import { startPolling } from "../../../../lib/poll";
import { REEL_STEPS, reelStepHref } from "../../../../lib/reel/steps";

export default function ReelVideoPage() {
  const { id } = useParams();
  const { project, reload } = useReelProject();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  // 상태 라우트가 준 마지막 응답. 문서(GET /api/reel/[id])보다 최신이다 — 폴링이 두드릴
  // 때마다 상태 라우트가 그 사이 완성된 컷을 이미 읽었을 수 있어서다.
  const [live, setLive] = useState(null);
  const stopRef = useRef(null);

  // 떠날 때는 반드시 뗀다 — 안 떼면 화면을 나가도 서버를 계속 두드린다.
  useEffect(() => () => { stopRef.current?.(); stopRef.current = null; }, []);

  function beginPolling() {
    stopRef.current?.();
    stopRef.current = startPolling({
      url: `/api/reel/${id}/status`,
      // ★ 기본값(5분)을 그대로 받지 않는다 — 컷이 여럿이면 큐에서 그보다 오래 걸릴 수
      //   있다. 대신 onTick 이 **끝나면 스스로 멈춘다**(무한정 두드리지 않는다).
      timeoutMs: Infinity,
      onTick: (st) => {
        setLive(st);
        // "rendering" 이 아니게 되면(성공은 "clips", 실패는 "error") 멈춘다.
        return st?.status !== "rendering";
      },
      onStop: ({ timedOut }) => {
        // ★ 반드시 비운다 — 안 비우면 손잡이가 영원히 truthy 라 아래 복원이 다시 안 붙는다.
        stopRef.current = null;
        if (timedOut) setErr("상태 확인이 오래 걸리고 있어요 — 새로고침해 주세요");
        // 문서를 다시 읽는다 — 상태 라우트는 cuts.video 는 실어도 material·reel 전체는
        // 안 준다(app/api/reel/[id]/status/route.js 의 계약). 다음 단계(완성) 가드가
        // 최신 컷을 봐야 한다.
        reload(id).catch((e) => setErr(e.message));
      },
    });
  }

  // 굽기 — **여기서 크레딧이 나간다.** 서버도 rendering 이면 거절하지만(이중 청구 방지),
  // 화면이 먼저 잠그는 이유는 사장님이 400/409 를 보기 전에 못 누르게 하는 것이다.
  async function startClips() {
    setBusy("clips"); setErr("");
    const res = await fetch(`/api/reel/${id}/clips`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "굽지 못했어요"); setBusy(""); return; }
    setLive(null);
    setBusy("");
    // 접수만 됐다(fire-and-forget) — 여기서부터 두드리기 시작한다.
    beginPolling();
  }

  const reel = reelOf(project);
  const cuts = live?.cuts || project?.cuts || [];
  const status = live?.status ?? reel.status;
  const rendering = status === "rendering";
  // ★★ 2026-08-21 리뷰 A2 — 프롬프트뿐 아니라 그림까지 본다(`/clips` 의 청구 앞 검사와
  //   같은 값). 프롬프트만 보면 화면이 열어 준 버튼이 서버 배경 작업에서 청구 뒤 실패한다.
  const ready = canBakeReelClips(project?.cuts || []);
  const doneCount = cuts.filter((c) => c?.video?.url).length;

  // 진입·새로고침 복원 — 굽는 중이면 폴링을 잇는다.
  useEffect(() => {
    if (!id) return;
    if (isReelRendering(reelOf(project)) && !stopRef.current) beginPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, project?.reel?.status]);

  const promptsStep = REEL_STEPS.find((s) => s.key === "prompts");
  const doneStep = REEL_STEPS.find((s) => s.key === "done");

  return (
    <section className="panel panel--wide">
      <h2>영상</h2>
      <p className="pgsub">컷 {cuts.length}개 중 {doneCount}개를 만들었어요</p>
      {err && <p className="pgsub warn">{err}</p>}
      {(live?.error || reel.error) && <p className="pgsub warn">{live?.error || reel.error}</p>}
      {rendering && (
        <p className="pgsub">영상을 만드는 중이에요 — 다 되면 여기에 나타나요.</p>
      )}

      {cuts.length > 0 && (
        <div className="uploads">
          {cuts.map((c) => (
            <div key={c.idx} className="up photo-mark">
              {c.video?.url ? (
                <video className="thumb-media" src={c.video.url} muted loop />
              ) : c.image?.url ? (
                <img className="thumb-media" src={c.image.url} alt={`컷 ${c.idx + 1}`} />
              ) : (
                <div className="thumb-media" />
              )}
              {(c.stale ?? isReelClipStale(c)) && c.video?.url && (
                <span className="tag warn">다시 만들어야 해요</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="step-actions">
        <Link className="mini" href={reelStepHref(promptsStep, id)}>← 영상 프롬프트로</Link>
        <div className="fwd">
          <span className="hint">
            {rendering ? "만드는 중에는 다시 누를 수 없어요" : "이대로 만들면 크레딧이 나가요 — 되돌릴 수 없어요"}
          </span>
          <button className="cta" disabled={rendering || !!busy || !ready} onClick={startClips}>
            {busy === "clips" ? "시작하는 중…" : doneCount > 0 ? "다시 굽기 →" : "이대로 굽기 →"}
          </button>
        </div>
      </div>

      {doneCount > 0 && (
        <div className="step-actions">
          <div className="fwd">
            <Link className="cta" href={reelStepHref(doneStep, id)}>완성으로 →</Link>
          </div>
        </div>
      )}
    </section>
  );
}
