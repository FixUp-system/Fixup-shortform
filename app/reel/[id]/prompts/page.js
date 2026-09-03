"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useReelProject } from "../layout";
import { isPromptsReady } from "../../../../lib/reel/doc";
import { planReelBake, reelSheetUrl, reelWholePrompt, canBakeReel } from "../../../../lib/reel/oneshot";
// 영어 원문 + 한국어를 한 덩어리로 — 세 화면이 같은 모양을 쓴다.
import PromptWithKo from "../../../../components/PromptWithKo";
import { REEL_STEPS, reelStepHref } from "../../../../lib/reel/steps";
import ReelBack from "../../../../components/ReelBack";
import AutoTextarea from "../../../../components/AutoTextarea";

// 4 영상 프롬프트 — **굽기 전이다.** 여기서 고치는 것은 값이 들지 않는다.
//
// ★ 프로젝트는 레이아웃이 읽어 컨텍스트에 담아 둔 것을 쓴다 — 화면마다 자기 fetch 를
//   두면 같은 문서를 여섯 번 읽고, 한 화면이 갱신한 값을 옆 화면이 모른다.
//
// ★★ 2026-08-25 — **갈래가 둘이다.** 15초 이하이고 스토리보드가 있으면 컷별 프롬프트가
//   아예 없다: 스토리보드 한 장을 통째로 넘기고 지문도 한 벌(시나리오 원문)이다.
//   16초 이상은 통짜가 물리적으로 불가라(Seedance 2.0 은 한 번에 15초가 최대) 예전 화면
//   그대로다. 판정은 lib/reel/oneshot.js 의 planReelBake 하나 — 화면이 초를 다시 세지 않는다.
export default function ReelPromptsPage() {
  const { id } = useParams();
  const { project, reload } = useReelProject();
  const cuts = project?.cuts || [];
  const [saving, setSaving] = useState("");
  const [err, setErr] = useState("");
  // ★ 사장님이 한국어로 적는 수정 요청. 보낸 뒤에는 비운다 — 남아 있으면 다음에
  //   또 누를 때 같은 요청이 두 번 실린다(②시나리오·③이미지와 같은 처방).
  const [note, setNote] = useState("");

  // 갈래·재료는 전부 lib 이 판정한다. **선언을 쓰는 자리보다 앞에 둔다** — 뒤에 두면
  // 그 자리에서 화면이 통째로 죽는다(2026-08-25 에 실제로 겪었다).
  const plan = planReelBake(project);
  const oneShot = plan.mode === "oneshot";
  const sheetUrl = reelSheetUrl(cuts);
  const whole = reelWholePrompt(project);

  async function save(idx, body) {
    setSaving(`save-${idx}`); setErr("");
    const res = await fetch(`/api/reel/${id}/prompts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idx, body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "저장하지 못했어요");
    await reload(id).catch((e) => setErr(e.message));
    setSaving("");
  }

  // ★ 전체 프롬프트를 **손으로 고쳐 저장하는** 길(PATCH, idx 없음)은 라우트에 그대로
  //   있지만 이 화면은 안 쓴다 — 여기서는 읽는 글로 보여 주고 고치는 것은 한국어 요청
  //   하나로 받는다(applyNote). 죽은 함수를 남겨 두면 다음 사람이 어느 쪽이 진짜인지 모른다.

  // 단위는 **전체 한 번**이다 — 컷 하나만 손보는 것은 위 직접 편집(textarea)이 맡는다.
  async function makeAll() {
    setSaving("all"); setErr("");
    // ★ 이미 쓰인 컷이 있으면 **명시로 전부**(all idx)를 보낸다 — only 를 안 주면
    //   파이프라인은 "비어 있는 칸만"으로 읽어(has 판정) 수정 요청이 아무 컷에도 안 닿는다.
    //   ★ 요청이 있을 때만 note 를 실는다 — 안 실으면 지문이 예전과 글자 그대로다.
    const payload = {
      ...(cuts.some((c) => c?.clip_prompt) ? { only: cuts.map((_, i) => i) } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const res = await fetch(`/api/reel/${id}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "영상 프롬프트를 못 만들었어요");
    await reload(id).catch((e) => setErr(e.message));
    setNote("");
    setSaving("");
  }

  // 통짜 갈래의 [이대로 고치기] — 적은 말을 반영해 **전체 프롬프트를 다시 쓴다**.
  //
  // ★★ 2026-08-25 사장님 지적으로 바뀐 자리다. 예전에는 LLM 을 안 부르고 적은 말을 전체
  //   프롬프트 **끝에 글자 그대로 붙였다**(0원). 그런데 붙인 한국어가 위 글(.script-src)에
  //   그대로 보였다 — "붙고 나면 위 글에 그대로 보여요. 삭제."
  //   지금은 라우트가 LLM 으로 한 문단을 다시 써서 그 자리를 **대체한다**(붙는 자리가 없다).
  //
  // ⚠️ 여기서 makeAll 을 부르면 안 된다 — 그것은 **컷별** 지문을 다시 쓰는 문이고,
  //   통짜 굽기는 컷별 지문을 아예 안 읽는다. 값은 나가는데 적은 말이 영상에 안 닿는다.
  //   그래서 같은 POST 라도 `whole: true` 로 **다른 문**을 연다.
  async function applyNote() {
    const ask = note.trim();
    if (!ask) return;
    setSaving("whole"); setErr("");
    const res = await fetch(`/api/reel/${id}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ whole: true, note: ask }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "프롬프트를 다시 쓰지 못했어요");
    await reload(id).catch((e) => setErr(e.message));
    // ★ 성공했을 때만 비운다 — 실패했는데 지우면 사장님이 적은 말이 사라진다.
    if (res.ok) setNote("");
    setSaving("");
  }

  async function rewrite(idx) {
    setSaving(`rewrite-${idx}`); setErr("");
    const res = await fetch(`/api/reel/${id}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ only: [idx] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "다시 쓰지 못했어요");
    await reload(id).catch((e) => setErr(e.message));
    setSaving("");
  }

  // 굽기 게이트 — 서버(app/api/reel/[id]/clips/route.js)와 **같은 함수**다.
  // 통짜 갈래는 컷별 프롬프트를 안 본다(없는 것이 정상이다).
  // ★ 굽기 게이트는 **갈래를 아는 한 함수**다 — 컷별 갈래에서는 프롬프트뿐 아니라
  //   그림까지 본다(canBakeReelClips 그대로). 여기서 isPromptsReady 하나만 보면
  //   그림이 빠진 채 ⑤로 보내고 서버가 400 으로 막는다.
  const ready = canBakeReel(project);
  const videoStep = REEL_STEPS.find((s) => s.key === "video");

  return (
    <section className="panel panel--wide">
      <h2>영상 프롬프트</h2>
      {/* ★ 이 단계를 따로 둔 이유 — 브리프의 요구대로 사장님 말로 적는다. */}
      {err && <p className="pgsub warn">{err}</p>}

      {!cuts.length ? (
        <p className="pgsub">시나리오와 그림을 먼저 만들어 주세요.</p>
      ) : oneShot ? (
        /* ── 통짜 갈래 — 스토리보드 한 장 + 프롬프트 하나 ─────────────────
           ★ 컷별 목록을 안 그린다. 이 갈래에는 컷별 프롬프트가 **아예 없다** —
             보여 주면 사장님이 고칠 수 있는 것처럼 보이는데 굽기는 안 읽는다. */
        <section className="panel">
          {sheetUrl && (
            <div className="sheet-view">
              <img src={sheetUrl} alt="스토리보드" />
            </div>
          )}

          {/* ★★ ②시나리오와 **같은 형식**이다(2026-08-25 사장님 지시):
              결과는 읽는 글로 보여 주고(.script-src), 고치는 것은 아래에서 **한국어로
              적는다**(.note-form). 두 화면이 같은 일을 하는데 조작이 다르면 사장님이
              화면마다 다른 사용법을 익혀야 한다. */}
          {/* ★★ 2026-08-27 — ②시나리오와 **글자 그대로 같은 모양**이다(사장님 지시).
              다시 쓰는 동안에는 옛 글을 안 보여 준다 — 곧 사라질 글을 읽고 있으면 바뀐
              줄도 모른다. 진행을 말하는 자리는 **여기 하나**다(버튼 옆이 아니다). */}
          {saving === "whole" ? (
            <p className="pgsub">
              <span className="spinner" aria-hidden="true" /> 영상 프롬프트를 다시 쓰고 있어요
            </p>
          ) : (
            <PromptWithKo text={whole} ko={project?.reel?.prompt_ko} />
          )}

          {/* ★ 한국어로 고쳐 달라고 적는 자리 — ②·③와 같은 모양이다.
              요청은 makeAll() 이 실어 보낸다(안 실으면 지문이 예전과 글자 그대로다). */}
          <div className="note-form">
            <AutoTextarea
              className="field"
              rows={3}
              value={note}
              disabled={!!saving}
              onChange={(e) => setNote(e.target.value)}
              placeholder="고치고 싶은 것을 적어 주세요 — 예) 카메라를 더 천천히 움직여 줘"
            />
            {/* ★ 안내문은 버튼 바로 왼쪽이다(②③와 같은 모양). */}
            {/* ★ 안내문은 **누르기 전에만** 뜨고, 버튼은 자리를 지키되 잠긴다
                (②시나리오와 같은 규칙 — 자리가 사라지면 화면이 접혔다 펴진다). */}
            <div className="note-act">
              {saving !== "whole" && (
                <p className="pgsub note-hint">적은 말을 반영해 위 글을 다시 써요.</p>
              )}
              <button className="mini" disabled={!!saving || !note.trim()} onClick={applyNote}>
                이대로 고치기
              </button>
            </div>
          </div>
        </section>
      ) : saving === "all" ? (
        /* ★ 컷별 갈래도 같은 규칙이다 — 다시 쓰는 동안에는 옛 지문을 안 보여 주고
           이 한 줄만 말한다(②시나리오·위 통짜 갈래와 같은 모양). */
        <p className="pgsub">
          <span className="spinner" aria-hidden="true" /> 영상 프롬프트를 다시 쓰고 있어요
        </p>
      ) : !cuts.some((c) => c?.clip_prompt) ? (
        <div className="step-actions">
          <button className="mini" disabled={!!saving} onClick={makeAll}>
            영상 프롬프트 만들기
          </button>
        </div>
      ) : (
        cuts.map((c, i) => (
          <section key={i} className="panel">
            <h3>컷 {i + 1}</h3>
            {c.image?.url && <img className="thumb-media" src={c.image.url} alt={`컷 ${i + 1}`} />}
            <AutoTextarea
              className="field"
              defaultValue={c.clip_prompt || ""}
              onBlur={(e) => { if (e.target.value.trim() !== (c.clip_prompt || "")) save(i, e.target.value); }}
            />
            <button type="button" className="tag" disabled={!!saving} onClick={() => rewrite(i)}>
              {saving === `rewrite-${i}` ? "다시 쓰는 중…" : "다시 쓰기"}
            </button>
          </section>
        ))
      )}

      {/* ★★ 영상 프롬프트 수정 요청 — **전체 한 번** 단위다(2026-08-25 사장님 결정).
          컷 하나만 손보는 것은 위 칸을 직접 고치는 쪽이 맡는다. 여기 적은 말은 **모든
          컷의 지문에 같이** 실린다 — "전체적으로 더 천천히" 같은 요청이 한 컷에만 먹으면
          그 컷만 다른 영상이 된다.
          ★ 프롬프트가 있을 때만 보인다 — 없으면 고칠 것이 없다(위에 만들기 버튼이 있다).
          ★ 통짜 갈래에는 안 보인다 — 거기서는 고칠 것이 위 칸 하나뿐이고, 다시 쓸 LLM
            호출 자체가 없다(프롬프트가 시나리오 원문이다). */}
      {!oneShot && cuts.some((c) => c?.clip_prompt) && (
        <div className="note-form">
          <AutoTextarea
            className="field"
            rows={3}
            value={note}
            disabled={!!saving}
            onChange={(e) => setNote(e.target.value)}
            placeholder="고치고 싶은 것을 적어 주세요 — 예) 전체적으로 카메라를 더 천천히 움직여 줘"
          />
          {/* 다시 쓰면 지금 프롬프트는 사라진다 — 모르면 고친 것을 잃는다.
              ★ 누르기 전에만 뜬다(②시나리오와 같은 규칙) — 이미 누른 뒤에 읽을 말이 아니다. */}
          {saving !== "all" && (
            <p className="pgsub">전체 컷을 다시 써요 — 지금 적힌 프롬프트는 사라져요.</p>
          )}
          <div className="note-act">
            <button type="button" className="mini" disabled={!!saving} onClick={makeAll}>
              {note.trim() ? "이대로 고치기" : "전부 다시 쓰기"}
            </button>
          </div>
        </div>
      )}

      <div className="step-actions">
        <ReelBack step="prompts" id={id} />
        <span className="hint">
          {oneShot
            ? (ready ? "" : "시나리오와 그림을 먼저 만들어 주세요.")
            : ready ? ""
            : isPromptsReady(cuts) ? "그림이 빠진 컷이 있어요."
            : "아직 비어 있는 컷이 있어요."}
        </span>
        <div className="fwd">
          {/* 판정은 서버(app/api/reel/[id]/clips/route.js)와 같은 함수(canBakeReel) 다 —
              손으로 다시 적으면 화면이 열어 준 버튼을 서버가 400 으로 막는 어긋남이 생긴다. */}
          <Link
            className="cta"
            aria-disabled={!ready}
            href={ready ? reelStepHref(videoStep, id) : "#"}
            onClick={(e) => { if (!ready) e.preventDefault(); }}
          >
            영상 만들기 →
          </Link>
        </div>
      </div>
    </section>
  );
}
