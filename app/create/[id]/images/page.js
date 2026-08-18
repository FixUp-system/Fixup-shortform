"use client";

// ④ 이미지 — 승인 게이트 (컷별 이미지 확인·재생성)
//
// 컷 분할은 여기가 아니라 ②시나리오 확정이 한다. 다만 **분할이 끝나기 전에 이 화면에 올 수
// 있다** — 말하는 모델에는 ③목소리가 없어 확정 뒤 곧장 여기다(아래 대기 루프).
// 그림은 컷당 후보 2장이라 가장 비싸므로, 사장님이 버튼을 눌러야 시작한다.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import { useMe } from "../../../../components/MeContext";
import BackButton from "../../../../components/BackButton";
import { isImageStale, isReachable } from "../../../../lib/steps";
// ★ 프롬프트는 **서버와 같은 함수**로 만든다 — 화면이 자기 규칙으로 다시 만들면 사장님이
//   보는 것과 실제로 나가는 것이 갈린다. 본문 판정도 같은 자리에서 온다(promptBodyOf).
//   이 사슬에는 `fs` 가 없다(tests/prompt-editing-ui.test.js 가 그 그물을 친다).
import { buildImagePrompt, promptBodyOf } from "../../../../lib/cuts";
// 상한과 값은 가격표 한 곳에서 온다(import 0 개의 순수 모듈이라 화면에서 안전하다).
import { MAX_REGEN_PER_CUT, priceLabel, regenPrice, videoPrice } from "../../../../lib/pricing";
import { modelIdForProject, resolutionForProject } from "../../../../lib/clip-limits";
// 폴링 한 벌·판정 한 벌·오류 필드 표 한 벌. 화면은 그리기만 한다 —
// 같은 판정을 화면마다 손으로 적었을 때 조용히 갈렸고, 그 어긋남이 이 화면이
// images_error 를 영영 못 보던 버그였다(2026-08-14).
import { startPolling } from "../../../../lib/poll";
import { generationState, isCutDone } from "../../../../lib/progress";
import { firstError } from "../../../../lib/step-errors";

// 그림이 아직 없는 자리에 뭐라고 쓸지.
// "생성 중…"은 **실제로 도는 동안에만** 쓴다 — 누르기 전에도 그렇게 적혀 있으면
// 자동으로 만들어지는 줄 알고 기다리게 된다(아무 일도 안 일어나는데).
//
// 모듈 스코프에 둔다. 컷 목록과 미리보기 패널이 **서로 다른 컴포넌트**인데 둘 다 이것을 쓴다.
// 본 컴포넌트 안에 두면 PreviewPane 에서 ReferenceError 로 화면이 통째로 죽는다(실제로 죽었다).
const placeholder = (state) =>
  state === "needs_attention" ? "품질 확인 필요"
    : state === "generating" ? "생성 중…"
    : "아직 그리기 전";

// 실린 사진을 사장님이 알아볼 이름으로 부른다.
// 준비된 인물 사진은 파일명이 없다 — 그건 우리가 넣은 것이라 이름을 말해도 소용이 없다.
//
// 모듈 스코프에 둔다 — 컷 목록과 미리보기 패널이 **서로 다른 컴포넌트**인데 둘 다 이것을
// 쓴다(placeholder 와 같은 이유다. 본 컴포넌트 안에 두면 PreviewPane 이 통째로 죽는다).
const refNames = (refs) =>
  (refs || []).map((r) => (r.mine ? r.name || "올린 사진" : "준비된 인물 사진")).join(", ");

