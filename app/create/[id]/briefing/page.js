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
import { activeStyle } from "../../../../lib/styles";
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
  const noteLoadedFor = useRef(null);

  // 저장된 보정을 칸에 한 번만 채운다 — 매번 덮으면 타이핑 중에 글자가 되돌아간다
  useEffect(() => {
    if (!project || noteLoadedFor.current === project.id) return;
    noteLoadedFor.current = project.id;
    setStyleNote(project.settings?.style?.note || "");
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
