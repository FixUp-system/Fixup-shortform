"use client";

// ② 대본 — 승인 게이트 (무료). 장면으로 끊기지 않은 하나의 원고를 읽고 고친다.
// 컷은 이 원고를 잘라서 만든다 — 여기서 승인한 문장이 이미지 단계까지 글자 그대로 간다.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import BackButton from "../../../../components/BackButton";
import { estimateSeconds } from "../../../../lib/script";
import { areCutsStale } from "../../../../lib/steps";
import { I2V_MAX_SECONDS } from "../../../../lib/clip-limits";

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
  const autoSplitFor = useRef(null);
  const splitPollRef = useRef(null);

  // 원고가 아직 없으면 자동 생성 시작
  useEffect(() => {
    if (project && !project.script?.text && project.briefing?.confirmed && autoGenFor.current !== id) {
      autoGenFor.current = id;
      genScript();
    }
  }, [project?.status, project?.briefing?.confirmed, id]);

  // 서버 원고가 바뀌면 편집 중인 초안을 버린다(재생성 결과가 화면에 보이게)
  useEffect(() => { setDraft(null); }, [project?.script?.version]);

  // 원고가 준비되면 구성(컷·화면·움직임)을 이어서 만든다.
  // 승인 뒤가 아니라 승인 앞에서 만드는 이유: 사장님이 원고와 구성을 함께 보고 고쳐야 한다.
  // 분할은 OpenAI 만 쓰고 fal 을 부르지 않아 여기서 돌려도 돈이 들지 않는다.
  //
  // 원고 버전마다 한 번씩만 돈다 — 같은 원고로 두 번 나누면 사장님이 고쳐 둔 화면이 지워진다.
  const scriptVersion = project?.script?.version;
  const cutsReady = (project?.cuts || []).length > 0 && !areCutsStale(project);
  useEffect(() => {
    if (!project?.script?.text || cutsReady || busy) return;
    const key = `${id}:${scriptVersion}`;
    if (autoSplitFor.current === key) return;
    autoSplitFor.current = key;
    splitCuts();
  }, [project?.script?.text, scriptVersion, cutsReady, busy]);

  // 분할이 끝나기를 기다린다 — 컷이 채워지면 화면이 그대로 열린다
  useEffect(() => {
    const splitting = project?.status === "cuts" && (project?.cuts || []).length === 0 && !project?.cuts_error;
    if (!splitting) { clearInterval(splitPollRef.current); splitPollRef.current = null; return; }
    if (splitPollRef.current) return;
    splitPollRef.current = setInterval(() => { load(id).catch(() => {}); }, 2000);
    return () => { clearInterval(splitPollRef.current); splitPollRef.current = null; };
  }, [project?.status, project?.cuts?.length, project?.cuts_error, id]);

  async function splitCuts() {
    const res = await fetch(`/api/projects/${id}/cuts`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aspect_ratio: aspect }),
    }).catch(() => null);
    // 409(이미 나눈 컷이 있음)는 정상이다 — 되돌아온 화면에서 다시 부른 경우다
    if (res && !res.ok && res.status !== 409) {
      setErr((await res.json().catch(() => ({}))).error || "구성을 만들지 못했어요");
    }
    await load(id).catch(() => {});
  }

  // 컷 한 줄 고치기 — 문장·화면·움직임
  async function saveCut(idx, patch) {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cut: { idx, ...patch } }),
    }).catch(() => null);
    if (!res || !res.ok) { setErr("고친 것을 저장하지 못했어요 — 다시 시도해 주세요"); return; }
    setErr("");
    await load(id).catch(() => {});
  }

  // 초점을 고치면 구성을 다시 만든다 — 라우트가 컷을 비우므로 이어서 부르면 새로 나뉜다.
  // 분할·화면 설계·캐스팅은 OpenAI 만 써서 fal 값이 들지 않는다.
  async function saveFocus(subject) {
    // busy 로 잠근다 — 저장하는 동안 컷이 비어 있어, 그 틈에 승인을 누르면 분할이 한 번 더 돈다.
    // 이 저장소가 같은 자리에서 이미 값을 치렀다(표시가 없어 두 번 눌렸다).
    if (busy) return;
    setBusy(true); setErr("");
    try {
      const focus = { ...project.briefing.focus, subject };
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefing: { focus } }),
      }).catch(() => null);
      if (!res || !res.ok) { setErr("고친 것을 저장하지 못했어요 — 다시 시도해 주세요"); return; }
      await load(id).catch(() => {});
      await splitCuts();
    } finally {
      setBusy(false);
    }
  }

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

  // 활성 모델의 클립 상한. 서버가 실어 보낸다 — 없으면(옛 응답) 기본 프로필 값으로 떨어진다
  const clipMax = project?.clip_limits?.max ?? I2V_MAX_SECONDS;

  const staleCuts = areCutsStale(project);
  const madeCuts = (project.cuts || []).length > 0;
  // 구성 — 낡은 컷은 보여주지 않는다(원고를 다시 썼으면 새로 나뉘는 중이다)
  const cuts = staleCuts ? [] : project.cuts || [];

  // 읽기 좋게 컷 경계마다 빈 줄을 넣어 보여준다. **저장되는 원고는 한 줄 그대로다.**
  //
  // 문단을 프롬프트로 요구했더니 지켜지지 않았다(빈 줄 하나 나오지 않았다). 문단은 창작이 아니라
  // 형식이라 코드가 쥐는 것이 맞다. 컷 경계를 쓰는 이유는 그것이 이미 의미 단위이고,
  // "컷을 이어붙이면 원고와 글자 그대로 같다"는 구조적 보장이 있어 글이 바뀔 수 없기 때문이다.
  const paragraphed =
    cuts.length > 1 && text ? cuts.map((c) => c.sentence).join("\n\n") : text;
  const shown = draft ?? paragraphed;

  // 저장할 때는 문단을 걷어 한 줄로 되돌린다 — 원고에 줄바꿈이 들어가면
  // splitSentences 가 그것을 문장 경계로 읽어(cuts.js:7) 컷이 달라진다.
  const flatten = (s) => s.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  const splitting = project.status === "cuts" && cuts.length === 0 && !project.cuts_error;
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
        onBlur={() => {
          if (draft === null) return;
          const next = flatten(draft);
          if (next && next !== text) saveText(next);
          else setDraft(null); // 문단만 다르고 내용은 같다 — 저장하지 않고 표시본으로 되돌린다
        }}
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

      {/* 초점 — 이 영상이 무엇을 따라가는지. 여기서 고치면 구성을 다시 만든다.
          그림과 클립이 이것을 기준으로 나오므로, 만들기 전에 고쳐야 값이 안 든다. */}
      {project.briefing?.focus?.subject && (
        <>
          <div className="eyebrow mt-lg">
            이 영상이 따라가는 것 <small>고치면 구성을 다시 만들어요</small>
          </div>
          <p className="pgsub">
            <b>{project.briefing.focus.mode}</b>{" — "}
            <span contentEditable suppressContentEditableWarning
              onBlur={(e) => {
                const v = e.currentTarget.textContent.trim();
                if (v && v !== project.briefing.focus.subject) saveFocus(v);
              }}>{project.briefing.focus.subject}</span>
          </p>
        </>
      )}

      {/* 구성 — 원고를 컷으로 나누고 컷마다 무엇을 보여줄지·어떻게 움직일지 정한 것.
          승인 앞에 두는 이유: 그림과 클립이 여기서 나오므로, 만들기 전에 고쳐야 값이 안 든다. */}
      <div className="eyebrow mt-lg">
        구성 <small>이 순서로 그림이 만들어지고, 적힌 대로 움직여요</small>
      </div>
      {splitting ? (
        <p className="pgsub">원고를 컷으로 나누는 중이에요…</p>
      ) : project.cuts_error ? (
        <p className="pgsub warn">
          {project.cuts_error}{" "}
          <button className="mini" disabled={busy} onClick={splitCuts}>다시 시도</button>
        </p>
      ) : cuts.length === 0 ? (
        <p className="pgsub">잠시만요 — 구성을 준비하고 있어요</p>
      ) : (
        <div className="plan-list">
          {cuts.map((c) => (
            <div className="plan-row" key={c.idx}>
              <span className="num">{c.idx + 1}</span>
              <div className="plan-body">
                <div className="preview-sentence">“{c.sentence}”</div>
                <div className="plan-field">
                  <b>화면</b>
                  <span contentEditable suppressContentEditableWarning className="editable"
                    onBlur={(e) => {
                      const v = e.currentTarget.textContent.trim();
                      if (v && v !== c.shows) saveCut(c.idx, { shows: v });
                    }}>{c.shows || "(아직 없음)"}</span>
                </div>
                <div className="plan-field">
                  <b>움직임</b>
                  <span contentEditable suppressContentEditableWarning className="editable"
                    onBlur={(e) => {
                      const v = e.currentTarget.textContent.trim();
                      if (v && v !== c.motion) saveCut(c.idx, { motion: v });
                    }}>{c.motion || "거의 정지, 아주 느린 카메라 이동"}</span>
                </div>
                <div className="badges">
                  <span className="badge ai">{c.seconds}초</span>
                  {c.seconds > clipMax && (
                    <span className="badge warn">
                      {clipMax}초까지만 움직여요 — 나머지는 멈춰 있어요
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
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
