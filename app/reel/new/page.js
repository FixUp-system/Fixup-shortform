"use client";

// /reel/new — 1 입력. **프로젝트가 아직 없는 자리**다(app/film/new/page.js 와 같은 이유).
//
// ★★ 왜 `/reel/<id>/briefing` 과 따로인가: 단계 레이아웃(app/reel/[id]/layout.js)은
//   프로젝트를 읽어 스테퍼와 가드를 건다 — 읽을 문서가 없으면 할 일이 없다. 그래서
//   "만들기 전"만 여기에 두고, 만든 뒤의 입력 화면은 `/reel/<id>/briefing` 이 보여 준다.
//   부르는 문은 `POST /api/reel` 하나뿐이고, 만들자마자 시나리오 단계로 넘긴다.
//
// ★★ 2026-08-27 — 옛 주석은 "이 화면만 useReelProject 를 안 쓴다(레이아웃 밖이다)"였는데
//   **둘 다 사실이 아니다**: 공급자는 루트(app/layout.js)에 있어 이 화면도 읽을 수 있고,
//   실제로 **읽어야 한다.** 안 읽었던 것이 사장님이 겪은 결함의 뿌리다 —
//   [+ 새로 만들기]를 누르고 다른 화면에 다녀오면 사이드바의 「영상 만들기」가
//   **옛 프로젝트**로 되돌려 보냈다(공유본에 옛 문서가 그대로 살아 있어서다).
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
// ★★ 사이즈(화면 비율)를 고른다(2026-08-25 사장님 지시로 열렸다). 옛 주석은 "reel 은
//   숏폼이 표제 기능이라 9:16 하나로 보낸다"였는데 그 결정이 뒤집혔다. 기본은 여전히
//   세로이고, 뒷단은 이미 비율을 받아 돌아가고 있었다(막힌 것은 화면뿐이었다).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
// 프로젝트 공유본 — 루트가 들고 사이드바가 읽는다. 여기서는 **놓는다**(아래 useEffect).
import { useReelProject } from "../../../components/ReelProjectContext";
import Icon from "../../../components/Icon";
// 주소는 단계 표 한 벌이 만든다 — 화면이 `/reel/<id>/scenario` 를 손으로 적으면 두 벌이 된다.
import { REEL_STEPS, reelStepHref } from "../../../lib/reel/steps";
import { ASPECTS, DEFAULT_ASPECT_ID, aspectFor } from "../../../lib/aspects";
import { AD_MOODS, AD_LANGS, AD_STYLE_LINES, DEFAULT_AD_OPTIONS } from "../../../lib/ad/options";
// ★★ 컨셉은 **reel 자기 표**다(2026-08-25 사장님 지시). 예전에는 AD_FORMATS(광고 포맷)를
//   그대로 그렸는데, 다섯이 전부 "팔 물건이 있다"를 전제로 해서 범용 영상에는 좁았다
//   — 그 다섯은 새 표의 "제품 홍보" 한 칸 안에 다 들어간다.
//   ★ 광고 화면(app/ads/new)은 여전히 AD_FORMATS 를 쓴다 — 그 흐름은 남겨 둔다.
import { REEL_CONCEPTS, DEFAULT_REEL_CONCEPT } from "../../../lib/reel/concepts";
import { STYLE_PRESETS } from "../../../lib/styles";
// 모델은 서버가 박는다(DEFAULT_I2V_MODEL) — 화면은 그 모델이 여는 해상도 목록만 읽는다
// (resolutionsForModel). isResolutionFor 는 라우트와 같은 판정이라 여기서는 안 쓴다(화면은
// 목록에서 고르므로 애초에 모르는 값이 안 생긴다 — 검증은 서버 몫).
import {
  resolutionsForModel, secondsForModel, reelModelsForTier,
  DEFAULT_I2V_MODEL, DEFAULT_RESOLUTION, defaultResolutionForModel, blocksFacesInRefs,
} from "../../../lib/clip-limits";
// 등급은 서버가 판정해 /api/me 로 내려준다 — 화면이 profile 을 직접 읽지 않는다.
import { useMe } from "../../../components/MeContext";
// ★★ 이 화면은 **값을 한 글자도 말하지 않는다**(2026-08-25 사장님 지시). 예전에는 길이·화질
//   칩 뒤에 크레딧이 붙었다(화질 쪽은 길이를 고른 뒤에만 나타났다) — 둘 다 뗐고, 그것을
//   설명하던 문구("정가가 길이·화질에서 나와요", "화질이 정가를 바꿔요")도 같이 뺐다.
//   그래서 lib/pricing 을 **더 이상 import 하지 않는다.** 값을 말하는 자리는 실제로 돈이
//   나가는 ⑤영상 하나뿐이다.
//   ⚠️ 판정은 그대로다 — 화질이 정가를 바꾸는 것 자체는 변함이 없고(videoPrice), 청구는
//     서버가 settings.resolution 을 읽어 한다. 문구만 뺀 것이지 값이 바뀐 것이 아니다.
// 사진 상한 — 서버(app/api/reel/route.js)와 **같은 파일**에서 읽는다. 손으로 두 벌 적으면
// 화면은 통과시키는데 서버가 400 을 내고, 사장님은 다 올린 뒤에야 거절당한다.
import { MAX_PHOTOS, PHOTO_ROLES, visiblePhotoRoles, isPersonPhoto } from "../../../lib/photos";
import { MAX_MATERIAL_TEXT } from "../../../lib/material";

