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
  const [dismissed, setDismissed] = useState(false); // 컷이 남은 채 난 실패를 화면에서 접었는가
  const pollRef = useRef(null);

  // 언마운트 정리 — ref까지 비운다. 비우지 않으면 (dev StrictMode의 재마운트처럼) 다시 마운트됐을 때
  // "이미 돌고 있음"으로 오인해 폴링이 되살아나지 않는다.
  useEffect(() => () => { clearInterval(pollRef.current); pollRef.current = null; }, []);

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
        setProject((p) => ({ ...p, status: st.status, cuts: st.cuts, cuts_error: st.cuts_error }));
        if (st.cuts_error) { stop(false); setErr(st.cuts_error); return; }
        const pending = (st.cuts || []).some((c) => ["pending", "generating"].includes(c.state));
        if (st.cuts?.length && !pending) stop(false);
      } catch {
        failures += 1;
        if (failures >= 5) stop(true);
      }
    }, 2000);
  }

  // 진입·새로고침 복원: 컷 분할 대기(컷이 아직 없음)거나 생성 중인 컷이 남아 있으면 폴링 재개
  useEffect(() => {
    const cuts = project?.cuts || [];
    const waiting = cuts.length === 0 || cuts.some((c) => ["pending", "generating"].includes(c.state));
    if (project?.status === "cuts" && !project.cuts_error && !pollRef.current && !pollTimedOut && waiting) {
      setBusy(true);
      startPolling();
    }
  }, [project?.status, project?.cuts, project?.cuts_error]);

  // 컷 분할이 실패한 뒤의 다시 시도 — 사용자가 누를 때만 파이프라인을 다시 띄운다
  async function retry() {
    setErr(""); setPollTimedOut(false); setBusy(true);
    const res = await fetch(`/api/projects/${id}/cuts`, { method: "POST" });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "다시 시도하지 못했어요");
      setBusy(false);
      return;
    }
    await load(id).catch(() => {});
    startPolling();
  }

  // 컷이 남은 채 실패한 경우의 빠져나갈 길. 여기서 POST /cuts는 409로 막히고(만든 컷을 지우지 않으려고),
  // cuts_error를 지우는 서버 경로도 없다 — load만으로는 같은 실패가 그대로 돌아온다.
  // 그래서 화면에서 접고, 최신 상태를 한 번 받아온 뒤 컷별 [다시 생성]으로 이어가게 한다.
  async function dismiss() {
    setErr(""); setDismissed(true);
    await load(id).catch(() => {});
  }

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

  const cuts = project.cuts || [];
  const generating = cuts.some((c) => ["pending", "generating"].includes(c.state));
  // 새로고침·재진입으로 들어오면 실패는 화면 상태가 아니라 프로젝트에 남아 있다 — 둘 다 본다.
  // 접기(dismiss)는 프로젝트에 남은 실패에만 적용한다 — 그 뒤에 새로 난 실패는 그대로 보여야 한다.
  const shownErr = err || (dismissed ? "" : project.cuts_error || "");
  // 실패가 남아 있으면 파이프라인은 이미 죽었다 — 폴링을 기다릴 게 없으니 컷별 [다시 생성]을 열어준다
  const stalled = pollTimedOut || !!project.cuts_error;
  // 컷 분할이 끝나기 전 — 대본 승인 직후 이 화면에 도착하면 여기부터 보인다
  const splitting = project.status === "cuts" && cuts.length === 0 && !shownErr;

  return (
    <section className="panel" style={{ maxWidth: 760 }}>
      <h2>{splitting ? "대본을 컷으로 나누는 중이에요"
        : cuts.length === 0 ? "컷을 나누지 못했어요"
        : generating ? "컷별 이미지를 만들고 있어요"
        : <>컷별 이미지를 확인해 주세요 <span className="badge vlm">승인 게이트 2</span></>}</h2>
      {splitting && <p className="pgsub">잠시만요 — 나뉜 컷부터 차례로 이미지가 만들어집니다</p>}
      {shownErr && (
        <p className="pgsub" style={{ color: "var(--warn)" }}>
          {shownErr}{" "}
          {cuts.length === 0
            ? <button className="mini" onClick={retry} disabled={busy}>다시 시도</button>
            : <button className="mini" onClick={dismiss} disabled={busy}>닫고 컷별로 다시 만들기</button>}
        </p>
      )}
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
                  <button className="mini" disabled={(!stalled && c.state === "generating") || c.regen_count >= 3} onClick={() => regen(c.idx)}>
                    {c.regen_count >= 3 ? "상한 도달" : "다시 생성"}
                  </button>
                  <span className="regen-note mono">재생성 {c.regen_count}/3</span>
                </>
              )}
            </div>
          </div>
        );
      })}
      {!generating && !busy && cuts.length > 0 && (
        <>
          <button className="cta" disabled>영상화 — 준비 중 (⑤)</button>
          <div className="credit-note">여기까지가 지금 되는 데까지예요 — 이미지가 곧 각 컷의 시작 프레임이 됩니다</div>
        </>
      )}
    </section>
  );
}
