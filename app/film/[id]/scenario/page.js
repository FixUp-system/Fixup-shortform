"use client";

// 2 시나리오 — **두 방식이 공유하는 하나**다. 그래서 주소에도, 이 화면이 부르는 라우트에도
// 방식이 없다(app/api/film/[id]/scenario/route.js 가 mode 를 아예 안 본다).
// 여기서 다시 쓰면 옆 방식의 영상도 그 시나리오로 구워진다 — 그래야 두 편의 차이를
// "방식 때문"이라고 말할 수 있다.
//
// ★ 잠금 판정은 lib/film/doc.js 의 scenarioLock **하나**다. 화면이 조건을 손으로 다시 적으면
//   서버(같은 함수를 쓴다)와 갈리고, 그 자리는 누르면 항상 400 인 버튼이 된다.
import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useFilmProject } from "../../../../components/FilmProjectContext";
import { FILM_STEPS, filmStepHref } from "../../../../lib/film/steps";
import { scenarioLock } from "../../../../lib/film/doc";
import { FILM_MODES } from "../../../../lib/film/mode";

export default function FilmScenarioPage() {
  const { id } = useParams();
  const { project, setProject } = useFilmProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const scenario = project?.scenario;
  const lock = scenarioLock(project);
  const imagesStep = FILM_STEPS.find((x) => x.key === "images");

  // 시나리오 — 무료(LLM 만 쓴다)다. 방식을 안 보낸다.
  async function makeScenario() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/film/${id}/scenario`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "시나리오를 만들지 못했어요"); setBusy(false); return; }
    // ★ 응답이 곧 최신 문서다 — 레이아웃이 다시 읽기를 기다리지 않는다(스테퍼의 열림
    //   판정도 이 값을 본다).
    setProject(data);
    setBusy(false);
  }

  return (
    <section className="panel panel--wide">
      <h2>시나리오</h2>
      {err && <p className="pgsub warn">{err}</p>}
      {scenario?.text ? (
        <p className="script-src">{scenario.text}</p>
      ) : (
        <p className="pgsub">시나리오를 만들어 주세요 — 무료예요.</p>
      )}
      {lock && <p className="pgsub">{lock.message}</p>}
      <div className="step-actions">
        <button className="mini" disabled={busy || !!lock} onClick={makeScenario}>
          {busy ? "쓰는 중…" : scenario?.text ? "다시 쓰기 · 무료" : "시나리오 만들기 · 무료"}
        </button>
        {/* ★★ 다음 단계부터 방식이 갈린다. 그래서 여기서 고른다 — 조용히 한쪽으로
            떨어뜨리면 사장님이 고른 것과 다른 방식으로 값이 나간다(장당 ≈$0.08). */}
        {scenario?.text && FILM_MODES.map((m) => (
          <Link key={m.id} className="cta" href={filmStepHref(imagesStep, id, m.id)}>
            {m.label}로 그림 →
          </Link>
        ))}
      </div>
    </section>
  );
}
