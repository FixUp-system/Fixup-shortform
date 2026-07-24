"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "../../components/ProjectContext";

export default function CreatePage() {
  const router = useRouter();
  const { setProject } = useProject();
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]); // {id, filename, url}
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
      body: JSON.stringify({ material: { text, photos } }),
    });
    const data = await res.json();
    if (res.ok) router.push(`/create/${data.id}/briefing`);
    else { setErr(data.error || "생성 실패"); setBusy(false); }
  }

  return (
    <>
      <h1 className="pgtitle">영상 만들기 (단계별)</h1>
      <p className="pgsub">자료를 주시면 기계가 정리해 보여드려요 — 확인 → 대본 → 목소리 → 이미지 → 영상 → 완성</p>
      <section className="panel" style={{ maxWidth: 760 }}>
        <div className="eyebrow">레퍼런스 자료 — 텍스트 <small>제품 설명·홍보 포인트·이야기 등 자유롭게</small></div>
        <textarea className="ref" value={text} maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 이번 주 신메뉴 생딸기라떼. 매일 아침 생딸기를 직접 갈아서 만듦…" />
        <div className="char-count">{text.length}자 / 2,000자</div>

        <div className="eyebrow">사진 <small>장면 소스 + AI 컷의 기준 이미지 (선택, ≤10장)</small></div>
        <div className="uploads">
          {photos.map((p) => (
            <div key={p.id} className="up photo-mark" style={{ background: "#333" }}>
              <img src={p.url} alt={p.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button className="tag" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))}>✕ {p.filename.slice(0, 8)}</button>
            </div>
          ))}
          {photos.length < 10 && (
            <label className="up add">+<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onFiles} /></label>
          )}
        </div>

        {err && <p className="pgsub" style={{ color: "var(--warn)" }}>{err}</p>}
        <button className="cta" onClick={submit} disabled={busy || !text.trim()}>
          {busy ? "여는 중…" : "정리하기 →"} <span className="cr">무료</span>
        </button>
      </section>
    </>
  );
}
