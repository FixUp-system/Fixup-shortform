"use client";

// 2 시나리오 — **사람이 멈추는 유일한 자리**다(브리프). reel 은 방식이 하나뿐이라
// film 처럼 이 자리에서 방식을 고르지 않는다 — 다음 단계(③그림)로 바로 간다.
//
// ★ 잠금 판정은 lib/reel/doc.js 의 scenarioLock **하나**다. 화면이 조건을 손으로 다시
//   적으면 서버(같은 함수를 쓴다, app/api/reel/[id]/scenario/route.js)와 갈리고, 그 자리는
//   누르면 항상 400 인 버튼이 된다.
//
// ★ 이 라우트의 POST 응답은 `{scenario, cuts}` 뿐이다(film 과 다르다 — film 은 전체
//   문서를 돌려준다). 그래서 성공한 뒤에는 레이아웃의 reload 를 불러 전체 문서를 다시
//   읽는다 — 응답을 그대로 project 에 끼워 넣으면 material·settings·reel 이 사라진다.
import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useReelProject } from "../layout";
import { REEL_STEPS, reelStepHref } from "../../../../lib/reel/steps";
import { scenarioLock } from "../../../../lib/reel/doc";

export default function ReelScenarioPage() {
  const { id } = useParams();
  const { project, reload } = useReelProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const scenario = project?.scenario;
  const lock = scenarioLock(project);
  const imagesStep = REEL_STEPS.find((x) => x.key === "images");

  // 시나리오 — 무료(LLM 만 쓴다)다.
  async function makeScenario() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/reel/${id}/scenario`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "시나리오를 만들지 못했어요"); setBusy(false); return; }
    // ★ 응답이 전체 문서가 아니다(위 머리말) — 다시 읽어야 최신 project 가 된다.
    await reload(id).catch((e) => setErr(e.message));
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
        {scenario?.text && (
          <div className="fwd">
            <Link className="cta" href={reelStepHref(imagesStep, id)}>그림으로 →</Link>
          </div>
        )}
      </div>
    </section>
  );
}
