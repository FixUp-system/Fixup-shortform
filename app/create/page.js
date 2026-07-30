"use client";

// 자료를 넣는 화면 — 입력 박스 하나다.
//
// 층층이 쌓인 라벨+필드(자료·길이·컨셉·사진)를 버린 이유: 그것들은 네 가지 서류가 아니라
// "이 영상 한 편을 어떻게 만들까"라는 한 덩어리다. 박스 하나에 담고 조작을 안쪽 아래에
// 붙이면 사장님이 보는 것이 '채워야 할 칸 넷'에서 '적고 누르는 자리 하나'로 바뀐다.
//
// 조작은 알약이고, 알약은 **지금 값을 라벨에 이고 있다**(예: "길이 · 30초"). 눌러야만
// 알 수 있는 자리를 만들지 않는다 — 접힌 것 안에 값이 숨으면 안 고른 것과 구별이 안 된다.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "../../components/ProjectContext";
import { TARGET_CHOICES } from "../../lib/script";
import { DEFAULT_STYLE_ID, styleFor } from "../../lib/styles";
import StylePicker from "../../components/StylePicker";

export default function CreatePage() {
  const router = useRouter();
  const { setProject } = useProject();
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]); // {id, filename, url}
  const [seconds, setSeconds] = useState(null); // null = 자동(자료가 정함)
  const [stylePreset, setStylePreset] = useState(DEFAULT_STYLE_ID);
  const [styleNote, setStyleNote] = useState("");
  const [tray, setTray] = useState(null); // 열린 서랍: "length" | "style" | null
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  // 새 프로젝트를 시작하는 자리 — 이전 프로젝트의 단계가 사이드바에 남지 않게 비운다
  useEffect(() => { setProject(null); }, [setProject]);

  const openTray = (name) => setTray((t) => (t === name ? null : name));

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

      <section className="panel--wide">
        <div className="composer">
          <textarea className="composer-text" value={text} maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            placeholder="무엇을 알리고 싶으세요? 제품 설명·홍보 포인트·손님 이야기를 자유롭게 적어 주세요" />

          {/* 붙인 사진이 먼저 보인다 — 무엇을 이미 넣었는지가 조작보다 앞이다 */}
          {photos.length > 0 && (
            <div className="uploads">
              {photos.map((p) => (
                <div key={p.id} className="up photo-mark">
                  <img src={p.url} alt={p.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button className="tag" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))}>
                    ✕ {p.filename.slice(0, 6)}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="composer-bar">
            <button className="pill" disabled={photos.length >= 10}
              onClick={() => fileRef.current?.click()}>
              ＋ 사진 {photos.length > 0 && <b>{photos.length}</b>}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onFiles} />

            <button className={`pill${tray === "length" ? " open" : ""}`} onClick={() => openTray("length")}>
              길이 <b>{seconds ? `${seconds}초` : "자동"}</b>
            </button>
            <button className={`pill${tray === "style" ? " open" : ""}`} onClick={() => openTray("style")}>
              컨셉 <b>{styleFor(stylePreset).label}</b>
            </button>

            <span className="spacer" />
            <span className="count">{text.length} / 2,000자</span>
            <button className="cta" onClick={submit} disabled={busy || !text.trim()}>
              {busy ? "여는 중…" : "정리하기 →"} <span className="cr">무료</span>
            </button>
          </div>

          {tray === "length" && (
            <div className="composer-tray">
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
              <div className="tray-note">자료가 모자라면 더 짧아질 수 있어요</div>
            </div>
          )}

          {tray === "style" && (
            <div className="composer-tray">
              <StylePicker bare preset={stylePreset} note={styleNote}
                onPreset={setStylePreset} onNote={setStyleNote} />
            </div>
          )}
        </div>

        {err && <p className="pgsub warn">{err}</p>}
      </section>
    </>
  );
}