// 화풍은 영상용 문구가 있는 것만 고를 수 있다 — 광고 화면(app/ads/new/page.js)·
// film(app/film/new/page.js)과 같은 규칙이다.
const AD_STYLES = STYLE_PRESETS.filter((s) => Object.keys(AD_STYLE_LINES).includes(s.id));

export default function ReelNewPage() {
  const router = useRouter();
  const { setProject } = useReelProject();

  // ★★ 이 화면에 들어섰다는 것이 곧 **"새로 시작한다"**는 뜻이다 — 그래서 공유본을 놓는다.
  //
  // 안 놓으면: 사이드바의 「영상 만들기」가 공유본을 보고 갈 곳을 정하므로
  // (lib/reel/resume.js 의 makeReelHref) 여기서 나갔다가 그 링크를 누르는 순간
  // **옛 프로젝트**로 되돌아간다. 사장님이 겪은 경로가 정확히 그것이다.
  //
  // ★ 놓는 자리가 [시작하기] 버튼 안이면 안 된다 — 눌러 보기 전에 다른 화면에 다녀오는
  //   그 경로가 그대로 남는다. 들어서는 순간이어야 한다.
  // ★ **문서를 지우는 것이 아니다.** 옛 프로젝트는 보관함에 그대로 있다 — 지금 화면이
  //   그것을 들고 있지 않을 뿐이다.
  useEffect(() => {
    setProject(null);
  }, [setProject]);

  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]); // {id, filename, url}
  const [concept, setConcept] = useState(DEFAULT_REEL_CONCEPT);
  const [mood, setMood] = useState(DEFAULT_AD_OPTIONS.mood);
  const [style, setStyle] = useState(DEFAULT_AD_OPTIONS.style);
  const [lang, setLang] = useState(DEFAULT_AD_OPTIONS.narration_lang);
  // 안 고르면 서버가 400 이다 — 그래서 여기서도 빈 값(안 고름)을 허용하지 않는다
  // (아래 create 의 disabled 조건). 기본으로 미리 골라 두면 사장님이 못 보고 지나간다.
  const [target, setTarget] = useState(null);
  // ★★ 비율(사이즈) — 2026-08-25 사장님 지시로 열었다("영상 비율이 빠졌어").
  //   그전에는 화면이 DEFAULT_ASPECT_ID 를 박아 보냈다. **뒷단은 이미 비율을 받아
  //   돌아가고 있었다** — 라우트가 isAspect 로 검증하고, 스토리보드 치수도 칸 자르기도
  //   비율을 인자로 받는다(storyboardImageSize · cropStoryboardCells). 막힌 것은 화면뿐이었다.
  //   ★ 기본은 여전히 세로다 — 숏폼이 이 흐름의 표제 기능이다.
  const [aspect, setAspect] = useState(DEFAULT_ASPECT_ID);
  // ★ 화질은 길이와 달리 **기본값을 미리 골라 둔다**(720p) — film·광고 화면과 같은 관례
  // (app/ads/new/page.js 의 DEFAULT_AD_RESOLUTION). 안 고르면 막는 것은 길이 하나로
  // 충분하다 — 화질까지 강제로 고르게 하면 처음 오는 사장님에게 선택지가 둘로 는다.
  // ★★ 모델 — 2026-08-25 사장님 지시로 칸이 생겼다("광고 영상에 맞추서 … 모델 선택 칩
  //   구성해줘. 모델선택은 똑같이 2.5는 프로 이상만 접근가능하도록"). 그전에는 화면에
  //   칸이 아예 없었고 서버가 값을 박아 버렸다.
  //   ★ 목록은 **등급이 가른다**(reelModelsForTier) — 광고 화면과 같은 모양이다.
  //   ★★ 다만 지금은 어느 등급이든 2.0 하나다. 2.5 는 reel 이 아직 안 연다
  //     (lib/clip-limits.js 의 REEL_MODEL_IDS 주석 — 프로필·통짜 상한·컷 최소·정가 넷이
  //      먼저다). 배선만 깔아 두고 그 한 줄이 늘면 열린다.
  const { me, ready } = useMe();
  // ★★ 등급을 **모르는 동안에는 비운다**(2026-08-31). 그전에는 tier 가 undefined 라
  //   모르는 등급 = 기본 등급으로 떨어져 **모델이 기본 하나만** 보였다가, 프로 등급이면
  //   로딩 뒤 늘어났다. 줄과 라벨은 남으므로 레이아웃은 안 흔들린다.
  // ★★ 2026-09-02 — **관리자는 등급을 안 타므로 화면도 그 축을 본다**(원클릭의
  //   AdOptionTray 가 이미 `modelsForTier(tier, { admin })` 으로 넘긴다). 서버만 열어 주면
  //   운영자가 자기 화면에서 그 모델을 못 고른다.
  const admin = me?.isAdmin === true;
  const models = ready ? reelModelsForTier(me?.tier, { admin }) : [];
  const [model, setModel] = useState(DEFAULT_I2V_MODEL);
  // ★ 2026-08-31 — 전역 720p 가 아니라 **그 모델의 기본**이다. 기본이 H3 로 옮겨 가면서
  //   720p 는 목록에 아예 없는 값이 됐다(768P·2K).
  const [resolution, setResolution] = useState(defaultResolutionForModel(DEFAULT_I2V_MODEL));
  const [busy, setBusy] = useState("");
  // 사진이 아직 올라가는 중인가. ★ busy 로 겸할 수 없다(app/film/new/page.js 의 같은
  // 주석 참고 — 업로드가 짧게 져서 사진 0장으로 나간 사고가 있었다).
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  const locked = !!busy || uploading;

  // ★★ 모델을 바꾸면 **그 모델이 안 받는 값을 들고 있을 수 있다** — 광고 화면의
  //   onModelChange 와 같은 처방이다(app/ads/new/page.js). 예: 2.0 에서 1080p 를 골라
  //   둔 채 1080p 를 안 받는 모델로 바꾸면, 화면은 그 값을 쥔 채 서버가 400 을 낸다.
  //   그래서 지금 값이 새 모델에서 유효하지 않으면 그 모델의 첫 값으로 되돌린다.
  // ★ 길이는 되돌리지 않고 **비운다** — 안 고르면 서버가 400 인 축이라(위 target 주석),
  //   임의로 골라 두면 사장님이 못 보고 지나간다.
  function onModelChange(next) {
    setModel(next);
    const res = resolutionsForModel(next);
    // ★ 되돌릴 자리는 목록의 첫 값이 아니라 **그 모델의 기본**이다(광고 화면과 같은 처방).
    if (res.length && !res.includes(resolution)) setResolution(defaultResolutionForModel(next));
    if (target !== null && !secondsForModel(next).includes(target)) setTarget(null);
  }

  // ★ 어느 버튼을 눌렀는지 기억한다(2026-08-31). 파일 input 은 **하나만** 둔다 —
  //   셋으로 늘리면 업로드 상태(uploading)와 ref 도 셋이 되고, 그중 하나만 안 풀려도
  //   버튼이 영영 잠긴다(이 화면이 이미 겪은 종류의 사고다).
  const pendingRole = useRef(PHOTO_ROLES[0].id);

  // ★★★ **프로(2.5)에서는 `＋인물`이 아예 안 보인다**(2026-09-01 사장님 결정).
  //   2.5 는 사진 같은 얼굴이 든 참조를 실측 9건 전부 거절했다 — 받아 놓고 못 쓰면
  //   사장님 얼굴이 나올 거라는 기대만 만들고 판값($0.401)을 두 번 태운다.
  //   ★ 잠긴 버튼을 남기지 않고 **숨긴다** — 못 쓰는 것은 안 보이는 편이 낫다.
  //   ★ 화면은 가림막일 뿐이다. 실제 잠금은 lib/cut-refs.js 의 describeCutRefs 다.
  //   ★ **나중에 푼다** — 종량제로 옮겨 가면 실패의 값이 우리 것이 아니게 된다.
  const noFaces = blocksFacesInRefs({ settings: { i2v_model: model } });
  const photoRoles = visiblePhotoRoles(noFaces);
  // 이미 올려 둔 인물 사진 — 지우지 않는다(기본으로 되돌리면 그대로 살아나야 한다).
  //   대신 안 실린다고 말한다. 조용히 버리면 "반영이 안 된다"로 읽힌다.
  const strandedPeople = noFaces ? photos.filter(isPersonPhoto).length : 0;
  function pickRole(id) {
    pendingRole.current = id;
    fileRef.current?.click();
  }

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
        // ★ 올린 사진에 **누른 버튼의 종류**를 붙인다 — 이 값이 프롬프트의 라벨이 된다.
        if (res.ok) setPhotos((p) => [...p, { ...data, role: pendingRole.current }]);
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
          aspect_ratio: aspect, target_seconds: target, resolution, i2v_model: model,
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
      <h1 className="pgtitle">단계별 영상 만들기</h1>
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

          {/* ★★ 이미 올려 둔 인물 사진은 **지우지 않는다** — 기본으로 되돌리면 그대로
              살아나야 한다. 대신 안 실린다고 말한다: 조용히 버리면 "반영이 안 된다"로
              읽힌다(이 저장소가 사진 누락으로 이미 겪은 종류의 오해다). */}
          {strandedPeople > 0 && (
            <p className="warn">
              인물 사진 {strandedPeople}장은 프로에서 안 실려요 — 얼굴 사진을 쓰시려면 기본으로 바꿔 주세요.
            </p>
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

            {/* ★★ 모델 — 광고 화면과 같은 자리·같은 모양이다(2026-08-25 사장님 지시).
                바꾸면 아래 사이즈·화질·길이가 그 모델이 받는 값으로 되돌아간다.
                ⚠️ 이 목록은 **가림막이지 잠금이 아니다.** 잠금은 서버가 한다
                (app/api/reel/route.js) — 광고에서 화면만 거르고 서버는 그대로 받아
                API 로 뚫렸던 사고가 그 근거다. */}
            <div className="tray-row">
              <span className="tray-label">모델</span>
              <div className="tray-col">
                <div className="chips">
                  {models.map((m) => (
                    <button key={m.id} className={`chip${model === m.id ? " on" : ""}`}
                      disabled={locked} onClick={() => onModelChange(m.id)}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="tray-note">{models.find((m) => m.id === model)?.hint}</div>
              </div>
            </div>

            {/* ★ 사이즈(비율) — 2026-08-25 사장님 지시로 생겼다. 화질 앞에 둔다:
                무엇을 만들지(비율)가 얼마나 곱게 만들지(화질)보다 앞선 결정이다. */}
            <div className="tray-row">
              <span className="tray-label">사이즈</span>
              <div className="tray-col">
                <div className="chips">
                  {ASPECTS.map((a) => (
                    <button key={a.id} className={`chip${aspect === a.id ? " on" : ""}`}
                      disabled={locked} onClick={() => setAspect(a.id)}>
                      {/* ★ 이름만이 아니라 **비율까지** 적는다 — 광고 화면과 같은 모양이다
                          (2026-08-25 사장님 지적: "라벨 부분이 안맞아"). "세로"만으로는
                          9:16 인지 4:5 인지 알 수 없다. */}
                      {a.label} · {a.id}
                    </button>
                  ))}
                </div>
                {/* ★ 문구도 광고 화면과 맞춘다(2026-08-25 사장님 지시 — "광고 영상에
                    맞춰서"). 두 흐름이 같은 것을 고르는데 말투가 다르면 사장님이
                    화면마다 다른 사용법을 익혀야 한다. */}
                <div className="tray-note">{aspectFor(aspect).note}에 맞는 규격이에요</div>
              </div>
            </div>

            <div className="tray-row">
              <span className="tray-label">화질</span>
              <div className="tray-col">
                <div className="chips">
                  {resolutionsForModel(model).map((r) => (
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
                  {secondsForModel(model).map((s) => (
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
            {/* ★★ 2026-08-31 사장님 지시 — `＋사진` 하나를 **종류별 셋**으로 갈랐다.
                누르는 순간 종류가 정해지므로 "안 고른 사진"이 아예 안 생긴다.
                ★ 표를 돌려 그린다(lib/photos.js) — 손으로 세 번 적으면 종류가 늘 때 낡는다. */}
            {photoRoles.map((r) => (
              <button key={r.id} className="pill" disabled={locked || photos.length >= MAX_PHOTOS}
                onClick={() => pickRole(r.id)}>
                ＋ {r.label}{photos.filter((p) => p.role === r.id).length > 0 && <b>{photos.filter((p) => p.role === r.id).length}</b>}
              </button>
            ))}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onFiles} />
            <span className="spacer" />
            <button className="cta" disabled={locked || !text.trim() || !target} onClick={create}>
              {busy === "create" ? "만드는 중…" : uploading ? "사진 올리는 중…" : "시작하기 →"}
            </button>
          </div>
        </div>

        {/* ★ 2026-09-02 사장님 지시 — 모드 하단 상시 안내: 프로에서 ＋인물이 왜 없는지를
            만들기 전에 말해 둔다(원클릭 app/ads/new 와 같은 줄). */}
        <p className="mode-note">
          <Icon name="bang" size={14} />
          프로 버전에서는 인물 사진 참조가 지원되지 않아요.
        </p>
      </section>
    </>
  );
}
