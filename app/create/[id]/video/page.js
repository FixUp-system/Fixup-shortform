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
// ★ 프롬프트는 **서버와 같은 함수**로 만든다 — 화면이 자기 규칙으로 다시 만들면 사장님이
//   보는 것과 실제로 나가는 것이 갈린다. 본문 판정도 같은 자리에서 온다(promptBodyOf).
//   이 사슬에는 `fs` 가 없다(tests/prompt-editing-ui.test.js 가 그 그물을 친다).
import { buildClipPrompt, promptBodyOf } from "../../../../lib/cuts";
// 비율은 lib 한 곳에서 온다 — 화면이 표를 또 만들면 언젠가 갈린다(④이미지가 그랬다)
import { aspectFor } from "../../../../lib/aspects";
// 상한과 값은 가격표 한 곳에서 온다(import 0 개의 순수 모듈이라 화면에서 안전하다).
import { MAX_REGEN_PER_CUT, priceLabel, regenPrice } from "../../../../lib/pricing";
// 폴링 루프·진행 판정·오류 필드 표는 전부 lib 한 벌이다. 화면마다 복붙해 두었더니
// 조금씩 다르게 틀렸다(④이미지가 images_error 를 영영 못 보던 버그가 그것이다).
import { startPolling } from "../../../../lib/poll";
import { generationState, isCutDone, busyLabel } from "../../../../lib/progress";
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
      // ★★ 상한을 **명시한다**(2026-08-18). 이 화면만 넘기지 않아 lib/poll.js 의 기본값(5분)을
      //    그대로 받고 있었다 — 그런데 클립은 실측 **컷당 100~800초**다(원장 기록: 16:13:58 ·
      //    +20s · +100.8s). 5분을 넘기면 폴링이 포기하고, `pollTimedOut` 이 서면 아래 진입 복원
      //    까지 막혀(`!pollTimedOut`) **새로고침만이 탈출구**가 됐다. 사장님이 겪은 그 일이다.
      //    ③목소리·④이미지는 이미 Infinity 다 — 영상만 기본값을 받은 것이 실수였고,
      //    CLAUDE.md 가 그 함정을 미리 적어 두었다("기본값을 그대로 받지 마라").
      // ★ 상한을 두지 않는 대신 **멈춤 판정**이 그 자리를 지킨다 — 심장박동이 2분 없으면
      //   화면이 "진행이 없어요"라고 말한다(lib/progress.js generationState). 즉 무한정
      //   기다리는 것처럼 보이지 않는다.
      timeoutMs: Infinity,
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

  // ★★ 탭으로 돌아오면 **스스로 다시 붙는다**(2026-08-18 사장님 지적: "새로고침 후 다시
  //    생성해야 한다"). 새로고침이 하던 일은 두 가지였다 — 상태를 한 번 다시 읽는 것과,
  //    포기 표시(pollTimedOut)를 지우는 것. 둘 다 여기서 한다.
  //
  // 왜 필요한가: 폴링이 어떤 이유로든 멎으면(연속 실패 5회, 브라우저가 백그라운드 탭의
  // 타이머를 늦추는 것) 화면은 멎은 채로 남는다. 사장님이 다른 창을 보다 돌아오는 그 순간이
  // 다시 확인할 가장 자연스러운 자리다.
  //
  // ★ 폴링이 돌고 있으면 손대지 않는다 — 멀쩡히 도는 루프를 껐다 켜면 회차가 밀린다.
  // ★ 포기 표시만 지우고 폴링을 직접 시작하지 않는다 — 시작 판정은 아래 복원 useEffect
  //   하나가 쥔다(두 곳에서 시작하면 루프가 둘 붙는다). 표시가 풀리면 그 effect 가 잇는다.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === "hidden") return;
      if (stopRef.current) return;
      setPollTimedOut(false);
      load(id).catch(() => {});
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [id]);

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
  async function regen(idx, instruction) {
    if (regening !== null) return;
    setErr(""); setRegening(idx);
    try {
      // 지시를 적었으면 함께 보낸다 — 서버가 그 말로 **본문을 다시 쓴다**(꼬리에 덧붙이지 않는다).
      const res = await fetch(`/api/projects/${id}/clips/${idx}/regen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(instruction ? { instruction } : {}),
      });
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

  // 컷별 클립 프롬프트 덮어쓰기 저장. ④이미지의 savePrompt 와 같은 모양이고 담는 필드만
  // 다르다(clip_prompt) — 같은 PATCH 자리다.
  //
  // ★ **빈 문자열을 보내는 것이 "원래대로"의 구현이다** — 서버가 필드를 지운다
  //   (app/api/projects/[id]/route.js). 별도 필드를 두지 않기로 한 설계다.
  // ★ 오류를 삼키지 않는다 — 길이 상한을 넘으면 400 이 오고, 그 문구를 안 띄우면 사장님은
  //   저장된 줄 알고 [다시 만들기]를 누른다(그 값은 유료 호출로 나가지 않는다).
  async function savePrompt(idx, clip_prompt) {
    setErr("");
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cut: { idx, clip_prompt } }),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "저장하지 못했어요");
      return;
    }
    await load(id).catch(() => {});
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

  if (!cuts.length) return <p className="pgsub">시나리오를 먼저 확정해 주세요.</p>;
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
          {/* ★ 여기서 **돈 드는 길을 권하지 않는다.** 멈춤은 "죽었다"가 아니라 "심장박동이
              2분 없었다"는 의심이고, 파이프라인은 아직 살아 움직이는 중일 수 있다.
              POST /clips 에는 진행 중 잠금이 없어(유일한 가드가 "남은 것이 있나"인데
              멈춤이면 그것은 언제나 참이다) 두 번째 누름이 남은 낡은 컷을 **다음 등급 값으로
              다시 과금하고** 3회 상한까지 깎으며, 같은 컷에 파이프라인을 하나 더 띄운다.
              그래서 공짜이고 언제나 되는 것(기다리기·새로고침)만 알린다.
              컷별 [다시 만들기]도 가리키면 안 된다 — 멈춘 컷에는 클립도 오류도 없어
              그 버튼 자체가 렌더되지 않는다. */}
          ⚠ 컷 {gen.done}/{gen.total}에서 한동안 진행이 없어요 — 아직 만들고 있을 수도 있어요.
          {/* ★ "기다리라"는 말은 아직 지켜보는 동안만 맞다. 5분 상한을 넘기면 위쪽 오류줄이
              "새로고침하거나 다시 시도해 주세요"라고 말하는데, 그 옆에서 계속 기다리라고
              하면 두 줄이 서로 싸운다(게다가 그때는 만들기 버튼이 이미 열려 있다). */}
          {!pollTimedOut && " 잠시 기다렸다가 새로고침하면 지금 상태를 다시 확인할 수 있어요."}
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
                {/* ★ 덮개는 그림 갈래 **밖**이다 — 이 화면의 카드는 언제나 컷 그림을 들고 있어,
                    갈래 안에 두면 영영 안 뜬다. 아래 글줄로만 말하던 것을 그림 위로 올린다. */}
                {(regening === c.idx || (gen.kind === "running" && !c.video && !c.video_error)) && (
                  <span className="frame-busy">
                    {busyLabel(regening === c.idx)} <span className="spinner" aria-hidden="true" />
                  </span>
                )}
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
                  {/* ★ ④이미지의 배지와 같은 이유로 사유를 뭉뚱그리지 않는다 — clipKey 는
                      그림·낭독뿐 아니라 속도·움직임·화질·프롬프트 덮어쓰기·공통 지시까지
                      각인한다(lib/steps.js). 사장님이 왜 낡았는지 오해하면 엉뚱한 값을
                      되돌리며 찾는다. */}
                  {isClipStale(c, project) && (
                    <span className="badge warn">
                      클립을 만든 뒤에 값이 바뀌었어요(그림·낭독·움직임·프롬프트·공통 지시) — 다시 만들면 됩니다
                    </span>
                  )}
                  {(c.video || c.video_error) && (
                    <>
                      <span className="badge ai">
                        다시 만듦 {c.clip_regen_count || 0}/{MAX_REGEN_PER_CUT}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <aside className="panel preview-pane">
          {/* ① 결과 — 무엇이 만들어졌는가 */}
          <div className="workbench-step">
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
            {(regening === selected?.idx ||
              (gen.kind === "running" && selected && !selected.video && !selected.video_error)) && (
              <span className="frame-busy">
                {busyLabel(regening === selected?.idx)} <span className="spinner" aria-hidden="true" />
              </span>
            )}
          </div>
          {selected && <p className="preview-note">컷 {selected.idx + 1} · {selected.sentence}</p>}
          </div>
          {/* 컷마다 상태가 새로 시작해야 하므로 key 로 갈아 끼운다 — 안 갈면 컷을 바꿔도
              텍스트칸에 앞 컷의 글이 남아, 그 글이 이 컷의 프롬프트로 저장된다. */}
          {selected && (
            <ClipPromptEdit
              key={selected.idx}
              cut={selected}
              project={project}
              busyCut={gen.kind === "running" || regening !== null}
              onSavePrompt={savePrompt}
              onRegen={regen}
              showCredits={showCredits}
              regening={regening}
            />
          )}
        </aside>
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
              {/* ★ busy 가 아니라 gen.kind 를 본다. 다만 **멈춤도 함께 잠근다** —
                  멈춤은 확신이 아니라 의심이라 파이프라인이 아직 살아 있을 수 있고,
                  이 버튼(POST /clips)에는 진행 중 잠금이 없어 두 번째 누름이 남은 낡은 컷을
                  다시 과금하고 파이프라인을 하나 더 띄운다. 살아 있을지 모르는 실행 위에
                  돈을 한 번 더 쓰게 두느니 잠가 둔다.
                  실패(failed)는 다르다: 프로젝트 단위 video_error 는 라우트의 catch 에서만
                  쓰이므로 그때는 파이프라인이 이미 끝난 뒤다 — 그래서 열어 둔다.
                  ★ 다만 **폴링이 포기할 때까지만** 잠근다. 멈춤은 저절로 풀리지 않아서
                  (심장박동이 멎은 채로 stalled_for_ms 는 계속 커지므로 generationState 는
                  idle 로 안 떨어진다) 조건 없이 잠그면 정말로 죽은 실행에서 사장님이
                  프로젝트 단위 재시도에 영영 못 닿는다 — 멈춘 컷에는 컷별 버튼도 없다.
                  5분 상한은 바꾸기 전과 똑같은 경계다: 그 안에서는 잠기고, 넘으면 열린다. */}
              <button
                className="cta"
                disabled={gen.kind === "running" || (gen.kind === "stalled" && !pollTimedOut)}
                onClick={start}
              >
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

// 이 컷에 실제로 보내는 지시 — 보이고, 고친다.
//
// ④이미지의 같은 자리와 **글자 그대로 같은 모양**이다(app/create/[id]/images/page.js 의
// PreviewPane). 그쪽 주석에 왜 이렇게 생겼는지가 다 적혀 있고, 여기서 다른 것은 셋이다:
//   ① 담는 필드가 clip_prompt 다
//   ② 판형 절이 없다(클립 프롬프트에는 애초에 없다 — lib/cuts.js promptBodyOf 주석)
//   ③ **대사는 못 고친다** — 아래 안내가 그 사실을 말한다
//
// ★ 대사가 꼬리에 있는 이유: 같은 문자열을 ffmpeg 가 자막으로 태운다(lib/subtitles.js).
//   사장님이 여기서 대사를 고칠 수 있으면 **들리는 말과 화면의 자막이 갈린다.** 그래서
//   고칠 수 없게 두고, 대신 어디서 고치는지를 화면이 말해 준다(안 말하면 여기서 고치려 든다).
function ClipPromptEdit({ cut, project, busyCut, onSavePrompt, onRegen, showCredits, regening }) {
  // ★ 텍스트칸에 앉히는 씨앗은 **사장님이 저장한 날 글자**이고, 없으면 코드가 만든 본문이다.
  //   판정 결과(promptBodyOf(cut))를 그대로 앉히면 안 된다 — 덮어쓰기 경로에서는 그 값이 곧
  //   사장님 글자라 괜찮아 보이지만, 이미지 쪽에서는 코드가 붙인 절이 함께 들어 있어 저장할
  //   때마다 한 벌씩 늘어났다. 두 화면이 같은 규칙을 쓰는 것이 그 함정을 안 밟는 길이다.
  const saved = typeof cut.clip_prompt === "string" ? cut.clip_prompt.trim() : "";
  // 덮어쓰기를 지운 컷의 본문 — "원래대로"가 텍스트칸에 되돌려 놓는 값이다.
  const generated = promptBodyOf("clip", { ...cut, clip_prompt: "" }, project);
  // ★ 씨앗을 **이름 하나로** 둔다. 텍스트칸의 초기값·꼬리를 떼는 기준·[저장] 잠금 판정이
  //   전부 이 값이어야 한다. 그중 하나만 `saved` 로 재면 덮어쓰기가 없는 컷에서
  //   **아무것도 안 고쳤는데 [저장]이 눌리고**, 그 순간 각인이 뒤집혀 살아 있는 클립을
  //   틀린 사유로 다시 사게 된다(Seedance 30초 한 편이 회당 ~$9다).
  //   ⚠️ `=== saved || generated` 로 적으면 `(a === b) || c` 로 읽혀 버튼이 영원히 잠긴다 —
  //      이름을 두는 것이 유일하게 안전한 형태다.
  const seed = saved || generated;
  // 수정사항 — 이 컷에서 고치고 싶은 점. ④이미지와 **같은 모양**이다(2026-08-18 사장님 지시로
  // 이 화면에도 생겼다). 전에는 [다시 만들기]뿐이라, 무엇이 마음에 안 드는지 말할 길 없이
  // 같은 프롬프트로 한 번 더 사는 것이 전부였다(컷당 8크레딧).
  const [instr, setInstr] = useState("");
  const [prompt, setPrompt] = useState(seed);
  // 꼬리는 전체에서 씨앗만큼 떼어 낸 것이다 — 본문이 프롬프트 맨 앞이라는 불변에 기댄다
  // (lib/cuts.js promptBodyOf, tests/prompt-override.test.js 가 못 박는다).
  // 대사·목소리·립싱크 지시가 여기 보이는 것이 맞다 — 그것도 코드가 붙이는 것이다.
  const full = buildClipPrompt(cut, project);
  const fixedTail = full.startsWith(seed)
    ? full.slice(seed.length)
    : full.slice(promptBodyOf("clip", cut, project).length);
  // ── 전문 복사 ────────────────────────────────────────────────────────
  //
  // ④이미지와 같은 버튼이지만 **서버에 묻지 않는다.** 영상 프롬프트에는 레퍼런스 절이 없다
  // (buildClipPrompt 는 refs 를 아예 안 받고, i2v 는 그림 한 장과 프롬프트로 나가며 판형은
  //  별도 요청 필드다) — 그래서 화면이 쥔 두 토막이 이미 실제로 나가는 전문 그대로다.
  // 라우트를 부르면 얻는 것 없이 **방금 고친 본문이 서버의 옛 본문으로 덮인다.**
  //
  // ★ 꼬리는 본문에 딸리지 않는다(fixedTail 은 seed 기준) — 아직 저장하지 않은 본문을
  //   복사해도 "저장하면 나갈 글자"가 그대로 나온다.
  const [copyMsg, setCopyMsg] = useState("");
  async function copyAll() {
    try {
      await navigator.clipboard.writeText(prompt + fixedTail);
      setCopyMsg("복사했어요");
    } catch {
      // 클립보드는 브라우저가 막을 수 있다(권한·비보안 컨텍스트). 조용히 실패하면
      // 사장님은 복사된 줄 알고 빈 것을 붙인다.
      setCopyMsg("복사하지 못했어요 — 위 글을 직접 긁어 주세요");
    }
    setTimeout(() => setCopyMsg(""), 4000);
  }

  // 컷마다 첫 회는 공짜, 둘째부터 값을 치른다. 화질까지 넘긴다 — 1080p 는 25 가 아니라 57 이다
  // (컷별 [다시 만들기] 버튼과 같은 출처를 본다).
  const regenLabel = priceLabel(
    regenPrice("clip", cut.clip_regen_count || 0, modelIdForProject(project), resolutionForProject(project))
  );
  // 상한에 닿았는가 — 값을 내도 못 하는 자리다(④이미지와 같은 판정).
  const atLimit = (cut.clip_regen_count || 0) >= MAX_REGEN_PER_CUT;

  return (
    <>
      {/* ② 고치기 — 사장님이 하는 일 */}
      <div className="workbench-step">
      {/* ★ 수정사항을 먼저, 지시문은 그 아래 곁길로(2026-08-18 사장님 지시) — 무엇을 고칠지 정하려면
          지금 무엇을 보내고 있는지를 먼저 봐야 한다.
          ★ 여기 적은 말은 꼬리에 덧붙지 않는다. 위 지시문을 **다시 써서**(lib/prompt-revise.js)
            가리킨 것은 고치고 새 요구는 더한다 — 그 결과가 위 칸에 그대로 보인다.
          ★ 대사는 이 길로도 못 고친다 — 고쳐 쓰기 규칙이 그것을 막는다(자막과 갈린다). */}
      {cut.edit_instruction && (
        <p className="preview-note">지난 수정 지시: {cut.edit_instruction}</p>
      )}
      <textarea
        className="ref"
        placeholder="이 영상에서 고치고 싶은 점을 적어주세요 — 예: 더 천천히 다가가게, 흔들림 줄이기"
        value={instr}
        onChange={(e) => setInstr(e.target.value)}
      />
      <div className="preview-actions">
        <button
          className="cta"
          disabled={busyCut || atLimit || !instr.trim()}
          onClick={() => onRegen?.(cut.idx, instr.trim())}
        >
          {busyCut ? "만드는 중…" : "이 지시로 다시 만들기"}
        </button>
        {/* ★ 지시 없이 그냥 다시 만드는 문 — ④이미지와 같은 짝이다.
            그리고 이것이 **멈춤·실패에서 빠져나오는 유일한 문**이다: 그때는 고칠 말이 없어도
            한 번 더 만들어 보는 것이 사장님이 할 수 있는 전부다. 그래서 `regening` 만 보고
            잠근다 — busyCut 으로 잠그면 멈춤 동안에도 닫혀 탈출구가 사라진다. */}
        <button
          className="mini"
          disabled={regening !== null || atLimit}
          onClick={() => onRegen?.(cut.idx)}
        >
          {regening === cut.idx ? "만드는 중…" : "재생성"}
        </button>
      </div>
      </div>

      {/* ③ 들여다보기 — 궁금할 때만 펼치는 곁길 */}
    {/* 접어 둔다 — 주경로는 컷별 [다시 만들기]다. 이 자리는 직접 지시를 쓰는 사장님을 위한
        곁길이라, 펼치지 않으면 기본 흐름이 그대로다. */}
    <details className="prompt-edit workbench-step">
      <summary>실제로 보내는 지시</summary>
      {/* 고치는 것은 **본문**(어떻게 움직이는가)이다. 첫 프레임 유지·글자 금지·대사는 코드가
          언제나 뒤에 붙인다 — 무엇을 쓰든 지워지지 않는다. */}
      {/* ★★ **하나의 지시문으로 보인다**(2026-08-18 사용자 지시) — ④이미지와 같은 모양이다.
          앞은 고칠 수 있고 뒤는 코드가 붙이는 글이지만 사장님에게는 모델이 받는 문장 하나다.
          ★ 붙이는 것은 보이는 방식이고, 고치는 자리는 그대로 본문 하나다 — 꼬리를 텍스트칸에
            넣으면 저장할 때마다 꼬리가 두 벌이 되고, 이 화면에서는 그 꼬리에 **대사**가
            들어 있어 자막과 갈리기까지 한다. */}
      <div className="prompt-one">
        {/* ★★ 본문이 **textarea 가 아니다**(2026-08-18 사장님 지적). 폼 컨트롤 안에서
            시작한 선택은 밖으로 못 넘어간다 — 한 상자로 이어 보이게 해 놓고 정작
            **한 덩어리로 집어갈 수는 없었다**. contentEditable 로 바꾸면 본문과 꼬리가
            같은 종류의 노드라 드래그가 이어지고, 스크롤도 상자 하나가 쥔다(막대 둘이
            보이던 것도 같은 뿌리다). 컷 문장 편집이 이미 쓰는 방식이다.
            ★ 값을 children 으로 그대로 되돌려준다 — DOM 글자와 같으면 React 가 손대지
              않아 커서가 튀지 않는다. 그래서 onInput 에서 상태를 갱신해도 안전하다. */}
        <div
          className="ref mono prompt-body"
          contentEditable
          suppressContentEditableWarning
          onInput={(e) => setPrompt(e.currentTarget.textContent)}
        >
          {prompt}
        </div>
        <p className="prompt-fixed mono">{fixedTail}</p>
      </div>
      {/* 글자 수만 보여 준다. 상한 숫자는 화면에 안 적는다 — 값이 두 벌이면 갈린다
          (상한은 원장이 자르는 자리 하나이고, 넘으면 서버 문구가 위에 뜬다). */}
      <div className="preview-actions">
        {/* 본문+공통지시+꼬리를 한 덩어리로 — 밖에서 그대로 돌려 볼 수 있게 */}
        <button className="mini" onClick={copyAll}>전문 복사</button>
        <span className="regen-note mono">{prompt.length}자</span>
        {copyMsg && <span className="regen-note">{copyMsg}</span>}
      </div>
      {/* ★ 꼬리에는 사장님이 직접 쓴 글도 섞여 있다 — 프로젝트 공통 지시(settings.clip_note)가
          본문 뒤·계약 앞이라 이 블록 안에 나온다. 대사에는 고칠 자리를 적어 뒀는데 이 값에는
          없어서, 자기가 쓴 문장을 못 고치는 것으로 읽혔다. */}
      {/* ★ 공통 지시를 **따로 설명하지 않는다**(2026-08-18 사용자 지시).
          이 문장을 하루에 세 번 고쳤고 세 번 다 사실이 바뀐 것이다: 자료 단계에서 고친다 →
          만들 때 정한다 → 못 고친다 → **말하지 않는다**. 마지막이 가장 짧고 가장 정직하다 —
          고칠 자리가 없는 값을 설명하면 사장님은 할 수 있는 일이 없는 글을 읽는다.
          값 자체는 위 꼬리 문단에 글자로 **함께 보인다**(감추는 것이 아니다). */}
      {/* ★ 대사가 꼬리에 있는 이유를 사장님 말로 적는다. 안 적으면 위 꼬리에서 대사를 보고
          여기서 고치려 들고, 고칠 자리를 못 찾아 헤맨다. */}
      <p className="preview-note">
        {/* ★ 단계 이름에 원문자(②)를 쓰지 않는다 — 사이드바는 "2 시나리오"라고 적고,
            화면 문자열의 원문자는 tests/design-system.test.js 가 막는다. */}
        <strong>대사는 여기서 못 고쳐요</strong> — 자막으로도 그 글자가 나가서, 갈리지 않게
        시나리오 단계에서 고쳐 주세요.
      </p>
      {/* 고쳐도 지금 클립은 그대로다 — 반영하려면 다시 만들어야 하고 그때 값이 든다. */}
      <p className="preview-note warn">
        고쳐서 저장해도 지금 클립은 그대로예요 — 반영하려면 [다시 만들기]로 다시 만들어야
        하고, 그때 값이 들어요 (유료 · {regenLabel})
      </p>
      <div className="preview-actions">
        <button
          className="mini"
          disabled={busyCut || prompt.trim() === seed}
          onClick={() => onSavePrompt(cut.idx, prompt.trim())}
        >
          저장
        </button>
        {/* ★ 빈 값을 보내는 것이 "원래대로"의 구현이다 — 서버가 필드를 지운다.
            텍스트칸도 코드가 만든 본문으로 되돌려 놓는다(이 컴포넌트는 컷이 안 바뀌면
            다시 마운트되지 않으므로 손으로 되돌려야 한다). */}
        <button
          className="mini"
          disabled={busyCut || !saved}
          onClick={() => { setPrompt(generated); onSavePrompt(cut.idx, ""); }}
        >
          원래대로
        </button>
      </div>
    </details>
    </>
  );
}
