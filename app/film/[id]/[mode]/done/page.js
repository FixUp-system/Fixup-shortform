"use client";

// /film/[id]/[mode]/done — 5 완성. 구운 영상을 보고 나간다.
//
// ★★ 비교가 이 기능의 목적이다. 같은 프로젝트(=같은 시나리오)를 옆 방식으로 굽는 길이
//   없으면 A/B 가 성립하지 않는다 — **id 를 그대로 들고** 건너간다. 방식별 산출물은
//   films 에 두 벌로 남으므로 이쪽 결과가 지워지지 않는다.
//
// ★ 폴링이 없다. 여기는 굽기가 **끝난 뒤에만** 열린다(lib/film/steps.js 의
//   isFilmStepReachable 이 films[방식].video.url 을 본다).
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFilmProject } from "../../../../../components/FilmProjectContext";
import { FILM_MODES, filmMode } from "../../../../../lib/film/mode";
import { filmOf } from "../../../../../lib/film/doc";
import { FILM_STEPS, filmStepHref } from "../../../../../lib/film/steps";

export default function FilmDonePage() {
  const { id, mode } = useParams();
  const { project } = useFilmProject();

  const here = filmMode(mode);
  const film = filmOf(project, mode);
  const other = FILM_MODES.find((m) => m.id !== mode);
  const imagesStep = FILM_STEPS.find((s) => s.key === "images");

  return (
    <section className="panel panel--wide">
      <h2>완성</h2>
      <p className="pgsub">{here.label} · {here.hint}</p>

      {film.video?.url ? (
        <div className="preview-pane done-preview">
          <div className="preview-frame">
            <video className="preview-video" controls src={film.video.url} />
          </div>
        </div>
      ) : (
        <p className="pgsub">아직 구운 영상이 없어요.</p>
      )}

      <div className="step-actions">
        {/* 옆 방식은 그림부터 갈린다 — 건너가는 자리는 3 그림이다. */}
        {other && (
          <Link className="mini" href={filmStepHref(imagesStep, id, other.id)}>
            다른 방식으로 굽기 · {other.label}
          </Link>
        )}
        <div className="fwd">
          <Link className="cta" href="/archive">보관함으로</Link>
        </div>
      </div>
    </section>
  );
}
