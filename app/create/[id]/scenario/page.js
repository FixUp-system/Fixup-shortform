"use client";

// ②시나리오 — 영화 틀을 보고 고친다. 이 파이프라인에서 사람이 멈추는 유일한 자리다.
//
// ★ 시나리오에는 원고가 갖고 있던 자동 장치(되돌리기·채점)가 없다. 품질을 지키는 것은
//   **사장님이 여기서 고치는 것**뿐이다. 그래서 이 화면의 칸은 전부 진짜여야 한다.
// ★ 판정을 화면이 손으로 다시 적지 않는다(checkScenario 한 벌). 두 벌이면 화면은
//   통과라는데 라우트가 400 을 준다.
// ★ 여기 있는 칸 넷은 라우트가 전부 저장한다(tests/scenario-route.test.js 가 박아 둔다).
//   "고칠 수 있는 척하는 칸"을 만들면 사장님은 고쳤다고 믿고 다음 단계에서 돈을 낸다.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import BackButton from "../../../../components/BackButton";
import { checkScenario, scenarioSeconds } from "../../../../lib/scenario-rules";
// 낡음 판정과 다음 단계 주소 — 다시 나누면 산 그림·영상이 사라지므로 반드시 물어본다.
// 다음 주소도 이 표에서 판다: 화면이 주소를 손으로 적으면 말하는 프로젝트(목소리 단계가
// 없는 흐름)를 없어진 단계로 밀어 넣고, 가드가 되돌려 보내는 깜빡임이 남는다.
import { areCutsStale, stepsFor, currentStepKey, stepHref } from "../../../../lib/steps";
import { useDialog } from "../../../../components/DialogProvider";

