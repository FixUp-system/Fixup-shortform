"use client";

// ⑤ 이미지 — 승인 게이트 3 (컷별 이미지 확인·재생성)
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
  const [selectedIdx, setSelectedIdx] = useState(null); // 우측 큰 미리보기로 볼 컷
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

  async function regen(idx, instruction) {
    setProject((p) => ({ ...p, cuts: p.cuts.map((c) => c.idx === idx ? { ...c, state: "generating" } : c) }));
    const res = await fetch(`/api/projects/${id}/cuts/${idx}/regen`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(instruction ? { instruction } : {}),
    });
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
  const imgUrl = (c) =>
    c.source === "photo" ? project.material.photos.find((p) => p.id === c.photo_id)?.url : c.image?.url;
  // 우측 미리보기 대상 — 사용자가 고른 컷, 없으면 이미지가 준비된 첫 컷
  const readyCuts = cuts.filter((c) => imgUrl(c));
  const activeIdx = cuts.some((c) => c.idx === selectedIdx) ? selectedIdx : readyCuts[0]?.idx ?? null;
  const activeCut = cuts.find((c) => c.idx === activeIdx) || null;
  const generating = cuts.some((c) => ["pending", "generating"].includes(c.state));
  // 새로고침·재진입으로 들어오면 실패는 화면 상태가 아니라 프로젝트에 남아 있다 — 둘 다 본다.
  // 접기(dismiss)는 프로젝트에 남은 실패에만 적용한다 — 그 뒤에 새로 난 실패는 그대로 보여야 한다.
  const shownErr = err || (dismissed ? "" : project.cuts_error || "");
  // 실패가 남아 있으면 파이프라인은 이미 죽었다 — 폴링을 기다릴 게 없으니 컷별 [다시 생성]을 열어준다
  const stalled = pollTimedOut || !!project.cuts_error;
  // 컷 분할이 끝나기 전 — 대본 승인 직후 이 화면에 도착하면 여기부터 보인다
  const splitting = project.status === "cuts" && cuts.length === 0 && !shownErr;

  return (
    <div className="images-layout">
      <section className="panel images-col">
        <h2>{splitting ? "대본을 컷으로 나누는 중이에요"
          : cuts.length === 0 ? "컷을 나누지 못했어요"
          : generating ? "컷별 이미지를 만들고 있어요"
          : <>컷별 이미지를 확인해 주세요 <span className="badge vlm">승인 게이트 3</span></>}</h2>
        {splitting && <p className="pgsub">잠시만요 — 나뉜 컷부터 차례로 이미지가 만들어집니다</p>}
        {!splitting && cuts.length > 0 && (
          <p className="pgsub">
            이미지를 클릭하면 오른쪽에서 크게 보고 고칠 수 있어요 · 아래 문장은 읽어 줄 말과 자막이에요 —
            고쳐도 그림은 바뀌지 않아요
          </p>
        )}
        {shownErr && (
          <p className="pgsub" style={{ color: "var(--warn)" }}>
            {shownErr}{" "}
            {cuts.length === 0
              ? <button className="mini" onClick={retry} disabled={busy}>다시 시도</button>
              : <button className="mini" onClick={dismiss} disabled={busy}>닫고 컷별로 다시 만들기</button>}
          </p>
        )}
        {cuts.map((c) => {
          const photo = project.material.photos.find((p) => p.id === c.photo_id);
          const img = imgUrl(c);
          return (
            <div className="scene" key={c.idx}>
              <div
                className={`thumb${c.source === "photo" ? " photo-mark" : ""}${c.idx === activeIdx ? " selected" : ""}`}
                onClick={() => setSelectedIdx(c.idx)}
              >
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
            </div>
          );
        })}
        {!generating && !busy && cuts.length > 0 && (
          <div className="step-actions">
            <div className="fwd">
              <span className="hint">여기까지가 지금 되는 데까지예요 — 이미지가 곧 각 컷의 시작 프레임이 됩니다</span>
              <button className="cta" disabled>영상화 — 준비 중 (⑥)</button>
            </div>
          </div>
        )}
      </section>

      {activeCut && (
        <PreviewPane
          key={activeCut.idx}
          cut={activeCut}
          url={imgUrl(activeCut)}
          photoName={project.material.photos.find((p) => p.id === activeCut.photo_id)?.filename}
          aspect={project.settings?.aspect_ratio || "9:16"}
          stalled={stalled}
          onRegen={regen}
        />
      )}
    </div>
  );
}

