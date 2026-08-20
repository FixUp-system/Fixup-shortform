"use client";

// /film/new — 1 입력. **프로젝트가 아직 없는 자리**다.
//
// ★★ 왜 `/film/<id>/briefing` 과 따로인가: 단계 레이아웃(app/film/[id]/layout.js)은
//   프로젝트를 읽어 스테퍼와 가드를 건다 — 읽을 문서가 없으면 할 일이 없다. 그래서
//   "만들기 전"만 여기에 두고, 만든 뒤의 입력 화면은 `/film/<id>/briefing` 이 보여 준다.
//   ★ 그래서 이 화면만 useFilmProject 를 안 쓴다(레이아웃 밖이다). 부르는 문은
//   `POST /api/film` 하나뿐이고, 만들자마자 시나리오 단계로 넘긴다.
//
// ★ 내용은 옛 한 화면(app/film/one/[mode]/page.js)의 입력 <section> 을 그대로 옮긴 것이다.
//   달라진 것은 끝뿐 — 예전에는 같은 화면에 머물렀고, 지금은 다음 단계로 보낸다.
//
// ★ 무엇을 만드는가(컨셉·분위기·화풍·언어·사이즈)는 사장님이 고른다. 어떻게 굽는가
//   (길이·화질·모델)는 서버가 박는다 — 두 방식의 조건이 같아야 비교가 성립하기 때문이다.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
// 주소는 단계 표 한 벌이 만든다 — 화면이 `/film/<id>/scenario` 를 손으로 적으면 두 벌이 된다.
import { FILM_STEPS, filmStepHref } from "../../../lib/film/steps";
import { ASPECTS, DEFAULT_ASPECT_ID, aspectFor } from "../../../lib/aspects";
import { AD_FORMATS, AD_MOODS, AD_LANGS, AD_STYLE_LINES, DEFAULT_AD_OPTIONS } from "../../../lib/ad/options";
import { STYLE_PRESETS } from "../../../lib/styles";
// 사진 상한 — 서버(app/api/film/route.js)와 **같은 파일**에서 읽는다. 손으로 두 벌 적으면
// 화면은 통과시키는데 서버가 400 을 내고, 사장님은 다 올린 뒤에야 거절당한다.
import { MAX_PHOTOS } from "../../../lib/photos";
import { MAX_MATERIAL_TEXT } from "../../../lib/material";

// 화풍은 영상용 문구가 있는 것만 고를 수 있다 — 광고 화면(app/ads/new/page.js)과 같은 규칙이다.
const AD_STYLES = STYLE_PRESETS.filter((s) => Object.keys(AD_STYLE_LINES).includes(s.id));

