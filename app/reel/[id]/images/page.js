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
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useReelProject } from "../layout";
import { REEL_STEPS, reelStepHref } from "../../../../lib/reel/steps";
import ReelBack from "../../../../components/ReelBack";
import {
  reelOf, reelErrorFor, canDrawReelImages, isReelRendering, isImagesLocked, imageTriesLeft, imageTriesLeftLifetime,
} from "../../../../lib/reel/doc";
import { reelSheetUrl, storyboardGridFor } from "../../../../lib/reel/oneshot";
// 보드 주소에 싣는 **내용 지문** — 서버와 같은 함수를 쓴다(두 벌이면 캐시가 안 맞는다).
import { boardKey } from "../../../../lib/reel/board-key";
// ★ 칸에 실리는 지문 한 줄 — **지문을 만드는 쪽과 같은 함수**다(lib/reel/panels.js).
//   화면에서 다시 조립하면 실제로 나간 글과 갈린다.
import { panelBody, panelSay, buildStoryboardPrompt } from "../../../../lib/reel/panels";
import { aspectFor } from "../../../../lib/aspects";

export default function ReelImagesPage() {
  const { id } = useParams();
  // ★ 제목은 **표가 쉠다** — 화면이 손으로 적으면 라벨을 바꿀 때 여기만 낡는다.
  const stepLabel = REEL_STEPS.find((x) => x.key === "images")?.label || "";
  const { project, reload } = useReelProject();
  const [busy, setBusy] = useState("");
  // ★★★ 2026-09-03 사장님 지시 — **보드가 오는 동안에도 로딩을 보여 준다.**
  //   그전에는 `drawingNow`(그림을 만드는 중)일 때만 표시가 떴고, 보드 그림이 서버에서
  //   그려져 도착하기까지는 **빈 자리**였다 — 사장님에게는 멈춘 화면으로 보인다.
  const [boardReady, setBoardReady] = useState(false);
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
  // 보드 주소 — 내용 지문을 실어 캐시가 컷에 맞물리게 한다(lib/reel/board-key.js).
  const boardHref = `/api/reel/${id}/board?v=${boardKey(cuts)}`;
  const triesLeft = imageTriesLeft(reel);
  const triesLeftLifetime = imageTriesLeftLifetime(reel);
  // 문 판정은 순수 함수 하나다 — 서버(app/api/reel/[id]/images/route.js)와 같은 값을 본다.
  const canDraw = canDrawReelImages(reel);
  const hasImages = cuts.some((c) => c?.image?.url);

  // only 를 주면 그 컷만, 안 주면 안 그려진 컷 전부. 배열이 아닌 값을 보내면 라우트가 400 이다.
  async function draw(only, opts = {}) {
    setBusy("images"); setErr("");
    const res = await fetch(`/api/reel/${id}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // ★ 요청이 있을 때만 실는다 — 안 실으면 지문이 예전과 글자 그대로다.
      // ★★ `auto` 는 **자동으로 부른 것**이라는 표시다 — 라우트가 그것을 보고 문서에
      //   `reel.autoImaged` 를 남겨 평생 한 번만 자동으로 돌게 한다($0.401).
      body: JSON.stringify({
        ...(only ? { only } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(opts.auto ? { auto: true } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "그림을 만들지 못했어요");
    // 성공이든 실패든 문서를 다시 읽는다 — 실패도 이미 만든 그림은 남아 있을 수 있다.
    await reload(id).catch((e) => setErr(e.message));
    setNote("");
    setBusy("");
  }

  // ★★ **누르지 않아도 그려진다**(2026-08-27 사장님 지시: "이미지 생성 버튼을 만드는게
  //   아니라" 자동으로). ②시나리오가 첫 방문에 한 번 걸어 두는 것과 **같은 문**을 쓴다 —
  //   거기서 시작한 것이 아직 안 끝났으면 서버가 409 로 되돌려 보내므로 두 번 안 나간다
  //   (isImagesLocked, app/api/reel/[id]/images/route.js).
  //
  // ⚠️ **돈이 나가는 자동화다**($0.401 한 장). 그래서 지키는 것이 셋이다:
  //   ① `auto: true` 로 보낸다 — 라우트가 문서에 `reel.autoImaged` 를 남겨 **평생 한 번**만
  //      돈다. 화면의 ref 로만 막으면 새로고침 한 번에 그 기억이 사라져 또 나간다.
  //   ② 이미 그림이 있으면 안 부른다 · 그리는 중이거나 굽는 중이면 안 부른다 ·
  //      회차 상한을 다 썼으면 안 부른다(canDraw — 서버와 같은 판정).
  //   ③ 실패는 조용히 넘긴다 — 사유는 아래 오류줄이 이미 말하고, 자동으로 또 시도하면
  //      같은 사유로 돈이 계속 나간다. 다시 하는 것은 사장님의 버튼 몫이다.
  const autoRef = useRef(false);
  useEffect(() => {
    if (autoRef.current) return;
    if (!project) return;
    if (!scenario?.text) return;
    if (reel.autoImaged) return;
    if (hasImages || sheetUrl) return;
    if (drawingNow || rendering || !canDraw) return;
    autoRef.current = true;
    draw(null, { auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, scenario?.text, reel.autoImaged, hasImages, sheetUrl, drawingNow, rendering, canDraw]);

  // ★ 컷 상자의 비율 — 출처는 프로젝트 하나다(--ar). CSS 에 박아 두면 가로 영상이
  //   세로 상자에 들어가 잘려 보인다(2026-08-25 비율 고르기가 열리며 생긴 자리).
  // ★ aspectFor 는 모르는 값이면 기본(9:16)으로 떨어진다 — 던지지 않는다.
  const ar = aspectFor(project?.settings?.aspect_ratio);
  const arStyle = { "--ar": `${ar.width} / ${ar.height}` };

  // ★★ **이미지 생성에 실제로 나간 지문 전체**(2026-08-27 사장님 지시: "이미지 생성
  //   프롬프트가 내용이 훨씬 긴데 기본적으로 들어가는 내용도 포함시켜줘").
  //   컷별 줄만 보여 주면 그것이 지문의 전부인 것처럼 읽힌다 — 실제로는 판형·인물 유지·
  //   화풍·글자 금지·첨부 사진 설명이 함께 나간다.
  //
  // ★ **저장된 것이 먼저다.** 그림을 그릴 때 각인해 둔 값(cut.image.of)이 곧 그때 나간
  //   글이다 — 화면이 다시 조립하면 그 사이에 바뀐 값 때문에 실제와 갈린다.
  // ★ 아직 안 그렸으면 지금 값으로 **미리보기**를 만든다(같은 함수 하나로 만든다).
  //   첨부 사진 줄은 사진이 있는지만 보고 붙으므로 장수만 넘긴다.
  const savedPrompt = cuts.map((c) => c.image?.of).find(Boolean) || "";
  // 보드 주소가 바뀌면(컷을 고쳤다) 다시 "오는 중"으로 되돌린다.
  useEffect(() => { setBoardReady(false); }, [boardHref]);

  const previewGrid = storyboardGridFor(cuts.length, {
    resolution: project?.settings?.resolution,
    aspect: project?.settings?.aspect_ratio,
  });
  const photoCount = project?.material?.photos?.length || 0;
  const fullPrompt =
    savedPrompt ||
    (previewGrid && cuts.length
      ? buildStoryboardPrompt(project, cuts, previewGrid, "", new Array(photoCount).fill({}))
      : "");

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
      {/* ★★ **이 단계의 오류만** 읽는다(2026-08-25). 그전에는 reel.error 를 그대로 읽어
          ⑤영상의 fal 422 가 이 화면에 떴다 — 반대로 그림이 진짜 실패했을 때도 남의
          오류에 가려졌다. 판정은 lib/reel/doc.js 의 reelErrorFor 하나다. */}
      {reelErrorFor(reel, "images") && <p className="pgsub warn">{reelErrorFor(reel, "images")}</p>}
      {/* ★★ 2026-08-25 — 도는 표시를 붙인다(사장님: "로딩 마크가 안 떠서 사용자가
          인지하기가 어려울 것 같아"). 스토리보드 한 장은 수십 초가 걸리는데 글자만
          있으면 멎은 것과 구별이 안 된다. ⑤영상이 같은 날 쓴 처방과 같은 모양이다. */}
      {drawingNow && (
        <p className="pgsub">
          <span className="spinner" aria-hidden="true" /> 그림을 그리는 중이에요 — 다 되면 여기에 나타나요.
        </p>
      )}
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
      {/* ★★ 통합 한 장이 **맨 위**로 돌아왔다(2026-08-27 사장님 지시: "전체 4컷도 상단에
          배치해줘 4컷도 다운 받을 수 있게"). 같은 날 한 번 뺐다가 되돌린 자리다 — 뺀 이유는
          "어느 칸이 어느 문장인가"를 못 말해서였는데, 그 일은 이제 **아래 컷별 목록**이
          한다. 통합본은 전체 흐름을 한눈에 보는 제 일만 하면 된다.
          ★ 내려받기는 라우트를 지난다(app/api/reel/[id]/sheet) — 그 한 장은 fal 에 있어
            다른 출처라, 링크에 download 를 붙여도 저장이 아니라 그냥 열린다. */}
      {/* ★★ 스토리보드를 **접는다**(2026-08-27, 안 A). 그전에는 늘 펼쳐져 있어서 306px 을
          먹었고, 그 아래 카드 한 줄(450px)과 합쳐 756px — 첫 화면에 남는 높이(약 700px)를
          넘겼다. 그래서 카드가 늘 잘려 보였다.
          ★ 없애는 것이 아니다 — 전체 흐름은 **가끔** 보는 것이라 필요할 때 펴는 자리로
            내린다(같은 날 통째로 뺐다가 되돌린 적이 있어 이번에는 접기다).
          ★ [전체 내려받기]는 **접힘 밖**이다 — 펴지 않고도 받을 수 있어야 한다. */}
      {/* ★★★ 2026-09-02 — 이 자리가 보여 주는 것이 **모델용 격자에서 사람용 보드로** 바뀌었다
          (사장님 요청: "사용자는 좀 더 보기 편하게 이미지보드처럼 보고 다운 받을 수 있게").
          번호·타임코드·카메라·연기·대사가 붙은 한 장이고, 비율은 프로젝트 비율을 따른다.
          ★★ **모델에 가는 r2v 격자는 그대로다** — 만드는 방식도 각인도 안 바뀌었다.
            그 원본은 ④프롬프트·⑤영상에서 여전히 그대로 보인다(거기서는 그것이 본문이다).
          ★ 보드는 그 자리에서 그린다(저장하지 않는다) — 컷을 고치면 다음에 열 때 최신이다.
          ★ 항상 그린다(2026-09-02 사장님: 고정 이미지) — 라우트가 60초 캐시로 반복 로드를 던다. */}
      {/* ★★★ 2026-09-02 — 보드는 **고정 이미지**다(사장님 지시: "토글로 되어 있는데 그냥
          고정 이미지로 배치해줘"). 접었다 펴던 details 를 걷어냈다 — 화면을 열면 바로 보인다.
          ★ 모델에 가는 r2v 격자는 그대로다. 원본은 ④프롬프트·⑤영상에서 여전히 보인다.
          ★ 보드는 그 자리에서 그린다(저장 안 함, 0원) — 컷을 고치면 다음 로드가 최신이다. */}
      {sheetUrl && (
        <div className="sheet-block">
          <div className="sheet-view sheet-view--sm">
            {/* ★★★ 2026-09-03 — 주소에 **내용 지문**을 싣는다(boardKey). 컷이 그대로면 같은
                주소라 브라우저 캐시가 그대로 맞고(라우트가 1년·immutable 로 답한다), 컷을
                고치면 주소가 달라져 **자동으로** 새로 그린다. 무효화를 손으로 안 한다.
                ★ key 도 같은 값이다 — 주소가 바뀌면 <img> 를 새로 만들어 onLoad 가 다시
                  불린다(안 그러면 새 그림이 오는 동안 옛 그림 위에 로딩이 안 뜬다). */}
            <img
              key={boardHref}
              src={boardHref}
              alt="스토리보드"
              onLoad={() => setBoardReady(true)}
              onError={() => setBoardReady(true)}
            />
            {/* 그리는 중이거나 **보드가 아직 안 온 동안** 덮개를 씌운다 — 빈 자리를 두면
                멈춘 화면으로 보인다(사장님 지적). */}
            {(drawingNow || !boardReady) && (
              <div className="frame-busy"><span className="spinner" aria-hidden="true" /></div>
            )}
          </div>
          {/* ★★ 2026-09-03 사장님 지시 — **스토리보드 옆에** 내려받기를 둔다.
              그전에는 보드 아래 줄에만 있었고 이름이 [전체 내려받기]라, 무엇을 받는지가
              자리와 이름 둘 다에서 흐렸다. 이제 **보는 것 옆에서 그것을 받는다**.
              ★ 이름을 [보드 내려받기]로 좁힌다 — 아래 지문 절의 [전체 내려받기]와 뜻이
                겹치지 않게. 실제로 받는 것은 같은 한 장이지만, 사장님이 **어느 자리에서
                눌렀는가**로 무엇을 받는지 알 수 있어야 한다. */}
          <div className="sheet-act">
            <a
              className="mini"
              href={`${boardHref}${boardHref.includes("?") ? "&" : "?"}download=1`}
              download
            >
              보드 내려받기
            </a>
          </div>
        </div>
      )}

      {/* ★★ 2026-08-27 — **컷별 갈래의 상자**(사장님 지시: "기존에 4컷을 통합한
          건 제거해줘"). 아래 컷별 목록이 같은 것을 더 잘 말한다 — 칸마다 그림과 그 칸에
          실린 지문이 짝지어 서기 때문이다. 통합본은 "어느 칸이 어느 문장인가"를 못 말한다.
          ★ **만드는 방식은 안 바뀌었다** — 여전히 스토리보드 한 장을 사서 칸을 자른다
            (app/api/reel/[id]/images/route.js). 바뀐 것은 보여 주는 방식뿐이다.
          ★ 원본은 ④프롬프트·⑤영상에서 그대로 볼 수 있다(굽기에 통째로 넘기는 그 한 장이라
            그 자리에서는 그것이 본문이다).
          ★ 컷별 갈래(격자 밖 칸 수 · 한 칸만 다시 그리기)의 컷 상자는 그대로 둔다 —
            거기에는 칸마다 [다시 만들기]가 붙어 있다. */}
      {!(sheetUrl || !hasImages) && cuts.length > 0 && (
        <div className="cut-shots">
          {cuts.map((c) => (
            <div key={c.idx} className="cut-shot" style={arStyle}>
              {c.image?.url && <img src={c.image.url} alt={`컷 ${c.idx + 1}`} />}
              {drawingNow && <div className="frame-busy"><span className="spinner" aria-hidden="true" /></div>}
              <span className="no">{c.idx + 1}</span>
              <button className="tag" disabled={!canDraw || drawingNow} onClick={() => draw([c.idx])}>
                {c.image?.url ? "다시 만들기" : "이 컷 그리기"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ★★ 컷마다 **무엇이 지문에 실렸는지** 보여 준다(2026-08-27 사장님 지시:
          "컷별로 어떤 프롬프트 내용이 반영 되는지 컷 이미지 - 프롬프트 내용 … 이런식으로").
          한 장을 통째로 보면 흐름은 읽히지만 **어느 칸이 어느 문장이었는지**는 안 보인다 —
          그림이 뜻대로 안 나왔을 때 고칠 자리를 찾으려면 그 짝이 필요하다.
          ★ 글은 lib/reel/panels.js 가 만든다 — 굽기 지문(buildStoryboardPrompt)이 쓰는 그
            함수다. 여기서 shows 만 직접 그리면 카메라가 빠져 실제와 갈린다.
          ★ 여기에는 **버튼을 두지 않는다** — 보는 자리다. 칸 하나만 다시 그리면 그것만
            컷별로 돌아 인물이 다른 칸과 달라진다(2026-08-25 결정, 수정은 전체 한 장 단위).
          ★ 그림이 없어도 그린다 — 굽기 전에도 "무엇을 그릴 것인가"를 읽을 수 있다. */}
      {/* ★ 컷 상자(.cut-shots)가 뜨는 갈래에서는 안 그린다 — 그쪽은 썸네일과 [다시 만들기]가
          이미 컷마다 서 있어서, 여기까지 그리면 같은 그림이 두 줄로 겹친다. */}
      {cuts.length > 0 && (sheetUrl || !hasImages) && (
        <ul className="panel-cards">
          {cuts.map((c, i) => (
            /* ★ 카드는 **누를 것이 없는 자리**다 — 초점도 안 받는다(2026-08-27 사장님
               지시로 위 스토리보드에 윤곽을 켜던 연결을 걷어냈다). 아무 일도 안 하는
               자리가 키보드 순서에 끼면 탭이 카드 수만큼 헛돈다. */
            <li className="panel-card" key={c.idx ?? i}>
              <div className="panel-thumb" style={arStyle}>
                {c.image?.url ? (
                  <img src={c.image.url} alt={`컷 ${i + 1}`} />
                ) : (
                  drawingNow && <span className="spinner" aria-hidden="true" />
                )}
              </div>
              <div className="panel-main">
                {/* ★ 번호는 장식이 아니다 — 지문이 "Panel 1 은 왼쪽 위"라고 말하는 그 수다.
                    위 스토리보드에서 그 칸을 찾는 열쇠이기도 하다.
                    ★ 초를 곁들인다 — 컷 길이는 이 화면에서 판단에 쓰이는 값이다. */}
                <span className="panel-no">
                  {i + 1}
                  {Number(c.seconds) > 0 ? ` · ${c.seconds}초` : ""}
                </span>
                {/* ★★ **대사가 먼저다**(2026-08-27, 안 A). 영어 지문만 있으면 "몇 번째
                    장면인지"를 머리로 맞춰야 한다 — 사장님 말로 적힌 이 줄이 그것을 바로
                    잡아 준다. 말 없는 컷에는 이 줄이 아예 없다(빈 줄을 남기지 않는다). */}
                {panelSay(c) && <p className="panel-say">「{panelSay(c)}」</p>}
                {/* 아직 안 적힌 칸은 그렇게 말한다 — 빈 줄을 남기면 덜 만들어진 것처럼 보인다. */}
                {/* ★ 마우스를 올리면 전체가 뜬다(title) — 스크롤이 번거로울 때의 지름길이다.
                    잘린 글을 **볼 길이 둘**인 셈이고, 어느 쪽도 이 화면을 떠나지 않는다. */}
                <p className="panel-body" title={panelBody(c)}>
                  {panelBody(c) || "아직 적힌 내용이 없어요"}
                </p>
                {/* ★ 내려받기는 카드 안 **오른쪽 아래**다(2026-08-27 사장님 지시).
                    `?dl=1` 이 붙어야 파일 이름이 버킷 키(uuid)가 아니라 사람이 읽는 이름으로
                    저장된다(app/api/uploads). fal 주소는 다른 출처라 그 파라미터를 모르고
                    download 속성도 안 먹는다 — 그때는 그냥 열린다.
                    ★ 모양은 보관함·⑥완성의 [내려받기]와 같다(.mini). */}
                {c.image?.url && (
                  <div className="panel-act">
                    <a
                      className="mini panel-dl"
                      href={c.image.url.startsWith("/api/uploads/") ? `${c.image.url}?dl=1` : c.image.url}
                      download={`컷${i + 1}.jpg`}
                      target={c.image.url.startsWith("/api/uploads/") ? undefined : "_blank"}
                      rel="noreferrer"
                    >
                      내려받기
                    </a>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ★★ 2026-09-03 사장님 지시 — **기본이 펼침이다**(`open`). 그전에는 접어 두었고
          이유가 "지문이 길어서 펴 두면 위의 컷 목록이 저 아래로 밀린다"였는데, 사장님은
          지문을 **늘 보면서** 고치는 자리라 접힌 채로 두면 매번 한 번 더 눌러야 했다.
          <details> 는 그대로 쓴다 — 접는 길은 남기고 **첫 상태만** 뒤집었다.
          ★ 키보드·스크린리더 동작이 이미 붙어 있어 <details> 를 계속 쓴다. */}
      {fullPrompt && (
        <details className="lib-fold" open>
          <summary>
            이미지 생성 지문 전체
            {savedPrompt ? "" : " (미리보기 — 아직 안 그렸어요)"}
          </summary>
          <p className="script-src">{fullPrompt}</p>
          {/* ★★ 2026-09-03 사장님 지시 — **지문 아래 줄에 [전체 내려받기]**.
              스토리보드까지 함께 받는 자리다(보드 옆 버튼은 보드 한 장만 받는다).
              ★ 같은 주소를 쓴다 — 보드 라우트가 컷 그림을 모아 한 장으로 그려 주므로
                "스토리보드 포함"이 그 한 장으로 성립한다. */}
          <div className="panel-act prompt-dl">
            <a
              className="mini"
              href={`${boardHref}${boardHref.includes("?") ? "&" : "?"}download=1`}
              download
            >
              전체 내려받기
            </a>
          </div>
        </details>
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
