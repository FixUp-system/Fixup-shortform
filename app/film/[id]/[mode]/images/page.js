"use client";

// /film/[id]/[mode]/images — 3 그림. **여기서부터 방식이 갈린다.**
//
// ★ 옛 한 화면(app/film/one/[mode]/page.js)의 그림 <section> 을 그대로 옮겨 담고,
//   카드별 [다시 만들기](only) 하나를 더했다. 축 하나를 손볼 때마다 넉 장($0.32)을
//   다시 그리던 것을 한 장($0.08)으로 줄인다.
//
// ★ 프로젝트는 레이아웃(app/film/[id]/layout.js)이 한 번 읽어 컨텍스트로 나눠 준다 —
//   여기서 자기 fetch 를 새로 만들면 같은 문서를 두 번 읽고 값이 갈린다.
//
// ★ 폴링이 없다. 그림 라우트는 **기다린다**(fire-and-forget 이 아니다) — 응답이 오면
//   그때 문서를 다시 읽는다. 그래서 이 화면에는 루프가 필요 없다.
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFilmProject } from "../../../../../components/FilmProjectContext";
import { FILM_MODES, filmMode } from "../../../../../lib/film/mode";
import { filmOf } from "../../../../../lib/film/doc";
// 문 판정은 순수 함수 한 벌이다 — 버튼마다 조건을 따로 적으면 언젠가 한 곳이 빠진다.
import { filmGates } from "../../../../../lib/film/gates";
import { FILM_STEPS, filmStepHref } from "../../../../../lib/film/steps";

export default function FilmImagesPage() {
  const { id, mode } = useParams();
  const { project, reload } = useFilmProject();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const here = filmMode(mode);
  const film = filmOf(project, mode);
  const scenario = project?.scenario;
  const { drawingNow, triesGone, drawLocked } = filmGates(film, !!busy);

  // ★★ 시나리오 판이 다르면 카드별 다시 만들기를 잠근다. 서버(lib/film/pipeline.js)도
  //   던지지만, 화면이 먼저 막아야 사장님이 오류를 보기 전에 안다. 판정은 서버와 **같은
  //   값**을 본다 — films[방식].scenarioTries vs scenario.tries. 판이 섞인 그림 묶음이
  //   생기면 "차이는 방식 때문"이라는 이 기능의 대전제를 나중에 아무도 확인할 수 없다.
  const staleSet = Number(film?.scenarioTries) !== (Number(scenario?.tries) || 0);

  // only 를 주면 그 축만, 안 주면 전부. 배열이 아닌 값을 보내면 라우트가 400 이다.
  async function redraw(only) {
    setBusy("images"); setErr("");
    const res = await fetch(`/api/film/${id}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(only ? { mode, only } : { mode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "그림을 만들지 못했어요");
    // 성공이든 실패든 문서를 다시 읽는다 — 실패도 films[mode].error 에 남아 있다.
    await reload(id).catch((e) => setErr(e.message));
    setBusy("");
  }

  const videoStep = FILM_STEPS.find((s) => s.key === "video");
  const imagesStep = FILM_STEPS.find((s) => s.key === "images");

  return (
    <section className="panel panel--wide">
      <h2>그림</h2>
      <p className="pgsub">{here.label} · {here.hint}</p>

      {/* ★★ 방식 칩 — **같은 id 를 들고** 옆 방식으로 건너간다. 그래야 두 편이 같은
          시나리오를 쓴다(시나리오 라우트가 방식을 안 보는 이유와 같다). 방식별 산출물은
          films 에 두 벌로 남으므로 이쪽 결과가 지워지지 않는다. */}
      <div className="chips">
        {FILM_MODES.map((m) => (
          <Link
            key={m.id}
            className={`chip${m.id === mode ? " on" : ""}`}
            href={filmStepHref(imagesStep, id, m.id)}
          >
            {m.label}
          </Link>
        ))}
      </div>

      {err && <p className="pgsub warn">{err}</p>}
      {film.error && <p className="pgsub warn">{film.error}</p>}
      {drawingNow && <p className="pgsub">그림을 그리는 중이에요 — 다 되면 여기에 나타나요.</p>}

      {/* 남은 횟수를 **미리** 말한다. 안 말하면 상한을 넘긴 뒤에 400 으로 처음 안다. */}
      {Number.isFinite(film.triesLeft) && !triesGone && (
        <p className="pgsub">다시 그릴 수 있는 횟수가 {film.triesLeft}번 남았어요.</p>
      )}
      {triesGone && !drawingNow && (
        <p className="pgsub warn">그림을 다시 그릴 수 있는 횟수를 다 썼어요.</p>
      )}
      {film.images?.length > 0 && staleSet && (
        <p className="pgsub warn">시나리오가 바뀌었어요 — 그림을 전부 다시 그려 주세요.</p>
      )}

      {film.images?.length > 0 && (
        <div className="uploads">
          {film.images.map((im) => (
            <div key={im.key} className="up photo-mark">
              {/* ★ 인라인 스타일을 안 쓴다 — globals.css 의 .thumb-media 가 그 세 줄이다
                  (tests/design-system.test.js 가 인라인 스타일 총량을 잰다). */}
              <img className="thumb-media" src={im.url} alt={im.key} />
              {/* ★ 이 축만 다시 그린다. 판이 다르면 잠근다 — 서버가 던지기 전에 막는다. */}
              <button className="tag" disabled={drawLocked || staleSet} onClick={() => redraw([im.key])}>
                다시 만들기
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="step-actions">
        {/* ★ 값이 나가는 자리다(장당 ≈$0.08). 시나리오가 없으면 아예 못 누른다 —
            서버도 막지만, 누르고 나서 400 을 보는 것과 못 누르는 것은 다르다. */}
        <button className="mini" disabled={drawLocked || !scenario?.text} onClick={() => redraw(null)}>
          {busy === "images" || drawingNow ? "그리는 중…" : film.images?.length ? "전부 다시 만들기" : "그림 만들기"}
        </button>
        {film.images?.length > 0 && (
          <div className="fwd">
            <Link className="cta" href={filmStepHref(videoStep, id, mode)}>영상으로 →</Link>
          </div>
        )}
      </div>
    </section>
  );
}
