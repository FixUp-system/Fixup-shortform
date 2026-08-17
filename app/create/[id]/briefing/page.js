"use client";

// ① 자료 — 사장님이 적은 설명과 사진, 그리고 규격만 받는다. 되묻지 않는다.
//
// 되묻던 자리를 걷어낸 이유: 이제 ②시나리오가 자료를 읽어 주제·갈래·컷을 직접 내놓고,
// 사장님은 그 결과를 눈으로 보며 고친다. 빈칸을 미리 캐물어 봐야 무엇이 부족한지는
// 시나리오를 만들어 봐야 알 수 있었고, 그 전에 멈춰 세우는 것은 게이트만 하나 늘리는 일이었다.
//
// 그래서 이 화면은 상태가 하나다 — 적은 것을 확인하고 ②로 간다.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
// PROMPT_NOTE_MAX 는 서버 게이트(normalizePromptNote)와 **같은 자리**에서 온다 —
// 숫자를 화면에 또 적으면 두 벌이 되어, 붙여넣기는 통했는데 저장이 400 인 칸이 생긴다.
// normalizePromptNote 도 같은 자리에서 온다 — 서버가 **공백을 접어서**(`\s+` → 한 칸)
// 저장하므로, 화면이 원문으로 비교하면 내부 이중 공백이나 개행이 든 지시는 빗장이 영영
// 안 풀려 blur 마다 헛 PATCH + refetch 가 돈다(실측 결함). 접는 규칙을 화면에 한 벌 더
// 적지 않고 게이트와 **같은 함수**를 부른다 — 두 벌이면 갈린다.
import { activeStyle, PROMPT_NOTE_MAX, normalizePromptNote } from "../../../../lib/styles";
import { ASPECTS, DEFAULT_ASPECT_ID } from "../../../../lib/aspects";
// 화질 — 모델이 실제로 여는 값만 고른다. 목록도 지금 값도 표(lib/clip-limits)가 준다.
// 이 화면이 그것을 드는 이유는 **화질이 정가를 바꾸기 때문**이다(Seedance 30초: 720p 160 ·
// 1080p 360). 정가는 ③목소리에서 걷히므로 고르는 자리는 그 앞이어야 하고, ②대본이 사라진
// 지금(2026-08-16) 길이·비율·모델·화풍이 이미 모여 있는 여기가 그 자리다.
import {
  modelIdForProject, resolutionsForProject, resolutionForProject,
} from "../../../../lib/clip-limits";
import { videoPrice } from "../../../../lib/pricing";
import StylePicker from "../../../../components/StylePicker";

