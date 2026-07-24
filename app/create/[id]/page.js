"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { estimateSeconds } from "../../../lib/script";

export default function ProjectPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [instruction, setInstruction] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const pollRef = useRef(null);

  async function load() {
    const res = await fetch(`/api/projects/${id}`);
    if (res.ok) setProject(await res.json());
    else setErr("프로젝트를 찾을 수 없어요");
  }
  useEffect(() => { load(); return () => clearInterval(pollRef.current); }, [id]);

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
        setErr("생성 상태 확인이 오래 걸리고 있어요 — 새로고침하거나 다시 시도해 주세요");
      }
    };
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > 5 * 60 * 1000) return stop(true);
      try {
        const res = await fetch(`/api/projects/${id}/cuts/status`);
        if (!res.ok) throw new Error();
        failures = 0;
        const st = await res.json();
        setProject((p) => ({ ...p, status: st.status, cuts: st.cuts }));
        const pending = (st.cuts || []).some((c) => ["pending", "generating"].includes(c.state));
        if (st.cuts?.length && !pending) stop(false);
      } catch {
        failures += 1;
        if (failures >= 5) stop(true);
      }
    }, 2000);
  }

  // 새로고침 복원: 생성 중인 컷이 남아 있으면 폴링 자동 재개
  useEffect(() => {
    if (
      project?.status === "cuts" &&
      !pollRef.current &&
      !pollTimedOut &&
      (project.cuts || []).some((c) => ["pending", "generating"].includes(c.state))
    ) {
      setBusy(true);
      startPolling();
    }
  }, [project?.status]);

  // 대본이 아직 없으면 자동 생성 시작
  useEffect(() => {
    if (project && project.status === "draft" && !busy) genScript();
  }, [project?.status]);

  async function genScript(instr) {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/script`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(instr ? { instruction: instr } : {}),
    });
    const data = await res.json();
    if (!res.ok) setErr(data.error || "대본 생성 실패");
    await load();
    setBusy(false); setInstruction("");
  }

  async function approveScript() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/cuts`, { method: "POST" });
    if (!res.ok) { setErr((await res.json()).error || "시작 실패"); setBusy(false); return; }
    startPolling();
  }

  async function regen(idx) {
    setProject((p) => ({ ...p, cuts: p.cuts.map((c) => c.idx === idx ? { ...c, state: "generating" } : c) }));
    const res = await fetch(`/api/projects/${id}/cuts/${idx}/regen`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) setErr(data.error);
    await load();
  }

  if (!project) return <p className="pgsub">{err || "불러오는 중…"}</p>;

  // draft도 step 2 — 자동 대본 생성 동안 "대본을 쓰는 중…" 표시 (빈 화면 방지)
  const step = project.status === "cuts" ? 3 : 2;
  const generating = busy && step >= 2 && (project.cuts || []).some?.((c) => ["pending", "generating"].includes(c.state));

  return (
    <>
      <h1 className="pgtitle">영상 만들기 (단계별)</h1>
      <nav className="stepper-h">
        <button className="done" disabled>1 자료·설정 ✓</button>
        <button className={step === 2 ? "on" : step > 2 ? "done" : ""} disabled>2 대본 확인</button>
        <button className={step === 3 ? "on" : ""} disabled>3 이미지 확인</button>
        <button disabled>4 영상화 (준비 중)</button>
      </nav>
      {err && <p className="pgsub" style={{ color: "var(--warn)" }}>{err}</p>}

      {step === 2 && project.script && (
        <section className="panel" style={{ maxWidth: 760 }}>
          <h2>대본을 확인해 주세요 <span className="badge vlm">승인 게이트 1</span></h2>
          <div className="script-box">
            {project.script.paragraphs.map((p, i) => (
              <p key={i}>
                <span className="tag">{p.tag}</span>
                <span
                  contentEditable
                  suppressContentEditableWarning
                  style={{ outline: "none" }}
                  onBlur={async (e) => {
                    const text = e.currentTarget.textContent.trim();
                    if (text && text !== p.text) {
                      await fetch(`/api/projects/${id}`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ script_paragraph: { idx: i, text } }),
                      });
                      await load();
                    }
                  }}
                >{p.text}</span>
              </p>
            ))}
          </div>
          <div className="script-src">이대로 읽으면 약 {estimateSeconds(project.script)}초 · 문장을 클릭하면 바로 고칠 수 있어요</div>
          {project.script.coverage?.length > 0 && (
            <div className="script-src">자료 반영 — {project.script.coverage.map((c, i) => <b key={i}>✓ {c} </b>)}</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <input className="sent-input" style={{ flex: 1 }} placeholder='수정 지시 (예: "더 짧게", "더 캐주얼하게")'
              value={instruction} onChange={(e) => setInstruction(e.target.value)} />
            <button className="mini" disabled={busy} onClick={() => genScript(instruction || "전체를 다시 써줘")}>
              {instruction ? "지시 반영" : "전체 다시 쓰기"}
            </button>
          </div>
          <button className="cta" disabled={busy} onClick={approveScript}>
            대본 승인 — 컷 나누고 이미지 만들기
          </button>
          <div className="credit-note">컷당 이미지 후보 2장 생성 + AI 검수 (약 $0.08/컷)</div>
        </section>
      )}

      {step === 2 && !project.script && <p className="pgsub">대본을 쓰는 중…</p>}

      {step === 3 && (
        <section className="panel" style={{ maxWidth: 760 }}>
          <h2>{generating ? "컷별 이미지를 만들고 있어요" : <>컷별 이미지를 확인해 주세요 <span className="badge vlm">승인 게이트 2</span></>}</h2>
          {(project.cuts || []).map((c) => {
            const photo = project.material.photos.find((p) => p.id === c.photo_id);
            const img = c.source === "photo" ? photo?.url : c.image?.url;
            return (
              <div className="scene" key={c.idx}>
                <div className={`thumb${c.source === "photo" ? " photo-mark" : ""}`}>
                  <span className="num">{c.idx + 1}</span>
                  {img ? <img src={img} alt="" /> :
                    <span className="ph">{c.state === "needs_attention" ? "품질 확인 필요" : "생성 중…"}</span>}
                </div>
                <div className="txt">
                  “<span contentEditable suppressContentEditableWarning style={{ outline: "none" }}
                    onBlur={async (e) => {
                      const sentence = e.currentTarget.textContent.trim();
                      if (sentence && sentence !== c.sentence) {
                        await fetch(`/api/projects/${id}`, {
                          method: "PATCH", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ cut: { idx: c.idx, sentence } }),
                        });
                        await load();
                      }
                    }}>{c.sentence}</span>”
                  <div className="badges">
                    <span className={`badge ${c.source === "photo" ? "photo" : "ai"}`}>
                      {c.source === "photo" ? `내 사진 · ${photo?.filename || ""}` : "AI 생성"}
                    </span>
                    {c.ref_photo_id && <span className="badge vlm">레퍼런스 적용</span>}
                    {c.vlm?.note && <span className="badge ai">{c.vlm.note.slice(0, 30)}</span>}
                    <span className="badge ai">{c.seconds}초</span>
                  </div>
                </div>
                <div className="ops" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {c.source === "ai" && (
                    <>
                      <button className="mini" disabled={(!pollTimedOut && c.state === "generating") || c.regen_count >= 3} onClick={() => regen(c.idx)}>
                        {c.regen_count >= 3 ? "상한 도달" : "다시 생성"}
                      </button>
                      <span className="regen-note mono">재생성 {c.regen_count}/3</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {!generating && (
            <>
              <button className="cta" disabled>영상화 — 준비 중 (M2)</button>
              <div className="credit-note">M1은 여기까지예요 — 이미지가 곧 각 컷의 시작 프레임이 됩니다</div>
            </>
          )}
        </section>
      )}
    </>
  );
}
