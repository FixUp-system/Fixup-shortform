"use client";

// ③ 목소리 — 컷마다 문장을 읽혀 실제 길이를 확정한다.
// 대본 화면의 "약 N초"는 글자 수로 어림잡은 값이고, 여기서 나온 길이가 진짜다 —
// 클립 길이(⑤)와 자막 타이밍(⑥)이 이 값을 따른다.
//
// 이미지(④)보다 앞인 이유도 그것이다: 여기서 확정된 길이가 10초를 넘으면 클립이 잘리는데,
// 그 사실을 그림 값(컷당 후보 2장)을 치르기 전에 알아야 한다.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import { useMe } from "../../../../components/MeContext";
import BackButton from "../../../../components/BackButton";
import { VOICES } from "../../../../lib/voices";
import { isAudioStale, isReachable } from "../../../../lib/steps";
// 상한과 정가는 가격표 한 곳에서 온다(import 0 개의 순수 모듈이라 화면에서 안전하다).
import { MAX_REGEN_PER_CUT, priceLabel, regenPrice, videoPrice } from "../../../../lib/pricing";
import { modelIdForProject, projectSpeaks, resolutionForProject } from "../../../../lib/clip-limits";
// 폴링과 판정은 화면이 다시 적지 않는다 — 복붙본이 조금씩 갈려 ④이미지가 images_error 를
// 영영 못 보던 버그가 났다(2026-08-14). 한 벌에서 온다.
import { startPolling } from "../../../../lib/poll";
import { generationState, isCutDone } from "../../../../lib/progress";
import { firstError } from "../../../../lib/step-errors";