export default function BriefingStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // 저장 전 보정 글. project 가 늦게 오므로 도착한 뒤 한 번 맞춰 준다(아래 effect).
  const [styleNote, setStyleNote] = useState("");
  // 프로젝트 공통 지시 두 칸. **화풍 보정과 다른 값이다** — 그쪽은 화풍에 딸린 한 줄(120자)이고
  // 이쪽은 밖에서 써 온 프롬프트 통짜다(600자). 상한과 저장 경로도 따로다.
  const [imageNote, setImageNote] = useState("");
  const [clipNote, setClipNote] = useState("");
  const noteLoadedFor = useRef(null);

  // 저장된 보정을 칸에 한 번만 채운다 — 매번 덮으면 타이핑 중에 글자가 되돌아간다
  useEffect(() => {
    if (!project || noteLoadedFor.current === project.id) return;
    noteLoadedFor.current = project.id;
    setStyleNote(project.settings?.style?.note || "");
    // ★ 공통 지시도 **같은 빗장 안에서** 채운다. 빗장이 하나뿐이라 밖에 두면 매 렌더마다
    //   저장값으로 덮여 글자마다 타이핑이 되돌아간다.
    setImageNote(project.settings?.image_note || "");
    setClipNote(project.settings?.clip_note || "");
  }, [project?.id]);

  // 사이즈 저장. 컷이 없을 때만 부를 수 있는 자리에 있다(위 sizePicker 가 감춘다).
  async function saveAspect(aspect_ratio) {
    setBusy(true);
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { aspect_ratio } }),
    }).catch(() => null);
    if (!res || !res.ok) { setErr("사이즈를 저장하지 못했어요 — 다시 골라 주세요"); setBusy(false); return; }
    setErr("");
    await load(id).catch(() => {});
    setBusy(false);
  }

  // 컨셉 저장. 컷을 비우지 않는다 — 컨셉은 글이 아니라 그림의 근거다.
  // 시나리오·컷·소리는 살아남고 ④이미지만 낡는다(image.style_of 각인이 판정한다).
  async function saveStyle(preset, note) {
    setBusy(true);
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { style: { preset, note } } }),
    }).catch(() => null);
    if (!res || !res.ok) {
      // 실패를 삼키지 않는다 — 고른 컨셉과 그림에 실리는 컨셉이 달라지면 아무도 못 알아본다
      setErr((await res?.json().catch(() => ({})))?.error || "영상 컨셉을 저장하지 못했어요 — 다시 골라 주세요");
      setBusy(false);
      return;
    }
    setErr("");
    await load(id).catch(() => {});
    setBusy(false);
  }

  // 프로젝트 공통 지시 저장. 사이즈·컨셉과 같은 경로(PATCH settings)이되 **화풍과 섞지
  // 않는다** — normalizeStyle 이 preset 을 함께 요구하므로 style 과 같은 몸통에 실으면
  // 400 이거나(preset 없음) 사장님이 고른 화풍이 조용히 덮인다. 그래서 그 값 하나만 보낸다.
  //
  // 실패를 삼키지 않는 이유는 다른 저장과 같다 — 이 글은 **전 컷의 프롬프트에 실린다**.
  // 저장이 안 됐는데 저장된 줄 알면, 사장님이 쓴 지시 없이 값을 치르게 된다.
  async function saveNote(key, value) {
    setBusy(true);
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { [key]: value } }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setErr((await res?.json().catch(() => ({})))?.error || "공통 지시를 저장하지 못했어요 — 다시 시도해 주세요");
      setBusy(false);
      return;
    }
    setErr("");
    await load(id).catch(() => {});
    setBusy(false);
  }

  // 화질 저장. 사이즈·컨셉과 같은 경로다(PATCH settings) — 화면마다 다른 길을 내지 않는다.
  // 실패를 삼키지 않는 이유: 고른 화질과 실제로 만들어지는 화질이 갈리면 값이 어긋난 채
  // 결제까지 간다(720p 160 vs 1080p 360).
  async function saveResolution(resolution) {
    setBusy(true);
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { resolution } }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setErr((await res?.json().catch(() => ({})))?.error || "화질을 저장하지 못했어요 — 다시 골라 주세요");
      setBusy(false);
      return;
    }
    setErr("");
    await load(id).catch(() => {});
    setBusy(false);
  }

  if (!project) return <p className="pgsub">준비 중…</p>;

  const styleId = activeStyle(project).id;
  const aspectId = project.settings?.aspect_ratio || DEFAULT_ASPECT_ID;
  // 사이즈는 컷이 생기면 감춘다 — 그림이 이미 그 모양으로 만들어졌고, 비율을 바꿔도
  // 낡았다고 판정할 수단이 없어(각인이 화면 설명과 화풍만 본다) 조용히 다른 모양으로 남는다.
  const madeCuts = (project.cuts || []).length > 0;
  const sizePicker = madeCuts ? null : (
    <>
      <div className="eyebrow">영상 사이즈 <small>이 규격으로 만들어져요</small></div>
      <div className="chips">
        {ASPECTS.map((a) => (
          <button key={a.id} className={`chip${aspectId === a.id ? " on" : ""}`}
            disabled={busy} onClick={() => saveAspect(a.id)}>
            {a.label} · {a.id}
          </button>
        ))}
      </div>
    </>
  );
  // 컨셉을 바꾸는 값이 실제로 드는지 — 그림이 하나라도 나와 있을 때만이다.
  // 컷이 있는 것과 그림이 있는 것은 다르다: 그림 전에는 0원이라 값 얘기를 꺼내면 겁만 준다.
  const madeImages = (project.cuts || []).some((c) => c.image?.url);
  const stylePicker = (
    <StylePicker
      preset={styleId} note={styleNote} disabled={busy}
      onPreset={(p) => saveStyle(p, styleNote)}
      onNote={setStyleNote}
      onNoteCommit={() => {
        // 보정만 고쳐도 그림은 달라진다. 바뀌었을 때만 보낸다 — 지나갈 때마다 PATCH 하지 않게
        if (styleNote.trim() !== (project.settings?.style?.note || "")) saveStyle(styleId, styleNote);
      }}
      warn={madeImages
        ? "이미 만든 그림이 있어요 — 컨셉을 바꾸면 그림과 영상을 다시 만들게 돼요 (컷당 약 $0.08 에 클립 값이 더 듭니다)"
        : null}
    />
  );

  // 이미 만든 클립이 있는가 — 영상 공통 지시를 고치는 값이 실제로 드는 자리다.
  // 그림과 따로 본다: 그림만 있는 상태에서 영상 지시를 고치는 것은 아직 0원이다.
  const madeClips = (project.cuts || []).some((c) => c.video?.url);
  // 프로젝트 공통 지시 두 칸 — 밖에서 프롬프트를 써 오는 사장님을 위한 자리다.
  // 전 컷의 프롬프트에 그대로 실린다(lib/cuts.js promptNoteClause).
  //
  // ★ 위의 화풍 보정(120자)과 **다른 값이다** — 그쪽은 화풍에 딸린 한 줄이고 이쪽은
  //   써 온 프롬프트 통짜다(상한 PROMPT_NOTE_MAX). 그래서 칸도 저장 경로도 따로다.
  // ★ 이미지와 영상을 나눈 이유: 영상 지시(움직임·립싱크)가 이미지 프롬프트에 붙으면
  //   정지 화면 설계가 망가진다(lib/cuts.js 의 stillOnly 가 같은 이유로 존재한다).
  // ★ 상한은 maxLength 로 미리 막는다 — 서버도 같은 값으로 거절하지만(600자, 자르지 않고
  //   400), 붙여넣고 나서 저장이 실패하는 것보다 애초에 안 넘어가는 쪽이 낫다.
  const notePicker = (
    <div className="mt-lg">
      <div className="eyebrow">
        모든 컷에 함께 보낼 지시 <small>선택 — 밖에서 쓴 프롬프트를 그대로 넣어도 돼요</small>
      </div>
      {/* ★ 값이 든다고 미리 말한다. 이 글은 **전 컷의 각인**에 들어가므로(lib/steps.js)
          한 줄만 고쳐도 그림과 클립이 통째로 낡는다 — 안 적으면 사장님이 한 줄 보태고
          전 컷 재구매를 마주한다. 이미 만든 것이 있을 때만 말한다: 그 전에는 0원이라
          값 얘기를 꺼내면 겁만 준다(화풍 보정과 같은 규칙이다). */}
      {(madeImages || madeClips) && (
        <div className="script-src warn">
          이미 만든 그림·클립이 있어요 — 여기를 고치면 전 컷을 다시 만들어야 해요 (유료)
        </div>
      )}
      {/* ★ 이 두 칸은 **busy 로 잠그지 않는다.** 잠그면 사장님이 이미지 칸에서 영상 칸으로
          탭하는 순간 이미지 칸의 onBlur → saveNote → setBusy(true) 가 돌아, 방금 포커스를
          받은 영상 칸이 그 자리에서 disabled 가 되며 **포커스가 날아간다**(다시 클릭해야
          한다). 화풍 보정은 칸이 하나라 겪지 않던 일이고, 칸이 둘이 된 지금 처음 생겼다.
          잠금을 뺀 대가는 없다 — 저장은 PATCH 한 번이고, 초기값은 빗장(noteLoadedFor)이
          한 번만 채우므로 저장 중에 타이핑한 글자가 되돌아가지도 않는다. */}
      <label className="tray-note">이미지에 함께 보낼 지시
        <textarea className="sent-input fix-input" maxLength={PROMPT_NOTE_MAX}
          placeholder="예: shot on 35mm film, shallow depth of field"
          value={imageNote}
          onChange={(e) => setImageNote(e.target.value)}
          // 바뀌었을 때만 보낸다 — 지나갈 때마다 PATCH 하지 않게(화풍 보정과 같은 규칙).
          // ★ 비교도 저장도 **서버와 같은 함수로 접은 값**이다. 원문으로 비교하면 서버가
          //   접어 저장한 값과 영원히 달라 blur 마다 헛 PATCH 가 돈다.
          onBlur={() => {
            const note = normalizePromptNote(imageNote, "이미지 지시");
            if (note !== (project.settings?.image_note || "")) saveNote("image_note", note);
          }} />
      </label>
      <label className="tray-note">영상에 함께 보낼 지시
        <textarea className="sent-input fix-input" maxLength={PROMPT_NOTE_MAX}
          placeholder="예: hand-held camera, subtle shake"
          value={clipNote}
          onChange={(e) => setClipNote(e.target.value)}
          onBlur={() => {
            const note = normalizePromptNote(clipNote, "영상 지시");
            if (note !== (project.settings?.clip_note || "")) saveNote("clip_note", note);
          }} />
      </label>
    </div>
  );

  // ★ 목록이 비면 아무것도 안 그린다(Kling·LTX). 그 모델에는 resolution 파라미터 자체가
  //   없어서, 고를 수 있는 척하면 고른 순간 fal 이 거절한다.
  // ★ 지금 값을 project.settings.resolution 이 아니라 resolutionForProject 로 읽는 이유:
  //   저장값이 이 모델의 목록 밖이면(모델이 바뀐 옛 프로젝트) 그 자리에서 기본값으로
  //   떨어진다 — 화면이 켠 값과 fal 에 실리는 값이 같아진다.
  const resolutions = resolutionsForProject(project);
  const resolution = resolutionForProject(project);
  // ★ 잠금은 **정가를 낸 뒤**다. 낸 값과 만드는 값이 어긋나면 차액을 정산할 방법이 없다.
  //   판정은 서버가 장부에서 내려 준 project.charged 하나다(③목소리 화면과 같은 값) —
  //   화면이 장부를 추측하지 않는다.
  const resolutionLocked = !!project.charged;
  const resolutionPicker = resolutions.length > 0 && (
    <div className="mt-lg">
      {/* ★ 잠겼을 때의 사유는 반드시 남긴다 — 지우면 눌리지 않는 칩만 남아 고장으로 보인다 */}
      <div className="eyebrow">
        영상 화질 {resolutionLocked && <small>이미 값을 치러서 바꿀 수 없어요</small>}
      </div>
      <div className="chips">
        {resolutions.map((r) => (
          <button key={r} className={`chip${resolution === r ? " on" : ""}`}
            disabled={busy || resolutionLocked}
            onClick={() => saveResolution(r)}>
            {r} · {videoPrice(project.settings?.target_seconds, modelIdForProject(project), r)} 크레딧
          </button>
        ))}
      </div>
      {/* 길이를 안 골랐을 때의 기준 표기 — 그 말이 없으면 15초로 나왔을 때 사장님이
          칩에 적힌 값과 어긋났다고 여긴다. 설명이 아니라 그 숫자가 무엇인지의 단서다. */}
      {!project.settings?.target_seconds && (
        <div className="tray-note">값은 30초 기준이고 길이에 따라 달라져요</div>
      )}
    </div>
  );

  const photos = project.material?.photos || [];

  return (
    <section className="panel panel--narrow">
      <h2>자료는 준비됐어요</h2>
      {/* 적은 글을 통째로 보여 준다 — 이제 이 글 하나가 시나리오의 유일한 원천이다 */}
      <p className="script-src">{project.material?.text}</p>
      {photos.length > 0 && (
        <p className="pgsub">사진 {photos.length}장을 함께 씁니다</p>
      )}
      {err && <p className="pgsub warn">{err}</p>}
      {sizePicker}
      {resolutionPicker}
      {stylePicker}
      {/* 공통 지시는 화풍 **아래**다 — 화풍이 주경로이고, 이 칸은 프롬프트를 직접 써 오는
          사장님을 위한 곁길이다. 위에 두면 빈 칸 둘이 기본 흐름을 막는다. */}
      {notePicker}
      <div className="step-actions">
        <div className="fwd">
          <button className="cta" disabled={busy} onClick={() => router.push(`/create/${id}/scenario`)}>
            시나리오 만들기 →
          </button>
        </div>
      </div>
    </section>
  );
}
