"use client";

// ④ 이미지 — 승인 게이트 2 (컷별 이미지 확인·재생성)
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";

export default function ImagesStepPage() {
  const { id } = useParams();
  const { project, setProject, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => () => clearInterval(pollRef.current), []);

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

  // 진입·새로고침 복원: 생성 중인 컷이 남아 있으면 폴링 재개
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
  }, [project?.status, project?.cuts]);

  async function regen(idx) {
    setProject((p) => ({ ...p, cuts: p.cuts.map((c) => c.idx === idx ? { ...c, state: "generating" } : c) }));
    const res = await fetch(`/api/projects/${id}/cuts/${idx}/regen`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error);
    await load(id).catch(() => {});
  }

  async function editSentence(idx, sentence) {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cut: { idx, sentence } }),
    });
    await load(id).catch(() => {});
  }

  const generating = (project.cuts || []).some((c) => ["pending", "generating"].includes(c.state));

  return (
    <section className="panel" style={{ maxWidth: 760 }}>
      <h2>{generating ? "컷별 이미지를 만들고 있어요" : <>컷별 이미지를 확인해 주세요 <span className="badge vlm">승인 게이트 2</span></>}</h2>
      {err && <p className="pgsub" style={{ color: "var(--warn)" }}>{err}</p>}
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
                onBlur={(e) => {
                  const sentence = e.currentTarget.textContent.trim();
                  if (sentence && sentence !== c.sentence) editSentence(c.idx, sentence);
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
      {!generating && !busy && (
        <>
          <button className="cta" disabled>영상화 — 준비 중 (⑤)</button>
          <div className="credit-note">여기까지가 지금 되는 데까지예요 — 이미지가 곧 각 컷의 시작 프레임이 됩니다</div>
        </>
      )}
    </section>
  );
}
