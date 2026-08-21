"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useReelProject } from "../layout";
import { isPromptsReady } from "../../../../lib/reel/doc";
import { REEL_STEPS, reelStepHref } from "../../../../lib/reel/steps";

// 4 영상 프롬프트 — **굽기 전이다.** 여기서 고치는 것은 값이 들지 않는다.
//
// ★ 프로젝트는 레이아웃이 읽어 컨텍스트에 담아 둔 것을 쓴다 — 화면마다 자기 fetch 를
//   두면 같은 문서를 여섯 번 읽고, 한 화면이 갱신한 값을 옆 화면이 모른다.
export default function ReelPromptsPage() {
  const { id } = useParams();
  const { project, reload } = useReelProject();
  const cuts = project?.cuts || [];
  const [saving, setSaving] = useState("");
  const [err, setErr] = useState("");

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

  async function makeAll() {
    setSaving("all"); setErr("");
    const res = await fetch(`/api/reel/${id}/prompts`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "영상 프롬프트를 못 만들었어요");
    await reload(id).catch((e) => setErr(e.message));
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

  const ready = isPromptsReady(cuts);
  const videoStep = REEL_STEPS.find((s) => s.key === "video");

  return (
    <section className="panel panel--wide">
      <h2>영상 프롬프트</h2>
      {/* ★ 이 단계를 따로 둔 이유 — 브리프의 요구대로 사장님 말로 적는다. */}
      <p className="pgsub">여기서 고치는 것은 무료예요 — 영상을 만들기 전이니까요. 굽고 나서 고치면 컷당 값이 나가요.</p>
      {err && <p className="pgsub warn">{err}</p>}

      {!cuts.length ? (
        <p className="pgsub">시나리오와 그림을 먼저 만들어 주세요.</p>
      ) : !cuts.some((c) => c?.clip_prompt) ? (
        <div className="step-actions">
          <button className="mini" disabled={!!saving} onClick={makeAll}>
            {saving === "all" ? "쓰는 중…" : "영상 프롬프트 만들기 · 무료"}
          </button>
        </div>
      ) : (
        cuts.map((c, i) => (
          <section key={i} className="panel">
            <h3>컷 {i + 1}</h3>
            {c.image?.url && <img className="thumb-media" src={c.image.url} alt={`컷 ${i + 1}`} />}
            <textarea
              className="field"
              defaultValue={c.clip_prompt || ""}
              onBlur={(e) => { if (e.target.value.trim() !== (c.clip_prompt || "")) save(i, e.target.value); }}
            />
            <button type="button" className="tag" disabled={!!saving} onClick={() => rewrite(i)}>
              {saving === `rewrite-${i}` ? "다시 쓰는 중…" : "다시 쓰기 · 무료"}
            </button>
          </section>
        ))
      )}

      <div className="step-actions">
        <span className="hint">{ready ? "모든 컷에 영상 프롬프트가 있어요." : "아직 비어 있는 컷이 있어요."}</span>
        <div className="fwd">
          {/* 판정은 서버(app/api/reel/[id]/clips/route.js)와 같은 함수(isPromptsReady) 다 —
              손으로 다시 적으면 화면이 열어 준 버튼을 서버가 400 으로 막는 어긋남이 생긴다. */}
          <Link
            className="cta"
            aria-disabled={!isPromptsReady(cuts)}
            href={isPromptsReady(cuts) ? reelStepHref(videoStep, id) : "#"}
            onClick={(e) => { if (!isPromptsReady(cuts)) e.preventDefault(); }}
          >
            영상 만들기 →
          </Link>
        </div>
      </div>
    </section>
  );
}
