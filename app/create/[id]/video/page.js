"use client";

// ⑤ 영상 — 컷 이미지를 시작 프레임으로 클립을 만든다.
// 길이는 ③목소리에서 확정된 낭독 길이를 따르되, 모델이 받는 눈금으로 올려 보낸다.
// 상한(서버가 clip_limits 로 실어 보낸 값)을 넘는 컷만 잘린 것으로 표시한다.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import { useMe } from "../../../../components/MeContext";
import BackButton from "../../../../components/BackButton";
import {
  I2V_MAX_SECONDS, modelIdForProject, projectSpeaks, resolutionForProject,
} from "../../../../lib/clip-limits";
import { isClipStale } from "../../../../lib/steps";
// 비율은 lib 한 곳에서 온다 — 화면이 표를 또 만들면 언젠가 갈린다(④이미지가 그랬다)
import { aspectFor } from "../../../../lib/aspects";
// 상한과 값은 가격표 한 곳에서 온다(import 0 개의 순수 모듈이라 화면에서 안전하다).
import { MAX_REGEN_PER_CUT, priceLabel, regenPrice } from "../../../../lib/pricing";
// 폴링 루프·진행 판정·오류 필드 표는 전부 lib 한 벌이다. 화면마다 복붙해 두었더니
// 조금씩 다르게 틀렸다(④이미지가 images_error 를 영영 못 보던 버그가 그것이다).
import { startPolling } from "../../../../lib/poll";
import { generationState, isCutDone } from "../../../../lib/progress";
import { firstError } from "../../../../lib/step-errors";

