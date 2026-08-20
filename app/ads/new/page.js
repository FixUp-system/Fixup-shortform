"use client";

// 광고 영상 한 방 만들기 — 입력 박스 하나다. app/create/page.js 와 같은 결을 그대로 따른다:
// 층층이 쌓인 라벨+필드가 아니라 "이 광고를 어떻게 만들까"라는 한 덩어리를 박스 하나에 담고,
// 조작은 그 안쪽 아래에 붙인다. 옵션(포맷·분위기·화풍·언어·사이즈)은 박스 안에 **늘 펼쳐 둔다**
// — 접었다 펴면 접힌 동안 무엇이 골라져 있는지 안 보이고, 값을 확인하려고 한 번 더 눌러야 한다.
// 사진만 알약으로 남는다: 그것은 값이 아니라 행동(파일 고르기)이다.
//
// 이 화면에서는 돈이 안 나간다 — [시나리오 만들기]는 LLM 만 쓰고 무료다
// (docs/superpowers/specs/2026-08-12-ad-video-oneshot-design.md:86).
// 유료 승인([이대로 만들기])은 다음 화면(/ads/[id])의 몫이다.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AD_FORMATS, AD_MOODS, AD_LANGS, AD_STYLE_LINES, DEFAULT_AD_OPTIONS } from "../../../lib/ad/options";
import { STYLE_PRESETS } from "../../../lib/styles";
import { ASPECTS, DEFAULT_ASPECT_ID, aspectFor } from "../../../lib/aspects";
// 모델·길이·해상도 — Task 21(백엔드)이 만든 표를 그대로 읽는다. 라벨·길이·해상도 목록을
// 여기 손으로 다시 적으면 모델이 하나 늘 때 화면만 낡는다(위 화풍과 같은 이유).
// ★ Task 24 — 해상도가 셋째 축이다(adResolutionsFor·isAdResolution·DEFAULT_AD_RESOLUTION).
import {
  AD_MODELS, DEFAULT_AD_MODEL, adSecondsFor, isAdSeconds,
  adResolutionsFor, isAdResolution, DEFAULT_AD_RESOLUTION,
} from "../../../lib/ad/models";
// 길이 칩에 정가를 같이 보여준다 — 사장님이 고르기 전에 값을 알아야 한다. 숫자는 여기 안 적는다.
import { priceLabel, adVideoPrice } from "../../../lib/pricing";
// app/create/page.js 와 같은 이유로 쓴다 — 새 광고를 시작하는 자리에서 이전 광고의
// 단계가 사이드바에 남지 않게 비운다(components/AdProjectContext).
import { useAdProject } from "../../../components/AdProjectContext";
import { useMe } from "../../../components/MeContext";
// 등급이 고를 수 있는 모델 — 표와 판정은 lib/tiers.js 한 벌이다.
import { modelsForTier } from "../../../lib/tiers";
import { MAX_MATERIAL_TEXT } from "../../../lib/material";

// 화풍 라벨은 styles.js 에 있지만, 고를 수 있는 것은 AD_STYLE_LINES 에 영상용 문구가 있는
// id 뿐이어야 한다 — 둘이 어긋나면 화면에는 있는데 서버(normalizeAdOptions)가 400 을 낸다.
const AD_STYLES = STYLE_PRESETS.filter((s) => Object.keys(AD_STYLE_LINES).includes(s.id));

// 서버(app/api/ads/route.js·[id]/route.js)와 같은 값. 갈리면 화면은 통과시키는데 서버가
// 거절한다 — 사장님이 5장을 다 올린 뒤에 거절당하지 않게 화면이 먼저 막는다.
const MAX_PHOTOS = 4;

