"use client";

// /reel/new — 1 입력. **프로젝트가 아직 없는 자리**다(app/film/new/page.js 와 같은 이유).
//
// ★★ 왜 `/reel/<id>/briefing` 과 따로인가: 단계 레이아웃(app/reel/[id]/layout.js)은
//   프로젝트를 읽어 스테퍼와 가드를 건다 — 읽을 문서가 없으면 할 일이 없다. 그래서
//   "만들기 전"만 여기에 두고, 만든 뒤의 입력 화면은 `/reel/<id>/briefing` 이 보여 준다.
//   이 화면만 useReelProject 를 안 쓴다(레이아웃 밖이다). 부르는 문은 `POST /api/reel`
//   하나뿐이고, 만들자마자 시나리오 단계로 넘긴다.
//
// ★ 컨셉·분위기·화풍·언어는 사장님이 고른다(app/api/reel/route.js 가 normalizeAdOptions
//   로 이 넷을 요구한다). 길이도 사장님이 고른다 — 안 고르면 서버가 400 이다(그 라우트의
//   주석 참고: 정가가 길이에서 나오는데 대체 추정 경로가 없어서, 옛 흐름과 달리 명시로
//   요구한다).
//
// ★★ **화질(해상도) 선택지를 여기 안 둔다 — 판단이다.** `POST /api/reel` 은 body.settings
//   에서 `format·mood·narration_lang·style`(normalizeAdOptions) 과 `aspect_ratio`·
//   `target_seconds` 만 읽고 저장한다 — `resolution` 은 아예 받지 않는다(전체를 다시
//   읽어도 이 라우트에 그 이름이 0건이다, 2026-08-21 확인). 실제로 쓰이는 해상도는
//   `lib/clip-limits.js` 의 `resolutionForProject` 가 `project.settings.resolution` 이
//   없을 때 기본값(720p)으로 떨어뜨려 정하는데, 그 필드를 저장할 문이 없으니 화면에
//   고르는 자리를 둬도 **아무 효과가 없다.** 고른 것이 무시되는 선택지를 보여 주는 것이
//   실제로 없는 것보다 나쁘다고 판단했다 — 다음 태스크가 라우트에 그 필드를 받게 하면
//   이 화면도 함께 열면 된다.
//
// ★ 사이즈(화면 비율) 선택지도 없다. reel 은 "숏폼"이 표제 기능이라 DEFAULT_ASPECT_ID(9:16)
//   하나로 보낸다 — film·광고처럼 여러 채널에 맞추는 것이 목적이 아니다.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
// 주소는 단계 표 한 벌이 만든다 — 화면이 `/reel/<id>/scenario` 를 손으로 적으면 두 벌이 된다.
import { REEL_STEPS, reelStepHref } from "../../../lib/reel/steps";
import { DEFAULT_ASPECT_ID } from "../../../lib/aspects";
import { AD_FORMATS, AD_MOODS, AD_LANGS, AD_STYLE_LINES, DEFAULT_AD_OPTIONS } from "../../../lib/ad/options";
import { STYLE_PRESETS } from "../../../lib/styles";
import { TARGET_CHOICES } from "../../../lib/script";
// 사진 상한 — 서버(app/api/reel/route.js)와 **같은 파일**에서 읽는다. 손으로 두 벌 적으면
// 화면은 통과시키는데 서버가 400 을 내고, 사장님은 다 올린 뒤에야 거절당한다.
import { MAX_PHOTOS } from "../../../lib/photos";
import { MAX_MATERIAL_TEXT } from "../../../lib/material";

// 화풍은 영상용 문구가 있는 것만 고를 수 있다 — 광고 화면(app/ads/new/page.js)·
// film(app/film/new/page.js)과 같은 규칙이다.
const AD_STYLES = STYLE_PRESETS.filter((s) => Object.keys(AD_STYLE_LINES).includes(s.id));

export default function ReelNewPage() {
  const router = useRouter();

  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]); // {id, filename, url}
  const [format, setFormat] = useState(DEFAULT_AD_OPTIONS.format);
  const [mood, setMood] = useState(DEFAULT_AD_OPTIONS.mood);
  const [style, setStyle] = useState(DEFAULT_AD_OPTIONS.style);
  const [lang, setLang] = useState(DEFAULT_AD_OPTIONS.narration_lang);
  // 안 고르면 서버가 400 이다 — 그래서 여기서도 빈 값(안 고름)을 허용하지 않는다
  // (아래 create 의 disabled 조건). 기본으로 미리 골라 두면 사장님이 못 보고 지나간다.
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState("");
  // 사진이 아직 올라가는 중인가. ★ busy 로 겸할 수 없다(app/film/new/page.js 의 같은
  // 주석 참고 — 업로드가 짧게 져서 사진 0장으로 나간 사고가 있었다).
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  const locked = !!busy || uploading;

  async function onFiles(e) {
    const files = Array.from(e.target.files);
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setErr(`사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요`);
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
      setUploading(false);
      e.target.value = "";
    }
  }

  async function create() {
    setBusy("create"); setErr("");
    const res = await fetch("/api/reel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        material: { text, photos },
        settings: {
          aspect_ratio: DEFAULT_ASPECT_ID, target_seconds: target,
          format, mood, style, narration_lang: lang,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "만들지 못했어요"); setBusy(""); return; }
    // ★ 다음 단계는 시나리오다. 주소는 단계 표가 만든다 — 세그먼트가 바뀌어도 여기가 안 깨진다.
    // ★ busy 를 안 푼다 — 화면이 곧 바뀌므로, 여기서 풀면 그 찰나에 [시작하기]가 다시 열려
    //   프로젝트가 둘 만들어질 수 있다(app/film/new/page.js 와 같은 처방).
    router.replace(reelStepHref(REEL_STEPS.find((s) => s.key === "scenario"), data.id));
  }

  return (
    <>
      <h1 className="pgtitle">컷마다 말하는 영상</h1>
      <p className="pgsub">소재와 사진을 주시면 시나리오부터 함께 만들어요 — 컷 안에서 직접 말해요.</p>
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
                  <img className="thumb-media" src={p.url} alt={p.filename} />
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
              <span className="tray-label">길이</span>
              <div className="tray-col">
                <div className="chips">
                  {TARGET_CHOICES.map((s) => (
                    <button key={s} className={`chip${target === s ? " on" : ""}`}
                      disabled={locked} onClick={() => setTarget(s)}>
                      {s}초
                    </button>
                  ))}
                </div>
                <div className="tray-note">정가가 길이에서 나와요 — 굽기 전에 미리 알 수 있어요</div>
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
            <button className="cta" disabled={locked || !text.trim() || !target} onClick={create}>
              {busy === "create" ? "만드는 중…" : uploading ? "사진 올리는 중…" : "시작하기 →"} <span className="cr">무료</span>
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
