"use client";

// 1 입력 — **보여 주기만 한다.** 만든 뒤에는 조건을 못 바꾼다(app/film/[id]/briefing/page.js
// 와 같은 규율): 그 값들이 시나리오·그림·굽기의 재료라, 바꿀 자리를 열면 낡음 경고가 함께
// 돌아와야 한다.
//
// ★ 프로젝트는 레이아웃(app/reel/[id]/layout.js)이 한 번 읽어 컨텍스트에 담아 둔 것을
//   쓴다. 화면마다 자기 fetch 를 두면 같은 문서를 여러 번 읽고, 한 화면이 갱신한 값을
//   옆 화면이 모른다.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useReelProject } from "../layout";
import { REEL_STEPS, reelStepHref } from "../../../../lib/reel/steps";
import { AD_FORMATS, AD_MOODS, AD_LANGS } from "../../../../lib/ad/options";
import { STYLE_PRESETS } from "../../../../lib/styles";
import { aspectFor } from "../../../../lib/aspects";

// 라벨은 표에서 읽는다 — 화면에 복사하면 표와 갈린다. 표에 없는 값이면 그 값을 그대로
// 보여 준다("알 수 없음"으로 뭉개면 무엇이 박혔는지 알 길이 없다).
const labelOf = (list, id) => list.find((x) => x.id === id)?.label || id;

export default function ReelBriefingPage() {
  const { id } = useParams();
  // ★ 제목은 **표가 쉠다** — 화면이 손으로 적으면 라벨을 바꿀 때 여기만 낡는다.
  const stepLabel = REEL_STEPS.find((x) => x.key === "material")?.label || "";
  const { project } = useReelProject();
  const s = project?.settings || {};
  const next = REEL_STEPS.find((x) => x.key === "scenario");

  const photos = project?.material?.photos || [];
  // ★ 라벨과 값을 한 자리에 모은다 — 화면이 칩만 늘어놓으면
  //   "story" 가 컨셉인지 분위기인지 사장님이 알 수 없다.
  const facts = [
    ["컨셉", labelOf(AD_FORMATS, s.format)],
    ["분위기", labelOf(AD_MOODS, s.mood)],
    ["화풍", labelOf(STYLE_PRESETS, s.style)],
    ["언어", labelOf(AD_LANGS, s.narration_lang)],
    ["사이즈", `${aspectFor(s.aspect_ratio)?.label || ""} · ${s.aspect_ratio}`],
    ["길이", `${s.target_seconds}초`],
  ];

  return (
    <section className="panel panel--wide">
      <h2>{stepLabel}</h2>

      <div className="recap">
        {/* ★ 사장님이 쓴 글이 **이 화면의 주인공**이다. 전에는 .script-src
            (12px 회색)라 각주처럼 보였다 — 정보 위계가 뒤집혀 있었다. */}
        <div className="recap-block">
          <span className="recap-label">소재</span>
          <p className="recap-text">{project?.material?.text}</p>
        </div>

        {/* ★★ 올린 사진을 **실제로 보여 준다.** 전에는 "사진 3장"이라는 숫자뿐이라
            내가 무엇을 올렸는지 확인할 길이 없었다 — 그런데 이 사진이 제품의 생김새를
            정하는 재료다(lib/cut-refs.js).
            ★ 주소는 저장된 것을 그대로 쓴다 — 비공개 버킷이라 /api/uploads/<name> 으로
            흘려주는 규약이 있고(CLAUDE.md), 화면이 손으로 조립하면 그 규약이 바뀔 때 여기만 낡는다. */}
        {photos.length > 0 && (
          <div className="recap-block">
            <span className="recap-label">사진 {photos.length}장</span>
            <div className="recap-photos">
              {photos.map((p, i) => (
                <div key={p.url || i} className="recap-photo">
                  <img src={p.url} alt={`올린 사진 ${i + 1}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="recap-block">
          <span className="recap-label">조건</span>
          <dl className="recap-facts">
            {facts.map(([k, v]) => (
              <div key={k} className="recap-fact">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="step-actions">
        <div className="fwd">
          <Link className="cta" href={reelStepHref(next, id)}>시나리오로 →</Link>
        </div>
      </div>
    </section>
  );
}