export default function AdNewPage() {
  const router = useRouter();
  const { setProject } = useAdProject();
  // 크레딧을 끈 동안(내부 QA)에는 값 이야기를 안 한다 — 판정은 서버가 내려 준 gated 하나다.
  const { me } = useMe();
  const showCredits = me?.gated !== false;
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]); // {id, filename, url}
  const [format, setFormat] = useState(DEFAULT_AD_OPTIONS.format);
  const [mood, setMood] = useState(DEFAULT_AD_OPTIONS.mood);
  const [lang, setLang] = useState(DEFAULT_AD_OPTIONS.narration_lang);
  const [style, setStyle] = useState(DEFAULT_AD_OPTIONS.style);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT_ID);
  const [model, setModel] = useState(DEFAULT_AD_MODEL);
  const [seconds, setSeconds] = useState(adSecondsFor(DEFAULT_AD_MODEL)[0]);
  const [resolution, setResolution] = useState(DEFAULT_AD_RESOLUTION);
  const [busy, setBusy] = useState(false);
  // 사진이 아직 올라가는 중인가. ★ busy 로 겸할 수 없다 — busy 는 "만드는 중"이라
  // 버튼 글자까지 바꾼다. 무엇보다 이 값이 없으면 화면은 사진이 붙었는지 모른 채
  // [시나리오 만들기]를 열어 둔다(2026-08-18 실측: 업로드가 0.57초 져서 사진 0장으로
  // 나갔고, 사진이 0장이면 t2v 가 골라져 사진이 아예 안 실린 광고에 $3.63 을 치렀다).
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const textRef = useRef(null);

  // 새 광고를 시작하는 자리 — 이전 광고의 단계가 사이드바에 남지 않게 비운다
  useEffect(() => { setProject(null); }, [setProject]);

  // 글이 늘면 칸이 아래로 밀린다 — 안에서 스크롤하지 않는다(app/create/page.js 와 같은 규칙).
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

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
        const data = await res.json();
        if (res.ok) setPhotos((p) => [...p, data]);
        else setErr(data.error || "업로드 실패");
      }
    } finally {
      // 실패해도 반드시 푼다 — 안 그러면 업로드 한 번 실패한 사장님은 버튼이 영영 잠긴다.
      setUploading(false);
      e.target.value = "";
    }
  }

  // 모델을 바꾸면 그 모델이 받는 길이·해상도가 바뀐다(lib/ad/models.js — 길이는
  // 2.0=15초·2.5=15·30초, 해상도는 standard만 1080p까지). 지금 고른 값이 새 모델에서
  // 유효하지 않으면(예: standard에서 1080p를 골라 둔 채 fast로 바꾸는 경우) 그 모델의
  // 첫 값으로 되돌린다 — 안 그러면 [시나리오 만들기]가 서버(app/api/ads/route.js 의
  // isAdSeconds·isAdResolution 검사)에서 400을 받는다.
  function onModelChange(id) {
    setModel(id);
    setSeconds((s) => (isAdSeconds(s, id) ? s : adSecondsFor(id)[0]));
    setResolution((r) => (isAdResolution(r, id) ? r : adResolutionsFor(id)[0]));
  }

  async function submit() {
    setBusy(true); setErr("");
    const res = await fetch("/api/ads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        material: { text, photos },
        settings: { format, mood, narration_lang: lang, style, aspect_ratio: aspect, model, seconds, resolution },
      }),
    });
    const data = await res.json();
    if (!res.ok) { setErr(data.error || "생성 실패"); setBusy(false); return; }

    // 시나리오는 동기다(몇 초) — 만드는 자리에서 바로 이어 부른다. 사장님은 버튼 한 번만 누른다.
    const res2 = await fetch(`/api/ads/${data.id}/scenario`, { method: "POST" });
    const data2 = await res2.json();
    // 실패해도 써 둔 자료는 화면에 남는다(로컬 state) — app/create/page.js 와 같은 판단.
    if (!res2.ok) { setErr(data2.error || "시나리오를 만들지 못했어요"); setBusy(false); return; }
    router.push(`/ads/${data.id}`);
  }

  return (
    <>
      <h1 className="pgtitle">광고 영상 만들기</h1>
      <p className="pgsub">무엇을 광고할지 적어 주시면 15초 시나리오를 무료로 만들어 드려요 — 확인하고 그대로 만들면 끝나요</p>

      <section className="panel--wide">
        <div className="composer">
          <textarea ref={textRef} className="field composer-text" value={text} maxLength={MAX_MATERIAL_TEXT}
            onChange={(e) => setText(e.target.value)}
            placeholder="무엇을 광고하고 싶으세요? 제품·강조하고 싶은 점·타깃을 자유롭게 적어 주세요" />

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

          {/* 고른 것들은 늘 펼쳐 둔다 — 접으면 무엇이 골라져 있는지 보려고 한 번 더 눌러야 한다 */}
          <div className="composer-tray">
            <div className="tray-row">
              <span className="tray-label">포맷</span>
              <div className="tray-col">
                <div className="chips">
                  {AD_FORMATS.map((f) => (
                    <button key={f.id} className={`chip${format === f.id ? " on" : ""}`}
                      onClick={() => setFormat(f.id)}>
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
                      onClick={() => setMood(m.id)}>
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
                      onClick={() => setStyle(s.id)}>
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
                  {/* 숨긴 언어(hidden)는 안 그린다 — 표에는 남아 있다(lib/ad/options.js 주석) */}
                  {AD_LANGS.filter((l) => !l.hidden).map((l) => (
                    <button key={l.id} className={`chip${lang === l.id ? " on" : ""}`}
                      onClick={() => setLang(l.id)}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 사이즈 — 컷을 만든 뒤에는 못 바꾼다. app/create/page.js 와 같은 이유로 여기가 자리다 */}
            <div className="tray-row">
              <span className="tray-label">사이즈</span>
              <div className="tray-col">
                <div className="chips">
                  {ASPECTS.map((a) => (
                    <button key={a.id} className={`chip${aspect === a.id ? " on" : ""}`}
                      onClick={() => setAspect(a.id)}>
                      {a.label} · {a.id}
                    </button>
                  ))}
                </div>
                <div className="tray-note">{aspectFor(aspect).note}에 맞는 규격이에요</div>
              </div>
            </div>

            {/* 모델 — 바꾸면 아래 해상도·길이도 그 모델이 받는 값으로 되돌아간다(onModelChange) */}
            <div className="tray-row">
              <span className="tray-label">모델</span>
              <div className="tray-col">
                <div className="chips">
                  {/* ★★ **등급이 고를 수 있는 것만** 그린다(2026-08-20). 숨김(hidden)도
                      함께 걸러진다 — modelsForTier 가 둘 다 본다.
                      ⚠️ 이것은 **가림막이지 잠금이 아니다.** 잠금은 서버가 한다
                      (app/api/ads/route.js · app/api/ads/[id]/render/route.js). 2.5 가
                      지금까지 열려 있던 이유가 정확히 이것이다 — 화면에서만 거르고
                      서버는 그대로 받았다. */}
                  {modelsForTier(me?.tier).map((m) => (
                    <button key={m.id} className={`chip${model === m.id ? " on" : ""}`}
                      onClick={() => onModelChange(m.id)}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="tray-note">{AD_MODELS.find((m) => m.id === model)?.hint}</div>
              </div>
            </div>

            {/* 해상도 — 고른 모델이 받는 값만 나온다(adResolutionsFor). standard 만
                1080p까지 열린다. 모델을 바꾸면 되돌아간다(onModelChange). */}
            <div className="tray-row">
              <span className="tray-label">해상도</span>
              <div className="tray-col">
                <div className="chips">
                  {adResolutionsFor(model).map((r) => (
                    <button key={r} className={`chip${resolution === r ? " on" : ""}`}
                      onClick={() => setResolution(r)}>
                      {r}{showCredits && ` · ${priceLabel(adVideoPrice(seconds, model, r))}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 길이 — 고른 모델이 받는 값만 나온다(adSecondsFor). 정가를 같이 보여
                사장님이 고르기 전에 값을 알게 한다 — 숫자는 pricing.js 가 만든다. */}
            <div className="tray-row">
              <span className="tray-label">길이</span>
              <div className="tray-col">
                <div className="chips">
                  {adSecondsFor(model).map((s) => (
                    <button key={s} className={`chip${seconds === s ? " on" : ""}`}
                      onClick={() => setSeconds(s)}>
                      {s}초{showCredits && ` · ${priceLabel(adVideoPrice(s, model, resolution))}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="composer-bar">
            <button className="pill" disabled={photos.length >= MAX_PHOTOS}
              onClick={() => fileRef.current?.click()}>
              ＋ 사진 {photos.length > 0 && <b>{photos.length}</b>}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onFiles} />

            <span className="spacer" />
            <button className="cta" onClick={submit} disabled={busy || uploading || !text.trim()}>
              {busy ? "만드는 중…" : uploading ? "사진 올리는 중…" : "시나리오 만들기 →"} <span className="cr">무료</span>
            </button>
          </div>
        </div>

        {err && <p className="pgsub warn">{err}</p>}
      </section>
    </>
  );
}