export default function VoiceStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project, setProject, load } = useProject();
  // ★ 잔액이 여기서 움직인다(정가·재생성). 상단바는 공유본을 보므로 다시 읽어 줘야
  // 옛 숫자가 안 남는다 — 안 읽으면 크레딧이 나갔는데 화면은 그대로다.
  // 실패해도 넘어간다: 만들기는 이미 시작됐고, 잔액 표시 하나 때문에 막을 일이 아니다.
  const { me, load: reloadMe } = useMe();
  // 크레딧을 끈 동안(내부 QA)에는 값 이야기를 안 한다 — 판정은 서버가 내려 준 gated 하나다.
  const showCredits = me?.gated !== false;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [picked, setPicked] = useState(project?.voice_label || VOICES[0].label);
  const [regening, setRegening] = useState(null); // 다시 읽는 중인 컷 idx
  const [status, setStatus] = useState(null); // 마지막 상태 응답 — 심장박동이 여기 온다
  const stopRef = useRef(null);

  // 컷 분할이 끝나기 전 — 대본 승인 직후 이 화면에 도착하면 여기부터 보인다.
  // 훅 순서가 어긋나지 않게 이른 return 보다 위에서 정한다.
  const splitting =
    (project?.cuts || []).length === 0 && project?.status === "cuts" && !project?.cuts_error;

  // 언마운트 정리 — ref까지 비운다(이미지 화면과 같은 이유: 재마운트 시 폴링이 되살아나게)
  useEffect(() => () => { stopRef.current?.(); stopRef.current = null; }, []);

  function beginPolling() {
    stopRef.current?.();
    setPollTimedOut(false);
    stopRef.current = startPolling({
      url: `/api/projects/${id}/voice/status`,
      onTick: (st) => {
        setStatus(st);
        setProject((p) => ({ ...p, status: st.status, cuts: st.cuts, voice_error: st.voice_error }));
        // 실패했으면 더 두드릴 것이 없다. 볼 필드는 표(lib/step-errors)가 정한다.
        const e = firstError(st, "voice");
        if (e) { setErr(e.message); return true; }
        // 컷마다 소리가 붙었거나 실패 표시가 남았으면 끝난 것이다.
        //
        // ★ status 까지 본다. 파이프라인은 컷마다 audio 를 따로 저장하고 status 는
        //   **다 끝난 뒤 한 번 더** 저장한다(lib/pipeline.js). audio 만 보고 끝내면 그 사이에
        //   버튼이 열리고, 누르면 가드가 아직 "cuts" 인 status 를 보고 되돌려보낸다 —
        //   "넘어가다가 돌아오는" 그 증상이다(2026-08-13 프로덕션 실측).
        //   로컬은 그 창이 밀리초라 거의 안 보이고, 배포 환경은 저장이 왕복이라 넓게 열린다.
        const pending = (st.cuts || []).some((c) => !c.audio && !c.voice_error);
        return !pending && st.status === "voice";
      },
      onStop: ({ timedOut }) => {
        // ★ 여기서 ref 를 비워야 한다. 아래 복원 effect 가 ref 의 참 여부로 "이미 돌고
        //   있나"를 판정하는데, 모듈은 자기 내부 handle 만 비운다 — 화면 ref 는 반환받은
        //   중단 함수를 계속 쥐어 항상 참이 되고, 스스로 끝난 폴링이 다시는 안 살아난다.
        stopRef.current = null;
        setBusy(false);
        if (timedOut) {
          setPollTimedOut(true);
          // ★ "오래 걸린다"가 아니다 — 상태를 못 읽은 것이다. 둘은 다른 사건이다.
          setErr("상태를 확인하지 못했어요 — 새로고침해 주세요");
        }
      },
    });
  }

  // 진입·새로고침 복원 — 아직 읽지 않은 컷이 남아 있으면 폴링을 잇는다.
  //
  // ★ 말하는 프로젝트는 폴링할 것이 없다 — 소리를 아예 안 만들기 때문이다(클립이 만든다).
  // 그 프로젝트는 스킵을 마치면 status 는 "voice" 인데 컷에 audio 도 voice_error 도 없어
  // 아래 조건이 전부 참이 된다: busy 가 서서 아래 갈래의 유일한 전진 버튼이 잠기고,
  // 오지 않을 소리를 5분 동안 헛폴링하다 "오래 걸리고 있어요"라는 거짓 오류를 띄운다.
  useEffect(() => {
    const cuts = project?.cuts || [];
    const waiting =
      !projectSpeaks(project) && cuts.length > 0 && cuts.some((c) => !c.audio && !c.voice_error);
    if (project?.status === "voice" && !stopRef.current && !pollTimedOut && waiting) {
      setBusy(true);
      beginPolling();
    }
  }, [project?.status, project?.cuts]);

  // 분할이 끝나기를 기다린다 — 컷이 생기면 아래 화면이 그대로 열린다.
  // ②대본과 같은 방식이다: 기다리는 동안은 가벼운 /status 만 보고, 컷이 생긴 뒤에만
  // load(id) 로 통짜를 받는다(실측 13,236 → 35 bytes).
  useEffect(() => {
    if (!splitting) return;
    const stop = startPolling({
      url: `/api/projects/${id}/status`,
      // ★ 이 가벼운 대기 루프에는 지금 **상한도 실패 카운트도 없다**(실측: startedAt·
      //    failures 가 아예 없었다). 기본값을 그대로 받으면 5분 상한과 연속 5회 중단이
      //    새로 생긴다 — 이 자리는 동작을 옮기기만 하는 곳이라 그러면 안 된다.
      //    컷 분할이 5분을 넘기면 화면이 조용히 멈춘 채 영영 안 갱신된다(알릴 onStop 도 없다).
      timeoutMs: Infinity,
      maxFailures: Infinity,
      // ★ 통짜를 **실제로 받아온 뒤에만** 끝낸다. 받아오기가 거절당했는데(네트워크 한 번
      //    끊김) 그 회차에 끝내 버리면 project 가 그대로라 splitting 도 그대로고, effect
      //    deps 도 안 바뀌고, 이 루프를 되살릴 사람도 없다 — 화면이 "나누는 중이에요"에서
      //    영영 안 움직인다. 거절하면 false 를 돌려 다음 주기가 다시 받아 온다.
      onTick: async (st) => {
        if (!(st.cut_count > 0 || st.cuts_error)) return false;
        try { await load(id); return true; } catch { return false; }
      },
    });
    return stop;
  }, [splitting, id]);

  // 분할이 실패한 뒤의 다시 시도 — 컷이 비어 있을 때만 서버가 받아 준다
  async function retrySplit() {
    setErr(""); setBusy(true);
    const res = await fetch(`/api/projects/${id}/cuts`, { method: "POST" });
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error || "다시 시도하지 못했어요");
    await load(id).catch(() => {});
    await reloadMe().catch(() => {});
    setBusy(false);
  }

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
    await reloadMe().catch(() => {});
    beginPolling();
  }

  // 다시 읽는 동안 잠근다 — 표시가 없으면 눌러도 아무 일이 없어 보여 한 번 더 누르게 된다
  async function regen(idx) {
    if (regening !== null) return;
    setErr(""); setRegening(idx);
    try {
      const res = await fetch(`/api/projects/${id}/voice/${idx}/regen`, { method: "POST" });
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
  const madeAny = cuts.some((c) => c.audio);
  const doneCount = cuts.filter((c) => c.audio).length;
  const totalSeconds = cuts.reduce((s, c) => s + (Number(c.seconds) || 0), 0);
  // 문장을 고친 뒤 옛 문장을 읽은 소리가 남아 있으면 다음으로 보내지 않는다
  const staleCount = cuts.filter(isAudioStale).length;
  // 이 영상의 정가 — 길이마다 다르다. 목소리 시작이 이 값을 받는 자리다.
  // ★ 화질까지 함께 본다 — 안 넘기면 1080p 프로젝트가 화면에 720p 값(160)을 적고
  //   실제로는 360 이 깎인다. 청구는 lib/charges.js 가 같은 출처(resolutionForProject)를 본다.
  const price = videoPrice(
    project?.settings?.target_seconds,
    modelIdForProject(project),
    resolutionForProject(project),
  );

  // 판정은 lib/progress 하나가 낸다 — 화면은 그린다.
  const gen = generationState({
    // ★ 여기의 done 은 "아직 기다릴 것이 남았나"의 답이다 — 그래서 **실패로 끝난 컷도
    //   끝난 것으로 센다**(isCutDone 이 audio ‖ voice_error 를 본다). 위의 doneCount 는
    //   사장님께 "몇 개를 읽었는지" 말하는 다른 숫자라 성공만 센다. 둘을 합치면
    //   실패 컷 하나 때문에 정상 종료한 낭독이 영영 "멈춤"으로 읽힌다.
    done: cuts.filter((c) => isCutDone(c, "voice")).length,
    total: cuts.length,
    error: firstError({ ...project, ...(status || {}) }, "voice"),
    phase: status?.progress?.phase ?? project?.progress?.phase ?? null,
    stepPhase: "voice",
    // 임계까지의 시간은 **서버가 뺀 값**을 읽는다 — 브라우저가 자기 시계로 빼면
    // 시계가 어긋난 PC 에서 시작하자마자 "멈췄어요"가 뜬다.
    stalledForMs: status?.stalled_for_ms ?? null,
    busy,
  });

  // 대본 승인 직후 이 화면에 도착하면 컷이 아직 없다 — 분할이 도는 중이다.
  // 분할은 대본 승인이 띄우고(POST /cuts), 여기서는 컷이 생기기를 기다리기만 한다.
  if (!cuts.length) {
    if (splitting) {
      return (
        <section className="panel panel--narrow">
          <h2>대본을 컷으로 나누는 중이에요</h2>
          <p className="pgsub">잠시만요 — 나뉜 컷부터 차례로 읽어 드립니다</p>
        </section>
      );
    }
    return (
      <section className="panel panel--narrow">
        <p className="pgsub warn">
          {project.cuts_error || "컷을 나누지 못했어요"}{" "}
          <button className="mini" onClick={retrySplit} disabled={busy}>다시 시도</button>
        </p>
      </section>
    );
  }

  // 말하는 프로젝트에는 이 단계가 없다(lib/steps.js 의 stepsFor). 주소를 직접 치고
  // 들어온 경우만 여기 닿으므로 화면을 그리지 않는다.
  //
  // ★ 되돌려보내는 것은 **여기가 아니라 레이아웃 가드**다(app/create/[id]/layout.js).
  //   stepFromPathname 이 /voice 를 짚고 isReachable("voice", project) 가 이제 거짓이라
  //   (stepsFor 가 목록에서 뺀다) 가드가 effect 안에서 replace 한다.
  //   여기서 또 부르면 **그리는 중에 이동**하는 꼴이라 App Router 가 경고하고 개발 모드에서
  //   맴돌 수 있다. 판정은 그대로 두고 화면만 접는다.
  if (projectSpeaks(project)) return null;

  return (
    <section className="panel panel--narrow">
      <h2>목소리를 입힙니다 <span className="badge vlm">목소리</span></h2>
      {err && <p className="pgsub warn">{err}</p>}

      {/* 되는 중·멈춘 것 같음·실패를 서로 다른 말로 알린다 — 전에는 셋이 다 침묵이라
          사장님이 무슨 일이 나는지 알 수 없었다. 판정은 위의 gen 하나가 이미 냈다. */}
      {gen.kind === "running" && (
        <p className="pgsub">
          <span className="spinner" aria-hidden="true" /> 컷 {gen.done}/{gen.total} 읽는 중이에요
        </p>
      )}

      {gen.kind === "stalled" && (
        <p className="pgsub warn">
          ⚠ 읽기가 멈춰 있는 것 같아요 — 컷 {gen.done}/{gen.total}에서 더 나아가지 않고 있어요.
          {" "}아래에서 컷별로 다시 읽혀 보세요.
        </p>
      )}

      {/* err 에 이미 같은 말이 떠 있으면 두 번 말하지 않는다. 새로고침으로 들어와
          err 이 빈 채 문서에만 실패가 남아 있는 경우가 이 문단이 필요한 자리다. */}
      {gen.kind === "failed" && !err && (
        <p className="pgsub warn">⚠ {gen.reason.message}</p>
      )}

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
                  {/* 길이·재생성 횟수와 [다시 읽기]는 한 줄에 둔다 — 셋 다 이 낭독 하나에 대한 것이다 */}
                  <div className="badges">
                    <span className="badge ai">{c.audio.seconds}초</span>
                    {isAudioStale(c) && (
                      <span className="badge warn">
                        문장을 고친 뒤라 소리가 옛 문장이에요 — 다시 읽히면 됩니다
                      </span>
                    )}
                    {/* 남은 횟수는 항상 보인다 — 상한에 언제 닿는지 누르기 전에 알아야 한다.
                        값도 함께 적는다: 컷마다 첫 회는 공짜고 둘째부터 크레딧이 나간다.
                        ★ 아래 값에 모델을 안 넘긴다 — 목소리 재생성 값은 영상 모델과 무관하다
                        (REGEN_PRICE.voice 는 표가 아니라 숫자 하나다). 클립만 모델을 탄다 */}
                    <span className="badge ai">
                      다시 읽음 {c.voice_regen_count || 0}/{MAX_REGEN_PER_CUT}
                    </span>
                    <button
                      className="mini"
                      disabled={busy || regening !== null || (c.voice_regen_count || 0) >= MAX_REGEN_PER_CUT}
                      onClick={() => regen(c.idx)}
                    >
                      {regening === c.idx
                        ? "읽는 중…"
                        : showCredits ? `다시 읽기 · ${priceLabel(regenPrice("voice", c.voice_regen_count || 0))}` : "다시 읽기"}
                    </button>
                  </div>
                </>
              ) : c.voice_error ? (
                <div className="badges">
                  <span className="script-src warn">{c.voice_error}</span>
                  <button className="mini" disabled={busy} onClick={() => regen(c.idx)}>
                    다시 읽기
                  </button>
                </div>
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
              {/* ★ 돈이 나가는 첫 문이 여기다. 단계별 흐름에서 영상 정가를 받는 자리가
                  ④그림에서 ③목소리로 앞당겨졌다(POST /voice 가 requireVideoCharge 를 부른다) —
                  누르기 전에 값을 알아야 한다. 이미 낸 프로젝트(자동 관통을 하다 멈춘 경우 등)
                  에는 적지 않는다: 또 받는 것처럼 읽힌다. charged 는 서버가 장부에서 판정한다. */}
              <span className="hint">
                컷 {cuts.length}개를 골라주신 목소리로 읽어요
                {showCredits && !project.charged && ` · 여기서 영상 정가 ${price} 크레딧이 나가요`}
              </span>
              <button className="cta" disabled={busy} onClick={start}>
                {busy ? "읽는 중…" : !showCredits || project.charged ? "목소리 만들기" : `목소리 만들기 · ${price} 크레딧`}
              </button>
            </>
          ) : (
            <>
              {staleCount > 0 && (
                <span className="hint">고친 문장 {staleCount}개를 다시 읽혀 주세요</span>
              )}
              {/* ★ 가드와 **같은 판정**을 쓴다(isReachable). 화면이 여는 문과 가드가
                  닫는 문이 갈리면 사장님은 넘어가다가 되돌아온다 — 그 어긋남이 실제로
                  났고(2026-08-13), 원인은 audio 는 다 저장됐는데 status 는 아직
                  "cuts" 인 창이었다. 판정을 한 벌로 두면 그 창에서 버튼이 저절로 잠긴다. */}
              <button
                className="cta"
                disabled={busy || doneCount === 0 || staleCount > 0 || !isReachable("images", project)}
                onClick={() => router.push(`/create/${id}/images`)}
              >
                이미지 만들러 가기 →
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
