"use client";

// ② 대본 — 승인 게이트 1 (무료)
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import { estimateSeconds } from "../../../../lib/script";
import { currentStepKey } from "../../../../lib/steps";

export default function ScriptStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [instruction, setInstruction] = useState("");

  // 대본이 아직 없으면 자동 생성 시작
  useEffect(() => {
    if (project && !project.script && project.briefing?.confirmed && !busy) genScript();
  }, [project?.status, project?.briefing?.confirmed]);

  async function genScript(instr) {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/script`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(instr ? { instruction: instr } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "대본 생성 실패");
    await load(id).catch(() => {});
    setBusy(false); setInstruction("");
  }

  // 이미 만든 컷이 있는가 — 단계 판정은 lib/steps 하나만 본다
  const hasCuts = currentStepKey(project) === "images" && (project.cuts || []).length > 0;

  async function approve() {
    // 이미 컷이 있으면 다시 만들지 않고 보러만 간다(서버도 409로 막는다 — 돈 나간 컷을 지우지 않게)
    if (hasCuts) { router.push(`/create/${id}/images`); return; }
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/cuts`, { method: "POST" });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "시작 실패");
      setBusy(false);
      return;
    }
    await load(id).catch(() => {});
    router.push(`/create/${id}/images`);
  }

  async function editParagraph(idx, text) {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script_paragraph: { idx, text } }),
    });
    await load(id).catch(() => {});
  }

  // 대본이 아직 없을 때 — 실패했다면 이유와 다시 쓰기 버튼을 보여준다(자동 재시도는 하지 않는다)
  if (!project.script) {
    if (err) {
      return (
        <p className="pgsub" style={{ color: "var(--warn)" }}>
          {err} <button className="mini" disabled={busy} onClick={() => genScript()}>다시 쓰기</button>
        </p>
      );
    }
    return <p className="pgsub">대본을 쓰는 중…</p>;
  }

  // 브리핑을 고쳐 다시 확정하면 버전이 올라간다 — 지금 대본이 그 이전 것인지 알려주기만 한다
  const staleScript =
    project.briefing?.version && project.script.briefing_version &&
    project.script.briefing_version !== project.briefing.version;

  return (
    <section className="panel" style={{ maxWidth: 760 }}>
      <h2>대본을 확인해 주세요 <span className="badge vlm">승인 게이트 1</span></h2>
      {err && <p className="pgsub" style={{ color: "var(--warn)" }}>{err}</p>}
      {staleScript && (
        <p className="pgsub" style={{ color: "var(--warn)" }}>
          브리핑이 바뀌었어요 — 지금 대본은 바뀌기 전 내용이에요{" "}
          <button className="mini" disabled={busy} onClick={() => genScript()}>대본 다시 쓰기</button>
        </p>
      )}
      <div className="script-box">
        {project.script.paragraphs.map((p, i) => (
          <p key={i}>
            <span className="tag">{p.tag}</span>
            <span
              contentEditable
              suppressContentEditableWarning
              style={{ outline: "none" }}
              onBlur={(e) => {
                const text = e.currentTarget.textContent.trim();
                if (text && text !== p.text) editParagraph(i, text);
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
      <button className="cta" disabled={busy} onClick={approve}>
        {hasCuts ? "④ 이미지 확인하러 가기" : "대본 승인 — 컷 나누고 이미지 만들기"}
      </button>
      <div className="credit-note">
        {hasCuts
          ? "이미 만든 컷이 있어요 — 다시 만들지 않고 그대로 보여드려요"
          : "컷당 이미지 후보 2장 생성 + AI 검수 (약 $0.08/컷) · 목소리(③)는 준비 중이라 건너뜁니다"}
      </div>
    </section>
  );
}
