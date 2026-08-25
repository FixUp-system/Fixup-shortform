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
// ★★ Task 12b(Ruling 14) — 화질(해상도)을 고르는 칸이 있다. 처음엔 여기 없었다 — 그때는
//   `POST /api/reel` 이 `settings.resolution` 을 아예 안 받아서, 고르는 자리를 둬도 값이
//   조용히 버려지고 늘 720p 로 청구됐다(480p 15초=40크레딧 vs 720p 15초=80크레딧, 2배
//   차이). 라우트가 그 필드를 받고 검증하게 고친 지금은(app/api/reel/route.js) 열어도
//   된다. 표는 이 흐름의 것(resolutionsForModel·videoPrice, i2v_model=DEFAULT_I2V_MODEL
//   로 서버가 고정한다) — 광고 쪽 짝(모델별 해상도·정가 함수)을 쓰면 화면이 보여 주는
//   값과 실제 청구가 갈린다.
//
// ★ 사이즈(화면 비율) 선택지는 없다. reel 은 "숏폼"이 표제 기능이라 DEFAULT_ASPECT_ID(9:16)
//   하나로 보낸다 — film·광고처럼 여러 채널에 맞추는 것이 목적이 아니다.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
// 주소는 단계 표 한 벌이 만든다 — 화면이 `/reel/<id>/scenario` 를 손으로 적으면 두 벌이 된다.
import { REEL_STEPS, reelStepHref } from "../../../lib/reel/steps";
import { DEFAULT_ASPECT_ID } from "../../../lib/aspects";
import { AD_MOODS, AD_LANGS, AD_STYLE_LINES, DEFAULT_AD_OPTIONS } from "../../../lib/ad/options";
// ★★ 컨셉은 **reel 자기 표**다(2026-08-25 사장님 지시). 예전에는 AD_FORMATS(광고 포맷)를
//   그대로 그렸는데, 다섯이 전부 "팔 물건이 있다"를 전제로 해서 범용 영상에는 좁았다
//   — 그 다섯은 새 표의 "제품 홍보" 한 칸 안에 다 들어간다.
//   ★ 광고 화면(app/ads/new)은 여전히 AD_FORMATS 를 쓴다 — 그 흐름은 남겨 둔다.
import { REEL_CONCEPTS, DEFAULT_REEL_CONCEPT } from "../../../lib/reel/concepts";
import { STYLE_PRESETS } from "../../../lib/styles";
import { TARGET_CHOICES } from "../../../lib/script";
// 모델은 서버가 박는다(DEFAULT_I2V_MODEL) — 화면은 그 모델이 여는 해상도 목록만 읽는다
// (resolutionsForModel). isResolutionFor 는 라우트와 같은 판정이라 여기서는 안 쓴다(화면은
// 목록에서 고르므로 애초에 모르는 값이 안 생긴다 — 검증은 서버 몫).
import { resolutionsForModel, DEFAULT_I2V_MODEL, DEFAULT_RESOLUTION } from "../../../lib/clip-limits";
// ★★ 이 화면은 **값을 한 글자도 말하지 않는다**(2026-08-25 사장님 지시). 예전에는 길이·화질
//   칩 뒤에 크레딧이 붙었다(화질 쪽은 길이를 고른 뒤에만 나타났다) — 둘 다 뗐고, 그것을
//   설명하던 문구("정가가 길이·화질에서 나와요", "화질이 정가를 바꿔요")도 같이 뺐다.
//   그래서 lib/pricing 을 **더 이상 import 하지 않는다.** 값을 말하는 자리는 실제로 돈이
//   나가는 ⑤영상 하나뿐이다.
//   ⚠️ 판정은 그대로다 — 화질이 정가를 바꾸는 것 자체는 변함이 없고(videoPrice), 청구는
//     서버가 settings.resolution 을 읽어 한다. 문구만 뺀 것이지 값이 바뀐 것이 아니다.
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
  const [concept, setConcept] = useState(DEFAULT_REEL_CONCEPT);
  const [mood, setMood] = useState(DEFAULT_AD_OPTIONS.mood);
  const [style, setStyle] = useState(DEFAULT_AD_OPTIONS.style);
  const [lang, setLang] = useState(DEFAULT_AD_OPTIONS.narration_lang);
  // 안 고르면 서버가 400 이다 — 그래서 여기서도 빈 값(안 고름)을 허용하지 않는다
  // (아래 create 의 disabled 조건). 기본으로 미리 골라 두면 사장님이 못 보고 지나간다.
  const [target, setTarget] = useState(null);
  // ★ 화질은 길이와 달리 **기본값을 미리 골라 둔다**(720p) — film·광고 화면과 같은 관례
  // (app/ads/new/page.js 의 DEFAULT_AD_RESOLUTION). 안 고르면 막는 것은 길이 하나로
  // 충분하다 — 화질까지 강제로 고르게 하면 처음 오는 사장님에게 선택지가 둘로 는다.
  const [resolution, setResolution] = useState(DEFAULT_RESOLUTION);
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
          aspect_ratio: DEFAULT_ASPECT_ID, target_seconds: target, resolution,
          concept, mood, style, narration_lang: lang,
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
      {/* ★ 2026-08-25 사장님 지시 — "컷마다 말하는 영상"은 **안쪽 사정**(클립이 직접
          말한다는 구현 방식)을 제목으로 쓴 것이었다. 사이드바 메뉴 이름과 맞춘다. */}
      <h1 className="pgtitle">영상 만들기</h1>
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
                  {REEL_CONCEPTS.map((c) => (
                    <button key={c.id} className={`chip${concept === c.id ? " on" : ""}`}
                      disabled={locked} onClick={() => setConcept(c.id)}>
                      {c.label}
                    </button>
                  ))}
                </div>
                {/* ★ [알아서]는 구성이 없으므로 설명(desc)을 대신 보여 준다 —
                    빈 줄로 남기면 고르면 안 되는 칩처럼 읽힌다. */}
                <div className="tray-note">
                  {(() => { const c = REEL_CONCEPTS.find((x) => x.id === concept); return c?.beat || c?.desc || ""; })()}
                </div>
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
              <span className="tray-label">화질</span>
              <div className="tray-col">
                <div className="chips">
                  {resolutionsForModel(DEFAULT_I2V_MODEL).map((r) => (
                    <button key={r} className={`chip${resolution === r ? " on" : ""}`}
                      disabled={locked} onClick={() => setResolution(r)}>
                      {/* ★ 크레딧 표기를 뗐다(2026-08-25 사장님 지시). 길이 칩과 같다.
                          예전에는 길이를 고른 뒤에만 붙었다(`target &&`) — 그래서
                          "길이를 선택했을 때 보여"였다. */}
                      {r}
                    </button>
                  ))}
                </div>
                {/* ★ 설명 줄이 없다(2026-08-25 사장님 지시 — "화질이 정가를 바꿔요 텍스트
                    제거해줘"). 값을 말하는 자리는 실제로 돈이 나가는 ⑤영상 하나뿐이다. */}
              </div>
            </div>

            <div className="tray-row">
              <span className="tray-label">길이</span>
              <div className="tray-col">
                <div className="chips">
                  {TARGET_CHOICES.map((s) => (
                    <button key={s} className={`chip${target === s ? " on" : ""}`}
                      disabled={locked} onClick={() => setTarget(s)}>
                      {/* ★ 크레딧 표기를 뗐다(2026-08-25 사장님 지시 — "일단 제거"). */}
                      {s}초
                    </button>
                  ))}
                </div>
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
              {busy === "create" ? "만드는 중…" : uploading ? "사진 올리는 중…" : "시작하기 →"}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
