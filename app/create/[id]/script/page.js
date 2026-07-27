"use client";

// ② 대본 — 승인 게이트 (무료). 장면으로 끊기지 않은 하나의 원고를 읽고 고친다.
// 컷은 이 원고를 잘라서 만든다 — 여기서 승인한 문장이 이미지 단계까지 글자 그대로 간다.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import BackButton from "../../../../components/BackButton";
import { estimateSeconds } from "../../../../lib/script";
import { currentStepKey, areCutsStale } from "../../../../lib/steps";

export default function ScriptStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState(null); // 손으로 고치는 중인 원고(저장 전)
  const [aspect, setAspect] = useState(project.settings?.aspect_ratio || "9:16");
  // 자동 생성이 한 번만 돌게 막는다 — busy는 비동기라 effect가 두 번 불리면 과금이 두 배가 된다.
  const autoGenFor = useRef(null);

  // 원고가 아직 없으면 자동 생성 시작
  useEffect(() => {
    if (project && !project.script?.text && project.briefing?.confirmed && autoGenFor.current !== id) {
      autoGenFor.current = id;
      genScript();
    }
  }, [project?.status, project?.briefing?.confirmed, id]);

  // 서버 원고가 바뀌면 편집 중인 초안을 버린다(재생성 결과가 화면에 보이게)
  useEffect(() => { setDraft(null); }, [project?.script?.version]);

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

  // 손으로 고친 원고 저장 — 실패를 삼키지 않는다(고친 글이 사라진 줄 모르면 안 된다)
  async function saveText(text) {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script_text: text }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setErr("고친 글을 저장하지 못했어요 — 다시 저장해 주세요");
      return;
    }
    setErr("");
    setDraft(null);
    await load(id).catch(() => {});
  }

  // 이미 만든 컷이 있는가 — 단계 판정은 lib/steps 하나만 본다
  const hasCuts = currentStepKey(project) === "images" && (project.cuts || []).length > 0;

  async function approve() {
    // 이미 컷이 있으면 다시 만들지 않고 보러만 간다(서버도 409로 막는다 — 돈 나간 컷을 지우지 않게)
    if (hasCuts) { router.push(`/create/${id}/images`); return; }
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/cuts`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aspect_ratio: aspect }),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "시작 실패");
      setBusy(false);
      return;
    }
    await load(id).catch(() => {});
    router.push(`/create/${id}/images`);
  }

  const text = project.script?.text;

  // 원고가 아직 없을 때 — 실패했다면 이유와 다시 쓰기 버튼을 보여준다(자동 재시도는 하지 않는다)
  if (!text) {
    if (err) {
      return (
        <p className="pgsub" style={{ color: "var(--warn)" }}>
          {err} <button className="mini" disabled={busy} onClick={() => genScript()}>다시 쓰기</button>
        </p>
      );
    }
    return <p className="pgsub">대본을 쓰는 중…</p>;
  }

  const shown = draft ?? text;
  const staleCuts = areCutsStale(project);
  const madeCuts = (project.cuts || []).length > 0;

  return (
    <section className="panel" style={{ maxWidth: 760 }}>
      <h2>대본을 확인해 주세요 <span className="badge vlm">승인 게이트</span></h2>
      {err && <p className="pgsub" style={{ color: "var(--warn)" }}>{err}</p>}
      {staleCuts && (
        <p className="pgsub" style={{ color: "var(--warn)" }}>
          원고가 바뀌었어요 — 지금 이미지는 바뀌기 전 원고로 만든 것이에요
        </p>
      )}

      <textarea
        className="ref ref-lg"
        style={{ minHeight: 260, lineHeight: 1.9, fontSize: 15 }}
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== null && draft.trim() && draft !== text) saveText(draft.trim()); }}
      />
      <div className="script-src">
        이대로 읽으면 약 {estimateSeconds({ text: shown })}초 · 글을 고치면 그대로 저장돼요
        {draft !== null && draft !== text && " (저장하려면 글 밖을 한 번 클릭하세요)"}
      </div>
      <div className="script-src">
        컷은 이 원고를 잘라서 만들어요 — 여기서 승인한 문장이 그대로 화면에 실립니다
      </div>
      {madeCuts && (
        <div className="script-src" style={{ color: "var(--warn)" }}>
          이미 만들어 둔 이미지가 있어요 — 대본을 다시 쓰면 컷을 처음부터 다시 만들게 되고, 그 이미지는 지워져요
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "flex-end" }}>
        <textarea className="sent-input" style={{ flex: 1, minHeight: 96, padding: "13px 15px", fontSize: 14, resize: "vertical", fontFamily: "inherit", lineHeight: 1.55 }}
          placeholder='수정 지시 (예: "더 짧게", "가게 이름을 빼줘", "손님 이야기를 앞으로")'
          value={instruction} onChange={(e) => setInstruction(e.target.value)} />
        <button className="mini" style={{ padding: "13px 18px", fontSize: 13.5, whiteSpace: "nowrap" }}
          disabled={busy} onClick={() => genScript(instruction || "전체를 다시 써줘")}>
          {instruction ? "지시 반영" : "전체 다시 쓰기"}
        </button>
      </div>

      {!hasCuts && (
        <>
          <div className="eyebrow" style={{ marginTop: 18 }}>화면 비율 <small>이 비율로 이미지가 만들어져요</small></div>
          <div className="chips">
            {[["9:16", "세로 (숏폼)"], ["1:1", "정사각"], ["16:9", "가로"]].map(([r, label]) => (
              <button key={r} className={`chip${aspect === r ? " on" : ""}`} onClick={() => setAspect(r)}>
                {r} · {label}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="step-actions">
        <BackButton stepKey="script" />
        <div className="fwd">
          <span className="hint">
            {hasCuts
              ? "이미 만든 컷이 있어요 — 다시 만들지 않고 그대로 보여드려요"
              : madeCuts
              ? "지금 승인하면 컷을 처음부터 다시 만들어요 — 먼저 만든 이미지는 지워집니다"
              : "원고를 컷으로 나누고, 컷마다 화면을 설계해서 그려요 · 목소리(③)는 준비 중이라 건너뜁니다"}
          </span>
          <button className="cta" disabled={busy} onClick={approve}>
            {hasCuts ? "④ 이미지 확인하러 가기" : "대본 승인 →"}
          </button>
        </div>
      </div>
    </section>
  );
}
