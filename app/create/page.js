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
import AutoTextarea from "../../components/AutoTextarea";
import { TARGET_CHOICES } from "../../lib/script";
import { DEFAULT_STYLE_ID } from "../../lib/styles";
import { ASPECTS, DEFAULT_ASPECT_ID, aspectFor } from "../../lib/aspects";
import { I2V_MODELS, DEFAULT_I2V_MODEL, DEFAULT_RESOLUTION, resolutionsForModel, defaultResolutionForModel } from "../../lib/clip-limits";
import { SUBTITLE_LANGS, DEFAULT_SPEECH_LANG } from "../../lib/subtitle-langs";
// 값은 가격표 한 곳에서 온다(import 0 개의 순수 모듈이라 화면에서 안전하다)
import { videoPrice } from "../../lib/pricing";
import StylePicker from "../../components/StylePicker";
import { MAX_MATERIAL_TEXT } from "../../lib/material";

export default function CreatePage() {
  const router = useRouter();
  const { setProject } = useProject();
  // 크레딧을 끈 동안(내부 QA)에는 값 이야기를 안 한다 — 판정은 서버가 내려 준 gated 하나다.
  // ★ `!== false` 로 본다: me 를 아직 못 읽은 동안(null)에는 지금까지처럼 값을 보여준다.
  //   반대로 두면 크레딧이 켜진 정상 배포에서 값이 잠깐 사라졌다 나타난다.
  const { me, ready } = useMe();
  // ★ ready 를 함께 본다(2026-08-31) — 모르는 동안 `me?.gated !== false` 는 **참**이라
  //   크레딧이 반짝 보였다가 사라졌다. 모르는 동안에는 값 이야기를 아예 안 한다.
  const showCredits = ready && me?.gated !== false;
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
  // ★ 2026-08-31 — 이 화면도 DEFAULT_I2V_MODEL 을 공유한다. 기본이 H3 로 옮겨 가면서
  //   전역 720p 가 그 모델에 없는 값이 됐다 — 그 모델의 기본으로 시작한다.
  const [resolution, setResolution] = useState(defaultResolutionForModel(DEFAULT_I2V_MODEL));
  // 영상이 말할 언어 — 대사 원문이 이 말로 쓰이고, 그 글자가 그대로 자막이 된다
  const [speechLang, setSpeechLang] = useState(DEFAULT_SPEECH_LANG);
  const [stylePreset, setStylePreset] = useState(DEFAULT_STYLE_ID);
  const [styleNote, setStyleNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  // 이 모델이 여는 화질 목록 — 비면 화질 칩을 아예 안 그린다(Kling·LTX)
  const resolutions = resolutionsForModel(model);

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
    setResolution(list.includes(DEFAULT_RESOLUTION) ? DEFAULT_RESOLUTION : defaultResolutionForModel(id));
  }

  async function submit() {
    setBusy(true); setErr("");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        material: { text, photos },
        settings: {
          target_seconds: seconds, aspect_ratio: aspect, i2v_model: model, speech_lang: speechLang,
          style: { preset: stylePreset, note: styleNote },
          // ★ 화질은 **그 모델이 화질을 열 때만** 싣는다. Kling 에는 resolution 파라미터가
          //   아예 없어, 보내면 서버가 400 으로 막는다(그것이 맞는 동작이다).
          ...(resolutionsForModel(model).length ? { resolution } : {}),
        },
      }),
    });
    const data = await res.json();
    // ★ **바로 ②시나리오로** 간다(2026-08-18 사장님 지시). ①자료 화면은 오늘 아침 입력을
    //   전부 잃어(전부 이 화면으로 모았다) 남은 일이 "적은 글을 보여 주고 버튼 하나를 누르는
    //   것" 뿐이었다 — 누를 것이 하나뿐인 화면은 게이트가 아니라 한 번 더 누르게 하는 자리다.
    //   ★ 화면을 지우지는 않는다: 스테퍼의 ①이 그곳을 가리키고, 적은 자료를 다시 볼 자리가
    //     필요하다. 가드도 막지 않는다 — 자료 글이 있으면 currentStepKey 가 곧바로
    //     "scenario" 를 돌려주고, 이 화면이 그 글을 반드시 받는다.
    if (res.ok) router.push(`/create/${data.id}/scenario`);
    // 실패해도 써 둔 자료는 화면에 남는다(로컬 state) — 다시 누르면 된다
    else { setErr(data.error || "생성 실패"); setBusy(false); }
  }

  return (
    <>
      <h1 className="pgtitle">영상 만들기 (단계별)</h1>
      <p className="pgsub">자료를 주시면 기계가 정리해 보여드려요 — 확인 → 시나리오 → 목소리 → 이미지 → 영상 → 완성</p>

      <section className="panel--wide">
        <div className="composer">
          {/* ★ 이 칸 하나가 **전부를 받는다**(2026-08-18 사용자 지시). 예전에는 아래에 이미지용·
              영상용 공통 지시 칸이 따로 있었는데, 사장님에게 그 구분은 우리 사정이다 — 바라는
              느낌은 하고 싶은 말과 함께 나온다. 자리표시자가 그 사실을 말해 주지 않으면
              사장님은 여전히 "적을 자리가 없다"고 느낀다.
              (걷어낸 라벨을 여기 그대로 옮겨 적지 않는다: 화면 계약이 소스 문자열을 훑어
               재므로 주석의 낱말도 "칸이 남아 있다"로 읽힌다 — 오늘 세 번째다.) */}
          <AutoTextarea className="field composer-text" value={text} maxLength={MAX_MATERIAL_TEXT}
            onChange={(e) => setText(e.target.value)}
            placeholder="무엇을 알리고 싶으세요? 제품 설명·홍보 포인트·손님 이야기를 자유롭게 적어 주세요. 원하는 분위기나 촬영 느낌이 있으면 그것도 여기 함께 적어 주세요" />

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
                      {m.label}{showCredits && ` · ${videoPrice(seconds, m.id, defaultResolutionForModel(m.id))} 크레딧`}
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

            {/* ★ 말하는 언어 — 여기서 한 번 정한다(2026-08-18 사장님 지시).
                뒤에서 못 정하는 이유: 이 값이 **대사 원문의 언어**라 시나리오를 쓸 때
                이미 필요하고, 나중에 바꾸면 대사·소리·자막이 전부 낡는다. */}
            <div className="tray-row">
              <span className="tray-label">언어</span>
              <div className="tray-col">
                <div className="chips">
                  {SUBTITLE_LANGS.map((l) => (
                    <button key={l.id} className={`chip${speechLang === l.id ? " on" : ""}`}
                      onClick={() => setSpeechLang(l.id)}>
                      {l.label}
                    </button>
                  ))}
                </div>
                <div className="tray-note">영상이 이 말로 말하고, 같은 말이 자막으로 깔려요 · 만든 뒤에는 바꿀 수 없어요</div>
              </div>
            </div>

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

            {/* ★★ 공통 지시 칸 둘을 **걷었다**(2026-08-18 사용자 지시). 같은 날 아침에 ①자료에서
                여기로 옮겨 왔는데, 옮기고 보니 첫 화면이 자료 칸 + 지시 칸 둘이 되어 "무엇을
                어디에 적어야 하는가"가 사장님 몫이 됐다. 바라는 화풍·촬영 느낌은 **맨 위 자료
                칸에 함께** 적으면 되고, 그 글이 시나리오·화면 설계를 거쳐 그림에 닿는다.
                ★ 자료에서 LLM 으로 그 지시를 **뽑지 않는 이유**: 그 값은 그림 각인에
                  들어간다(lib/steps.js imageContextKey). 시나리오를 다시 만들 때마다 뽑힌 문장이
                  조금씩 달라지면 **전 컷 그림이 낡아 재구매가 열린다**(컷당 $0.08, 클립까지
                  낡으면 $0.674). 사장님이 손으로 적을 때는 안 흔들리던 값이라 없던 위험이다.
                ⚠️ 서버는 여전히 이 값을 받을 수 있다(POST /api/projects · PATCH) — 화면만 안
                   보낸다. 파워 유저용 자리를 다시 열 때 배관을 새로 깔지 않아도 된다. */}
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
