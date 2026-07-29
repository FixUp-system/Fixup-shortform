"use client";

// ④ 이미지 — 승인 게이트 (컷별 이미지 확인·재생성)
//
// 컷 분할은 여기가 아니라 대본 승인이 한다. 이 화면에 올 때는 컷도 낭독 길이도 이미 있다 —
// 그림은 컷당 후보 2장이라 가장 비싸므로, 사장님이 버튼을 눌러야 시작한다.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import BackButton from "../../../../components/BackButton";
import { isImageStale } from "../../../../lib/steps";

// 그림이 아직 없는 자리에 뭐라고 쓸지.
// "생성 중…"은 **실제로 도는 동안에만** 쓴다 — 누르기 전에도 그렇게 적혀 있으면
// 자동으로 만들어지는 줄 알고 기다리게 된다(아무 일도 안 일어나는데).
//
// 모듈 스코프에 둔다. 컷 목록과 미리보기 패널이 **서로 다른 컴포넌트**인데 둘 다 이것을 쓴다.
// 본 컴포넌트 안에 두면 PreviewPane 에서 ReferenceError 로 화면이 통째로 죽는다(실제로 죽었다).
const placeholder = (state) =>
  state === "needs_attention" ? "품질 확인 필요"
    : state === "generating" ? "생성 중…"
    : "아직 그리기 전";

