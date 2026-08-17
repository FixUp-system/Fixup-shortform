"use client";

// 자료를 넣는 화면 — 입력 박스 하나다.
//
// 층층이 쌓인 라벨+필드(자료·길이·컨셉·사진)를 버린 이유: 그것들은 네 가지 서류가 아니라
// "이 영상 한 편을 어떻게 만들까"라는 한 덩어리다. 박스 하나에 담고 조작을 안쪽 아래에
// 붙이면 사장님이 보는 것이 '채워야 할 칸 넷'에서 '적고 누르는 자리 하나'로 바뀐다.
//
// 길이·컨셉은 박스 안에 **늘 펼쳐 둔다.** 접었다 펴면 접힌 동안 무엇이 골라져 있는지 안 보이고,
// 값을 확인하려고 한 번 더 눌러야 한다 — 자료를 적기 전에 알아야 하는 값이라 처음부터 보인다.
// 사진만 알약으로 남는다: 그것은 값이 아니라 행동(파일 고르기)이다.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "../../components/ProjectContext";
import { useMe } from "../../components/MeContext";
import { TARGET_CHOICES } from "../../lib/script";
// PROMPT_NOTE_MAX 는 서버 게이트(normalizePromptNote)와 **같은 자리**에서 온다 —
// 숫자를 화면에 또 적으면 두 벌이 되어, 붙여넣기는 통했는데 만들기가 400 인 칸이 생긴다.
import { DEFAULT_STYLE_ID, PROMPT_NOTE_MAX } from "../../lib/styles";
import { ASPECTS, DEFAULT_ASPECT_ID, aspectFor } from "../../lib/aspects";
import { I2V_MODELS, DEFAULT_I2V_MODEL, DEFAULT_RESOLUTION, resolutionsForModel } from "../../lib/clip-limits";
// 값은 가격표 한 곳에서 온다(import 0 개의 순수 모듈이라 화면에서 안전하다)
import { videoPrice } from "../../lib/pricing";
import StylePicker from "../../components/StylePicker";