export default function VideoStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project, setProject, load } = useProject();
  // ★ 잔액이 여기서 움직인다(정가·재생성). 상단바는 공유본을 보므로 다시 읽어 줘야
  // 옛 숫자가 안 남는다 — 안 읽으면 크레딧이 나갔는데 화면은 그대로다.
  // 실패해도 넘어간다: 만들기는 이미 시작됐고, 잔액 표시 하나 때문에 막을 일이 아니다.
  const { me, load: reloadMe } = useMe();
  // 크레딧을 끈 동안에는 값 이야기를 안 한다(gated).
  const showCredits = me?.gated !== false;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [regening, setRegening] = useState(null); // 다시 만드는 중인 컷 idx
  // 상태 라우트가 돌려준 마지막 응답 그대로. 진행 판정에 필요한 심장박동(progress)과
  // 멈춘 시간(stalled_for_ms)은 프로젝트 문서가 아니라 여기에만 실려 온다.
  const [status, setStatus] = useState(null);
  const stopRef = useRef(null);

  useEffect(() => () => { stopRef.current?.(); stopRef.current = null; }, []);

  function beginPolling() {
    stopRef.current?.();
    setPollTimedOut(false);
    stopRef.current = startPolling({
      url: `/api/projects/${id}/clips/status`,
      onTick: (st) => {
        setStatus(st);
        setProject((p) => ({ ...p, status: st.status, cuts: st.cuts, video_error: st.video_error }));
        if (firstError(st, "video")) return true;
        return !(st.cuts || []).some((c) => !c.video && !c.video_error);
      },
      onStop: ({ timedOut }) => {
        // ★ 반드시 여기서 비운다. startPolling 이 돌려주는 것은 "떼기"라 스스로 끝난
        //   폴링에서는 안 불리고, 안 비우면 손잡이가 영원히 truthy 라 아래 복원
        //   useEffect 가 "이미 돌고 있다"고 오인해 폴링이 다시 살아나지 않는다.
        stopRef.current = null;
        setBusy(false);
        if (timedOut) {
          setPollTimedOut(true);
          setErr("상태 확인이 오래 걸리고 있어요 — 새로고침하거나 다시 시도해 주세요");
        }
      },
    });
  }

  // 진입·새로고침 복원 — 아직 만들지 않은 컷이 남아 있으면 폴링을 잇는다
  useEffect(() => {
    const cuts = project?.cuts || [];
    const waiting = cuts.length > 0 && cuts.some((c) => !c.video && !c.video_error);
    if (project?.status === "video" && !stopRef.current && !pollTimedOut && waiting) {
      setBusy(true);
      beginPolling();
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
    await reloadMe().catch(() => {});
    beginPolling();
  }

  // 다시 만드는 동안 그 컷을 잠근다.
  // 표시가 없던 때는 눌러도 아무 일이 없어 보여 한 번 더 누르게 됐고, 그만큼 돈이 더 나갔다.
  async function regen(idx) {
    if (regening !== null) return;
    setErr(""); setRegening(idx);
    try {
      const res = await fetch(`/api/projects/${id}/clips/${idx}/regen`, { method: "POST" });
      if (!res.ok) {
        setErr((await res.json().catch(() => ({}))).error || "다시 만들지 못했어요");
        return;
      }
      await load(id).catch(() => {});
    await reloadMe().catch(() => {});
    } finally {
      setRegening(null);
    }
  }

  const cuts = project?.cuts || [];
  const chosenModel = modelIdForProject(project);

  // ★ 미리보기 틀은 **프로젝트 비율**이다(⑥완성과 같은 규칙). 9:16 으로 고정해 두면
  // 16:9·1:1 프로젝트의 클립이 세로 틀에 맞춰 잘려 보이고, 키우면 그 잘림이 그대로 커진다.
  // 폭을 뷰포트 높이로 제한해 세로가 길어도 화면을 넘지 않는다.
  const aspect = aspectFor(project?.settings?.aspect_ratio);
  const frameStyle = {
    aspectRatio: `${aspect.width} / ${aspect.height}`,
    maxWidth: `calc((100vh - 210px) * ${aspect.width} / ${aspect.height})`,
  };
  // 활성 모델의 클립 상한. 서버가 실어 보낸다 — 없으면(옛 응답) 기본 프로필 값으로 떨어진다
  const clipMax = project?.clip_limits?.max ?? I2V_MAX_SECONDS;
  // 남은 컷 = 클립이 없거나 낡은 컷. runVideoPipeline 의 건너뛰기 조건의 정확한 반대다.
  const remainingCount = cuts.filter((c) => !c.video?.url || isClipStale(c, project)).length;
  const doneCount = cuts.filter((c) => c.video).length;
  const truncatedCount = cuts.filter((c) => c.video?.truncated).length;
  // 그림이나 낭독이 바뀐 뒤 옛것으로 만든 클립이 남아 있으면 합치러 보내지 않는다
  // ⚠️ 포인트프리로 넘기면 배열 번호가 project 자리에 들어가 말하는 축 판정이 죽는다
  const staleCount = cuts.filter((c) => isClipStale(c, project)).length;
  const selected = cuts.find((c) => c.idx === selectedIdx) || cuts.find((c) => c.video) || cuts[0];

  // ★ 프로젝트 단위 video_error 는 **스스로 지워지지 않는다.** 컷별 [다시 만들기] 라우트는
  //   그 필드를 건드리지 않고, 지우는 것은 POST /clips(아래 만들기 버튼) 하나뿐이다.
  //   그런데 마지막 빠진 컷을 컷별로 되살리면 remainingCount 가 0 이 되어 그 버튼이 아예
  //   렌더되지 않는다 — 전부 성공한 프로젝트에 실패 경고가 영영 붙어 있게 된다.
  //   그래서 **만들 것이 하나도 안 남았으면** 그 오류는 이미 해결된 옛 기록으로 본다.
  //
  //   조건을 `cuts.every((c) => c.video)` 로 잡으면 구멍이 난다: 낡은 클립만 남은 상태에서
  //   다시 돌렸다가 실패하면 컷마다 옛 클립은 그대로라 **방금 난 실패가 가려진다.**
  //   remainingCount(=없거나 낡은 컷)로 재면 그 경우 0 이 아니라 경고가 제대로 뜬다.
  //   그리고 이 값은 아래 만들기 버튼이 그려지는 조건과 정확히 같다 — 즉 "지울 길이 아직
  //   있으면 그대로 보여주고, 지울 길이 사라졌을 때만 옛 기록으로 본다".
  //
  //   숨기는 것(dismiss)이 아니다. 사실 판정이라 저절로 되돌아온다 — 컷이 하나라도 빠지거나
  //   낡는 순간 경고가 다시 뜬다. 그래서 ④이미지에서 났던 사고(감추기 플래그가 다음 진짜
  //   실패까지 걸어 잠근 것)가 여기서는 안 난다. 무엇을 다시 잠그지도 않는다: 아래 잠금
  //   둘은 gen.kind 만 보기 때문이다.
  const nothingLeftToMake = cuts.length > 0 && remainingCount === 0;

  // "안 눌렀다 / 되고 있다 / 멈춘 것 같다 / 실패했다 / 끝났다" — 판정은 lib 한 벌이 한다.
  const gen = generationState({
    // ★ `doneCount` 를 넘기지 않는다 — 그것은 **성공한** 클립 수라 화면 문구
    //   ("N/M개 컷을 만들었어요")의 값이다. 진행 판정이 원하는 것은 **더 기다릴 것이
    //   남았는가**이므로 실패로 끝난 컷도 끝난 것으로 세야 한다(안 그러면 실패 컷 하나가
    //   영원히 "만드는 중"으로 남는다). 그래서 파이프라인과 같은 함수를 쓴다.
    done: cuts.filter((c) => isCutDone(c, "video")).length,
    total: cuts.length,
    error: nothingLeftToMake ? null : firstError({ ...project, ...(status || {}) }, "video"),
    phase: status?.progress?.phase ?? project?.progress?.phase ?? null,
    stepPhase: "video",
    // ★ 멈춘 시간은 서버가 재서 실어 보낸다. 브라우저가 자기 시계로 빼면 사장님 PC 가
    //   3분 빠를 때 시작하자마자 "멈췄어요"가 뜬다.
    stalledForMs: status?.stalled_for_ms ?? null,
    busy,
  });

  if (!cuts.length) return <p className="pgsub">대본을 먼저 만들어 주세요.</p>;
  // ★ 말하는 모델은 예외다 — 목소리를 클립이 만드니 낭독이 아예 없다.
  //   컷 길이는 분할 때 잡은 추정 초가 그대로 최종값이다(lib/subtitles.js 의 cutSeconds).
  if (!projectSpeaks(project) && !cuts.some((c) => c.audio))
    return <p className="pgsub">목소리를 먼저 만들어 주세요.</p>;
  if (!cuts.some((c) => c.image || c.source === "photo"))
    return <p className="pgsub">이미지를 먼저 만들어 주세요.</p>;

  return (
    <section className="panel">
      <h2>컷을 영상으로 만듭니다 <span className="badge vlm">영상</span></h2>
      {err && <p className="pgsub warn">{err}</p>}
      {/* 되는 중·멈춤·실패를 서로 다른 말로 알린다 — 셋을 뭉뚱그리면 사장님이 기다려야
          하는지 손을 써야 하는지 알 수 없다. */}
      {gen.kind === "running" && (
        <p className="pgsub">
          <span className="spinner" aria-hidden="true" /> 컷 {gen.done}/{gen.total} 만드는 중이에요
        </p>
      )}
      {gen.kind === "stalled" && (
        <p className="pgsub warn">
          {/* ★ 컷별 [다시 만들기]를 가리키면 안 된다 — 그 버튼은 클립이나 오류가 남은 컷에만
              그려지고, **멈춘 컷에는 둘 다 없어** 아예 렌더되지 않는다. 지금 확실히 있는
              길은 아래 만들기 버튼 하나다(멈춤이면 남은 컷이 있으니 반드시 그려진다). */}
          ⚠ 진행이 멈춰 있는 것 같아요 — 컷 {gen.done}/{gen.total}에서 더 나아가지 않고 있어요.
          아래 만들기 버튼을 다시 누르면 남은 컷부터 이어서 만들어요.
        </p>
      )}
      {gen.kind === "failed" && <p className="pgsub warn">⚠ {gen.reason.message}</p>}
      <p className="pgsub">
        {doneCount > 0
          ? `${doneCount}/${cuts.length}개 컷을 만들었어요`
          : "그림이 움직이기 시작해요 — 읽은 길이만큼."}
        {truncatedCount > 0 && ` · ${truncatedCount}개 컷은 ${clipMax}초까지만 움직여요`}
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
                {regening === c.idx ? (
                  <div className="script-src">다시 만드는 중이에요 — 30초쯤 걸려요</div>
                ) : c.video_error ? (
                  <div className="script-src warn">{c.video_error}</div>
                ) : !c.video ? (
                  // ★ 카드도 머리말과 같은 판정을 본다. busy 를 보면 멈춤 동안(busy 는 5분
                  //   상한까지 참이다) 머리말은 "멈춰 있는 것 같아요", 카드는 "만드는 중…"
                  //   이라 한 화면이 서로 다른 말을 한다.
                  <div className="script-src">
                    {gen.kind === "running"
                      ? "만드는 중…"
                      : gen.kind === "stalled" ? "멈춰 있어요" : "아직 만들지 않았어요"}
                  </div>
                ) : null}
                {/* 길이·재생성 횟수·[다시 만들기]를 한 줄에 — 목소리 단계와 같은 배치.
                    남은 횟수는 항상 보인다: 3회 상한에 언제 닿는지 누르기 전에 알아야 한다. */}
                <div className="badges">
                  {c.audio && <span className="badge ai">{c.audio.seconds}초 낭독</span>}
                  {c.video && <span className="badge photo">클립 {c.video.seconds}초</span>}
                  {c.video?.truncated && (
                    <span className="badge warn">{clipMax}초까지만 움직이고 나머지는 멈춰 있어요</span>
                  )}
                  {isClipStale(c, project) && (
                    <span className="badge warn">
                      그림이나 낭독이 바뀐 뒤라 클립이 옛것이에요 — 다시 만들면 됩니다
                    </span>
                  )}
                  {(c.video || c.video_error) && (
                    <>
                      <span className="badge ai">
                        다시 만듦 {c.clip_regen_count || 0}/{MAX_REGEN_PER_CUT}
                      </span>
                      <button
                        className="mini"
                        // ★ busy 가 아니라 **실제로 도는 중**일 때만 잠근다. 멈췄거나
                        //   실패했을 때도 busy 는 참인 채로 남을 수 있는데, 그때 이 버튼이
                        //   사장님의 유일한 탈출구다 — 잠가 두면 할 수 있는 일이 없다.
                        disabled={gen.kind === "running" || regening !== null || (c.clip_regen_count || 0) >= MAX_REGEN_PER_CUT}
                        onClick={() => regen(c.idx)}
                      >
                        {/* 컷마다 첫 회는 공짜다. 클립은 다시 만드는 값이 가장 비싸므로
                            누르기 전에 보여 준다. */}
                        {regening === c.idx
                          ? "만드는 중…"
                          // ★ 화질까지 넘긴다 — 1080p 는 25 가 아니라 57 이다.
                          //   라우트(clips/[idx]/regen)가 걷는 값과 같은 출처를 본다.
                          : !showCredits
                            ? "다시 만들기"
                            : `다시 만들기 · ${priceLabel(regenPrice("clip", c.clip_regen_count || 0, modelIdForProject(project), resolutionForProject(project)))}`}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="preview-pane">
          <div className="preview-frame" style={frameStyle}>
            {/* 다시 만드는 중에는 옛 클립을 감춘다 — 그대로 두면 바뀐 줄 알고 또 누르게 된다 */}
            {regening === selected?.idx ? (
              selected?.image?.url ? <img src={selected.image.url} alt="" /> : null
            ) : selected?.video?.url ? (
              <video className="preview-video" controls src={selected.video.url} />
            ) : selected?.image?.url ? (
              <img src={selected.image.url} alt="" />
            ) : (
              <span className="ph">컷을 고르면 여기서 크게 봅니다</span>
            )}
            {regening === selected?.idx && (
              <span className="ph">다시 만드는 중이에요…</span>
            )}
          </div>
          {selected && <p className="preview-note">컷 {selected.idx + 1} · {selected.sentence}</p>}
        </div>
      </div>


      <div className="step-actions">
        <BackButton stepKey="video" />
        <div className="fwd">
          {remainingCount > 0 ? (
            <>
              <span className="hint">
                {doneCount > 0
                  ? `남은 컷 ${remainingCount}개를 만들어요 — 이미 만든 ${doneCount}개는 그대로 씁니다`
                  : `컷 ${cuts.length}개를 각각 움직이는 영상으로 만들어요`}
              </span>
              {/* ★ busy 가 아니라 **실제로 도는 중**일 때만 잠근다. 멈춤·실패에서도 busy 는
                  참인 채로 남는데(멈춤은 5분 상한에 닿아야 풀린다), 그동안 이 버튼이
                  멈춘 컷을 이어 만들 유일한 길이다 — 잠가 두면 할 수 있는 일이 없다. */}
              <button className="cta" disabled={gen.kind === "running"} onClick={start}>
                {gen.kind === "running"
                  ? "만드는 중…"
                  : doneCount > 0 ? `남은 ${remainingCount}개 만들기` : "영상 만들기"}
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
                완성하러 가기 →
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
