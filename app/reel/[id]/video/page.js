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
import { reelOf, isReelRendering } from "../../../../lib/reel/doc";
// ★★ 2026-08-25 — 굽기 갈래가 둘이다(통짜 · 컷별). 판정은 lib 의 순수 함수 하나다 —
//   canBakeReel 은 컷별 갈래에서 예전 canBakeReelClips 를 글자 그대로 부른다.
import { planReelBake, canBakeReel, isReelOneShotStale, reelSheetUrl, reelWholePrompt } from "../../../../lib/reel/oneshot";
import { isReelClipStale } from "../../../../lib/reel/steps";
import { startPolling } from "../../../../lib/poll";
import { REEL_STEPS, reelStepHref } from "../../../../lib/reel/steps";
import ReelBack from "../../../../components/ReelBack";

export default function ReelVideoPage() {
  const { id } = useParams();
  const { project, reload } = useReelProject();
  const [busy, setBusy] = useState("");
  // ★ 사장님이 한국어로 적는 수정 요청 — ②③④와 같은 모양이다.
  const [note, setNote] = useState("");
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
    // ★★ 수정 요청이 적혀 있으면 **굽기 전에 전체 프롬프트에 반영한다**(2026-08-25).
    //   ④가 쓰는 것과 같은 문이다(PATCH /prompts, idx 없으면 전체). 그래야
    //   굽기가 새 지문을 쓰고, 각인(video.of)도 그 값을 따라 난음 판정이 맞는다.
    // ★ 저장이 실패하면 **굽지 않는다** — 사장님이 적은 말이 한 글자도 안 닿은 채
    //   돈이 나가는 것을 막는다(⑥의 저장→합성 순서와 같은 규율).
    const ask = note.trim();
    if (ask) {
      const saved = await fetch(`/api/reel/${id}/prompts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: [wholePrompt, ask].join("\n\n") }),
      });
      if (!saved.ok) {
        const d = await saved.json().catch(() => ({}));
        setErr(d.error || "수정 요청을 저장하지 못했어요");
        setBusy("");
        return;
      }
      setNote("");
      await reload(id).catch(() => {});
    }
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
  // ★ 전체 프롬프트 — ④에서 고친 것이 있으면 그것, 없으면 시나리오 원문이다.
  //   판정은 lib 의 순수 함수 하나다 — 화면이 조립하면 ④와 갈린다.
  const wholePrompt = reelWholePrompt(project);
  const status = live?.status ?? reel.status;
  const rendering = status === "rendering";
  // ★★ 2026-08-21 리뷰 A2 — 프롬프트뿐 아니라 그림까지 본다(`/clips` 의 청구 앞 검사와
  //   같은 값). 프롬프트만 보면 화면이 열어 준 버튼이 서버 배경 작업에서 청구 뒤 실패한다.
  const ready = canBakeReel(project);
  const doneCount = cuts.filter((c) => c?.video?.url).length;
  // ★ 갈래는 **문서**로 판정한다 — 상태 라우트(live)는 settings·scenario 를 안 싣는다.
  const oneShot = planReelBake(project).mode === "oneshot";
  const sheetUrl = reelSheetUrl(project?.cuts || []);
  const oneShotStale = oneShot && isReelOneShotStale(project);

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
      {/* ★ 통짜 갈래는 "컷 N개 중 M개"가 거짓말이다 — 한 번에 한 편을 굽는다. */}
      <p className="pgsub">
        {oneShot
          ? (doneCount > 0
            ? `스토리보드 한 장으로 ${cuts.length}컷짜리 한 편을 만들었어요`
            : `스토리보드 한 장을 통째로 넘겨 ${cuts.length}컷을 한 편으로 만들어요`)
          : `컷 ${cuts.length}개 중 ${doneCount}개를 만들었어요`}
      </p>
      {err && <p className="pgsub warn">{err}</p>}
      {(live?.error || reel.error) && <p className="pgsub warn">{live?.error || reel.error}</p>}
      {rendering && (
        <p className="pgsub">영상을 만드는 중이에요 — 다 되면 여기에 나타나요.</p>
      )}

      {/* 통짜 갈래 — 보여 줄 것이 **한 편**이다(굽기 전에는 스토리보드 원본). */}
      {oneShot ? (
        <div className="uploads">
          <div className="up photo-mark">
            {cuts[0]?.video?.url ? (
              <video className="thumb-media" src={cuts[0].video.url} muted loop />
            ) : sheetUrl ? (
              <img className="thumb-media" src={sheetUrl} alt="스토리보드" />
            ) : (
              <div className="thumb-media" />
            )}
            {oneShotStale && <span className="tag warn">다시 만들어야 해요</span>}
          </div>
        </div>
      ) : cuts.length > 0 && (
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

      {/* ★ 만드는 버튼은 **그 줄에 혼자** 둔다 — 되돌아가는 링크와 나란히
          있으면 둘 다 "지금 할 일"처럼 읽힌다(2026-08-25 사장님 지적). */}
      {/* ★★ 수정 요청 — ②③④와 같은 모양이다(2026-08-25 사장님 지시).
          적은 말은 [다시 만들기]를 누를 때 **전체 프롬프트에 반영된 뒤** 굽기로 간다.
          ★ 자동으로 안 나간다 — 영상은 이 흐름에서 가장 비싸다.
          ★ 만든 뒤에만 보인다 — 만들기 전에는 고칠 것이 없다. */}
      {doneCount > 0 && !rendering && (
        <div className="note-form">
          <textarea
            className="field"
            rows={3}
            value={note}
            disabled={!!busy}
            onChange={(e) => setNote(e.target.value)}
            placeholder="고치고 싶은 것을 적어 주세요 — 예) 마지막을 좀 더 천천히 끝내 줘"
          />
        </div>
      )}

      <div className="step-actions step-actions--bare">
        <div className="fwd">
          <button className="cta" disabled={rendering || !!busy || !ready} onClick={startClips}>
            {busy === "clips" ? "시작하는 중…" : doneCount > 0 ? "다시 만들기 →" : "영상 만들기 →"}
          </button>
        </div>
      </div>

      {/* ★ 맨 아래 줄 — 왼쪽 끝이 [이전으로], 오른쪽이 다음이다(.fwd 가 margin-left:auto).
          이전 버튼은 components/ReelBack.jsx 하나가 그린다 — 화면마다 손으로 적어서
          이름도 자리도 갈렸던 것이 원래 문제였다(2026-08-25 사장님 지적). */}
      {/* ★ 굽기 전에도 되돌아갈 수 있어야 한다 — 이 줄은 doneCount 와 무관하게
          항상 그리고, [완성으로]만 조건부로 둔다. */}
      <div className="step-actions">
        <ReelBack step="video" id={id} />
        {doneCount > 0 && (
          <div className="fwd">
            <Link className="cta" href={reelStepHref(doneStep, id)}>완성으로 →</Link>
          </div>
        )}
      </div>
    </section>
  );
}