export default function CreatePage() {
  const router = useRouter();
  const { setProject } = useProject();
  // 크레딧을 끈 동안(내부 QA)에는 값 이야기를 안 한다 — 판정은 서버가 내려 준 gated 하나다.
  // ★ `!== false` 로 본다: me 를 아직 못 읽은 동안(null)에는 지금까지처럼 값을 보여준다.
  //   반대로 두면 크레딧이 켜진 정상 배포에서 값이 잠깐 사라졌다 나타난다.
  const { me } = useMe();
  const showCredits = me?.gated !== false;
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]); // {id, filename, url}
  // ★ 기본 30초. 예전에는 null(자동 · 자료가 정함)이 기본이었는데, 길이가 **정가를 정하는
  //   축**이라 자동이면 사장님이 만들기 전에 얼마인지 모른다 — 화면도 "값은 30초 기준"이라고
  //   에둘러 말하고 있었다. 2026-08-14 사용자 요청으로 자동을 뺐다.
  const [seconds, setSeconds] = useState(30);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT_ID);
  // ★ 영상 모델은 **여기서 한 번** 고른다 — 만든 뒤에는 못 바꾼다(서버도 400 으로 막는다).
  // 모델이 정가를 정하는데(길이 × 모델) 정가는 ③목소리·④이미지에서 걷히므로, 뒤에서
  // 바꾸면 낸 값과 만드는 값이 어긋난다. 차액 정산은 만들지 않았다.
  const [model, setModel] = useState(DEFAULT_I2V_MODEL);
  // ★ 화질도 **여기서** 고른다(2026-08-18, 사용자 지시) — ①자료에 있던 칩을 옮겼다.
  //   화질이 정가를 바꾸므로(Seedance 30초: 720p 160 · 1080p 360) 고르는 자리는 결제 앞이어야
  //   하고, 만들기 전이 가장 앞이다. 여기에는 잠금(project.charged)이 없다 — 아직 청구가
  //   없으니 잠글 것도 없고, 그 대신 **모델과 어긋난 값이 남지 않게** pickModel 이 맞춰 준다.
  const [resolution, setResolution] = useState(DEFAULT_RESOLUTION);
  const [stylePreset, setStylePreset] = useState(DEFAULT_STYLE_ID);
  const [styleNote, setStyleNote] = useState("");
  // 전 컷의 프롬프트에 그대로 실리는 공통 지시(lib/cuts.js promptNoteClause). 밖에서 프롬프트를
  // 써 오는 사장님을 위한 자리다. **화풍 보정(120자)과 다른 값이다** — 그쪽은 화풍에 딸린 한
  // 줄이고 이쪽은 써 온 프롬프트 통짜(PROMPT_NOTE_MAX)다.
  const [imageNote, setImageNote] = useState("");
  const [clipNote, setClipNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const textRef = useRef(null);

  // 이 모델이 여는 화질 목록 — 비면 화질 칩을 아예 안 그린다(Kling·LTX)
  const resolutions = resolutionsForModel(model);

  // 새 프로젝트를 시작하는 자리 — 이전 프로젝트의 단계가 사이드바에 남지 않게 비운다
  useEffect(() => { setProject(null); }, [setProject]);

  // 글이 늘면 칸이 아래로 밀린다 — 안에서 스크롤하지 않는다.
  // height 를 auto 로 되돌린 뒤 재야 줄일 때도 따라온다(지운 만큼 다시 접힌다).
  // 바닥은 CSS 의 min-height 가 잡는다.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

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

  // 모델을 바꾸면 화질을 그 모델이 여는 값으로 맞춘다.
  //
  // ★ 이것이 잠금 없는 자리의 유일한 방어선이다. Seedance(1080p 있음) → Kling(화질 없음) 으로
  //   바꿔도 1080p 가 상태에 남아 있으면 그 값이 그대로 생성 요청에 실려 **400** 이고
  //   (서버가 isResolutionFor 로 막는다), 막지 못하면 fal 이 거절하는 값이 저장된다.
  // ★ 목록이 비는 모델(Kling·LTX)에서는 손대지 않는다 — 그 모델에는 화질 축이 아예 없어
  //   보낼 값도 없다(submit 이 안 싣는다). 여기서 억지로 비우면 모델을 되돌렸을 때
  //   사장님이 고른 값이 사라져 있다.
  function pickModel(id) {
    setModel(id);
    const list = resolutionsForModel(id);
    if (!list.length || list.includes(resolution)) return;
    setResolution(list.includes(DEFAULT_RESOLUTION) ? DEFAULT_RESOLUTION : list[0]);
  }

  async function submit() {
    setBusy(true); setErr("");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        material: { text, photos },
        settings: {
          target_seconds: seconds, aspect_ratio: aspect, i2v_model: model,
          style: { preset: stylePreset, note: styleNote },
          // ★ 화질은 **그 모델이 화질을 열 때만** 싣는다. Kling 에는 resolution 파라미터가
          //   아예 없어, 보내면 서버가 400 으로 막는다(그것이 맞는 동작이다).
          ...(resolutionsForModel(model).length ? { resolution } : {}),
          // ★ 공통 지시는 **화풍과 다른 몸통이다.** style 안에 실으면 normalizeStyle 이
          //   preset 을 요구해 400 이거나 고른 화풍이 조용히 덮인다.
          // ★ 빈 칸은 안 보낸다 — "안 적었다"와 "빈 문자열을 적었다"를 구분해 둔다(각인이
          //   그 차이를 본다, lib/steps.js).
          ...(imageNote.trim() ? { image_note: imageNote } : {}),
          ...(clipNote.trim() ? { clip_note: clipNote } : {}),
        },
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
      <p className="pgsub">자료를 주시면 기계가 정리해 보여드려요 — 확인 → 시나리오 → 목소리 → 이미지 → 영상 → 완성</p>

      <section className="panel--wide">
        <div className="composer">
          <textarea ref={textRef} className="field composer-text" value={text} maxLength={2000}
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

          {/* 고른 것들은 늘 펼쳐 둔다 — 접으면 무엇이 골라져 있는지 보려고 한 번 더 눌러야 한다 */}
          <div className="composer-tray">
            {/* 영상 모델 — 움직임을 만드는 방식이자 **정가를 정하는 값**이다. 만든 뒤에는
                못 바꾸므로(모델이 값을 정하고 그 값은 ③④에서 걷힌다) 여기가 유일한 자리다.
                이름·설명·값은 화면이 적지 않는다 — lib/clip-limits 의 표와 가격표에서 온다. */}
            <div className="tray-row">
              <span className="tray-label">영상 모델</span>
              <div className="tray-col">
                <div className="chips">
                  {I2V_MODELS.map((m) => (
                    <button key={m.id} className={`chip${model === m.id ? " on" : ""}`}
                      onClick={() => pickModel(m.id)}>
                      {/* ★ 칩마다의 값은 **기본 화질** 기준이다 — 모델을 고르는 순간의 화질을
                          쓰면, 그 모델이 그 화질을 열지 않을 때 없는 값의 가격을 적게 된다.
                          고른 화질의 정확한 값은 바로 아래 화질 칩이 적는다. */}
                      {m.label}{showCredits && ` · ${videoPrice(seconds, m.id, DEFAULT_RESOLUTION)} 크레딧`}
                    </button>
                  ))}
                </div>
                <div className="tray-note">
                  {I2V_MODELS.find((m) => m.id === model)?.hint} · 만든 뒤에는 바꿀 수 없어요
                </div>
              </div>
            </div>

            {/* 화질 — 이 모델이 실제로 여는 값만. 목록도 값도 표(lib/clip-limits)가 준다.
                ★ 목록이 비면 **아무것도 그리지 않는다**(Kling·LTX). 그 모델에는 resolution
                  파라미터가 아예 없어, 고를 수 있는 척하면 고른 순간 fal 이 거절한다. */}
            {resolutions.length > 0 && (
              <div className="tray-row">
                <span className="tray-label">화질</span>
                <div className="tray-col">
                  <div className="chips">
                    {resolutions.map((r) => (
                      <button key={r} className={`chip${resolution === r ? " on" : ""}`}
                        onClick={() => setResolution(r)}>
                        {/* 칩마다 그 화질의 정가를 적는다 — 값이 달라지는 것이 고르는 이유다 */}
                        {r}{showCredits && ` · ${videoPrice(seconds, model, r)} 크레딧`}
                      </button>
                    ))}
                  </div>
                  <div className="tray-note">높은 화질은 값이 더 들어요 · 만든 뒤에는 바꿀 수 없어요</div>
                </div>
              </div>
            )}

            <div className="tray-row">
              <span className="tray-label">길이</span>
              <div className="tray-col">
                <div className="chips">
                  {TARGET_CHOICES.map((s) => (
                    <button key={s} className={`chip${seconds === s ? " on" : ""}`} onClick={() => setSeconds(s)}>
                      {s}초
                    </button>
                  ))}
                </div>
                <div className="tray-note">자료가 모자라면 더 짧아질 수 있어요</div>
              </div>
            </div>

            {/* 사이즈 — 컷을 만든 뒤에는 못 바꾼다(그림이 그 모양으로 나온다). 그래서 여기가 자리다 */}
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


            <div className="tray-row">
              <span className="tray-label">컨셉</span>
              <div className="tray-col">
                <StylePicker bare preset={stylePreset} note={styleNote}
                  onPreset={setStylePreset} onNote={setStyleNote} />
              </div>
            </div>

            {/* 공통 지시 — 컨셉 **아래**다. 컨셉이 주경로이고 이 두 칸은 프롬프트를 직접 써 오는
                사장님을 위한 곁길이라, 위에 두면 빈 칸 둘이 기본 흐름을 막는다.
                ★ 두 칸을 **잠그지 않는다.** 잠그면 이미지 칸에서 영상 칸으로 탭하는 순간
                  포커스가 날아간다(①자료에서 실제로 겪은 결함이다).
                ★ 자리표시자는 영어다 — 이 값은 번역 없이 모델에 그대로 실린다. 한국어 예시를
                  두면 사장님이 그것을 따라 적고 그 한국어가 그대로 fal 에 나간다. */}
            <div className="tray-row">
              <span className="tray-label">지시</span>
              <div className="tray-col">
                <label className="tray-note">이미지에 함께 보낼 지시
                  <textarea className="field tray-input" maxLength={PROMPT_NOTE_MAX}
                    placeholder="예: shot on 35mm film, shallow depth of field"
                    value={imageNote} onChange={(e) => setImageNote(e.target.value)} />
                </label>
                <label className="tray-note">영상에 함께 보낼 지시
                  <textarea className="field tray-input" maxLength={PROMPT_NOTE_MAX}
                    placeholder="예: hand-held camera, subtle shake"
                    value={clipNote} onChange={(e) => setClipNote(e.target.value)} />
                </label>
                <div className="tray-note">비워 두어도 돼요 · 모든 컷에 그대로 함께 보내요</div>
              </div>
            </div>
          </div>

          <div className="composer-bar">
            <button className="pill" disabled={photos.length >= 10}
              onClick={() => fileRef.current?.click()}>
              ＋ 사진 {photos.length > 0 && <b>{photos.length}</b>}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onFiles} />

            <span className="spacer" />
            <button className="cta" onClick={submit} disabled={busy || !text.trim()}>
              {busy ? "여는 중…" : "정리하기 →"} <span className="cr">무료</span>
            </button>
          </div>
        </div>

        {err && <p className="pgsub warn">{err}</p>}
      </section>
    </>
  );
}
