"use client";

// ① 자료 — 정리 결과 확인·보강·확정 (개입 지점 1)
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";

const EMPTY = { topic: "", key_points: [""], audience: "", takeaway: "", asked: [], confirmed: false };
const BLANK = "(비어 있음)";

// 클릭하면 바로 고쳐지는 한 줄. 브리핑 카드의 네 칸이 모두 이걸 쓴다.
function EditableText({ value, placeholder, className, style, onCommit }) {
  return (
    <span
      className={className}
      style={style}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => {
        const raw = e.currentTarget.textContent.trim();
        const text = raw === placeholder ? "" : raw; // 안내 문구를 값으로 저장하지 않는다
        if (text !== value) onCommit(text);
      }}
    >{value || placeholder}</span>
  );
}

export default function BriefingStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState(null); // 직접 채우기 폴백용
  const started = useRef(false);

  // 브리핑이 없으면 자동으로 정리 시작 (새로고침으로 들어와도 이어진다)
  useEffect(() => {
    if (project && !project.briefing && !started.current) {
      started.current = true;
      extract();
    }
  }, [project?.id, project?.briefing]);

  async function extract() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/briefing`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "정리하지 못했어요");
      setDraft(EMPTY); // 백지 폼으로 폴백 — 직접 채울 수 있게
    } else {
      setDraft(null); // 다시 정리하기가 성공하면 백지 폼은 버린다
    }
    await load(id).catch(() => {});
    setBusy(false);
  }

  async function patch(briefing) {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefing }),
    });
    await load(id).catch(() => {});
  }

  // 백지 폼(폴백)에서는 아직 서버에 브리핑이 없으므로 draft에만 담고, 확정할 때 한 번에 저장한다.
  function save(patchObj) {
    return draft ? setDraft({ ...draft, ...patchObj }) : patch(patchObj);
  }

  async function answer(idx, value) {
    const asked = brief.asked.map((a, i) => (i === idx ? { ...a, answer: value, done: true } : a));
    await patch({ asked });
  }

  async function confirm() {
    // 마지막 칸을 채우고 바로 누르는 경우가 있다 — 눌러도 아무 일도 안 나는 대신 무엇이 빈지 알려준다.
    // (버튼을 disabled로 막으면 mousedown이 먹혀 편집 칸의 blur=저장이 아예 안 일어난다)
    if (!canConfirm) { setErr("주제와 핵심 내용을 채워 주세요"); return; }
    setBusy(true); setErr("");
    if (draft) await patch({ ...draft, key_points: draft.key_points.filter((k) => k.trim()) });
    await patch({ confirmed: true });
    router.push(`/create/${id}/script`);
  }

  const brief = project.briefing || draft;

  if (!brief) return <p className="pgsub">{busy ? "자료를 정리하는 중…" : err || "준비 중…"}</p>;

  const pending = (brief.asked || []).filter((a) => !a.done);
  const canConfirm = brief.topic.trim() && brief.key_points.some((k) => k.trim());

  return (
    <section className="panel" style={{ maxWidth: 760 }}>
      <h2>이렇게 이해했어요 <span className="badge vlm">확인 1</span></h2>
      {err && (
        <p className="pgsub" style={{ color: "var(--warn)" }}>
          {err} <button className="mini" onClick={extract} disabled={busy}>다시 정리하기</button>
        </p>
      )}

      <div className="brief">
        <div className="brief-row">
          <b>주제</b>
          <EditableText className="val" value={brief.topic} placeholder=""
            onCommit={(topic) => save({ topic })} />
        </div>
        <div className="brief-row">
          <b>핵심 내용</b>
          <div className="val">
            {brief.key_points.map((k, i) => (
              <div className="brief-point" key={i}>
                <EditableText value={k} placeholder="" style={{ outline: "none", flex: 1 }}
                  onCommit={(text) => save({
                    key_points: brief.key_points.map((v, j) => (j === i ? text : v)).filter((v) => v),
                  })} />
              </div>
            ))}
            <button className="mini" style={{ marginTop: 6 }}
              onClick={() => save({ key_points: [...brief.key_points, "새 내용"] })}>+ 내용 추가</button>
          </div>
        </div>
        <div className="brief-row">
          <b>보는 사람</b>
          <EditableText className={`val${brief.audience ? "" : " blank"}`} value={brief.audience} placeholder={BLANK}
            onCommit={(audience) => save({ audience })} />
        </div>
        <div className="brief-row">
          <b>보고 나면</b>
          <EditableText className={`val${brief.takeaway ? "" : " blank"}`} value={brief.takeaway} placeholder={BLANK}
            onCommit={(takeaway) => save({ takeaway })} />
        </div>
      </div>

      {pending.length > 0 && (
        <div className="ask">
          <h3>{pending.length}가지만 더 여쭤요 — 대본이 구체적이 됩니다</h3>
          {brief.asked.map((a, i) => a.done ? null : (
            <div className="ask-q" key={i}>
              <p>{a.question}</p>
              <div className="row">
                {a.options.map((o) => (
                  <button className="mini" key={o} onClick={() => answer(i, o)}>{o}</button>
                ))}
                <input className="sent-input" placeholder="직접 입력"
                  onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value.trim()) answer(i, e.currentTarget.value.trim()); }} />
                <button className="mini" onClick={() => answer(i, null)}>건너뛰기</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {brief.asked?.some((a) => a.done && a.answer) && (
        <div className="script-src">
          답해주신 것 — {brief.asked.filter((a) => a.done && a.answer).map((a, i) => <b key={i}>✓ {a.answer} </b>)}
        </div>
      )}

      <div className="script-src">칸을 클릭하면 바로 고칠 수 있어요</div>
      <button className="cta" disabled={busy} aria-disabled={!canConfirm} onClick={confirm}>
        이대로 대본 만들기
      </button>
      <div className="credit-note">대본은 무료예요 — 마음에 들 때까지 다시 쓸 수 있습니다</div>
    </section>
  );
}