export default function ScenarioStepPage() {
  const { id } = useParams();
  const router = useRouter();
  const { project, setProject, load } = useProject();
  const { confirm: ask } = useDialog();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const madeFor = useRef(null);

  const scenario = project?.scenario || null;
  const { ok, problems } = scenario ? checkScenario(scenario, project) : { ok: false, problems: [] };
  const total = scenarioSeconds(scenario);
  const target = project?.settings?.target_seconds || 0;

  // 진입하면 한 번 만든다 — ②대본이 원고를 자동 생성하던 것과 같은 모양이다.
  // madeFor 로 한 번만: 안 걸면 저장할 때마다 다시 만들어 사장님이 고친 것이 날아간다.
  useEffect(() => {
    if (!project || scenario || madeFor.current === id) return;
    madeFor.current = id;
    (async () => {
      setBusy(true); setErr("");
      const res = await fetch(`/api/projects/${id}/scenario`, { method: "POST" });
      if (!res.ok) setErr((await res.json().catch(() => ({}))).error || "시나리오를 만들지 못했어요");
      else await load(id).catch(() => {});
      setBusy(false);
    })();
  }, [project?.id, scenario, id]);

  // 고친 것을 문서에 반영한다. 저장(PATCH)은 다음으로 갈 때 한 번에 한다 —
  // 글자마다 저장하면 낙관적 락이 계속 부딪힌다.
  const edit = (next) => setProject((p) => ({ ...p, scenario: { ...p.scenario, ...next } }));
  const editShot = (i, patch) =>
    edit({ shots: scenario.shots.map((s, j) => (i === j ? { ...s, ...patch } : s)) });
  const addShot = () =>
    edit({ shots: [...scenario.shots, { beat: "", line: "", speaker: "", seconds: 0 }] });
  const removeShot = (i) => edit({ shots: scenario.shots.filter((_, j) => j !== i) });
  const moveShot = (i, dir) => {
    const to = i + dir;
    if (to < 0 || to >= scenario.shots.length) return;
    const next = [...scenario.shots];
    [next[i], next[to]] = [next[to], next[i]];
    edit({ shots: next });
  };

  // ★ 라우트의 validateScenario 는 **하는 일이 빈 장면을 버린다**(lib/scenario.js) —
  //   화면 설계가 무엇을 그릴지 모르는 장면이라서다. checkScenario 는 그것을 재지 않으므로,
  //   말해 주지 않으면 사장님이 더한 장면이 저장에서 말없이 사라진다.
  const emptyBeat = (s) => !String(s?.beat || "").trim();

  async function confirmScenario() {
    // ★ 이미 만든 컷이 시나리오와 어긋나면 다시 나눠야 하고, 그때 그 컷에 딸린 그림·클립이
    //   사라진다. 막는 것은 서버(409)가 아니라 여기다 — 서버가 막으면 고쳐도 반영이 안 되고,
    //   안 물어보면 산 것이 말없이 날아간다.
    if (areCutsStale(project)) {
      const go = await ask({
        title: "고친 시나리오로 다시 나눌까요?",
        body: "이미 만든 컷과 거기 딸린 그림·영상이 사라져요.\n쓴 크레딧은 돌아오지 않아요.",
        confirmLabel: "다시 나누기",
      });
      if (!go) return;
    }
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/scenario`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario, confirmed: true }),
    });
    if (!res.ok) {
      setBusy(false);
      setErr((await res.json().catch(() => ({}))).error || "저장하지 못했어요");
      return;
    }
    // ★ 컷 분할을 여기서 시작한다. 옛 ②대본 화면이 하던 일이다(그 화면의 approve).
    //   그 화면이 없어지므로 이 자리가 물려받지 않으면 **컷을 만드는 자리가 저장소에서
    //   사라진다** — 사장님이 ③목소리에서 "분할 실패" 안내를 거쳐 [다시 시도]를 눌러야만
    //   진행되는 흐름이 된다.
    //   409(이미 나눈 컷이 있음)는 정상이다 — 되돌아와 다시 확정한 경우다.
    const split = await fetch(`/api/projects/${id}/cuts`, {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }).catch(() => null);
    if (split && !split.ok && split.status !== 409) {
      setBusy(false);
      setErr((await split.json().catch(() => ({}))).error || "컷을 나누지 못했어요");
      return;
    }
    // 라우트가 응답 전에 status:cuts 를 세워 두므로(app/api/projects/[id]/cuts/route.js)
    // 바로 다음 주소로 가도 가드가 되돌려 보내지 않는다.
    const fresh = await load(id).catch(() => project);
    setBusy(false);
    // 다음 주소는 가드와 **같은 표**에서 판다 — 말하는 프로젝트에는 ③목소리가 없다.
    const next = stepsFor(fresh).find((s) => s.key === currentStepKey(fresh));
    router.push(stepHref(next, id) || `/create/${id}`);
  }

  if (!scenario) {
    return (
      <section className="panel panel--narrow">
        <h2>{err ? "시나리오를 만들지 못했어요" : "시나리오를 짜는 중이에요"}</h2>
        {err && <p className="pgsub warn">{err}</p>}
      </section>
    );
  }

  return (
    <section className="panel panel--narrow">
      <h2>시나리오를 확인해 주세요</h2>
      {err && <p className="pgsub warn">{err}</p>}

      <div className="eyebrow">이 영상을 어떻게 전달하나</div>
      <textarea className="field" value={scenario.angle || ""} rows={2}
        onChange={(e) => edit({ angle: e.target.value })} />

      {/* 합계는 늘 보인다 — 고치는 동안 목표에서 얼마나 벗어났는지가 이 화면의 유일한 눈금이다 */}
      <p className={ok ? "pgsub" : "pgsub warn"}>
        장면 {scenario.shots.length}개 · 초 합계 {total}초{target ? ` / 목표 ${target}초` : ""}
      </p>
      {problems.map((p, i) => <p key={i} className="pgsub warn">{p}</p>)}

      <div className="plan-list">
        {scenario.shots.map((s, i) => (
          <div className="plan-row" key={i}>
            <span className="num">{i + 1}</span>
            <div className="plan-body sc-body">
              <label className="sc-cell">
                <span className="sc-label">이 장면이 하는 일</span>
                <input className="field" value={s.beat || ""}
                  onChange={(e) => editShot(i, { beat: e.target.value })} />
              </label>
              {emptyBeat(s) && (
                <p className="pgsub warn">이 칸이 비어 있으면 이 장면은 저장되지 않아요</p>
              )}
              <label className="sc-cell">
                <span className="sc-label">대사</span>
                <textarea className="field" rows={2} value={s.line || ""}
                  onChange={(e) => editShot(i, { line: e.target.value })} />
              </label>
              <div className="sc-two">
                <label className="sc-cell">
                  <span className="sc-label">말하는 사람</span>
                  <input className="field" value={s.speaker || ""}
                    placeholder="화면 밖 목소리면 내레이션"
                    onChange={(e) => editShot(i, { speaker: e.target.value })} />
                </label>
                <label className="sc-cell sc-secs">
                  <span className="sc-label">초</span>
                  <input className="field" type="number" value={s.seconds ?? 0}
                    onChange={(e) => editShot(i, { seconds: Math.round(Number(e.target.value) || 0) })} />
                </label>
              </div>
              <div className="sc-actions">
                <button className="mini" onClick={() => moveShot(i, -1)} disabled={busy}>↑</button>
                <button className="mini" onClick={() => moveShot(i, 1)} disabled={busy}>↓</button>
                <button className="mini" onClick={() => removeShot(i)} disabled={busy}>삭제</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="mini mt-lg" onClick={addShot} disabled={busy}>장면 추가</button>

      <div className="step-actions">
        <BackButton stepKey="scenario" />
        <div className="fwd">
          <span className="hint">
            확정하면 장면을 컷으로 나누고 컷마다 화면을 설계해요 · 여기서 고치는 것이 마지막 무료 관문이에요
          </span>
          <button className="cta" disabled={busy || !ok} onClick={confirmScenario}>
            확정하고 다음으로 →
          </button>
        </div>
      </div>
    </section>
  );
}