export default function FilmNewPage() {
  const router = useRouter();

  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]); // {id, filename, url}
  const [aspect, setAspect] = useState(DEFAULT_ASPECT_ID);
  // ★★ 조건 넷을 화면이 고른다(2026-08-19). 그전에는 안 보내서 전부 기본값으로 떨어졌고,
  //   야구단 굿즈 광고에 mood=premium 이 박혀 모델이 정장 코트를 입고 나왔다.
  //   기본값은 lib/ad/options.js 의 것을 그대로 쓴다 — 두 벌이면 갈린다.
  const [format, setFormat] = useState(DEFAULT_AD_OPTIONS.format);
  const [mood, setMood] = useState(DEFAULT_AD_OPTIONS.mood);
  const [style, setStyle] = useState(DEFAULT_AD_OPTIONS.style);
  const [lang, setLang] = useState(DEFAULT_AD_OPTIONS.narration_lang);
  const [busy, setBusy] = useState("");
  // 사진이 아직 올라가는 중인가. ★ busy 로 겸할 수 없다 — 2026-08-18 에 업로드가 0.57초
  // 져서 사진 0장으로 나갔고, 사진 없는 광고에 $3.63 을 치렀다. 이 경로에서 사진은
  // **그림의 참조**라 없으면 제품이 딴 물건으로 그려진다.
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  const locked = !!busy || uploading;

  async function onFiles(e) {
    const files = Array.from(e.target.files);
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setErr(`사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요`);
    // ★ 켜는 자리가 첫 await 앞이어야 한다. 뒤에 두면 그 사이에 눌린 버튼이 이미 이겼다.
    setUploading(true);
    try {
      for (const file of files.slice(0, Math.max(room, 0))) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setPhotos((p) => [...p, data]);
        else setErr(data.error || "업로드 실패");
      }
    } finally {
      // 실패해도 반드시 푼다 — 안 그러면 한 번 실패한 사장님은 버튼이 영영 잠긴다.
      setUploading(false);
      e.target.value = "";
    }
  }

  // 만들기 — 길이·화질·모델은 서버가 박는다(두 방식의 조건을 같게 두려고).
  // 여기서 고르는 것은 자료·사진·사이즈·컨셉·분위기·화풍·언어뿐이다.
  async function create() {
    setBusy("create"); setErr("");
    const res = await fetch("/api/film", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        material: { text, photos },
        settings: { aspect_ratio: aspect, format, mood, style, narration_lang: lang },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "만들지 못했어요"); setBusy(""); return; }
    // ★ 다음 단계는 시나리오다. 주소는 단계 표가 만든다 — 세그먼트가 바뀌어도 여기가 안 깨진다.
    // ★ busy 를 안 푼다. 화면이 곧 바뀌므로, 여기서 풀면 그 찰나에 [시작하기]가 다시 열려
    //   프로젝트가 둘 만들어질 수 있다.
    router.replace(filmStepHref(FILM_STEPS.find((s) => s.key === "scenario"), data.id));
  }

  return (
    <>
      <h1 className="pgtitle">한 번에 굽는 영상</h1>
      <p className="pgsub">소재와 사진을 주시면 시나리오부터 함께 만들어요.</p>
      {err && <p className="pgsub warn">{err}</p>}

      <section className="panel--wide">
        <div className="composer">
          <textarea
            className="field composer-text"
            value={text}
            maxLength={MAX_MATERIAL_TEXT}
            onChange={(e) => setText(e.target.value)}
            placeholder="무엇을 만들고 싶으세요? 제품·강조하고 싶은 점·타깃을 자유롭게 적어 주세요"
          />

          {photos.length > 0 && (
            <div className="uploads">
              {photos.map((p) => (
                <div key={p.id} className="up photo-mark">
                  <img src={p.url} alt={p.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button
                    className="tag"
                    disabled={locked}
                    onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))}
                  >
                    ✕ {p.filename.slice(0, 6)}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="composer-tray">
            <div className="tray-row">
              <span className="tray-label">컨셉</span>
              <div className="tray-col">
                <div className="chips">
                  {AD_FORMATS.map((f) => (
                    <button key={f.id} className={`chip${format === f.id ? " on" : ""}`}
                      disabled={locked} onClick={() => setFormat(f.id)}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="tray-note">{AD_FORMATS.find((f) => f.id === format)?.beat}</div>
              </div>
            </div>

            <div className="tray-row">
              <span className="tray-label">분위기</span>
              <div className="tray-col">
                <div className="chips">
                  {AD_MOODS.map((m) => (
                    <button key={m.id} className={`chip${mood === m.id ? " on" : ""}`}
                      disabled={locked} onClick={() => setMood(m.id)}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="tray-row">
              <span className="tray-label">화풍</span>
              <div className="tray-col">
                <div className="chips">
                  {AD_STYLES.map((s) => (
                    <button key={s.id} className={`chip${style === s.id ? " on" : ""}`}
                      disabled={locked} onClick={() => setStyle(s.id)}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="tray-note">{AD_STYLES.find((s) => s.id === style)?.desc}</div>
              </div>
            </div>

            <div className="tray-row">
              <span className="tray-label">언어</span>
              <div className="tray-col">
                <div className="chips">
                  {/* 숨긴 언어(hidden)는 안 그린다 — 표에는 남아 있다 */}
                  {AD_LANGS.filter((l) => !l.hidden).map((l) => (
                    <button key={l.id} className={`chip${lang === l.id ? " on" : ""}`}
                      disabled={locked} onClick={() => setLang(l.id)}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="tray-row">
              <span className="tray-label">사이즈</span>
              <div className="tray-col">
                <div className="chips">
                  {ASPECTS.map((a) => (
                    <button
                      key={a.id}
                      className={`chip${aspect === a.id ? " on" : ""}`}
                      disabled={locked}
                      onClick={() => setAspect(a.id)}
                    >
                      {a.label} · {a.id}
                    </button>
                  ))}
                </div>
                <div className="tray-note">{aspectFor(aspect).note}에 맞는 규격이에요</div>
              </div>
            </div>
          </div>

          <div className="composer-bar">
            <button
              className="pill"
              disabled={locked || photos.length >= MAX_PHOTOS}
              onClick={() => fileRef.current?.click()}
            >
              ＋ 사진 {photos.length > 0 && <b>{photos.length}</b>}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onFiles} />
            <span className="spacer" />
            {/* 사진이 다 올라가기 전에는 못 누른다 — 사진 없이 나가면 참조가 빈 채로 그려진다 */}
            <button className="cta" disabled={locked || !text.trim()} onClick={create}>
              {busy === "create" ? "만드는 중…" : uploading ? "사진 올리는 중…" : "시작하기 →"} <span className="cr">무료</span>
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
