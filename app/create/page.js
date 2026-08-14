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
import { DEFAULT_STYLE_ID } from "../../lib/styles";
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
  const [seconds, setSeconds] = useState(null); // null = 자동(자료가 정함)
  const [aspect, setAspect] = useState(DEFAULT_ASPECT_ID);
  // ★ 영상 모델은 **여기서 한 번** 고른다 — 만든 뒤에는 못 바꾼다(서버도 400 으로 막는다).
  // 모델이 정가를 정하는데(길이 × 모델) 정가는 ③목소리·④이미지에서 걷히므로, 뒤에서
  // 바꾸면 낸 값과 만드는 값이 어긋난다. 차액 정산은 만들지 않았다.
  const [model, setModel] = useState(DEFAULT_I2V_MODEL);
  const [stylePreset, setStylePreset] = useState(DEFAULT_STYLE_ID);
  const [styleNote, setStyleNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);
  const textRef = useRef(null);

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
      <p className="pgsub">자료를 주시면 기계가 정리해 보여드려요 — 확인 → 대본 → 목소리 → 이미지 → 영상 → 완성</p>

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
            <div className="tray-row">
              <span className="tray-label">길이</span>
              <div className="tray-col">
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

            {/* 영상 모델 — 움직임을 만드는 방식이자 **정가를 정하는 값**이다. 만든 뒤에는
                못 바꾸므로(모델이 값을 정하고 그 값은 ③④에서 걷힌다) 여기가 유일한 자리다.
                이름·설명·값은 화면이 적지 않는다 — lib/clip-limits 의 표와 가격표에서 온다. */}
            <div className="tray-row">
              <span className="tray-label">영상 모델</span>
              <div className="tray-col">
                <div className="chips">
                  {I2V_MODELS.map((m) => (
                    <button key={m.id} className={`chip${model === m.id ? " on" : ""}`}
                      onClick={() => setModel(m.id)}>
                      {/* ★ 화질은 여기서 안 고른다 — 프로젝트가 생긴 뒤 ②대본에서 고른다.
                          그래서 값은 **기본 화질** 기준이고, 그것을 인자로 명시한다
                          (비우면 다음 사람이 "해상도를 안 보는 자리"로 읽는다). */}
                      {m.label}{showCredits && ` · ${videoPrice(seconds, m.id, DEFAULT_RESOLUTION)} 크레딧`}
                    </button>
                  ))}
                </div>
                {/* ★ 길이를 안 고르면(자동) 가격표가 30초 값으로 떨어진다 — 그 숫자를 확정처럼
                    적으면 자료가 짧아 15초로 나왔을 때 사장님이 다른 값을 본다. 기준을 말한다. */}
                {/* ★ 값은 **기본 화질** 기준이다 — ②대본에서 더 높은 화질을 고르면 올라간다.
                    화질을 안 고르는 모델(Kling·LTX)에는 그 말을 안 붙인다: 여기 없는 선택을
                    있는 것처럼 말하는 것이 "고를 수 있는 척"과 같은 잘못이다. */}
                <div className="tray-note">
                  {I2V_MODELS.find((m) => m.id === model)?.hint} · 만든 뒤에는 바꿀 수 없어요
                  {seconds === null && " · 값은 30초 기준이고 길이에 따라 달라져요"}
                  {resolutionsForModel(model).length > 0 && " · 화질에 따라서도 달라져요"}
                </div>
              </div>
            </div>

            <div className="tray-row">
              <span className="tray-label">컨셉</span>
              <div className="tray-col">
                <StylePicker bare preset={stylePreset} note={styleNote}
                  onPreset={setStylePreset} onNote={setStyleNote} />
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
