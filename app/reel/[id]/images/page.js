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
import {
  reelOf, canDrawReelImages, isReelRendering, isImagesLocked, imageTriesLeft, imageTriesLeftLifetime,
} from "../../../../lib/reel/doc";

export default function ReelImagesPage() {
  const { id } = useParams();
  const { project, reload } = useReelProject();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const reel = reelOf(project);
  const cuts = project?.cuts || [];
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
      body: JSON.stringify(only ? { only } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "그림을 만들지 못했어요");
    // 성공이든 실패든 문서를 다시 읽는다 — 실패도 이미 만든 그림은 남아 있을 수 있다.
    await reload(id).catch((e) => setErr(e.message));
    setBusy("");
  }

  const promptsStep = REEL_STEPS.find((s) => s.key === "prompts");

  return (
    <section className="panel panel--wide">
      <h2>그림</h2>
      <p className="pgsub">컷마다 한 장 — 이 값은 영상 정가에 포함돼 있어요.</p>

      {err && <p className="pgsub warn">{err}</p>}
      {reel.error && <p className="pgsub warn">{reel.error}</p>}
      {drawingNow && <p className="pgsub">그림을 그리는 중이에요 — 다 되면 여기에 나타나요.</p>}
      {rendering && <p className="pgsub warn">지금 영상을 만드는 중이에요 — 끝난 뒤에 다시 그릴 수 있어요.</p>}

      {/* 남은 횟수를 **미리** 말한다. 안 말하면 상한을 넘긴 뒤에 400 으로 처음 안다. */}
      {Number.isFinite(triesLeft) && triesLeft > 0 && (
        <p className="pgsub">다시 그릴 수 있는 횟수가 {triesLeft}번 남았어요(이 시나리오판 안에서).</p>
      )}
      {triesLeft <= 0 && !drawingNow && (
        <p className="pgsub warn">그림을 다시 그릴 수 있는 횟수를 다 썼어요 — 시나리오를 다시 쓰면 회차가 돌아와요.</p>
      )}
      {triesLeftLifetime <= 0 && !drawingNow && (
        <p className="pgsub warn">이 프로젝트에서 그림을 너무 많이 다시 그렸어요 — 새로 시작해 주세요.</p>
      )}

      {cuts.length > 0 && (
        <div className="uploads">
          {cuts.map((c) => (
            <div key={c.idx} className="up photo-mark">
              {c.image?.url ? (
                <img className="thumb-media" src={c.image.url} alt={`컷 ${c.idx + 1}`} />
              ) : (
                <div className="thumb-media" />
              )}
              <button className="tag" disabled={!canDraw || drawingNow} onClick={() => draw([c.idx])}>
                {c.image?.url ? "다시 만들기" : "이 컷 그리기"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="step-actions">
        {/* ★ hasImages 일 때는 **명시로 전부**를 보낸다(all idx) — only 를 안 주면 라우트는
            "안 그려진 컷만"(초안 채우기)으로 읽는다(app/api/reel/[id]/images/route.js 의
            wanted 판정). 여기서 null 을 그대로 보내면 [전부 다시 만들기]가 실은 아무 것도
            새로 안 그린다(전부 이미 그려져 있으니 has 가 전부 참이라서). */}
        <button
          className="mini"
          disabled={!canDraw || drawingNow || !scenario?.text}
          onClick={() => draw(hasImages ? cuts.map((c) => c.idx) : null)}
        >
          {drawingNow ? "그리는 중…" : hasImages ? "전부 다시 만들기" : "그림 만들기"}
        </button>
        {hasImages && cuts.every((c) => c?.image?.url) && (
          <div className="fwd">
            <Link className="cta" href={reelStepHref(promptsStep, id)}>영상 프롬프트로 →</Link>
          </div>
        )}
      </div>
    </section>
  );
}
