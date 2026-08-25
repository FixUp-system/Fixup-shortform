"use client";

// 3 그림 — 컷마다 한 장. app/film/[id]/[mode]/images/page.js 를 본으로 삼되, reel 은
// 방식이 없고(cuts 가 idx 로 갈린다, film 의 images[].key 가 아니다) 청구가 함께 붙는다
// (그림값이 영상 정가에 포함, app/api/reel/[id]/images/route.js 머리말).
//
// ★ 프로젝트는 레이아웃이 한 번 읽어 컨텍스트로 나눠 준다 — 여기서 자기 fetch 를 새로
//   만들면 같은 문서를 두 번 읽고 값이 갈린다.
//
// ★ 폴링이 없다. 그림 라우트는 **기다린다**(fire-and-forget 이 아니다) — 응답이 오면
//   그때 문서를 다시 읽는다. 그래서 이 화면에는 루프가 필요 없다.
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useReelProject } from "../layout";
import { REEL_STEPS, reelStepHref } from "../../../../lib/reel/steps";
import ReelBack from "../../../../components/ReelBack";
import {
  reelOf, canDrawReelImages, isReelRendering, isImagesLocked, imageTriesLeft, imageTriesLeftLifetime,
} from "../../../../lib/reel/doc";
import { reelSheetUrl } from "../../../../lib/reel/oneshot";

