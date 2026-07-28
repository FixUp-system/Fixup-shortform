"use client";

// ② 대본 — 승인 게이트 (무료). 장면으로 끊기지 않은 하나의 원고를 읽고 고친다.
// 컷은 이 원고를 잘라서 만든다 — 여기서 승인한 문장이 이미지 단계까지 글자 그대로 간다.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import BackButton from "../../../../components/BackButton";
import { estimateSeconds } from "../../../../lib/script";
import { areCutsStale } from "../../../../lib/steps";

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

  // 모자란 분량을 채울 이야기를 청한다 — 질문을 만들어 두고 답하는 화면(①자료)으로 보낸다.
  // 답한 뒤 거기서 "이대로 대본 쓰기"를 누르면 원고가 다시 쓰인다.
  async function askMore() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/briefing`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "develop" }),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "여쭤볼 것을 찾지 못했어요");
      setBusy(false);
      return;
    }
    await load(id).catch(() => {});
    router.push(`/create/${id}/briefing`);
  }

  // 지금 원고에서 나온 컷이 이미 있는가 — 낡은 컷은 다시 만들어야 하므로 세지 않는다.
  // 서버(POST /cuts)와 같은 판정을 쓴다. 어긋나면 화면은 넘어가는데 서버가 409로 막는다.
  const hasCuts = (project.cuts || []).length > 0 && !areCutsStale(project);

  async function approve() {
    // 이미 컷이 있으면 다시 만들지 않고 보러만 간다(서버도 409로 막는다 — 돈 나간 컷을 지우지 않게)
    if (hasCuts) { router.push(`/create/${id}/voice`); return; }
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
    // 분할이 도는 동안 목소리 화면에서 기다린다 — 그림보다 소리가 먼저다
    router.push(`/create/${id}/voice`);
  }

  const text = project.script?.text;

  // 원고가 아직 없을 때 — 실패했다면 이유와 다시 쓰기 버튼을 보여준다(자동 재시도는 하지 않는다)
  if (!text) {
    if (err) {
      return (
        <p className="pgsub warn">
          {err} <button className="mini" disabled={busy} onClick={() => genScript()}>다시 쓰기</button>
        </p>
      );
    }
    return <p className="pgsub">대본을 쓰는 중…</p>;
  }

  const shown = draft ?? text;
  const staleCuts = areCutsStale(project);
  const madeCuts = (project.cuts || []).length > 0;
  // 고른 길이를 못 채웠는가 — 사실 개수로 어림하지 않고 실제 원고를 재서 판단한다.
  // 모자라면 강요하지 않고 고르게 한다: 이야기를 더 들려주거나, 이대로 가거나.
  const chosen = project.settings?.target_seconds || null;
  const actual = estimateSeconds({ text: shown });
  const short = chosen ? chosen - actual : 0;
  const needsMore = chosen ? actual < chosen * 0.85 : false;

  return (
    <section className="panel panel--narrow">
      <h2>대본을 확인해 주세요 <span className="badge vlm">승인 게이트</span></h2>
      {err && <p className="pgsub warn">{err}</p>}
      {staleCuts && (
        <p className="pgsub warn">
          원고가 바뀌었어요 — 지금 이미지는 바뀌기 전 원고로 만든 것이에요
        </p>
      )}

      <textarea
        className="ref ref-lg script-draft"
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
      {needsMore && (
        <div className="script-src warn">
          고르신 {chosen}초에 <b>약 {short}초</b>가 모자라요 — 자료에 담긴 이야기를 다 썼거든요.
          이야기를 조금 더 들려주시면 채울 수 있어요.{" "}
          <button className="mini" disabled={busy} onClick={askMore}>이야기 더 들려주기</button>
          {" "}또는 이대로 승인하셔도 됩니다.
        </div>
      )}
      {madeCuts && (
        <div className="script-src warn">
          이미 만들어 둔 이미지가 있어요 — 대본을 다시 쓰면 컷을 처음부터 다시 만들게 되고, 그 이미지는 지워져요
        </div>
      )}
      <div className="fix-row">
        <textarea className="sent-input fix-input"
          placeholder='수정 지시 (예: "더 짧게", "가게 이름을 빼줘", "손님 이야기를 앞으로")'
          value={instruction} onChange={(e) => setInstruction(e.target.value)} />
        <button className="mini"
          disabled={busy} onClick={() => genScript(instruction || "전체를 다시 써줘")}>
          {instruction ? "지시 반영" : "전체 다시 쓰기"}
        </button>
      </div>

      {!hasCuts && (
        <>
          <div className="eyebrow mt-lg">화면 비율 <small>이 비율로 이미지가 만들어져요</small></div>
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
          {/* 이미 만든 컷으로 되돌아가는 길에는 설명을 붙이지 않는다 — 지나온 자리다.
              승인은 다르다: 무슨 일이 일어나는지, 무엇이 지워지는지 미리 말해야 한다. */}
          {!hasCuts && (
            <span className="hint">
              {madeCuts
                ? "지금 승인하면 컷을 처음부터 다시 만들어요 — 먼저 만든 이미지는 지워집니다"
                : "원고를 컷으로 나누고 컷마다 화면을 설계해요 · 그다음 목소리를 입히고, 읽은 길이에 맞춰 그림을 그립니다"}
            </span>
          )}
          <button className="cta" disabled={busy} onClick={approve}>
            {hasCuts ? "③ 목소리 만들러 가기 →" : "대본 승인 →"}
          </button>
        </div>
      </div>
    </section>
  );
}
