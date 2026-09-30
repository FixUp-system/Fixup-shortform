"use client";

// **롱폼 — 입력 화면** (2026-09-29, 시험용 껍데기).
//
// ★★★ 사장님 지시: "사이드바에 롱폼 섹션을 하나 만들어줘 거기서 따로 진행할게 ·
//   ui 는 단계별을 참고해서". 그래서 이 화면은 app/reel/new/page.js 의 **말투와 격자를
//   그대로** 쓴다(rw-grid · rp-panel · composer-tray). 새 CSS 를 만들지 않는다 —
//   두 흐름이 다른 모양이면 사장님이 화면마다 다른 사용법을 익혀야 한다.
//
// ★★ **굽기는 아직 배선하지 않았다.** 이 회차에서 굳히는 것은 "롱폼이 무엇을 입력으로
//   받는가"까지다. 구간을 어디서 끊을지(경계를 장면 전환에 맞춘다) · 일관성 채널(닻) ·
//   낭독을 우리 TTS 로 가져오는 것은 설계가 끝난 뒤다.
//   그래서 [시작하기]가 **잠겨 있고, 왜 잠겼는지 화면이 말한다** — 눌리지 않는 버튼만
//   두면 "고장인가?"가 된다(이 저장소가 ＋인물 숨김에서 이미 배운 것).
//
// ★ 표는 **전부 기존 것을 읽는다**(화풍·분위기·비율). 롱폼용 사본을 만들면 그 순간
//   두 벌이 되어 한쪽이 낡는다 — 이 저장소의 "값이 사는 곳" 규율이다.
// ★ 길이만 이 흐름의 것이다 — 단계별은 초, 롱폼은 **분**이다(lib/longform/plan.js).
//
// ⚠️ **사진 첨부는 아직 없다.** 붙일 프로젝트가 없어서 지금 올리면 버킷에 주인 없는
//   파일만 쌓인다. 만드는 라우트를 배선할 때 단계별과 **같은 배관**(shrinkForUpload →
//   /api/uploads → material.photos)으로 함께 붙인다.
import { useState } from "react";
import Select from "../../../components/Select";
import AutoTextarea from "../../../components/AutoTextarea";
import { ASPECTS, aspectFor } from "../../../lib/aspects";
import { STYLE_PRESETS } from "../../../lib/styles";
import { AD_STYLE_LINES, AD_MOODS, DEFAULT_AD_OPTIONS } from "../../../lib/ad/options";
import { MAX_MATERIAL_TEXT } from "../../../lib/material";
import {
  LONGFORM_LENGTHS, SEGMENT_SECONDS, segmentCountFor, lengthLabel,
} from "../../../lib/longform/plan";

// 화풍은 **영상용 문구가 있는 것만** 고를 수 있다 — 단계별·광고·film 과 같은 규칙이다.
const LONGFORM_STYLES = STYLE_PRESETS.filter((s) => Object.keys(AD_STYLE_LINES).includes(s.id));

export default function LongformNewPage() {
  const [text, setText] = useState("");
  const [aspect, setAspect] = useState("9:16");
  const [style, setStyle] = useState(DEFAULT_AD_OPTIONS.style);
  const [mood, setMood] = useState(DEFAULT_AD_OPTIONS.mood);
  const [seconds, setSeconds] = useState(null);

  // ★ 구간 수는 **계산해서** 보여 준다. 손으로 적으면 굽는 쪽과 갈린다.
  const segments = segmentCountFor(seconds);

  return (
    <section className="panel panel--wide">
      <h1 className="pgtitle">테스트용 - 롱폼생성</h1>
      <p className="pgsub">
        15초짜리 여러 편을 만들어 이어 붙여요. 소재와 설정을 주시면 전체 시나리오부터 함께 만들어요.
      </p>

      <div className="rw-grid rw-grid--even">
        <aside className="rp-panel">
          <div className="rp-head">이 영상의 설정</div>
          <div className="rp-body">
            <div className="composer-tray">
              <div className="tray-row">
                <span className="tray-label">사이즈</span>
                <div className="tray-col">
                  <Select value={aspect} aria-label="사이즈"
                    onChange={(e) => setAspect(e.target.value)}>
                    {ASPECTS.map((a) => (
                      <option key={a.id} value={a.id}>{a.label} · {a.id}</option>
                    ))}
                  </Select>
                  <div className="tray-note">{aspectFor(aspect).fits}</div>
                </div>
              </div>

              {/* ★★ 단계별과 **다른 유일한 줄**이다 — 거기는 초, 여기는 분이다.
                  ★ 고른 길이가 곧 구간 수다(15초로 나눈다). 그 수를 여기서 바로 말해 주는
                    이유: 10분이 "구간 40개"라는 것이 사장님에게 보여야 값과 시간을 짐작할
                    수 있다. 안 보이면 [시작하기]를 누른 뒤에야 안다. */}
              <div className="tray-row">
                <span className="tray-label">길이</span>
                <div className="tray-col">
                  <Select value={seconds ?? ""} aria-label="길이"
                    onChange={(e) => setSeconds(Number(e.target.value))}>
                    {seconds === null && <option value="" disabled>길이 선택</option>}
                    {LONGFORM_LENGTHS.map((s) => (
                      <option key={s} value={s}>{lengthLabel(s)}</option>
                    ))}
                  </Select>
                  {segments > 0 && (
                    <div className="tray-note">
                      {SEGMENT_SECONDS}초짜리 <b>{segments}개</b>를 만들어 이어 붙여요
                    </div>
                  )}
                </div>
              </div>

              <div className="tray-row">
                <span className="tray-label">화풍</span>
                <div className="tray-col">
                  <Select value={style} aria-label="화풍"
                    onChange={(e) => setStyle(e.target.value)}>
                    {LONGFORM_STYLES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </Select>
                  <div className="tray-note">
                    {LONGFORM_STYLES.find((s) => s.id === style)?.desc || ""}
                  </div>
                </div>
              </div>

              <div className="tray-row">
                <span className="tray-label">분위기</span>
                <div className="tray-col">
                  <Select value={mood} aria-label="분위기"
                    onChange={(e) => setMood(e.target.value)}>
                    {AD_MOODS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div>
          <label className="lbl" htmlFor="lf-text">소재</label>
          {/* ★ 칸도 기존 것을 쓴다 — 광고 첫 화면과 **같은 부품·같은 클래스**다
              (components/AutoTextarea + .field.composer-text). 새 클래스를 지으면
              globals.css 에 이름이 없는 칸이 되고, tests/ad-draft-form-ui.test.js 의
              그물이 그것을 막는다(실제로 여기서 한 번 걸렸다). */}
          <div className="composer">
            <AutoTextarea
              id="lf-text"
              className="field composer-text"
              maxLength={MAX_MATERIAL_TEXT}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="무엇에 대한 영상인가요? 이야기·정보·대본 무엇이든 적어 주세요."
            />
          </div>

          {/* ★★ 잠긴 이유를 말한다 — 눌리지 않는 버튼만 두면 "고장인가?"가 된다. */}
          <p className="pgsub warn">
            ⚠ 아직 만들기가 배선되지 않았어요 — 지금은 입력만 확인하는 시험용 화면이에요.
            구간을 어디서 끊을지와 인물을 어떻게 붙들지를 정한 뒤에 열어요.
          </p>
          <button className="cta" disabled>시작하기</button>
        </div>
      </div>
    </section>
  );
}