export default function ReelImagesPage() {
  const { id } = useParams();
  // ★ 제목은 **표가 쉠다** — 화면이 손으로 적으면 라벨을 바꿀 때 여기만 낡는다.
  const stepLabel = REEL_STEPS.find((x) => x.key === "images")?.label || "";
  const { project, reload } = useReelProject();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  // ★ 사장님이 한국어로 적는 수정 요청. 보낸 뒤에는 비운다 — 남아 있으면 다음에
  //   또 누를 때 같은 요청이 두 번 실린다(②시나리오와 같은 처방).
  const [note, setNote] = useState("");

  const reel = reelOf(project);
  const cuts = project?.cuts || [];
  // ★ 스토리보드 원본 — 칸을 자를 때 라우트가 컷마다 같은 주소를 적어 둔다.
  //   ★★ 2026-08-25 — 판독을 lib 으로 뺐다(reelSheetUrl). ④·⑤ 화면이 같은 주소를 읽어
  //     "통짜로 구울 수 있는가"를 판정하므로, 여기서 손으로 다시 찾으면 두 벌이 된다.
  const sheetUrl = reelSheetUrl(cuts);
  const scenario = project?.scenario;
  const rendering = isReelRendering(reel);
  const drawingNow = isImagesLocked(reel) || !!busy;
  const triesLeft = imageTriesLeft(reel);
  const triesLeftLifetime = imageTriesLeftLifetime(reel);
  // 문 판정은 순수 함수 하나다 — 서버(app/api/reel/[id]/images/route.js)와 같은 값을 본다.
  const canDraw = canDrawReelImages(reel);
  const hasImages = cuts.some((c) => c?.image?.url);

  // only 를 주면 그 컷만, 안 주면 안 그려진 컷 전부. 배열이 아닌 값을 보내면 라우트가 400 이다.
  async function draw(only) {
    setBusy("images"); setErr("");
    const res = await fetch(`/api/reel/${id}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ★ 요청이 있을 때만 실는다 — 안 실으면 지문이 예전과 글자 그대로다.
      body: JSON.stringify({ ...(only ? { only } : {}), ...(note.trim() ? { note: note.trim() } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "그림을 만들지 못했어요");
    // 성공이든 실패든 문서를 다시 읽는다 — 실패도 이미 만든 그림은 남아 있을 수 있다.
    await reload(id).catch((e) => setErr(e.message));
    setNote("");
    setBusy("");
  }

  const promptsStep = REEL_STEPS.find((s) => s.key === "prompts");

  // ★ 그리는 버튼은 **한 번만 적는다** — 자리가 둘(프롬프트 칸 안 / 그림이 아직 없을 때의
  //   실행줄)이지만 둘은 동시에 안 뜬다.
  // ★ hasImages 일 때는 **명시로 전부**를 보낸다(all idx) — only 를 안 주면 라우트는
  //   "안 그려진 컷만"(초안 채우기)으로 읽는다(app/api/reel/[id]/images/route.js 의 wanted
  //   판정). null 을 그대로 보내면 [전부 다시 만들기]가 실은 아무 것도 새로 안 그린다.
  const drawBtn = (
    <button
      className="mini"
      disabled={!canDraw || drawingNow || !scenario?.text}
      onClick={() => draw(hasImages ? cuts.map((c) => c.idx) : null)}
    >
      {drawingNow ? "그리는 중…" : hasImages ? "다시 만들기" : "그림 만들기"}
    </button>
  );

  return (
    <section className="panel panel--wide">
      <h2>{stepLabel}</h2>
      {err && <p className="pgsub warn">{err}</p>}
      {reel.error && <p className="pgsub warn">{reel.error}</p>}
      {drawingNow && <p className="pgsub">그림을 그리는 중이에요 — 다 되면 여기에 나타나요.</p>}
      {rendering && <p className="pgsub warn">지금 영상을 만드는 중이에요 — 끝난 뒤에 다시 그릴 수 있어요.</p>}

      {/* ★ 남은 횟수·값 안내를 걷어냈다(2026-08-25 사장님 지시).
          ⚠️ 문구만 걷어냈고 **상한 판정은 그대로다** — canDraw 가 라우트와 같은
          판정을 보고 버튼을 잠근다. 판정까지 지우면 400 이 날 때까지 누를 수 있고
          그 사이에 돈이 나간다. 다 썬 뒤에는 버튼이 잠긴 채 보인다. */}
      {/* ★★ 스토리보드로 만들었으면 **원본 한 장**을 보여 준다.
          칸은 굽기에 쓰이고(cut.image.url), 사람이 보는 것은 전체 흐름이다 —
          컷 순서도 인물이 같은지도 한 장에서 읽힌다.
          ★ 원본 주소는 라우트가 이미 적어 둔다(images/route.js 의 `sheet`).
          ★ 컷별 갈래(격자 밖 칸 수 · 한 칸만 다시 그리기)에는 sheet 가 없다 —
          그때는 아래처럼 칸을 보여 준다. */}
      {sheetUrl ? (
        <div className="sheet-view">
          <img src={sheetUrl} alt="스토리보드" />
        </div>
      ) : cuts.length > 0 && (
        <div className="cut-shots">
          {cuts.map((c) => (
            <div key={c.idx} className="cut-shot">
              {c.image?.url && (
                <img src={c.image.url} alt={`컷 ${c.idx + 1}`} />
              )}
              <span className="no">{c.idx + 1}</span>
              <button className="tag" disabled={!canDraw || drawingNow} onClick={() => draw([c.idx])}>
                {c.image?.url ? "다시 만들기" : "이 컷 그리기"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ★★ 이미지 수정 요청 — **전체 한 장 단위**다(2026-08-25 사장님 결정).
          스토리보드가 한 장이라 그 단위가 맞다 — 칸 하나만 다시 만들면 그것만 컷별로
          돌아 인물이 다른 칸과 달라진다(08-21 에 하루를 쓴 문제).
          ★ 그림이 있을 때만 보인다 — 없으면 고칠 것이 없다. */}
      {(sheetUrl || hasImages) && (
        <div className="note-form">
          <textarea
            className="field"
            rows={3}
            value={note}
            disabled={!!busy || !canDraw}
            onChange={(e) => setNote(e.target.value)}
            placeholder="고치고 싶은 것을 적어 주세요 — 예) 전체적으로 더 밝게 해 줘"
          />
          {/* ★ 안내문과 버튼은 **같은 줄**이다(2026-08-25 사장님 지시). */}
          <div className="note-act">
            <p className="pgsub note-hint">이미지를 다시 만들면 이전 그림은 사라져요.</p>
            {drawBtn}
          </div>
        </div>
      )}

      <div className="step-actions">
        <ReelBack step="images" id={id} />
        {/* ★ 그림이 아직 없을 때만 여기 선다 — 있을 때는 위 프롬프트 칸 안에 있다. */}
        {!(sheetUrl || hasImages) && drawBtn}
        {hasImages && cuts.every((c) => c?.image?.url) && (
          <div className="fwd">
            <Link className="cta" href={reelStepHref(promptsStep, id)}>영상 프롬프트로 →</Link>
          </div>
        )}
      </div>
    </section>
  );
}
