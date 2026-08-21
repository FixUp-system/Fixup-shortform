"use client";

// 광고 옵션 트레이 — **첫 화면과 입력 수정 화면이 나눠 쓴다**(2026-08-21).
//
// ★★ 왜 뺐나: 사장님이 시나리오를 보고 나서 입력값을 고치고 싶어 했는데(2026-08-21),
//   고칠 자리가 첫 화면(/ads/new)뿐이었고 거기는 **새 프로젝트를 만드는 자리**라
//   기존 값이 없는 빈 화면이 떴다. 수정 화면을 새로 그리면 트레이가 두 벌이 되고,
//   이 저장소는 두 벌이 갈려 사고가 난 자리를 이미 여럿 안다.
//
// ★ 값과 바꾸기를 **하나씩만** 받는다(value / onChange). 칸이 여덟이라 setter 를 여덟 개
//   넘기면 부르는 쪽마다 그 목록이 또 두 벌이 된다.
// ★ 이 컴포넌트는 **판정을 안 한다** — 모델·해상도·길이의 닫힌 목록과 등급·관리자 판정은
//   전부 lib 이 쥔다(modelsForTier · adResolutionsFor · adSecondsFor). 여기는 그리기만 한다.
import {
  AD_MODELS, adSecondsFor, isAdSeconds,
  adResolutionsFor, isAdResolution, adDefaultResolution, isAdminOnlyResolution,
} from "../lib/ad/models";
import { AD_FORMATS, AD_MOODS, AD_LANGS, AD_STYLE_LINES } from "../lib/ad/options";
import { STYLE_PRESETS } from "../lib/styles";
import { ASPECTS, aspectFor } from "../lib/aspects";
import { priceLabel, adVideoPrice } from "../lib/pricing";
import { modelsForTier } from "../lib/tiers";

// 영상용 문구가 있는 화풍만 고를 수 있다 — app/ads/new 에 있던 그 줄을 그대로 옮겼다
// (두 화면이 같은 목록을 봐야 한다).
const AD_STYLES = STYLE_PRESETS.filter((s) => Object.keys(AD_STYLE_LINES).includes(s.id));

export default function AdOptionTray({ value, onChange, showCredits = true, admin = false, tier }) {
  const { format, mood, style, lang, aspect, model, seconds, resolution } = value;
  const set = (k, v) => onChange({ [k]: v });

  // 모델을 바꾸면 길이·해상도가 그 모델에서 유효한지 다시 본다 — 안 그러면 서버가 400 을
  // 낸다(app/api/ads 의 isAdSeconds·isAdResolution). 되돌릴 자리는 **그 모델의 기본**이다.
  function onModelChange(id) {
    onChange({
      model: id,
      seconds: isAdSeconds(seconds, id) ? seconds : adSecondsFor(id)[0],
      resolution: isAdResolution(resolution, id, { admin }) ? resolution : adDefaultResolution(id),
    });
  }

  return (
              <div className="composer-tray">
                <div className="tray-row">
                  <span className="tray-label">포맷</span>
                  <div className="tray-col">
                    <div className="chips">
                      {AD_FORMATS.map((f) => (
                        <button key={f.id} className={`chip${format === f.id ? " on" : ""}`}
                          onClick={() => set('format', f.id)}>
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
                          onClick={() => set('mood', m.id)}>
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
                          onClick={() => set('style', s.id)}>
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
                          onClick={() => set('lang', l.id)}>
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
                          onClick={() => set('aspect', a.id)}>
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
                      {modelsForTier(tier, { admin }).map((m) => (
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
                      {adResolutionsFor(model, { admin }).map((r) => (
                        <button key={r} className={`chip${resolution === r ? " on" : ""}`}
                          onClick={() => set('resolution', r)}>
                          {r}{showCredits && ` · ${priceLabel(adVideoPrice(seconds, model, r))}`}
                          {/* ★ 관리자에게만 보이는 칸이라는 것을 화면이 말한다 — 안 그러면
                              운영자가 무심코 골라 한 편에 $15~31 이 나간다. */}
                          {isAdminOnlyResolution(r, model) && <span className="soon-tag">관리자</span>}
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
                          onClick={() => set('seconds', s)}>
                          {s}초{showCredits && ` · ${priceLabel(adVideoPrice(s, model, resolution))}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
  );
}
