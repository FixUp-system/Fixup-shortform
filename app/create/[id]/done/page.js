"use client";

// ⑥ 완성 — 클립을 이어붙이고 소리와 자막을 얹어 내려받을 mp4 를 만든다.
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import BackButton from "../../../../components/BackButton";
import {
  cutSeconds,
  SUBTITLE_POSITIONS,
  DEFAULT_SUBTITLE,
  SUBTITLE_FONTS,
  SIZE_MIN,
  SIZE_MAX,
  normalizeSubtitle,
  clampPos,
  outlineFor,
  subtitleStyle,
  posFromLegacyPosition,
  SUBTITLE_LINE_HEIGHT,
} from "../../../../lib/subtitles";
import { aspectFor } from "../../../../lib/aspects";
import { isRenderStale, isClipStale, isImageStale, isSubtitleOnlyStale } from "../../../../lib/steps";

// 옛 프로젝트가 쥔 자막 위치(위·중간·아래)를 자유 위치 비율로 옮기는 일은 lib 이 한다
// (posFromLegacyPosition). 정렬 기준마다 marginV 의 뜻이 달라 글자 블록 높이까지 봐야 하는데,
// 그 식은 자막 크기를 정하는 곳(subtitleStyle) 옆에 있어야 갈라지지 않는다.

// 화면이 쥘 초기값. settings.subtitle 이 있으면 그것이 진실이고, 없는 옛 프로젝트는
// 옛 위치를 이어받는다. 되돌리기·범위 판정은 늘 lib 의 normalizeSubtitle 을 지난다.
function seedSubtitle(project) {
  const saved = project?.settings?.subtitle;
  if (saved) return normalizeSubtitle(saved);
  return normalizeSubtitle({
    ...DEFAULT_SUBTITLE,
    pos: posFromLegacyPosition(project?.settings?.subtitle_position),
  });
}

// 빠른 위치 — 드래그가 자유롭다고 칩이 쓸모없어지지 않는다. "대충 아래로"를 한 번에 하는 길이다.
//
// 자리는 posFromLegacyPosition 하나에서 온다(값이 세 벌이 되면 안 된다). 목록도 lib 의
// SUBTITLE_POSITIONS 를 그대로 쓰고, 화면이 더하는 것은 한국어 이름뿐이다.
// 순서는 y 로 정렬한다 — 표의 키 순서(아래·중간·위)가 아니라 사장님이 보는 위→아래 순이다.
const POSITION_LABELS = { top: "위", middle: "중간", bottom: "아래" };
const POSITION_PRESETS = SUBTITLE_POSITIONS.map((id) => ({
  id,
  label: POSITION_LABELS[id] || id,
  pos: posFromLegacyPosition(id),
})).sort((a, b) => a.pos[1] - b.pos[1]);

// 켜진 칩은 pos 에서 거꾸로 판정한다 — settings.subtitle_position 을 읽으면 화면이 거짓말을
// 한다(드래그로 옮겨도 칩은 켜진 채다). 드래그해서 어느 프리셋과도 다르면 아무 칩도 안 켜진다.
// 눈금 하나 차이로 꺼지지 않게 아주 작은 여유만 둔다.
const samePos = (a, b) => Math.abs(a[0] - b[0]) < 0.005 && Math.abs(a[1] - b[1]) < 0.005;

