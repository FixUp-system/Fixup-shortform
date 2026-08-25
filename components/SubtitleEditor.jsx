"use client";

// 자막 편집기 — 크기·글꼴·색·자리를 고르고, 그 결과를 **자막 없는 영상** 위에 미리 그린다.
//
// ★★ 한 벌이다(2026-08-25 사장님 지시). 단계별 완성 화면(app/create/[id]/done)에만 있던
//   것을 여기로 뺐고, reel 완성 화면(app/reel/[id]/done)이 같은 것을 쓴다. 두 벌이 되면
//   한쪽만 고쳐진 채로 갈린다 — 이 저장소가 반복해서 값을 치른 자리다.
//
// ★ **값은 여기서 정하지 않는다.** 기본값·범위·되돌리기·외곽선·줄바꿈은 전부
//   lib/subtitles.js 하나가 쥔다. 이 파일이 하는 일은 그 값을 화면에 옮기는 것뿐이다.
//
// ★★ 미리보기는 **자막이 안 구워진 영상** 위에만 그린다. 구워진 완성본 위에 얹으면
//   옛 자막과 새 자막이 둘 다 보인다 — 아래 showingRaw 하나가 그 판정이다.
//   · 단계별: 자막 없는 원본(render.rawUrl)이 그 영상이다
//   · reel : 아직 원본을 문서에 안 남기므로 **클립**을 쓴다(자막은 합성에서 굽힌다)
//
// ★ 저장은 **부르는 화면의 일이다.** 흐름마다 문이 다르고(/api/projects vs /api/reel)
//   무엇을 함께 저장하는지도 다르다. 여기서는 고른 값을 onChange 로 올려 줄 뿐이다.
import { useEffect, useRef, useState } from "react";
import {
  SUBTITLE_POSITIONS,
  DEFAULT_SUBTITLE,
  SUBTITLE_FONTS,
  SIZE_MIN,
  SIZE_MAX,
  normalizeSubtitle,
  clampPos,
  outlineFor,
  rimFor,
  buildCues,
  subtitleTextFor,
  subtitleStyle,
  posFromLegacyPosition,
  SUBTITLE_LINE_HEIGHT,
} from "../lib/subtitles";
import { aspectFor } from "../lib/aspects";

// 화면이 쥘 초기값. settings.subtitle 이 있으면 그것이 진실이고, 없는 옛 프로젝트는
// 옛 위치를 이어받는다. 되돌리기·범위 판정은 늘 lib 의 normalizeSubtitle 을 지난다.
//
// ★ 두 흐름이 같은 씨를 뿌린다 — 화면마다 적으면 갈린다. 옛 위치(subtitle_position)는
//   단계별 흐름의 옛 프로젝트에만 있고, 없으면 그냥 기본값이다.
export function seedSubtitle(project) {
  const saved = project?.settings?.subtitle;
  if (saved) return normalizeSubtitle(saved);
  return normalizeSubtitle({
    ...DEFAULT_SUBTITLE,
    pos: posFromLegacyPosition(project?.settings?.subtitle_position),
  });
}

// 빠른 위치 — 드래그가 자유롭다고 목록이 쓸모없어지지 않는다. "대충 아래로"를 한 번에 하는 길이다.
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

// 드래그로 옮겨 어느 프리셋과도 안 맞을 때 목록이 가리킬 자리. 저장되는 값이 아니다.
const CUSTOM_POS = "custom";

// 눈금 하나 차이로 목록이 "직접 옮김"으로 떨어지지 않게 아주 작은 여유만 둔다.
const samePos = (a, b) => Math.abs(a[0] - b[0]) < 0.005 && Math.abs(a[1] - b[1]) < 0.005;