export default function ImagesStepPage() {
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
  // 접어 둔 실패의 **문구**를 들고 있는다(접었는가/아닌가의 boolean 이 아니다).
  // boolean 빗장이면 한 번 접은 뒤에 도착한 진짜 실패가 영영 안 뜬다 — 이 계획이
  // 드러내려는 바로 그 실패가 조용히 묻힌다. 무엇을 접었는지 알아야 그것만 감춘다.
  const [dismissedMsg, setDismissedMsg] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null); // 우측 큰 미리보기로 볼 컷
  // ★ 다시 만드는 중인 컷 — **로컬로 들고 있는다**(⑤영상과 같은 모양, 2026-08-18).
  //   컷의 state 를 낙관적으로 generating 으로 바꾸는 것만으로는 부족했다: 곧바로 이어지는
  //   load(id) 가 서버 값으로 덮으면 표시가 사라져, 누른 흔적이 화면에서 없어진다.
  //   사장님 지적이 정확히 그것이었다 — "버튼이 눌린 건지 확인이 안 돼."
  const [regening, setRegening] = useState(null);
  const [status, setStatus] = useState(null); // 마지막 상태 응답 — 심장박동이 여기 온다
  const stopRef = useRef(null);

  // 언마운트 정리 — ref까지 비운다. 비우지 않으면 (dev StrictMode의 재마운트처럼) 다시 마운트됐을 때
  // "이미 돌고 있음"으로 오인해 폴링이 되살아나지 않는다.
  useEffect(() => () => { stopRef.current?.(); stopRef.current = null; }, []);

  function beginPolling() {
    stopRef.current?.();
    setPollTimedOut(false);
    stopRef.current = startPolling({
      url: `/api/projects/${id}/cuts/status`,
      onTick: (st) => {
        setStatus(st);
        setProject((p) => ({
          ...p, status: st.status, cuts: st.cuts,
          cuts_error: st.cuts_error, images_error: st.images_error,
        }));
        // 실패했으면 더 두드릴 것이 없다
        if (firstError(st, "images")) return true;
        const pending = (st.cuts || []).some((c) => ["pending", "generating"].includes(c.state));
        return !!st.cuts?.length && !pending;
      },
      onStop: ({ timedOut }) => {
        // ★ 여기서 반드시 비운다. startPolling 이 돌려주는 것은 **떼는 함수**라 영원히
        //   truthy 다 — 안 비우면 스스로 끝난 폴링을 "아직 돌고 있음"으로 오인해
        //   다시 시작할 수 없다.
        stopRef.current = null;
        setBusy(false);
        if (timedOut) {
          setPollTimedOut(true);
          // ★ "오래 걸린다"가 아니다 — 상태를 못 읽은 것이다. 둘은 다른 사건이고,
          //   전에는 같은 문구를 써서 사장님이 생성이 느린 줄 알았다.
          setErr("상태를 확인하지 못했어요 — 새로고침해 주세요");
        }
      },
    });
  }

  // 진입·새로고침 복원: **만드는 중인** 컷이 남아 있으면 폴링을 잇는다.
  //
  // generating 만 본다. pending 은 "아직 시작 안 함"이기도 하다 —
  // 목소리를 마치면 컷이 pending 인 채로 이 화면에 오는데, 그때 폴링을 걸면
  // 화면이 busy 로 잠겨 [이미지 만들기] 버튼이 사라지고 영원히 기다린다(실제로 그랬다).
  useEffect(() => {
    const cuts = project?.cuts || [];
    const running = cuts.some((c) => c.state === "generating");
    if (running && !project.images_error && !stopRef.current && !pollTimedOut) {
      setBusy(true);
      beginPolling();
    }
  }, [project?.status, project?.cuts, project?.images_error]);

  // 컷 분할이 끝나기를 기다린다 — ③목소리의 같은 루프와 **같은 모양**이다
  // (app/create/[id]/voice/page.js 의 "분할이 끝나기를 기다린다").
  //
  // ★ 왜 ④에도 필요한가: 말하는 모델(기본 Seedance)에는 ③목소리 단계가 아예 없다
  //   (lib/steps.js stepsFor). 그래서 ②시나리오에서 확정하면 컷이 아직 나뉘는 중인 채로
  //   **곧장 이 화면**에 온다 — 기다리지 않으면 "컷이 없다"는 화면이 떠서, 사라진 단계를
  //   하라고 시키는 안내가 된다. 곁길이 아니라 이제 이쪽이 주경로다.
  const splitting =
    project?.status === "cuts" && (project?.cuts || []).length === 0 && !project?.cuts_error;
  useEffect(() => {
    if (!splitting) return;
    const stop = startPolling({
      url: `/api/projects/${id}/status`,
      // ★ 이 대기 루프에는 상한도 실패 카운트도 두지 않는다 — 기본값을 받으면 5분 상한과
      //   연속 5회 중단이 새로 생겨, 분할이 길어지면 화면이 아무 말 없이 얼어붙는다
      //   (알릴 onStop 도 없다). ③목소리·②대본의 같은 루프와 같은 값이다.
      timeoutMs: Infinity,
      maxFailures: Infinity,
      // ★ 통짜를 **실제로 받아온 뒤에만** 끝낸다. 받아오기가 거절당했는데(네트워크 한 번
      //   끊김) 그 회차에 끝내 버리면 project 가 그대로라 splitting 도 그대로고, deps 도
      //   안 바뀌어 이 루프를 되살릴 사람이 없다 — "나누는 중"에서 영영 안 움직인다.
      onTick: async (st) => {
        if (!(st.cut_count > 0 || st.cuts_error)) return false;
        try { await load(id); return true; } catch { return false; }
      },
    });
    return stop;
  }, [splitting, id]);

  // 분할이 실패한 뒤의 다시 시도 — 컷이 비어 있을 때만 서버가 받아 준다(③목소리와 같다)
  async function retrySplit() {
    setErr(""); setBusy(true);
    const res = await fetch(`/api/projects/${id}/cuts`, { method: "POST" });
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error || "다시 시도하지 못했어요");
    await load(id).catch(() => {});
    setBusy(false);
  }

  // 그림 만들기 시작 — 컷당 후보 2장이라 가장 비싼 단계다. 눌러야 나간다.
  async function start() {
    // 다시 만들기를 시작하면 접어 둔 것은 무효다 — 안 풀면 같은 문구의 실패가 또 나도 안 뜬다.
    setErr(""); setPollTimedOut(false); setDismissedMsg(null); setBusy(true);
    const res = await fetch(`/api/projects/${id}/images`, { method: "POST" });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "시작하지 못했어요");
      setBusy(false);
      return;
    }
    await load(id).catch(() => {});
    await reloadMe().catch(() => {});
    beginPolling();
  }

  // 실패가 남은 경우의 빠져나갈 길. 다시 [이미지 만들기]를 누르면 409로 막힌다(만든 그림을
  // 지우지 않으려고). images_error를 지우는 서버 경로도 없다 — load만으로는 같은 실패가 돌아온다.
  // 그래서 화면에서 접고, 최신 상태를 한 번 받아온 뒤 컷별 [다시 생성]으로 이어가게 한다.
  //
  // ★ 접기가 하는 일은 **띠지를 감추는 것 하나**다. 판정(stalled)은 건드리지 않는다 —
  //   건드리면 아직 generating 인 컷이 다시 잠겨, 이 버튼이 약속한 "컷별로 다시 만들기"를
  //   바로 그 버튼이 막는다. 그리고 지금 접은 문구만 기억한다: 그 뒤에 새로 난 실패는
  //   그대로 보여야 한다.
  async function dismiss() {
    // 띠지에 실제로 적힌 문구(분류를 거친 쪽)를 기억한다 — 날 문구를 넣으면 비교가 어긋나
    // 접었는데도 그대로 남는다.
    setErr(""); setDismissedMsg(gen.kind === "failed" ? gen.reason.message : null);
    await load(id).catch(() => {});
    await reloadMe().catch(() => {});
  }

  async function regen(idx, instruction) {
    // 두 번 눌리면 값이 두 번 나간다 — 도는 동안은 받지 않는다.
    if (regening !== null) return;
    setErr("");
    setRegening(idx);
    setProject((p) => ({ ...p, cuts: p.cuts.map((c) => c.idx === idx ? { ...c, state: "generating" } : c) }));
    try {
      const res = await fetch(`/api/projects/${id}/cuts/${idx}/regen`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(instruction ? { instruction } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setErr(data.error || "다시 만들지 못했어요");
      await load(id).catch(() => {});
      await reloadMe().catch(() => {});
    } finally {
      // ★ **반드시 내린다.** 실패한 채로 두면 그 컷이 영영 잠겨, 다시 시도할 길이
      //   새로고침뿐이다(⑤영상이 같은 이유로 finally 를 쓴다).
      setRegening(null);
    }
  }

  // 컷별 프롬프트 덮어쓰기 저장. editSentence 와 같은 모양이다 — 같은 PATCH 자리다.
  //
  // ★ **빈 문자열을 보내는 것이 "원래대로"의 구현이다** — 서버가 필드를 지운다
  //   (app/api/projects/[id]/route.js). 별도 필드를 두지 않기로 한 설계다.
  // ★ 오류를 삼키지 않는다 — 길이 상한을 넘으면 400 이 오고, 그 문구를 안 띄우면 사장님은
  //   저장된 줄 알고 다음 단계로 간다(그 값은 유료 호출로 나가지 않는다).
  async function savePrompt(idx, image_prompt) {
    setErr("");
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cut: { idx, image_prompt } }),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "저장하지 못했어요");
      return;
    }
    await load(id).catch(() => {});
  }

  async function editSentence(idx, sentence) {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cut: { idx, sentence } }),
    });
    await load(id).catch(() => {});
    await reloadMe().catch(() => {});
  }

  const cuts = project.cuts || [];

  // ── 올린 사진이 실제로 어디에 실렸는가 ────────────────────────────────
  //
  // ★ 이 판정은 **서버만 할 수 있다** — resolveCutRefs → 사진 읽기가 `fs`·Storage 를 끈다.
  //   그래서 이 화면은 사장님이 사진 5장을 올렸는데 한 장만 실렸다는 사실을 지금까지 한 마디도
  //   못 했다("레퍼런스가 반영이 안 된다"고 읽힌다). 컷 전체를 한 번에 받는다 —
  //   컷마다 물으면 요청이 컷 수만큼 늘고 같은 사진을 컷마다 다시 내려받는다.
  // 못 받으면 아무것도 그리지 않는다(null 그대로) — 틀린 말보다 침묵이 낫다.
  const [refUse, setRefUse] = useState(null);
  useEffect(() => {
    if (!cuts.length) return;
    let alive = true;
    fetch(`/api/projects/${id}/refs`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setRefUse(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [id, cuts.length]);
  // 사진을 안 올린 프로젝트에서는 이 이야기를 꺼내지 않는다 — 빈 칸이 생긴다.
  const hasPhotos = !!refUse?.photos_total;
  const usageOf = (idx) => (hasPhotos ? (refUse.cuts || []).find((u) => u.idx === idx) : null) || null;
  const unused = hasPhotos ? refUse.unused || [] : [];

  // 화면 설명이나 화풍을 고친 뒤 옛 값으로 그린 그림이 남아 있으면 클립을 사러 보내지 않는다.
  // ⚠️ filter(isImageStale) 로 넘기면 배열 번호가 project 자리에 들어가 화풍 판정이 죽는다.
  const staleCount = cuts.filter((c) => isImageStale(c, project)).length;
  const imgUrl = (c) =>
    c.source === "photo" ? project.material.photos.find((p) => p.id === c.photo_id)?.url : c.image?.url;
  // 우측 미리보기 대상 — 사용자가 고른 컷, 고르기 전에는 첫 컷.
  // "이미지가 준비된 첫 컷"이 아니라 그냥 첫 컷이다: 만드는 동안에도 자리가 잡혀 있어야
  // 첫 장이 완성되는 순간 그 자리에서 보인다(빈 오른쪽을 보다가 갑자기 채워지지 않게).
  const activeIdx = cuts.some((c) => c.idx === selectedIdx) ? selectedIdx : cuts[0]?.idx ?? null;
  const activeCut = cuts.find((c) => c.idx === activeIdx) || null;
  // busy 는 방금 [이미지 만들기]를 누른 경우다 — 그때는 아직 컷이 pending 이라 generating 이 없다.
  // busy 없이 pending 만으로 판단하면 시작 전과 구별되지 않는다.
  const generating = cuts.some((c) => c.state === "generating") || (busy && cuts.some((c) => c.state === "pending"));
  // 판정은 lib/progress 하나가 낸다 — 화면은 그린다.
  // 새로고침·재진입으로 들어오면 실패는 화면 상태가 아니라 프로젝트에 남아 있다 — 둘 다 본다.
  // 접기(dismiss)는 남은 실패를 화면에서만 접는 길이다(서버에 지우는 경로가 없다).
  const err0 = firstError({ ...project, ...(status || {}) }, "images");
  const gen = generationState({
    // ★ 술어를 여기 손으로 적지 않는다 — 파이프라인의 심장박동과 **같은 함수**를 쓴다.
    //   손으로 적었을 때 실제로 갈렸다: 실패한 컷(image 없이 needs_attention)을 안 세서
    //   정상 종료한 실행이 영구히 "멈춤"으로 읽혔다. 한 곳에서 오면 그 표류가 불가능하다.
    //   ⚠️ 이 done 은 "더 기다릴 것이 남았는가"의 답이다 — 사장님께 보이는
    //      "N개 만들었어요"(성공만 센 수)와는 다른 숫자다. 섞지 말 것.
    done: cuts.filter((c) => isCutDone(c, "images")).length,
    total: cuts.length,
    // ★ 접기를 여기 섞지 않는다. 판정은 실제 상태 그대로여야 한다 — 접었다고 오류를 null 로
    //   주면 판정이 running 으로 되살아나, 이미 죽은 파이프라인 옆에서 스피너가 돈다.
    //   감추는 일은 아래 띠지에서만 한다.
    error: err0,
    phase: status?.progress?.phase ?? project.progress?.phase ?? null,
    stepPhase: "images",
    // ★ 서버가 잰 값을 그대로 읽는다. 브라우저가 자기 시계로 빼면 사장님 PC 가
    //   3분 빠를 때 시작하자마자 "멈췄어요"가 뜬다.
    stalledForMs: status?.stalled_for_ms ?? null,
    busy,
  });
  // 파이프라인이 더 안 도는 상태(멈춤·실패)이거나 상태를 아예 못 읽었으면 기다릴 게 없다 —
  // 컷별 [다시 생성]을 열어준다.
  //
  // ★ 접기가 여기 끼어들면 안 된다. 서버에는 images_error 를 지우는 경로가 없어 접어도
  //   파이프라인은 여전히 죽어 있는데, 접기로 이 값이 false 가 되면 아직 generating 인 컷이
  //   busyCut 으로 다시 잠겨 "닫고 컷별로 다시 만들기"가 약속한 바로 그 일을 막는다.
  const stalled = pollTimedOut || gen.kind === "stalled" || gen.kind === "failed";
  // 아직 한 장도 만들지 않았는가 — 시작 버튼을 보일지 가른다
  const madeAny = cuts.some((c) => c.image || c.source === "photo");
  // 구성이 없는 영상에서는 컷의 문장이 곧 그림을 만드는 글이다(lib/cuts.js buildImagePrompt).
  // 구성이 있으면 그림의 바탕은 장면 설명이지만, 그때도 문장은 어떤 그림을 고를지에 쓰인다(lib/vlm.js).

  return (
    <div className="images-layout">
      <section className="panel images-col">
        {/* 컷이 없는 자리를 셋으로 가른다 — 나누는 중 / 나누다 실패 / 아직 확정 전.
            전에는 셋 다 없어진 ②대본 단계를 하라고 시키는 한 문장이었다. */}
        <h2>{splitting ? "컷을 나누는 중이에요"
          : cuts.length === 0 && project.cuts_error ? "컷을 나누지 못했어요"
          : cuts.length === 0 ? "시나리오를 먼저 확정해 주세요"
          : generating ? "컷별 이미지를 만들고 있어요"
          : !madeAny ? "컷마다 그림을 그립니다"
          : "컷별 이미지를 확인해 주세요"}</h2>
        {cuts.length > 0 && (
          <p className="pgsub">
            그림을 누르면 크게 보고 고칠 수 있어요
          </p>
        )}
        {/* ★ "올렸는데 안 쓰였다"를 말한다 — 2026-08-18 실측에서 사진 5장 중 1장만 실렸고
            화면은 아무 말도 하지 않았다. 안 쓰인 사진이 없으면(또는 사진을 안 올렸으면)
            이 자리는 아예 없다.
            ⚠️ 여기서 무엇을 해 준다고 말하지 않는다 — 이 화면에는 사진을 컷에 꽂아 주는
               조작이 없다. 못 하는 일을 권하는 것이 이 화면이 고쳐 온 병이다.
               대신 왜 그런지만 말한다. */}
        {unused.length > 0 && (
          <p className="pgsub warn">
            올린 사진 {refUse.photos_total}장 중 {unused.length}장은 어느 컷에도 안 쓰였어요 —{" "}
            {unused.map((u) => u.name).filter(Boolean).join(", ")}. 컷마다 가장 잘 맞는 사진
            한두 장만 골라서 그려요.
          </p>
        )}

        {/* 네 가지는 사장님에게 서로 다른 사건이다 — 도는 중 / 멈춤 / 실패 / 상태 못 읽음.
            전에는 전부 한 문단이라 무엇을 해야 할지 알 수 없었다. */}
        {err && <p className="pgsub warn">{err}</p>}

        {splitting && (
          <p className="pgsub">
            <span className="spinner" aria-hidden="true" /> 장면을 컷으로 나누고 있어요 — 잠시만요
          </p>
        )}
        {cuts.length === 0 && project.cuts_error && (
          <p className="pgsub warn">
            {project.cuts_error}{" "}
            <button className="mini" disabled={busy} onClick={retrySplit}>다시 시도</button>
          </p>
        )}

        {gen.kind === "running" && (
          <p className="pgsub">
            <span className="spinner" aria-hidden="true" /> 컷 {gen.done}/{gen.total} 만드는 중이에요
          </p>
        )}

        {gen.kind === "stalled" && (
          <p className="pgsub warn">
            {/* ★ 여기에는 버튼을 두지 않는다. 살아 있는 탈출구는 이미 오른쪽에 있고
                (멈춤 동안 stalled 가 참이라 컷별 버튼의 busyCut 잠금이 풀린다), 여기 하나 더
                두면 죽은 버튼이 된다 — 폴링이 도는 동안이라 busy 로 잠기거나, 눌러도 보이는
                변화가 없다. 무엇을 해 준다고 하고 안 하는 것이 이 화면이 고치려던 병이다. */}
            ⚠ 진행이 멈춰 있어요 — 컷 {gen.done}/{gen.total}에서 한참째 그대로예요.
            {/* ★ 가리키는 조작은 **멈춤 중에 실제로 눌리는 것**이어야 한다. 지시를 적어야
                열리는 쪽은 글을 쓰기 전에는 회색이고, 컷을 안 고르면 오른쪽에 사진 컷이
                올라와 버튼이 아예 없을 수도 있다 — 그래서 고르는 단계까지 말한다.
                (대괄호로 부르는 이름은 테스트가 실제 버튼과 대조한다) */}
            {" "}멈춘 컷을 눌러 오른쪽에서 [재생성]으로 이어가실 수 있어요.
          </p>
        )}

        {/* 접기는 **이 띠지 하나**만 감춘다. 접어 둔 문구와 다른 실패가 오면 접힌 적 없다는
            듯 뜬다 — 그 뒤에 새로 난 실패는 그대로 보여야 하기 때문이다. */}
        {gen.kind === "failed" && gen.reason.message !== dismissedMsg && (
          <p className="pgsub warn">
            ⚠ {gen.reason.message}{" "}
            {gen.reason.retryable && (
              <button className="mini" onClick={dismiss} disabled={busy}>닫고 컷별로 다시 만들기</button>
            )}
          </p>
        )}
        {cuts.map((c) => {
          const photo = project.material.photos.find((p) => p.id === c.photo_id);
          const img = imgUrl(c);
          // 사진 컷은 그 사진 자체가 화면이라 아래 배지가 할 말이 없다(옆의 "내 사진" 배지가
          // 이미 무엇인지 말한다). 레퍼런스로 참고하는 컷만 센다.
          const usage = c.source === "photo" ? null : usageOf(c.idx);
          return (
            <div className="scene" key={c.idx}>
              <div
                className={`thumb${c.source === "photo" ? " photo-mark" : ""}${c.idx === activeIdx ? " selected" : ""}`}
                onClick={() => setSelectedIdx(c.idx)}
              >
                <span className="num">{c.idx + 1}</span>
                {img ? <img src={img} alt="" /> :
                  <span className="ph">{placeholder(c.state)}</span>}
                {/* ★ 덮개는 그림 갈래 **밖**이다 — 안에 두면 그림이 있는 컷(재생성은 언제나
                    그 경우다)에서 안 뜬다. 옛 그림이 비쳐 보이게 두어 무엇을 다시 만드는지 안다. */}
                {(regening === c.idx || c.state === "generating") && (
                  <span className="frame-busy">
                    <span className="spinner" aria-hidden="true" /> 다시 만드는 중이에요
                  </span>
                )}
              </div>
              <div className="txt">
                “<span contentEditable suppressContentEditableWarning className="editable"
                  onBlur={(e) => {
                    const sentence = e.currentTarget.textContent.trim();
                    if (sentence && sentence !== c.sentence) editSentence(c.idx, sentence);
                  }}>{c.sentence}</span>”
                <div className="badges">
                  {/* ★ "AI 생성"·"레퍼런스 적용"·품질 판정은 걷어냈다(2026-08-13) — 전부 내부
                      상태라 사장님이 보고 할 일이 없다. 내 사진으로 만든 컷만 남긴다:
                      그건 사장님이 준 것이라 구별할 이유가 있다. */}
                  {c.source === "photo" && (
                    <span className="badge photo">내 사진 · {photo?.filename || ""}</span>
                  )}
                  <span className="badge ai">{c.seconds}초</span>
                  {/* ★ 이 컷에 실제로 실린 사진 — 장수와 이름을 함께 적는다. 한 장도 안
                      실렸으면 그렇다고 말한다: 그것이 사장님이 "반영이 안 된다"고 느끼던
                      바로 그 자리다. 값을 못 받았으면(usage 가 null) 아무것도 안 그린다. */}
                  {usage && (
                    <span className="badge">
                      {usage.refs.length > 0
                        ? `쓴 사진 ${usage.refs.length}장 · ${refNames(usage.refs)}`
                        : "올린 사진을 쓰지 않은 컷"}
                    </span>
                  )}
                  {usage?.missing > 0 && (
                    <span className="badge warn">
                      사진 {usage.missing}장을 못 읽어서 그림에 안 실렸어요
                    </span>
                  )}
                  {/* ★ 사유를 뭉뚱그리지 않는다. 낡음을 만드는 것은 화면 설명·화풍만이
                      아니다 — 이 컷의 프롬프트 덮어쓰기와 프로젝트 공통 지시(①자료)도
                      같은 배지를 띄운다.
                      ★ 판정 자리가 하나가 아니다 — `isImageStale`(lib/steps.js) 안에서
                      화면 설명은 `image.of`, 화풍은 `image.style_of`, 톤·전환은 `image.tone_of`,
                      그리고 프롬프트 덮어쓰기·공통 지시·무대·인물·제품은 `image.context_of`
                      (=`imageContextKey`)가 각각 판정한다. `imageContextKey` 만 보면
                      화면 설명과 화풍을 못 찾는다 — 그 둘은 거기 안 들어 있다.
                      옛 문구는 프롬프트를 고쳐 낡은 컷에 **틀린 사유**를 보여 줬다 —
                      재생성 자체는 정당하니 돈이 새는 것은 아니지만, 사장님이 무엇 때문에
                      낡았는지 오해하면 엉뚱한 값을 되돌리며 찾는다. */}
                  {isImageStale(c, project) && (
                    <span className="badge warn">
                      그림을 만든 뒤에 값이 바뀌었어요(화면 설명·화풍·프롬프트·공통 지시) — 다시 만들면 됩니다
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!generating && !busy && cuts.length > 0 && (
          <div className="step-actions">
            <BackButton stepKey="images" />
            <div className="fwd">
              {!madeAny ? (
                <>
                  {/* 정가는 프로젝트당 한 번이고, 단계별 흐름에서는 보통 ③목소리에서 이미
                      냈다(POST /voice 가 먼저 문을 연다). 그래서 charged 일 때는 적지 않는다 —
                      적으면 같은 값을 두 번 내는 것처럼 읽힌다. 안 낸 채 여기 도착한 경우
                      (③을 건너뛴 옛 프로젝트)에만 이 버튼이 정가를 받는다. */}
                  <button className="cta" disabled={busy} onClick={start}>
                    {busy
                      ? "그리는 중…"
                      : project.charged
                        ? "이미지 만들기"
                        : !showCredits
                          ? "이미지 만들기"
                          : `이미지 만들기 · ${videoPrice(project.settings?.target_seconds, modelIdForProject(project), resolutionForProject(project))} 크레딧`}
                  </button>
                </>
              ) : (
                <>
                  <span className="hint">
                    {staleCount > 0
                      ? `고친 화면 ${staleCount}개를 다시 그려 주세요`
                      : "이 그림에서 영상이 시작돼요"}
                  </span>
                  {/* ★ ③목소리와 같은 이유로 가드와 같은 판정을 쓴다 — 그림은 컷마다
                      저장되고 status 는 마지막에 한 번이라, 그 사이에 누르면 되돌아온다
                      (사용자가 ⑤영상에서도 같은 증상을 보고했다, 2026-08-13). */}
                  <button
                    className="cta"
                    disabled={staleCount > 0 || !isReachable("video", project)}
                    onClick={() => router.push(`/create/${id}/video`)}
                  >
                    영상 만들러 가기 →
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {activeCut && (
        <PreviewPane
          key={activeCut.idx}
          cut={activeCut}
          project={project}
          url={imgUrl(activeCut)}
          photoName={project.material.photos.find((p) => p.id === activeCut.photo_id)?.filename}
          usage={activeCut.source === "photo" ? null : usageOf(activeCut.idx)}
          aspect={project.settings?.aspect_ratio || "9:16"}
          stalled={stalled}
          onRegen={regen}
          regening={regening}
          onSavePrompt={savePrompt}
        />
      )}
    </div>
  );
}

// 비율별 프레임 스타일 — 미리보기가 실제 출력 비율을 그대로 보여준다.
// 폭을 뷰포트 높이로 제한해 세로가 길어도 화면을 넘지 않고 비율이 유지된다.
const ASPECT = {
  "9:16": { css: "9 / 16", r: 9 / 16 },
  "1:1": { css: "1 / 1", r: 1 },
  "16:9": { css: "16 / 9", r: 16 / 9 },
};
function frameStyle(aspect) {
  const a = ASPECT[aspect] || ASPECT["9:16"];
  return { aspectRatio: a.css, maxWidth: `calc((100vh - 210px) * ${a.r})` };
}

// 우측 큰 미리보기 + 컷별 수정. instruction 입력은 컷마다 초기화돼야 하므로
// 부모가 key={cut.idx}로 이 컴포넌트를 갈아끼운다(로컬 state가 자연히 리셋됨).
function PreviewPane({ cut, project, url, photoName, usage, aspect, stalled, onRegen, onSavePrompt, regening }) {
  const [instr, setInstr] = useState("");
  // ── 실제로 보내는 지시 ──────────────────────────────────────────────
  //
  // ★ 판정은 서버와 **같은 함수**다(promptBodyOf·buildImagePrompt). 화면이 문형을 한 벌 더
  //   들면 그날부터 보는 것과 나가는 것이 갈린다.
  // ★ 텍스트칸에 앉히는 씨앗은 **사장님이 저장한 날 글자**이고, 없으면 코드가 만든 본문이다.
  //   판정 결과(promptBodyOf)를 그대로 앉히면 안 된다 — 덮어쓰기 경로에서는 그 값에 코드가
  //   붙인 판형 절(`… vertical 9:16 composition.`)이 이미 들어 있어서, 저장할 때마다 그
  //   절이 한 벌씩 늘어난다(실측으로 확인한 함정이다).
  // ★ 꼬리는 전체에서 사장님 글자만큼 떼어 낸 것이다. 코드가 채운 마침표·판형 절이 꼬리
  //   쪽에 보이는 것이 맞다 — 그것도 코드가 붙이는 것이다.
  //   `startsWith` 는 lib/cuts.js 의 불변이고 테스트가 못 박는다(tests/prompt-override).
  const saved = typeof cut.image_prompt === "string" ? cut.image_prompt.trim() : "";
  // 덮어쓰기를 지운 컷의 본문 — "원래대로"가 텍스트칸에 되돌려 놓는 값이다.
  const generated = promptBodyOf("image", { ...cut, image_prompt: "" }, project);
  // ★ 씨앗을 **이름 하나로** 둔다. 텍스트칸의 초기값·꼬리를 떼는 기준·[저장] 잠금 판정이
  //   전부 이 값이어야 한다. 그중 하나만 `saved` 로 재면(그렇게 적혀 있었다) 덮어쓰기가 없는
  //   컷에서 **아무것도 안 고쳤는데 [저장]이 눌린다** — 그 순간 코드가 만든 본문이 덮어쓰기로
  //   굳어 화면 설명·화풍을 바꿔도 프롬프트가 안 따라오고, 각인이 뒤집혀
  //   "화면 설명이나 화풍을 고친 뒤라…" 라는 **틀린 사유로 컷당 $0.08 재생성을 권한다.**
  const seed = saved || generated;
  const [prompt, setPrompt] = useState(seed);
  // ⚠️ 레퍼런스 사진 문구는 화면에서 만들 수 없다 — 그 판정(lib/cast.js)이 `fs` 를 끈다.
  //    그래서 꼬리에 그 절이 빠질 수 있고, 아래 안내에 그렇게 적는다(없는 것처럼 보이면
  //    사장님이 "레퍼런스가 안 나간다"고 읽는다).
  const full = buildImagePrompt(cut, project, []);
  const fixedTail = full.startsWith(seed)
    ? full.slice(seed.length)
    : full.slice(promptBodyOf("image", cut, project).length);
  // ── 전문 복사 ────────────────────────────────────────────────────────
  //
  // 접힌 칸은 본문(텍스트칸)과 꼬리(문단)를 **따로** 보여 준다. 밖으로 가져가려면 두 곳을
  // 긁어 손으로 이어야 했고, 이으면서 순서가 뒤바뀌거나 꼬리가 빠지면 밖에서 돌려 본 결과가
  // 우리 결과와 달라도 왜 다른지 알 수 없다.
  //
  // ★ 잇는 값은 **화면에 보이는 두 토막 그대로**다(prompt + fixedTail). 여기서 조립 함수를
  //   다시 부르면 사장님이 방금 고친 본문이 빠진 옛 프롬프트가 복사된다 — 보는 것과
  //   가져가는 것이 갈리는, 이 화면이 처음부터 경계한 그 병이다.
  // ★ 꼬리는 본문에 딸리지 않는다(fixedTail 은 seed 기준) — 그래서 아직 저장하지 않은
  //   본문을 복사해도 "저장하면 나갈 글자"가 그대로 나온다.
  // ⚠️ 레퍼런스 사진 절은 여기에도 빠진다 — 화면이 그 판정을 못 하기 때문이다(위 주석).
  //    아래 안내가 이미 그 사실을 말한다.
  // ★ 꼬리는 **서버에서 받는다** — 레퍼런스 사진 절(`Attached reference images, in order: …`)은
  //   resolveCutRefs → readRefBytes 를 거쳐야 알 수 있고 그 판정이 fs·Storage 를 끈다.
  //   화면이 쥔 fixedTail 에는 그 절이 없다. 못 받으면 **그 사실을 말한다** — 조용히 화면
  //   꼬리로 돌아가면 사장님은 "정확한 전문"으로 알고 밖에서 돌린다.
  const [copyMsg, setCopyMsg] = useState("");
  async function copyAll() {
    let exact = null;
    let missing = 0;
    try {
      const res = await fetch(`/api/projects/${project.id}/cuts/${cut.idx}/prompt`);
      if (res.ok) {
        const got = await res.json();
        exact = got.tail;
        missing = got.missing || 0;
      }
    } catch {
      // 아래에서 화면 꼬리로 복사하고, 무엇이 빠졌는지 알린다
    }
    try {
      await navigator.clipboard.writeText(prompt + (exact ?? fixedTail));
      setCopyMsg(
        exact === null
          ? "복사했어요 — 다만 레퍼런스 사진 지시는 못 넣었어요"
          : missing > 0
            ? `복사했어요 · 사진 ${missing}장은 못 읽어서 그림에도 안 실려요`
            : "복사했어요"
      );
    } catch {
      // 클립보드는 브라우저가 막을 수 있다(권한·비보안 컨텍스트). 조용히 실패하면
      // 사장님은 복사된 줄 알고 빈 것을 붙인다.
      setCopyMsg("복사하지 못했어요 — 위 글을 직접 긁어 주세요");
    }
    setTimeout(() => setCopyMsg(""), 4000);
  }

  const isPhoto = cut.source === "photo";
  // ★ 로컬 표시(regening)를 **먼저** 본다. 서버 state 는 다시 읽는 순간 덮이므로 그것만
  //   보면 방금 누른 버튼이 도로 풀린다. `stalled` 예외는 서버 판정에만 건다 —
  //   멈춤이라고 해서 방금 누른 이 요청까지 열어 주면 값이 두 번 나간다.
  const busyCut = regening === cut.idx || (!stalled && cut.state === "generating");
  const atLimit = cut.regen_count >= MAX_REGEN_PER_CUT;
  // 컷마다 첫 회는 공짜, 둘째부터 값을 치른다 — 누르기 전에 보여 준다.
  // ★ 모델을 안 넘긴다 — 이미지 재생성 값은 영상 모델과 무관하다(REGEN_PRICE.image 는 표가
  //   아니라 숫자 하나다). 넘기려면 project 를 이 컴포넌트까지 끌고 와야 하는데, 값이 갈릴
  //   일이 없는 자리에 배선을 늘리지 않는다. 갈리게 되는 날 표가 먼저 바뀐다.
  const { me: meForPrice } = useMe();
  const showCredits = meForPrice?.gated !== false;
  const regenLabel = priceLabel(regenPrice("image", cut.regen_count || 0));

  return (
    <aside className="panel preview-pane">
      {/* ① 결과 — 무엇이 만들어졌는가 */}
      <div className="workbench-step">
      <div className="preview-frame" style={frameStyle(aspect)}>
        {url ? <img src={url} alt="" /> : <span className="ph">{placeholder(cut.state)}</span>}
        {/* 판정은 busyCut 하나다(로컬 표시를 먼저 보고, 서버 state 를 그다음에 본다) —
            버튼이 잠기는 조건과 화면이 말하는 조건이 갈리면 사장님이 둘 중 무엇을 믿을지 모른다. */}
        {busyCut && (
          <span className="frame-busy">
            <span className="spinner" aria-hidden="true" /> 다시 만드는 중이에요
          </span>
        )}
      </div>
      <div className="badges mt-md">
        {isPhoto && <span className="badge photo">내 사진 · {photoName || ""}</span>}
        <span className="badge ai">{cut.seconds}초</span>
      </div>
      <p className="preview-sentence">“{cut.sentence}”</p>

      {/* ★ 이 컷에 실제로 실린 사진. 값을 못 받았으면 이 줄 자체가 없다 —
          "모른다"를 "없다"로 적으면 사장님이 안 실렸다고 오해한다. */}
      {usage && (
        <p className="preview-note">
          {usage.refs.length > 0
            ? `이 컷에 쓴 사진: ${refNames(usage.refs)}`
            : "이 컷은 올린 사진 없이 그렸어요."}
          {usage.missing > 0 ? ` 사진 ${usage.missing}장은 못 읽어서 안 실렸어요.` : ""}
        </p>
      )}

      </div>

      {/* ② 고치기 — 사장님이 하는 일. 사진 컷은 고칠 것이 없어 안내 한 줄로 끝난다. */}
      {isPhoto ? (
        <p className="preview-note workbench-step">내가 올린 사진이라 그대로 쓰여요.</p>
      ) : (
        <div className="preview-edit workbench-step">
          {/* ★ 안내를 지웠다(2026-08-13) — 아래 입력칸이 예시까지 들고 같은 말을 한다.
              "문장이 그림의 재료"라는 뒷단 설명은 사장님이 알아야 할 일이 아니다. */}
          {/* ★ 수정사항 칸은 **접힌 칸 아래**다(2026-08-18 사장님 지시). 무엇을 고칠지 정하려면
              지금 무엇을 보내고 있는지를 **먼저** 봐야 한다 — 위에 있으면 프롬프트를 펼치기도
              전에 빈 칸부터 마주친다.
              ★ 여기 적은 말은 꼬리에 덧붙지 않는다. 위 지시문을 **다시 써서**(lib/prompt-revise.js)
                가리킨 것은 고치고 새 요구는 더한다 — 그 결과가 위 칸에 그대로 보인다. */}
          {cut.edit_instruction && <p className="preview-note">지난 수정 지시: {cut.edit_instruction}</p>}
          <textarea
            className="ref"
            placeholder="이 이미지에서 고치고 싶은 점을 적어주세요 — 예: 딸기라떼가 보이게, 컵을 더 작게, 손 빼기"
            value={instr}
            onChange={(e) => setInstr(e.target.value)}
          />
          {/* 만드는 중에는 글자로도 알린다 — 잠기기만 하면 눌렸는지 알 수 없어 또 누르게 된다 */}
          <div className="preview-actions">
            <button
              className="cta"
              disabled={atLimit || busyCut || !instr.trim()}
              onClick={() => onRegen(cut.idx, instr.trim())}
            >
              {busyCut ? "만드는 중…" : "이 지시로 다시 만들기"}
            </button>
            <button className="mini" disabled={atLimit || busyCut} onClick={() => onRegen(cut.idx)}>
              {busyCut ? "만드는 중…" : "재생성"}
            </button>
          </div>
          <span className="regen-note mono">
            {atLimit
              ? `더는 다시 만들 수 없어요 (${MAX_REGEN_PER_CUT}/${MAX_REGEN_PER_CUT})`
              : `다시 만듦 ${cut.regen_count}/${MAX_REGEN_PER_CUT}`}
          </span>

          {/* 접어 둔다 — 주경로는 위 "고치고 싶은 점" 칸이다. 이 자리는 직접 지시를 쓰는
              사장님을 위한 곁길이라, 펼치지 않으면 기본 흐름이 그대로다. */}
          {/* ③ 들여다보기 — 궁금할 때만 펼치는 곁길 */}
          <details className="prompt-edit workbench-step">
            <summary>실제로 보내는 지시</summary>
            {/* 고치는 것은 **본문**이다. 판형·글자 금지·레퍼런스 결속은 코드가 언제나 뒤에
                붙인다 — 무엇을 쓰든 지워지지 않는다. */}
            {/* ★★ **하나의 지시문으로 보인다**(2026-08-18 사용자 지시). 앞은 고칠 수 있고 뒤는
                코드가 붙이는 글이지만, 사장님에게는 모델이 받는 **문장 하나**다 — 사이에 안내나
                버튼이 끼면 서로 다른 두 개로 읽힌다. 그래서 편집칸과 꼬리를 한 상자로 잇고,
                조작(복사·글자수)은 그 아래로 내렸다.
                ★ 붙이는 것은 **보이는 방식**이다. 고치는 자리는 그대로 본문 하나 — 꼬리를
                  텍스트칸에 넣으면 저장할 때마다 꼬리가 두 벌이 된다(이 저장소가 못 박은 함정). */}
            <div className="prompt-one">
              <textarea
                className="ref mono"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
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
            {/* ★ 꼬리에는 사장님이 직접 쓴 글도 섞여 있다 — 프로젝트 공통 지시
                (settings.image_note)가 본문 뒤·계약 앞이라 이 블록 안에 나온다. "고칠 수
                없어요"만 적어 두면 자기가 쓴 문장을 못 고치는 것으로 읽는다. 고치는 자리를
                알려 준다. 원문자(①)는 쓰지 않는다 — tests/design-system.test.js 가 막는다. */}
            {/* ★ 2026-08-18 — 이 칸이 ①자료에서 **첫 화면**으로 옮겼다(만들 때 한 번 정한다).
                "자료 단계에서 고칠 수 있어요"는 그날부터 거짓이었다 — 없는 자리로 사장님을
                보내는 안내가 "고칠 수 있는 척하는 칸"보다 나을 것이 없다. 지금은 **못 고친다**는
                사실을 말한다. 고칠 자리를 다시 열게 되면 이 문구도 함께 되돌려야 한다. */}
            {/* ★ 공통 지시를 **따로 설명하지 않는다**(2026-08-18 사용자 지시). 고칠 자리가
                저장소 어디에도 없는 값이라, 그것이 프롬프트에 실린다는 사실은 우리 사정이다 —
                사장님이 할 수 있는 일이 하나도 없는 안내는 화면을 무겁게만 한다.
                값 자체는 **위 꼬리 문단에 글자로 함께 보인다** — 감추는 것이 아니라 설명을
                덜어내는 것이다(이 화면이 "폰트가 한 벌이라…"를 걷은 것과 같은 판단이다). */}
            <p className="preview-note">
              레퍼런스 사진을 쓰는 컷에는 그 사진에 대한 지시도 함께 붙어요.
            </p>
            {/* 고쳐도 지금 그림은 그대로다 — 반영하려면 다시 만들어야 하고 그때 값이 든다. */}
            <p className="preview-note warn">
              고쳐서 저장해도 지금 그림은 그대로예요 — 반영하려면 [재생성]으로 다시 만들어야
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
                  텍스트칸도 코드가 만든 본문으로 되돌려 놓는다(저장 뒤 다시 그려지지만,
                  이 컴포넌트는 컷이 안 바뀌면 다시 마운트되지 않는다). */}
              <button
                className="mini"
                disabled={busyCut || !saved}
                onClick={() => { setPrompt(generated); onSavePrompt(cut.idx, ""); }}
              >
                원래대로
              </button>
            </div>
          </details>

        </div>
      )}
    </aside>
  );
}
