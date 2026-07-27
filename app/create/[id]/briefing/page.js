"use client";

// ① 자료 — 되물을 것이 있을 때만 멈춘다.
//
// 정리된 요약("이렇게 이해했어요" 카드)은 보여주지 않는다. 대본 지문에서 브리핑 요약을 뺀 뒤로
// key_points가 원고에 직접 닿지 않기 때문이다 — 사장님이 고칠 실익이 없는 것을 확인시키면
// 게이트만 하나 늘어난다. topic(이미지 주제 앵커)과 사실 개수(자동 길이)는 그대로 쓰인다.
//
// 그래서 이 화면은 셋 중 하나다: 정리하는 중 / 되물을 것 / (둘 다 아니면) 대본으로 바로 통과.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import { capacitySeconds } from "../../../../lib/script";

export default function BriefingStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const started = useRef(false);
  const passed = useRef(null); // 자동 통과는 프로젝트당 한 번만 — 뒤로 돌아왔을 때 다시 튕기지 않게

  // 브리핑이 없으면 자동으로 정리 시작 (새로고침으로 들어와도 이어진다)
  useEffect(() => {
    if (project && !project.briefing && !started.current) {
      started.current = true;
      extract();
    }
  }, [project?.id, project?.briefing]);

  const brief = project?.briefing;
  const pending = (brief?.asked || []).filter((a) => !a.done);

  // 되물을 것이 없으면 멈추지 않는다 — 확정하고 대본으로 넘긴다
  useEffect(() => {
    if (!brief || brief.confirmed || pending.length > 0 || passed.current === id) return;
    passed.current = id;
    confirmAndGo();
  }, [brief, pending.length, id]);

  async function extract() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/briefing`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "자료를 정리하지 못했어요");
    }
    await load(id).catch(() => {});
    setBusy(false);
  }

  async function patchBriefing(patch) {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefing: patch }),
    }).catch(() => null);
    if (!res || !res.ok) setErr("저장하지 못했어요 — 다시 시도해 주세요");
    await load(id).catch(() => {});
    return !!res && res.ok;
  }

  async function answer(idx, value) {
    const asked = (brief.asked || []).map((a, i) => (i === idx ? { ...a, answer: value, done: true } : a));
    await patchBriefing({ asked });
  }

  async function confirmAndGo() {
    setBusy(true);
    const ok = await patchBriefing({ confirmed: true });
    setBusy(false);
    if (ok) router.replace(`/create/${id}/script`);
  }

  // 이야기를 더 들려준 뒤에는 원고를 다시 써야 반영된다 — 그 자리를 명시적으로 만든다
  async function rewriteScript() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/script`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "대본을 다시 쓰지 못했어요");
      setBusy(false);
      return;
    }
    await load(id).catch(() => {});
    router.push(`/create/${id}/script`);
  }

  if (!project) return <p className="pgsub">준비 중…</p>;

  if (!brief) {
    return err ? (
      <p className="pgsub warn">
        {err} <button className="mini" onClick={extract} disabled={busy}>다시 정리하기</button>
      </p>
    ) : (
      <p className="pgsub">자료를 정리하는 중…</p>
    );
  }

  // 되물을 것이 없는데 여기 있다면 되돌아온 것이다(자동 통과는 위에서 한 번만 돈다)
  if (pending.length === 0) {
    return (
      <section className="panel panel--narrow">
        <h2>자료는 준비됐어요</h2>
        <p className="pgsub">{project.material?.text?.slice(0, 120)}…</p>
        <div className="step-actions">
          <div className="fwd">
            <button className="cta" disabled={busy} onClick={() => router.push(`/create/${id}/script`)}>
              대본 보러 가기 →
            </button>
          </div>
        </div>
      </section>
    );
  }

  const hasScript = !!project.script?.text;
  const capacity = capacitySeconds({ briefing: brief });

  return (
    <section className="panel panel--narrow">
      <h2>{pending.length}가지만 여쭤요 <span className="badge vlm">대본이 구체적이 됩니다</span></h2>
      {err && <p className="pgsub warn">{err}</p>}

      <div className="ask">
        {(brief.asked || []).map((a, i) => a.done ? null : (
          <div className="ask-q" key={i}>
            <p>{a.question}</p>
            <div className="row">
              {(a.options || []).map((o) => (
                <button className="mini" key={o} onClick={() => answer(i, o)}>{o}</button>
              ))}
              <input className="sent-input" placeholder="직접 입력"
                onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value.trim()) answer(i, e.currentTarget.value.trim()); }} />
              <button className="mini" onClick={() => answer(i, null)}>건너뛰기</button>
            </div>
          </div>
        ))}
      </div>

      {brief.asked?.some((a) => a.done && a.answer) && (
        <div className="script-src">
          답해주신 것 — {brief.asked.filter((a) => a.done && a.answer).map((a, i) => <b key={i}>✓ {a.answer} </b>)}
        </div>
      )}
      <div className="script-src">
        답하시면 그만큼 대본에 담을 이야기가 늘어요 — 지금 자료로는 약 {capacity}초예요.
      </div>

      <div className="step-actions">
        <div className="fwd">
          <span className="hint">
            {hasScript
              ? "답한 이야기를 담으려면 대본을 다시 써야 해요"
              : "답을 마치면 바로 대본을 씁니다 — 건너뛰셔도 됩니다"}
          </span>
          {hasScript ? (
            <button className="cta" disabled={busy} onClick={rewriteScript}>
              이 이야기로 대본 다시 쓰기
            </button>
          ) : (
            <button className="cta" disabled={busy} onClick={confirmAndGo}>
              이대로 대본 쓰기
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