export default function SubtitleEditor({
  // 자막 글자를 뽑을 컷들 — 미리보기 문장이 여기서 온다(완성본과 **같은 함수**로 나눈다).
  cuts = [],
  // 프로젝트 비율. 상자 비율이 프로젝트를 따라야 드래그한 자리가 최종과 같다.
  aspectRatio,
  // 자막 **언어**. 글자와 글꼴 줄이 함께 이 값을 따른다(한국어에서만 글꼴을 고른다).
  lang = "ko",
  // 사장님이 고른 설정과 그 갱신 — 상태는 **부르는 화면**이 쥔다(저장이 그쪽 일이라서).
  sub,
  onChange,
  // 자막이 **안 구워진** 영상. 이것이 없으면 미리보기를 얹을 수 없다.
  rawUrl = null,
  // 자막이 **구워진** 완성본. 고친 게 없으면 이쪽을 튼다 — 그래야 적용 결과가 보인다.
  finalSrc = null,
  // 저장된 설정과 지금 고른 값이 다른가(=고치는 중인가). 부르는 화면이 판정한다.
  dirty = false,
  // 조절판을 그릴까 — 자막 없는 영상이 없으면 미리보기만 남는다.
  editable = true,
  applying = false,
  busy = false,
  // 실행 버튼. 안 주면 안 그린다 — reel 은 화면 아래의 [다시 만들기] 하나가 그 일을 한다
  // (한 화면에서 영상을 만드는 버튼이 둘이면 어느 것이 반영하는지 알 수 없다).
  onApply = null,
  applyLabel = "",
  applyDisabled = false,
  // 드래그 중이라고 알린다 — 부르는 화면이 서버 값으로 덮어쓰는 것을 그동안 멈춘다.
  onDragging = null,
  // 흐름마다 다른 것들. topSlot 은 조절판 맨 위(단계별의 언어 줄),
  // children 은 조절판 아래(단계별의 번역 검토)다.
  topSlot = null,
  children = null,
}) {
  // 미리보기 상자의 실제 크기(px). 글자 크기를 완성본과 **같은 함수**로 재려면 화면에서의
  // 치수가 필요하다 — subtitleStyle 이 치수에서 비례로 뽑으므로 상자 치수를 그대로 넣으면 된다.
  const [box, setBox] = useState({ width: 0, height: 0 });
  const stageRef = useRef(null);
  // 드래그 중에 잡은 지점과 자막 자리의 차이. null 이면 드래그 중이 아니다.
  const dragRef = useRef(null);

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
  }, [rawUrl, finalSrc]);

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
    onChange({
      ...sub,
      pos: clampPos([
        (e.clientX - r.left) / r.width + grab.dx,
        (e.clientY - r.top) / r.height + grab.dy,
      ]),
    });
  }
  function onPointerDown(e) {
    if (!editable || !rawUrl || applying) return;
    const r = stageRef.current?.getBoundingClientRect();
    if (!r?.width || !r?.height) return;
    dragRef.current = {
      dx: sub.pos[0] - (e.clientX - r.left) / r.width,
      dy: sub.pos[1] - (e.clientY - r.top) / r.height,
    };
    onDragging?.(true);
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
    onDragging?.(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  // ★ 지금 트는 영상에 자막이 **안 구워져 있는가.** 그럴 때만 브라우저가 자막을 그린다.
  //   고치는 중이거나(dirty) 아직 완성본이 없으면 자막 없는 영상을 튼다.
  const showingRaw = !!rawUrl && (dirty || !finalSrc);
  const previewSrc = showingRaw ? rawUrl : finalSrc || rawUrl;

  // ★ 미리보기 상자의 비율은 **프로젝트 비율**이다 — 9:16 으로 고정하고 영상을 cover 로
  // 채우면 16:9·1:1 프로젝트에서 영상이 잘려, ①드래그한 자리가 잘린 프레임 기준이 되고
  // ②글자 크기도 어긋난다. 값은 lib/aspects 에서 가져온다.
  const aspect = aspectFor(aspectRatio);
  const frameStyle = {
    position: "relative",
    touchAction: "none",
    aspectRatio: `${aspect.width} / ${aspect.height}`,
    // 세로가 긴 비율에서 화면 밖으로 넘치지 않게 — CSS 의 9:16 고정값을 비율에서 다시 뽑는다
    maxWidth: `calc((100vh - 210px) * ${aspect.width} / ${aspect.height})`,
  };
  // 미리보기를 **가로 560 · 세로 640 상자**에 가둔다. 상자 치수는 CSS 가 쥐고, 비율만
  // 여기서 넘긴다(--ar) — 비율의 출처는 프로젝트 하나여야 한다(위 aspectFor).
  const previewStyle = { "--ar": aspect.width / aspect.height };

  // 미리보기에 띄울 자막 — **완성본과 같은 함수로 나눈다.**
  //
  // ★ 문장을 통째로 흘리면 상자 폭에 따라 여섯 줄이 되는데 완성본은 두 줄이다. pos 가 글자
  // 블록의 아랫변 기준이라 줄 수가 다르면 자막이 차지하는 자리가 통째로 달라지고, 낱말도
  // 아무 데서나 잘린다("하/이톱"). 나누는 규칙은 lib 하나여야 한다.
  // ★ 언어를 싣는다 — 안 실으면 사장님은 원문을 검토하는데 구워지는 것은 번역이라
  // 검토와 결과가 갈린다.
  const sampleCut = cuts.find((c) => (c.sentence || "").trim());
  const sampleText = (box.height && sampleCut
    ? buildCues([sampleCut], { width: box.width, height: box.height, subtitle: sub, lang })[0]?.text
    : sampleCut && subtitleTextFor(sampleCut, lang)) || "자막 미리보기";
  const font = SUBTITLE_FONTS.find((f) => f.id === sub.font) || SUBTITLE_FONTS[0];
  // ★ 완성본과 **같은 함수**로 잰다. 여기서 따로 곱하면 미리보기와 최종이 갈린다.
  const previewFontSize = box.height
    ? subtitleStyle({ width: box.width, height: box.height, subtitle: sub }).fontSize
    : 0;
  // 외곽선 색은 사장님이 고르지 않는다 — lib 의 같은 규칙(글자색의 반대 명도)을 쓴다.
  // ASS 의 외곽선을 브라우저에서는 그림자 여덟 방향으로 흉내 낸다.
  const outline = outlineFor(sub.color);
  // ★ 두께도 lib 이 정한다 — 글꼴이 가늘수록·글자가 클수록 두꺼워진다(rimFor).
  const rim = rimFor(sub.font, previewFontSize);
  const outlineShadow = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
    .map(([x, y]) => `${x * rim.outline}px ${y * rim.outline}px 0 ${outline}`)
    // ASS 의 Shadow 는 오른쪽 아래로 떨어지는 그림자다 — 밝은 배경에서 아랫변을 떼어 놓는다
    .concat(`${rim.shadow}px ${rim.shadow}px ${rim.shadow}px rgba(0,0,0,0.55)`)
    .join(", ");
  const overlayStyle = {
    position: "absolute",
    left: `${sub.pos[0] * 100}%`,
    top: `${sub.pos[1] * 100}%`,
    // ★ pos 는 글자 블록의 **아랫변** 기준이다 — ffmpeg 의 \pos + Alignment 2 와 같은 뜻.
    // 기준이 갈리면 미리보기와 완성본의 자막 높이가 어긋나고, 두 줄이 되면 덜컹거린다.
    transform: "translate(-50%, -100%)",
    // 자막이 **영상 안에** 구워져 있을 때는 그리지 않는다 — 그리면 둘로 보인다.
    // 지우지 않고 감추기만 하는 이유는 **끄는 자리**를 남겨 두려고다: 사장님이 영상 속 자막을
    // 그대로 끌면 그 순간 고치는 중이 되어 미리보기가 다시 나타난다.
    opacity: showingRaw ? 1 : 0,
    textAlign: "center",
    // ★ 줄바꿈은 이미 lib 이 정했다(buildCues) — 여기서 폭을 걸어 **다시** 접으면 완성본과
    // 다른 줄 수가 나온다. ffmpeg 는 \N 자리에서만 끊으므로 미리보기도 그래야 같은 그림이다.
    whiteSpace: "pre",
    fontSize: previewFontSize,
    // 줄 높이도 lib 이 쥔다 — 옛 위치를 옮길 때 쓰는 글자 블록 높이와 같은 값이어야 한다
    lineHeight: SUBTITLE_LINE_HEIGHT,
    fontWeight: 700,
    // ★ 브라우저에는 **cssFamily** 를 쓴다(ffmpeg 의 family 가 아니다). CSS 패밀리 이름은
    // 대소문자를 안 가려서, 파일 내부 이름을 그대로 쓰면 next/font/local 이 내는 UI 폰트
    // 이름과 한 가족이 된다 — 어느 쪽이 이길지가 빌드 산출물 순서에 달린다.
    fontFamily: `"${font.cssFamily}", sans-serif`,
    color: sub.color,
    textShadow: outlineShadow,
    cursor: applying ? "default" : "move",
    userSelect: "none",
    touchAction: "none",
  };

  return (
    <div className="done-stage">
      {/* ★ 제목은 조절판 **밖**이다 — 안에 두면 제목 높이만큼 상자가 아래로 밀려 영상
          윗변과 어긋난다. 무대가 격자라 제목은 1행 왼쪽 칸, 상자와 영상은 2행에 나란히 선다. */}
      {editable && (
        <div className="eyebrow sub-eyebrow">
          수정 <small>끌어서 옮기고 글꼴·색·크기를 골라요</small>
        </div>
      )}
      {editable && (
        <div className="sub-editor">
          {/* 결정들을 한 장에 같은 리듬으로 둔다. 라벨 없이 칩만 두 줄로 붙어 있으면
              어느 줄이 무엇을 고르는 줄인지 알 수 없다. */}
          <div className="subpanel">
            {topSlot}
            <div className="sub-row">
              <span className="sub-label">위치</span>
              {/* 고른 값은 pos 에서 거꾸로 판정한다 — 끌어서 옮기면 어느 자리와도 안 맞으므로
                  "직접 옮김"으로 떨어진다(그때 목록을 비우면 화면이 거짓말을 한다). */}
              <div className="sub-select-wrap">
                <select
                  className="sub-select"
                  aria-label="자막 위치"
                  value={POSITION_PRESETS.find((p) => samePos(sub.pos, p.pos))?.id || CUSTOM_POS}
                  disabled={applying}
                  onChange={(e) => {
                    const preset = POSITION_PRESETS.find((p) => p.id === e.target.value);
                    if (preset) onChange({ ...sub, pos: clampPos(preset.pos) });
                  }}
                >
                  {POSITION_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                  <option value={CUSTOM_POS} disabled>직접 옮김</option>
                </select>
              </div>
            </div>
            {lang === "ko" ? (
              <div className="sub-row">
                <span className="sub-label">글꼴</span>
                {/* ★ 고른 글꼴을 **그 글꼴로** 보여 준다 — 이름만 보고 고르면 "부드럽게"가 어떤
                    글씨인지 모른 채 고르게 된다. 이름(label)·글꼴 이름(cssFamily) 둘 다 lib 에서
                    온다. 브라우저용 이름이라야 한다(ffmpeg 의 family 가 아니다). */}
                <div className="sub-select-wrap">
                  <select
                    className="sub-select face"
                    aria-label="자막 글꼴"
                    style={{ fontFamily: font.cssFamily }}
                    value={sub.font}
                    disabled={applying}
                    onChange={(e) => onChange({ ...sub, font: e.target.value })}
                  >
                    {SUBTITLE_FONTS.map((f) => (
                      <option key={f.id} value={f.id} style={{ fontFamily: f.cssFamily }}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null /* 고를 것이 없으면 그 줄이 아예 없는 것이 자연스럽다 — 한국어 밖에서는
                글꼴을 lib 이 언어로 정하므로(subtitleFontFor) 고르게 두면 고른 것과 다른
                결과가 나온다(두부 □). ⚠️ 왜 사라졌는지를 **문구로** 설명하지 마라:
                그것은 우리 사정이고 사장님이 알 일이 아니다(2026-08-18 사용자 지시). */}
            <div className="sub-row">
              <span className="sub-label">색</span>
              {/* 테두리 색은 사장님이 고르는 것이 아니다 — 미리보기가 이미 보여 주므로
                  값을 글자로 적지 않는다. */}
              <div className="sub-control">
                <input
                  className="sub-swatch"
                  type="color"
                  aria-label="자막 글자색"
                  value={sub.color}
                  disabled={applying}
                  onChange={(e) => onChange({ ...sub, color: e.target.value.toUpperCase() })}
                />
                <span className="sub-value mono">{sub.color}</span>
              </div>
            </div>
            <div className="sub-row">
              <span className="sub-label">크기</span>
              <div className="sub-control">
                {/* 범위는 lib 이 쥔다 — 두 벌이면 슬라이더 끝과 저장되는 값이 갈린다 */}
                <input
                  className="sub-slider"
                  type="range"
                  aria-label="자막 크기"
                  min={SIZE_MIN}
                  max={SIZE_MAX}
                  step="0.05"
                  value={sub.size}
                  disabled={applying}
                  onChange={(e) => onChange({ ...sub, size: Number(e.target.value) })}
                />
                <span className="sub-value mono">{sub.size.toFixed(2)}배</span>
              </div>
            </div>
            {/* 실행도 이 격자 안이다 — 카드 밖에 두면 어느 카드에 딸린 버튼인지 흐려진다. */}
            <div className="sub-row sub-row--actions">
              {/* 되돌리기 값도 lib 이 쥔다 — 화면이 기본값을 다시 적지 않는다 */}
              <button
                className="mini"
                disabled={applying || busy}
                onClick={() => onChange(normalizeSubtitle(DEFAULT_SUBTITLE))}
              >
                기본으로
              </button>
              {/* ★ 영상을 만드는 버튼은 화면에 하나뿐이어야 한다. 그래서 여기 둘지는
                  부르는 화면이 정한다(reel 은 아래의 [다시 만들기]가 그 일을 한다). */}
              {onApply && (
                <button
                  className="mini confirm-btn"
                  disabled={applyDisabled}
                  onClick={onApply}
                >
                  {applyLabel}
                </button>
              )}
            </div>
          </div>
          {children}
        </div>
      )}
      {/* ★ 자막 없는 영상을 재생하고 그 위에 브라우저가 자막을 그린다 — 구워진 자막 위에
          미리보기를 얹으면 자막이 둘로 보인다(showingRaw 가 그 판정이다). */}
      <div className="preview-pane done-preview" style={previewStyle}>
        <div className="preview-frame" ref={stageRef} style={frameStyle}>
          {/* key 로 다시 만든다 — src 만 바꾸면 브라우저가 이미 물고 있던 스트림을 이어 튼다 */}
          <video key={previewSrc} className="preview-video" controls src={previewSrc} />
          {editable && rawUrl && (
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
    </div>
  );
}