export default function DoneStepPage() {
  const { id } = useParams();
  const { project, setProject, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const pollRef = useRef(null);

  // ★ 미리보기는 **자막 없는 원본** 위에 브라우저가 자막을 그린다. 자막이 구워진 완성본 위에
  // 얹으면 자막이 둘로 보인다. 원본이 없는 옛 프로젝트에서는 완성본을 재생하고 조절 UI 를 숨긴다.
  //
  // ⚠️ 이름이 **camelCase 다**(`rawUrl`). 이 저장소의 프로젝트 문서는 대체로 snake_case 인데
  // (`clip_regen_count`·`cuts_script_version`) render 만 composeVideo 의 반환값을 그대로
  // 스프레드해 저장한다(lib/pipeline.js) — 그래서 여기만 섞여 있다. `raw_url` 은 없는 필드다.
  const rawUrl = project?.render?.rawUrl || null;

  // 사장님이 고른 자막 설정. 화면이 값을 새로 정하지 않는다 — 기본값·되돌리기·범위는
  // lib/subtitles.js 하나가 쥔다(두 벌이 되면 언젠가 갈린다).
  const [sub, setSub] = useState(() => seedSubtitle(project));
  // 미리보기 상자의 실제 크기(px). 글자 크기를 완성본과 **같은 함수**로 재려면 화면에서의
  // 치수가 필요하다 — subtitleStyle 이 치수에서 비례로 뽑으므로 상자 치수를 그대로 넣으면 된다.
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [applying, setApplying] = useState(false);
  const stageRef = useRef(null);
  // 드래그 중에 잡은 지점과 자막 자리의 차이. null 이면 드래그 중이 아니다.
  const dragRef = useRef(null);

  useEffect(() => () => { clearInterval(pollRef.current); pollRef.current = null; }, []);

  // 서버가 준 설정이 바뀌면 따라간다(불러오기·저장 뒤). 문자열로 비교하는 이유는 객체가
  // 매 렌더 새로 오기 때문이다 — 참조로 걸면 사장님이 만지는 중에도 계속 덮어쓴다.
  //
  // 옛 위치(subtitle_position)도 함께 본다 — settings.subtitle 이 아직 없는 프로젝트에서는
  // 그 값이 초기 자리를 정하므로, 칩으로 위치를 바꾸면 미리보기도 따라와야 한다.
  const savedSubtitle = JSON.stringify([
    project?.settings?.subtitle ?? null,
    project?.settings?.subtitle_position ?? null,
  ]);
  useEffect(() => {
    if (dragRef.current) return;
    setSub(seedSubtitle(project));
  }, [savedSubtitle]);

  // 상자 크기는 창 너비·비율에 따라 바뀐다. 한 번만 재면 창을 줄였을 때 글자만 안 따라온다.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rawUrl]);

  // 드래그 — 상자 안에서의 비율로 옮기고, 화면 밖은 lib 의 clampPos 가 되돌린다.
  //
  // 잡은 지점과 자막 자리의 차이(grab)를 쥐고 간다. 커서 자리를 그대로 pos 로 삼으면
  // 누르는 순간 자막이 튄다 — pos 는 글자 블록의 아랫변이라, 한가운데를 잡아도 블록이
  // 제 높이의 절반만큼 위로 솟는다.
  function moveTo(e) {
    const el = stageRef.current;
    const grab = dragRef.current;
    if (!el || !grab) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    setSub((s) => ({
      ...s,
      pos: clampPos([
        (e.clientX - r.left) / r.width + grab.dx,
        (e.clientY - r.top) / r.height + grab.dy,
      ]),
    }));
  }
  function onPointerDown(e) {
    if (!rawUrl || applying) return;
    const r = stageRef.current?.getBoundingClientRect();
    if (!r?.width || !r?.height) return;
    dragRef.current = {
      dx: sub.pos[0] - (e.clientX - r.left) / r.width,
      dy: sub.pos[1] - (e.clientY - r.top) / r.height,
    };
    // 포인터를 붙잡아 둔다 — 안 그러면 빨리 끌 때 커서가 자막 밖으로 나가며 드래그가 끊긴다
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    moveTo(e);
  }
  function onPointerMove(e) {
    if (dragRef.current) moveTo(e);
  }
  function onPointerUp(e) {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  // [적용] — 설정을 저장한 뒤 **자막만** 다시 굽는다. 클립·소리·그림은 그대로라 값이 안 든다.
  // 저장을 먼저 하는 이유: 재굽기가 실패해도 고른 설정은 남아야 다음에 다시 시도할 수 있다.
  async function applySubtitle() {
    if (applying || busy) return;
    setApplying(true);
    setErr("");
    try {
      const saved = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { subtitle: sub } }),
      });
      if (!saved.ok) {
        throw new Error((await saved.json().catch(() => ({}))).error || "자막 설정을 저장하지 못했어요");
      }
      const res = await fetch(`/api/projects/${id}/subtitle`, { method: "POST" });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).error || "자막을 다시 굽지 못했어요");
      }
      await load(id).catch(() => {});
    } catch (e) {
      setErr(e.message || "자막을 다시 굽지 못했어요");
    } finally {
      setApplying(false);
    }
  }

  function startPolling() {
    clearInterval(pollRef.current);
    setPollTimedOut(false);
    let failures = 0;
    const startedAt = Date.now();
    const stop = (timedOut) => {
      clearInterval(pollRef.current);
      pollRef.current = null;
      setBusy(false);
      if (timedOut) {
        setPollTimedOut(true);
        setErr("합성이 오래 걸리고 있어요 — 새로고침하거나 다시 시도해 주세요");
      }
    };
    pollRef.current = setInterval(async () => {
      // 인코딩은 이미지 생성보다 오래 걸릴 수 있어 10분까지 기다린다
      if (Date.now() - startedAt > 10 * 60 * 1000) return stop(true);
      try {
        const res = await fetch(`/api/projects/${id}/render/status`);
        if (!res.ok) throw new Error();
        failures = 0;
        const st = await res.json();
        setProject((p) => ({ ...p, status: st.status, render: st.render, render_error: st.render_error }));
        if (st.render_error) { stop(false); setErr(st.render_error); return; }
        if (st.render) stop(false);
      } catch {
        failures += 1;
        if (failures >= 5) stop(true);
      }
    }, 2000);
  }

  // 진입·새로고침 복원 — 합성 중이면 폴링을 잇는다
  useEffect(() => {
    if (busy && !pollRef.current && !pollTimedOut) startPolling();
  }, [busy]);

  async function start() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/render`, { method: "POST" });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "시작하지 못했어요");
      setBusy(false);
      return;
    }
    await load(id).catch(() => {});
    startPolling();
  }

  const cuts = project?.cuts || [];
  const render = project?.render;
  const clipCount = cuts.filter((c) => c.video?.url).length;
  // 완성본 길이는 컷마다 낭독·클립 중 긴 쪽을 더한 값이다 — 낭독 합으로 예고하면
  // 만든 뒤에 다른 초가 나온다(눈금 올림 때문에 클립이 거의 항상 더 길다)
  // ★ cutSeconds 가 컷만 보고 판정한다 — 소리 파일이 있으면 합성이 낭독 길이로 자르고,
  // 없으면(클립이 스스로 말한다) 못 자르니 받은 클립 길이다. 화면이 예고하는 초가
  // 합성 결과와 같은 자를 쓴다.
  const totalSeconds = cuts.reduce((s, c) => s + cutSeconds(c), 0);
  // 컷을 고친 뒤라면 이 완성본은 옛 소리·옛 그림으로 만든 것이다.
  // 합성은 0원이라 막을 게 아니라 바로 다시 만들게 하는 것이 맞다.
  //
  // 완성본 자체의 각인만 보면 안 된다. renderKey 는 소리·클립 주소와 문장만 이어 붙이므로
  // **④로 돌아가 그림을 다시 만든 것만으로는 완성본이 낡지 않는다** — 그림 주소는 클립 각인
  // (clipKey)에만 들어 있다. 앞 단계의 [다음] 잠금이 그것을 막아 줄 거라 봤지만, 사이드바는
  // status 만 보고 링크를 여니(isReachable) 잠금을 지나쳐 ⑥으로 바로 들어올 수 있다.
  // 그래서 ⑥이 스스로 클립·그림까지 본다. 안 그러면 옛 클립으로 만든 mp4 가 그대로 내려받히고,
  // 거기서 [다시 합치기]를 눌러도 옛 클립으로 다시 합쳐져 "안 낡음"으로 굳는다.
  // ⚠️ some(isImageStale) 로 넘기면 배열 번호가 project 자리에 들어가 화풍 판정이 죽는다.
  const stale = isRenderStale(project) || cuts.some((c) => isClipStale(c, project)) || cuts.some((c) => isImageStale(c, project));
  // 낡음의 원인을 갈라 말한다 — 자막 위치만 바꾼 것을 "옛 소리·옛 그림" 이라 하면
  // 사장님이 자기가 무엇을 망가뜨렸나로 읽는다. 갈래는 둘이면 충분하다.
  const staleMessage = isSubtitleOnlyStale(project)
    ? "자막을 바꿨어요 — 다시 합치면 새 자막으로 나와요"
    : "컷을 고친 뒤라 이 영상은 옛 소리·옛 그림으로 만든 것이에요 — 다시 합쳐 주세요";

  // ★ 미리보기 상자의 비율은 **프로젝트 비율**이다 — CSS 가 9:16 으로 고정하고 영상을
  // object-fit: cover 로 채우던 때는, 16:9·1:1 프로젝트에서 영상이 잘려 보였다. 그러면
  // ①드래그한 자리가 잘린 프레임 기준이라 최종과 다른 자리를 가리키고, ②글자 크기를
  // box.height(=폭×16/9)로 재는데 ffmpeg 는 실제 높이로 재서 크기까지 어긋났다.
  // 값은 lib/aspects 에서 가져온다 — 화면이 손으로 적으면 값이 두 벌이 된다.
  const aspect = aspectFor(project?.settings?.aspect_ratio);
  const frameStyle = {
    position: "relative",
    touchAction: "none",
    aspectRatio: `${aspect.width} / ${aspect.height}`,
    // 세로가 긴 비율에서 화면 밖으로 넘치지 않게 — CSS 의 9:16 고정값을 비율에서 다시 뽑는다
    maxWidth: `calc((100vh - 210px) * ${aspect.width} / ${aspect.height})`,
  };

  // 미리보기에 띄울 자막 — 첫 문장이면 충분하다(자리·크기·색을 보는 용도다)
  const sampleText = (cuts.find((c) => (c.sentence || "").trim())?.sentence || "자막 미리보기").trim();
  const font = SUBTITLE_FONTS.find((f) => f.id === sub.font) || SUBTITLE_FONTS[0];
  // ★ 완성본과 **같은 함수**로 잰다. 여기서 따로 곱하면 미리보기와 최종이 갈린다.
  const previewFontSize = box.height
    ? subtitleStyle({ width: box.width, height: box.height, subtitle: sub }).fontSize
    : 0;
  // 외곽선 색은 사장님이 고르지 않는다 — lib 의 같은 규칙(글자색의 반대 명도)을 쓴다.
  // ASS 의 외곽선을 브라우저에서는 그림자 여덟 방향으로 흉내 낸다.
  const outline = outlineFor(sub.color);
  const outlineShadow = [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2]]
    .map(([x, y]) => `${x}px ${y}px 0 ${outline}`)
    .join(", ");
  const overlayStyle = {
    position: "absolute",
    left: `${sub.pos[0] * 100}%`,
    top: `${sub.pos[1] * 100}%`,
    // ★ pos 는 글자 블록의 **아랫변** 기준이다 — ffmpeg 의 \pos + Alignment 2 와 같은 뜻.
    // 기준이 갈리면 미리보기와 완성본의 자막 높이가 어긋나고, 두 줄이 되면 덜컹거린다.
    transform: "translate(-50%, -100%)",
    maxWidth: "84%",
    textAlign: "center",
    whiteSpace: "pre-line",
    fontSize: previewFontSize,
    // 줄 높이도 lib 이 쥔다 — 옛 위치를 옮길 때 쓰는 글자 블록 높이와 같은 값이어야 한다
    lineHeight: SUBTITLE_LINE_HEIGHT,
    fontWeight: 700,
    // ★ 브라우저에는 **cssFamily** 를 쓴다(ffmpeg 의 family 가 아니다). CSS 패밀리 이름은
    // 대소문자를 안 가려서, 파일 내부 이름을 그대로 쓰면 next/font/local 이 내는 UI 폰트
    // 이름과 한 가족이 된다 — 어느 쪽이 이길지가 빌드 산출물 순서에 달린다.
    // app/globals.css 의 @font-face 가 public/fonts/ 의 파일을 이 이름으로 물린다.
    // 뒤의 sans-serif 는 폰트를 받는 동안(font-display: swap) 대신 그릴 글씨다.
    fontFamily: `"${font.cssFamily}", sans-serif`,
    color: sub.color,
    textShadow: outlineShadow,
    cursor: applying ? "default" : "move",
    userSelect: "none",
    touchAction: "none",
  };

  if (!clipCount) return <p className="pgsub">영상을 먼저 만들어 주세요.</p>;

  return (
    <section className="panel panel--narrow">
      <h2>완성본을 내려받습니다 <span className="badge vlm">완성</span></h2>
      {err && <p className="pgsub warn">{err}</p>}

      {!render ? (
        <>
          <p className="pgsub">
            컷 {clipCount}개를 이어 붙이고 목소리와 자막을 얹어요 · 약 {Math.round(totalSeconds)}초
          </p>
          <div className="brief">
            <div className="brief-row"><b>이어붙이기</b><div className="val">컷 {clipCount}개를 순서대로</div></div>
            <div className="brief-row"><b>소리</b><div className="val">컷마다 읽은 목소리를 그대로</div></div>
            <div className="brief-row"><b>자막</b><div className="val">문장을 화면에 태워요 — 틱톡·릴스 버튼에 가리지 않는 위치에</div></div>
            <div className="brief-row"><b>비율</b><div className="val">{project?.settings?.aspect_ratio || "9:16"}</div></div>
          </div>
        </>
      ) : render.fake ? (
        <>
          <p className="pgsub">합성까지 마쳤어요 — 약 {Math.round(render.seconds || 0)}초짜리로.</p>
          <div className="brief">
            <div className="brief-row">
              <b>파일</b>
              <div className="val">
                가짜 모드라 파일은 만들어지지 않았어요.
                <br />실제로 만들려면 <code className="mono">SHOTFORM_FAKE</code> 를 끄고 다시 눌러 주세요.
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="pgsub">완성했어요 — 약 {Math.round(render.seconds || 0)}초.</p>
          {stale && (
            <div className="script-src warn">{staleMessage}</div>
          )}
          {render.noSubtitles && (
            <div className="script-src warn">
              이 합성 방식에서는 자막이 들어가지 않아요 (SHOTFORM_COMPOSER=fal)
            </div>
          )}
          {/* ★ 자막 없는 원본을 재생하고 그 위에 브라우저가 자막을 그린다 — 구워진 자막 위에
              미리보기를 얹으면 자막이 둘로 보인다. 원본이 없는 옛 프로젝트는 완성본 그대로다. */}
          <div className="preview-pane done-preview">
            <div className="preview-frame" ref={stageRef} style={frameStyle}>
              <video className="preview-video" controls src={rawUrl || render.url} />
              {rawUrl && (
                <div
                  style={overlayStyle}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  {sampleText}
                </div>
              )}
            </div>
          </div>

          {rawUrl && (
            <>
              <div className="eyebrow mt-lg">
                자막 꾸미기 <small>끌어서 옮기고 폰트·색·크기를 골라요 — 다시 굽는 데 값이 들지 않아요</small>
              </div>
              {/* 빠른 위치. 켜짐은 pos 에서 거꾸로 판정하므로, 끌어서 옮기면 아무 칩도 안 켜진다 */}
              <div className="chips">
                {POSITION_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className={`chip${samePos(sub.pos, p.pos) ? " on" : ""}`}
                    disabled={applying}
                    onClick={() => setSub((s) => ({ ...s, pos: clampPos(p.pos) }))}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="chips">
                {SUBTITLE_FONTS.map((f) => (
                  <button
                    key={f.id}
                    className={`chip${sub.font === f.id ? " on" : ""}`}
                    disabled={applying}
                    onClick={() => setSub((s) => ({ ...s, font: f.id }))}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="brief">
                <div className="brief-row">
                  <b>글자색</b>
                  <div className="val">
                    <input
                      type="color"
                      value={sub.color}
                      disabled={applying}
                      onChange={(e) => setSub((s) => ({ ...s, color: e.target.value.toUpperCase() }))}
                    />
                    <span className="mono"> {sub.color} · 테두리 {outline}</span>
                  </div>
                </div>
                <div className="brief-row">
                  <b>크기</b>
                  <div className="val">
                    {/* 범위는 lib 이 쥔다 — 두 벌이면 슬라이더 끝과 저장되는 값이 갈린다 */}
                    <input
                      type="range"
                      min={SIZE_MIN}
                      max={SIZE_MAX}
                      step="0.05"
                      value={sub.size}
                      disabled={applying}
                      onChange={(e) => setSub((s) => ({ ...s, size: Number(e.target.value) }))}
                    />
                    <span className="mono"> {sub.size.toFixed(2)}배</span>
                  </div>
                </div>
              </div>
              <div className="chips">
                {/* 되돌리기 값도 lib 이 쥔다 — 화면이 기본값을 다시 적지 않는다 */}
                <button className="chip" disabled={applying} onClick={() => setSub(normalizeSubtitle(DEFAULT_SUBTITLE))}>
                  기본으로
                </button>
                <button className="chip on" disabled={applying} onClick={applySubtitle}>
                  {applying ? "다시 굽는 중…" : "적용"}
                </button>
              </div>
            </>
          )}

          {/* 원본이 없는 옛 프로젝트 — 자막이 이미 구워져 있어 그 위에 미리보기를 얹을 수 없다.
              조절 UI 를 그냥 숨기기만 하면 사장님은 이 기능이 있는지조차 모른다. 아래에 이미
              있는 [다시 합치기]로 이어 준다 — 한 번 다시 만들면 원본이 함께 남는다. */}
          {!rawUrl && (
            <p className="pgsub">
              자막을 옮기거나 폰트·색·크기를 고치려면 아래 [다시 합치기]로 완성본을 한 번 다시 만들어 주세요.
            </p>
          )}
        </>
      )}

      <div className="step-actions">
        <BackButton stepKey="done" />
        {/* 완성본이 있으면 사장님이 하고 싶은 일은 내려받기다 — 그것을 주 버튼으로 둔다.
            다시 합치기는 컷을 고쳤을 때만 쓰는 보조 동작이다. */}
        <div className="fwd">
          {render && !render.fake && render.url && !stale ? (
            <>
              <button className="mini" disabled={busy} onClick={start}>
                {busy ? "합치는 중…" : "다시 합치기"}
              </button>
              <a className="cta" href={render.url} download>
                내려받기
              </a>
            </>
          ) : (
            <>
              <span className="hint">
                {stale
                  ? "다시 합치면 지금 내용으로 내려받을 수 있어요"
                  : render
                  ? "컷을 고쳤다면 다시 합쳐 주세요"
                  : "합치는 데 조금 걸려요"}
              </span>
              <button className="cta" disabled={busy} onClick={start}>
                {busy ? "합치는 중…" : render ? "다시 합치기" : "완성본 만들기"}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