// 비율별 프레임 스타일 — 미리보기가 실제 출력 비율을 그대로 보여준다.
// 폭을 뷰포트 높이로 제한해 세로가 길어도 화면을 넘지 않고 비율이 유지된다.
const ASPECT = {
  "9:16": { css: "9 / 16", r: 9 / 16 },
  "1:1": { css: "1 / 1", r: 1 },
  "16:9": { css: "16 / 9", r: 16 / 9 },
};
function frameStyle(aspect) {
  const a = ASPECT[aspect] || ASPECT["9:16"];
  return { aspectRatio: a.css, maxWidth: `calc((100vh - 210px) * ${a.r})` };
}

// 우측 큰 미리보기 + 컷별 수정. instruction 입력은 컷마다 초기화돼야 하므로
// 부모가 key={cut.idx}로 이 컴포넌트를 갈아끼운다(로컬 state가 자연히 리셋됨).
function PreviewPane({ cut, url, photoName, aspect, stalled, onRegen }) {
  const [instr, setInstr] = useState("");
  const isPhoto = cut.source === "photo";
  const busyCut = !stalled && cut.state === "generating";
  const atLimit = cut.regen_count >= 3;

  return (
    <aside className="panel preview-pane">
      <div className="preview-frame" style={frameStyle(aspect)}>
        {url ? <img src={url} alt="" /> : <span className="ph">{cut.state === "needs_attention" ? "품질 확인 필요" : "생성 중…"}</span>}
      </div>
      <div className="badges" style={{ marginTop: 12 }}>
        <span className={`badge ${isPhoto ? "photo" : "ai"}`}>{isPhoto ? `내 사진 · ${photoName || ""}` : "AI 생성"}</span>
        {cut.ref_photo_id && <span className="badge vlm">레퍼런스 적용</span>}
        <span className="badge ai">{cut.seconds}초</span>
      </div>
      <p className="preview-sentence">“{cut.sentence}”</p>

      {isPhoto ? (
        <p className="preview-note">내가 올린 사진이라 그대로 쓰여요.</p>
      ) : (
        <div className="preview-edit">
          <p className="preview-note">그림을 바꾸려면 여기에 적어주세요 — 위 문장을 고치는 건 읽어 줄 말과 자막에만 반영돼요.</p>
          {cut.edit_instruction && <p className="preview-note">지난 수정 지시: {cut.edit_instruction}</p>}
          <textarea
            className="ref"
            placeholder="이 이미지에서 고치고 싶은 점을 적어주세요 — 예: 딸기라떼가 보이게, 컵을 더 작게, 손 빼기"
            value={instr}
            onChange={(e) => setInstr(e.target.value)}
          />
          <div className="preview-actions">
            <button
              className="cta"
              disabled={atLimit || busyCut || !instr.trim()}
              onClick={() => onRegen(cut.idx, instr.trim())}
            >
              이 지시로 다시 만들기
            </button>
            <button className="mini" disabled={atLimit || busyCut} onClick={() => onRegen(cut.idx)}>
              그냥 다시
            </button>
          </div>
          <span className="regen-note mono">{atLimit ? "재생성 상한 도달 (3/3)" : `재생성 ${cut.regen_count}/3`}</span>
        </div>
      )}
    </aside>
  );
}
