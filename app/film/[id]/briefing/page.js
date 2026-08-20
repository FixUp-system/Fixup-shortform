"use client";

// 1 입력 — **보여 주기만 한다.** 만든 뒤에는 조건을 못 바꾼다(단계별 ①자료와 같은 규율):
// 그 값들이 시나리오·그림·굽기의 재료라, 바꿀 자리를 열면 낡음 경고가 함께 돌아와야 한다.
//
// ★ 프로젝트는 레이아웃(app/film/[id]/layout.js)이 한 번 읽어 컨텍스트에 담아 둔 것을 쓴다.
//   화면마다 자기 fetch 를 두면 같은 문서를 다섯 번 읽고, 한 화면이 갱신한 값을 옆 화면이
//   모른다.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFilmProject } from "../../../../components/FilmProjectContext";
import { FILM_STEPS, filmStepHref } from "../../../../lib/film/steps";
import { AD_FORMATS, AD_MOODS, AD_LANGS } from "../../../../lib/ad/options";
import { STYLE_PRESETS } from "../../../../lib/styles";
import { aspectFor } from "../../../../lib/aspects";

// 라벨은 표에서 읽는다 — 화면에 복사하면 표와 갈린다. 표에 없는 값이면 그 값을 그대로
// 보여 준다("알 수 없음"으로 뭉개면 무엇이 박혔는지 알 길이 없다).
const labelOf = (list, id) => list.find((x) => x.id === id)?.label || id;

export default function FilmBriefingPage() {
  const { id } = useParams();
  const { project } = useFilmProject();
  const s = project?.settings || {};
  const next = FILM_STEPS.find((x) => x.key === "scenario");

  return (
    <section className="panel panel--wide">
      <h2>입력</h2>
      <p className="script-src">{project?.material?.text}</p>
      {/* ⚠️ 계획서는 여기에 `tray` 클래스를 적었는데 globals.css 에 그런 클래스는 0건이다
          (실물은 `chips` + `chip`). 없는 클래스를 쓰면 무스타일로 뜬다. */}
      <div className="chips">
        <span className="chip on">{labelOf(AD_FORMATS, s.format)}</span>
        <span className="chip on">{labelOf(AD_MOODS, s.mood)}</span>
        <span className="chip on">{labelOf(STYLE_PRESETS, s.style)}</span>
        <span className="chip on">{labelOf(AD_LANGS, s.narration_lang)}</span>
        <span className="chip on">{aspectFor(s.aspect_ratio)?.label} · {s.aspect_ratio}</span>
      </div>
      <p className="pgsub">사진 {(project?.material?.photos || []).length}장</p>
      <div className="step-actions">
        <Link className="cta" href={filmStepHref(next, id)}>시나리오로</Link>
      </div>
    </section>
  );
}
