"use client";

// ④ 이미지 — 승인 게이트 (컷별 이미지 확인·재생성)
//
// 컷 분할은 여기가 아니라 대본 승인이 한다. 이 화면에 올 때는 컷도 낭독 길이도 이미 있다 —
// 그림은 컷당 후보 2장이라 가장 비싸므로, 사장님이 버튼을 눌러야 시작한다.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import { useMe } from "../../../../components/MeContext";
import BackButton from "../../../../components/BackButton";
import { isImageStale, isReachable } from "../../../../lib/steps";
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
    setProject((p) => ({ ...p, cuts: p.cuts.map((c) => c.idx === idx ? { ...c, state: "generating" } : c) }));
    const res = await fetch(`/api/projects/${id}/cuts/${idx}/regen`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(instruction ? { instruction } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error);
    await load(id).catch(() => {});
    await reloadMe().catch(() => {});
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
        <h2>{cuts.length === 0 ? "대본을 먼저 만들어 주세요"
          : generating ? "컷별 이미지를 만들고 있어요"
          : !madeAny ? "컷마다 그림을 그립니다"
          : "컷별 이미지를 확인해 주세요"}</h2>
        {cuts.length > 0 && (
          <p className="pgsub">
            그림을 누르면 크게 보고 고칠 수 있어요
          </p>
        )}
        {/* 네 가지는 사장님에게 서로 다른 사건이다 — 도는 중 / 멈춤 / 실패 / 상태 못 읽음.
            전에는 전부 한 문단이라 무엇을 해야 할지 알 수 없었다. */}
        {err && <p className="pgsub warn">{err}</p>}

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
            {" "}오른쪽 그림 아래 [다시 만들기]로 이어서 하실 수 있어요.
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
          return (
            <div className="scene" key={c.idx}>
              <div
                className={`thumb${c.source === "photo" ? " photo-mark" : ""}${c.idx === activeIdx ? " selected" : ""}`}
                onClick={() => setSelectedIdx(c.idx)}
              >
                <span className="num">{c.idx + 1}</span>
                {img ? <img src={img} alt="" /> :
                  <span className="ph">{placeholder(c.state)}</span>}
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
                  {isImageStale(c, project) && (
                    <span className="badge warn">
                      화면 설명이나 화풍을 고친 뒤라 그림이 옛 값으로 그려진 거예요 — 다시 만들면 됩니다
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
          url={imgUrl(activeCut)}
          photoName={project.material.photos.find((p) => p.id === activeCut.photo_id)?.filename}
          aspect={project.settings?.aspect_ratio || "9:16"}
          stalled={stalled}
          onRegen={regen}
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
function PreviewPane({ cut, url, photoName, aspect, stalled, onRegen }) {
  const [instr, setInstr] = useState("");
  const isPhoto = cut.source === "photo";
  const busyCut = !stalled && cut.state === "generating";
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
      <div className="preview-frame" style={frameStyle(aspect)}>
        {url ? <img src={url} alt="" /> : <span className="ph">{placeholder(cut.state)}</span>}
      </div>
      <div className="badges mt-md">
        {isPhoto && <span className="badge photo">내 사진 · {photoName || ""}</span>}
        <span className="badge ai">{cut.seconds}초</span>
      </div>
      <p className="preview-sentence">“{cut.sentence}”</p>

      {isPhoto ? (
        <p className="preview-note">내가 올린 사진이라 그대로 쓰여요.</p>
      ) : (
        <div className="preview-edit">
          {/* ★ 안내를 지웠다(2026-08-13) — 아래 입력칸이 예시까지 들고 같은 말을 한다.
              "문장이 그림의 재료"라는 뒷단 설명은 사장님이 알아야 할 일이 아니다. */}
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
              {busyCut ? "만드는 중…" : showCredits ? `이 지시로 다시 만들기 · ${regenLabel}` : "이 지시로 다시 만들기"}
            </button>
            <button className="mini" disabled={atLimit || busyCut} onClick={() => onRegen(cut.idx)}>
              {busyCut ? "만드는 중…" : `그냥 다시 · ${regenLabel}`}
            </button>
          </div>
          <span className="regen-note mono">
            {atLimit
              ? `더는 다시 만들 수 없어요 (${MAX_REGEN_PER_CUT}/${MAX_REGEN_PER_CUT})`
              : `다시 만듦 ${cut.regen_count}/${MAX_REGEN_PER_CUT}`}
          </span>
        </div>
      )}
    </aside>
  );
}