export default function ImagesStepPage() {
  const { id } = useParams();
  const router = useRouter();
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

  // 진입·새로고침 복원: **만드는 중인** 컷이 남아 있으면 폴링을 잇는다.
  //
  // generating 만 본다. pending 은 "아직 시작 안 함"이기도 하다 —
  // 목소리를 마치면 컷이 pending 인 채로 이 화면에 오는데, 그때 폴링을 걸면
  // 화면이 busy 로 잠겨 [이미지 만들기] 버튼이 사라지고 영원히 기다린다(실제로 그랬다).
  useEffect(() => {
    const cuts = project?.cuts || [];
    const running = cuts.some((c) => c.state === "generating");
    if (running && !project.images_error && !pollRef.current && !pollTimedOut) {
      setBusy(true);
      startPolling();
    }
  }, [project?.status, project?.cuts, project?.images_error]);

  // 그림 만들기 시작 — 컷당 후보 2장이라 가장 비싼 단계다. 눌러야 나간다.
  async function start() {
    setErr(""); setPollTimedOut(false); setBusy(true);
    const res = await fetch(`/api/projects/${id}/images`, { method: "POST" });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "시작하지 못했어요");
      setBusy(false);
      return;
    }
    await load(id).catch(() => {});
    startPolling();
  }

  // 실패가 남은 경우의 빠져나갈 길. 다시 [이미지 만들기]를 누르면 409로 막힌다(만든 그림을
  // 지우지 않으려고). images_error를 지우는 서버 경로도 없다 — load만으로는 같은 실패가 돌아온다.
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
  // 화면 설명을 고친 뒤 옛 설명으로 그린 그림이 남아 있으면 클립을 사러 보내지 않는다
  const staleCount = cuts.filter(isImageStale).length;
  const imgUrl = (c) =>
    c.source === "photo" ? project.material.photos.find((p) => p.id === c.photo_id)?.url : c.image?.url;
  // 우측 미리보기 대상 — 사용자가 고른 컷, 고르기 전에는 첫 컷.
  // "이미지가 준비된 첫 컷"이 아니라 그냥 첫 컷이다: 만드는 동안에도 자리가 잡혀 있어야
  // 첫 장이 완성되는 순간 그 자리에서 보인다(빈 오른쪽을 보다가 갑자기 채워지지 않게).
  const activeIdx = cuts.some((c) => c.idx === selectedIdx) ? selectedIdx : cuts[0]?.idx ?? null;
  const activeCut = cuts.find((c) => c.idx === activeIdx) || null;
  // busy 는 방금 [이미지 만들기]를 누른 경우다 — 그때는 아직 컷이 pending 이라 generating 이 없다.
  // busy 없이 pending 만으로 판단하면 시작 전과 구별되지 않는다.
  const generating = cuts.some((c) => c.state === "generating") || (busy && cuts.some((c) => c.state === "pending"));
  // 새로고침·재진입으로 들어오면 실패는 화면 상태가 아니라 프로젝트에 남아 있다 — 둘 다 본다.
  // 접기(dismiss)는 프로젝트에 남은 실패에만 적용한다 — 그 뒤에 새로 난 실패는 그대로 보여야 한다.
  const shownErr = err || (dismissed ? "" : project.images_error || "");
  // 실패가 남아 있으면 파이프라인은 이미 죽었다 — 폴링을 기다릴 게 없으니 컷별 [다시 생성]을 열어준다
  const stalled = pollTimedOut || !!project.images_error;
  // 아직 한 장도 만들지 않았는가 — 시작 버튼을 보일지 가른다
  const madeAny = cuts.some((c) => c.image || c.source === "photo");
  // 구성이 없는 영상에서는 컷의 문장이 곧 그림을 만드는 글이다(lib/cuts.js buildImagePrompt).
  // 구성이 있으면 그림의 바탕은 장면 설명이지만, 그때도 문장은 어떤 그림을 고를지에 쓰인다(lib/vlm.js).
  const hasSynopsis = !!project.synopsis;

  return (
    <div className="images-layout">
      <section className="panel images-col">
        <h2>{cuts.length === 0 ? "대본을 먼저 만들어 주세요"
          : generating ? "컷별 이미지를 만들고 있어요"
          : !madeAny ? <>컷마다 그림을 그립니다 <span className="badge vlm">④ 이미지</span></>
          : <>컷별 이미지를 확인해 주세요 <span className="badge vlm">승인 게이트</span></>}</h2>
        {cuts.length > 0 && (
          <p className="pgsub">
            {hasSynopsis
              ? "이미지를 클릭하면 오른쪽에서 크게 보고 고칠 수 있어요 · 아래 문장은 읽어 줄 말이에요 — 그림을 만드는 바탕은 ②구성에 적어 둔 장면이라, 그림을 바꾸려면 오른쪽에 수정 지시를 적거나 ②구성의 장면 글을 고쳐 주세요"
              : "이미지를 클릭하면 오른쪽에서 크게 보고 고칠 수 있어요 · 아래 문장은 읽어 줄 말이면서, 이 영상에서는 그림을 만드는 글이기도 해요 — 문장을 고친 뒤 다시 만들면 그림도 달라져요"}
          </p>
        )}
        {shownErr && (
          <p className="pgsub warn">
            {shownErr}{" "}
            <button className="mini" onClick={dismiss} disabled={busy}>닫고 컷별로 다시 만들기</button>
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
                  <span className="ph">{placeholder(c.state)}</span>}
              </div>
              <div className="txt">
                “<span contentEditable suppressContentEditableWarning className="editable"
                  onBlur={(e) => {
                    const sentence = e.currentTarget.textContent.trim();
                    if (sentence && sentence !== c.sentence) editSentence(c.idx, sentence);
                  }}>{c.sentence}</span>”
                <div className="badges">
                  <span className={`badge ${c.source === "photo" ? "photo" : "ai"}`}>
                    {c.source === "photo" ? `내 사진 · ${photo?.filename || ""}` : "AI 생성"}
                  </span>
                  {(c.ref_ids?.length || c.ref_photo_id) && <span className="badge vlm">레퍼런스 적용</span>}
                  {c.vlm?.note && <span className="badge ai">{c.vlm.note.slice(0, 30)}</span>}
                  <span className="badge ai">{c.seconds}초</span>
                  {isImageStale(c) && (
                    <span className="badge warn">
                      화면 설명을 고친 뒤라 그림이 옛 설명으로 그려진 거예요 — 다시 만들면 됩니다
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!generating && !busy && cuts.length > 0 && (
          <div className="step-actions">
            <BackButton stepKey="images" />
            <div className="fwd">
              {!madeAny ? (
                <>
                  <button className="cta" disabled={busy} onClick={start}>
                    {busy ? "그리는 중…" : "이미지 만들기"}
                  </button>
                </>
              ) : (
                <>
                  <span className="hint">
                    {staleCount > 0
                      ? `고친 화면 ${staleCount}개를 다시 그려 주세요`
                      : "이미지가 곧 각 컷의 시작 프레임이 됩니다"}
                  </span>
                  <button
                    className="cta"
                    disabled={staleCount > 0}
                    onClick={() => router.push(`/create/${id}/video`)}
                  >
                    ⑤ 영상 만들러 가기 →
                  </button>
                </>
              )}
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
          hasSynopsis={hasSynopsis}
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
function PreviewPane({ cut, url, photoName, aspect, hasSynopsis, stalled, onRegen }) {
  const [instr, setInstr] = useState("");
  const isPhoto = cut.source === "photo";
  const busyCut = !stalled && cut.state === "generating";
  const atLimit = cut.regen_count >= 3;

  return (
    <aside className="panel preview-pane">
      <div className="preview-frame" style={frameStyle(aspect)}>
        {url ? <img src={url} alt="" /> : <span className="ph">{placeholder(cut.state)}</span>}
      </div>
      <div className="badges mt-md">
        <span className={`badge ${isPhoto ? "photo" : "ai"}`}>{isPhoto ? `내 사진 · ${photoName || ""}` : "AI 생성"}</span>
        {(cut.ref_ids?.length || cut.ref_photo_id) && <span className="badge vlm">레퍼런스 적용</span>}
        <span className="badge ai">{cut.seconds}초</span>
      </div>
      <p className="preview-sentence">“{cut.sentence}”</p>

      {isPhoto ? (
        <p className="preview-note">내가 올린 사진이라 그대로 쓰여요.</p>
      ) : (
        <div className="preview-edit">
          <p className="preview-note">
            {hasSynopsis
              ? "그림을 바꾸려면 여기에 적어주세요 — 위 문장은 읽어 줄 말이고, 그림을 만드는 바탕은 ②구성에 적어 둔 장면이에요. 문장을 고친 뒤 다시 만들면 고르는 그림이 달라질 수 있어요."
              : "그림을 바꾸려면 여기에 적어주세요 — 위 문장은 읽어 줄 말이면서 그림을 만드는 글이기도 해서, 문장을 고친 뒤 다시 만들면 그림도 달라져요."}
          </p>
          {cut.edit_instruction && <p className="preview-note">지난 수정 지시: {cut.edit_instruction}</p>}
          <textarea
            className="ref"
            placeholder="이 이미지에서 고치고 싶은 점을 적어주세요 — 예: 딸기라떼가 보이게, 컵을 더 작게, 손 빼기"
            value={instr}
            onChange={(e) => setInstr(e.target.value)}
          />
          {/* 만드는 중에는 글자로도 알린다 — 잠기기만 하면 눌렸는지 알 수 없어 또 누르게 된다 */}
          <div className="preview-actions">
            <button
              className="cta"
              disabled={atLimit || busyCut || !instr.trim()}
              onClick={() => onRegen(cut.idx, instr.trim())}
            >
              {busyCut ? "만드는 중…" : "이 지시로 다시 만들기"}
            </button>
            <button className="mini" disabled={atLimit || busyCut} onClick={() => onRegen(cut.idx)}>
              {busyCut ? "만드는 중…" : "그냥 다시"}
            </button>
          </div>
          <span className="regen-note mono">{atLimit ? "재생성 상한 도달 (3/3)" : `재생성 ${cut.regen_count}/3`}</span>
        </div>
      )}
    </aside>
  );
}
