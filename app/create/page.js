"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "../../components/ProjectContext";
import { TARGET_CHOICES } from "../../lib/script";
import { DEFAULT_STYLE_ID } from "../../lib/styles";
import StylePicker from "../../components/StylePicker";

export default function CreatePage() {
  const router = useRouter();
  const { setProject } = useProject();
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]); // {id, filename, url}
  const [seconds, setSeconds] = useState(null); // null = 자동(자료가 정함)
  const [stylePreset, setStylePreset] = useState(DEFAULT_STYLE_ID);
  const [styleNote, setStyleNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // 새 프로젝트를 시작하는 자리 — 이전 프로젝트의 단계가 사이드바에 남지 않게 비운다
  useEffect(() => { setProject(null); }, [setProject]);

  async function onFiles(e) {
    for (const file of e.target.files) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) setPhotos((p) => [...p, data]);
      else setErr(data.error || "업로드 실패");
    }
    e.target.value = "";
  }

  async function submit() {
    setBusy(true); setErr("");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        material: { text, photos },
        settings: { target_seconds: seconds, style: { preset: stylePreset, note: styleNote } },
      }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/create/${data.id}/briefing`);
    // 실패해도 써 둔 자료는 화면에 남는다(로컬 state) — 다시 누르면 된다
    else { setErr(data.error || "생성 실패"); setBusy(false); }
  }

  return (
    <>
      <h1 className="pgtitle">영상 만들기 (단계별)</h1>
      <p className="pgsub">자료를 주시면 기계가 정리해 보여드려요 — 확인 → 대본 → 목소리 → 이미지 → 영상 → 완성</p>
      <section className="panel panel--wide">
        <div className="eyebrow">레퍼런스 자료 — 텍스트 <small>제품 설명·홍보 포인트·이야기 등 자유롭게</small></div>
        <textarea className="ref ref-lg" value={text} maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 이번 주 신메뉴 생딸기라떼. 매일 아침 생딸기를 직접 갈아서 만듦…" />
        <div className="char-count">{text.length}자 / 2,000자</div>

        {/* 원하는 길이는 여기서 고른다 — 원고를 쓰기 전에 정해져야 하는 값이다.
            고르지 않으면 자료가 담은 사실 수만큼만 만든다(자동). */}
        <div className="eyebrow">영상 길이 <small>자료가 모자라면 더 짧아질 수 있어요</small></div>
        <div className="chips">
          <button className={`chip${seconds === null ? " on" : ""}`} onClick={() => setSeconds(null)}>
            자동 · 자료에 맞춰
          </button>
          {TARGET_CHOICES.map((s) => (
            <button key={s} className={`chip${seconds === s ? " on" : ""}`} onClick={() => setSeconds(s)}>
              {s}초
            </button>
          ))}
        </div>

        {/* 영상 컨셉도 길이와 같은 종류의 값이다 — 만들기 전에 정해져야 하고, 자료를 넣는
            이 자리가 가장 이르다. 나중에 ①자료 화면에서 바꿀 수 있다. */}
        <StylePicker preset={stylePreset} note={styleNote}
          onPreset={setStylePreset} onNote={setStyleNote} />

        <div className="eyebrow">사진 <small>장면 소스 + AI 컷의 기준 이미지 (선택, ≤10장)</small></div>
        <div className="uploads">
          {photos.map((p) => (
            <div key={p.id} className="up photo-mark">
              <img src={p.url} alt={p.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button className="tag" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))}>✕ {p.filename.slice(0, 8)}</button>
            </div>
          ))}
          {photos.length < 10 && (
            <label className="up add">+<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onFiles} /></label>
          )}
        </div>

        {err && <p className="pgsub warn">{err}</p>}
        <div className="step-actions">
          <div className="fwd">
            <button className="cta" onClick={submit} disabled={busy || !text.trim()}>
              {busy ? "여는 중…" : "정리하기 →"} <span className="cr">무료</span>
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
