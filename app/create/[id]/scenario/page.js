"use client";

// ②시나리오 — 영화 틀을 보고 고친다. 이 파이프라인에서 사람이 멈추는 유일한 자리다.
//
// ★ 시나리오에는 원고가 갖고 있던 자동 장치(되돌리기·채점)가 없다. 품질을 지키는 것은
//   **사장님이 여기서 고치는 것**뿐이다. 그래서 이 화면의 칸은 전부 진짜여야 한다.
// ★ 판정을 화면이 손으로 다시 적지 않는다(checkScenario 한 벌). 두 벌이면 화면은
//   통과라는데 라우트가 400 을 준다.
// ★ 여기 있는 칸은 라우트가 전부 저장한다(tests/scenario-route.test.js 가 박아 둔다) —
//   장면의 넷(beat·line·speaker·seconds), 그리고 나타났을 때의 narrator_voice.
//   "고칠 수 있는 척하는 칸"을 만들면 사장님은 고쳤다고 믿고 다음 단계에서 돈을 낸다.
// ★ **화면에 칸이 없는 값도 그대로 왕복한다** — PATCH 가 `{ scenario }` 를 통째로 보내므로,
//   angle 처럼 화면에서 걷은 값(2026-08-18)도 문서에 살아 남아 다음 단계 LLM 이 읽는다.
//   즉 "칸을 지우는 것"과 "값을 없애는 것"은 다른 일이다 — 여기서는 앞엣것만 했다.
import { useEffect, useRef, useState } from "react";
import Icon from "../../../../components/Icon";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import BackButton from "../../../../components/BackButton";
import { checkScenario, scenarioSeconds, hasNarration } from "../../../../lib/scenario-rules";
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
  const [saved, setSaved] = useState(false);
  const madeFor = useRef(null);
  // 내레이터 목소리 칸을 열어 둘까. **한 번 열리면 이 화면을 떠날 때까지 닫지 않는다.**
  //   조건이 "값이 비었는가"라서, 안 붙잡으면 사장님이 첫 글자를 치는 순간 칸이 사라져
  //   입력을 이어 갈 수 없다(값이 채워지면 조건이 거짓이 되므로).
  const [voiceOpen, setVoiceOpen] = useState(false);

  const scenario = project?.scenario || null;
  const { ok, problems } = scenario ? checkScenario(scenario, project) : { ok: false, problems: [] };
  const total = scenarioSeconds(scenario);
  const target = project?.settings?.target_seconds || 0;

  // 시나리오를 만든다. 진입할 때 한 번, 그리고 실패했을 때 [다시 시도]가 같은 자리를 부른다.
  async function generate() {
    madeFor.current = id;
    setBusy(true); setErr(""); setSaved(false);
    const res = await fetch(`/api/projects/${id}/scenario`, { method: "POST" });
    if (!res.ok) setErr((await res.json().catch(() => ({}))).error || "시나리오를 만들지 못했어요");
    else await load(id).catch(() => {});
    setBusy(false);
  }

  // 진입하면 한 번 만든다 — ②대본이 원고를 자동 생성하던 것과 같은 모양이다.
  // madeFor 로 한 번만: 안 걸면 저장할 때마다 다시 만들어 사장님이 고친 것이 날아간다.
  useEffect(() => {
    if (!project || scenario || madeFor.current === id) return;
    generate();
  }, [project?.id, scenario, id]);

  // 모델이 내레이터 목소리를 안 채워 왔으면 그때만 칸을 연다 — 그 상태로는 확정이 막히고
  // (lib/scenario-rules.js), 칸이 없으면 사장님이 빠져나올 수단이 없다.
  useEffect(() => {
    if (hasNarration(scenario) && !scenario.narrator_voice) setVoiceOpen(true);
  }, [scenario]);

  // ★ 실패했을 때 빠져나가는 문. madeFor 를 푸는 것이 요점이다 — 자동 생성은 프로젝트당
  //   한 번만 돌기 때문에, 그 각인이 남아 있는 한 화면에는 오류 문구만 있고 다시 만들 길이
  //   없었다(새로고침이 유일한 복구였다, 2026-08-16 최종 리뷰 Important 3).
  //   자동으로 다시 부르지 않고 **사장님이 누를 때만** 부른다 — 유료 호출이다.
  const retry = () => { madeFor.current = null; generate(); };

  // 고친 것을 문서에 반영한다. 저장(PATCH)은 다음으로 갈 때 한 번에 한다 —
  // 글자마다 저장하면 낙관적 락이 계속 부딪힌다.
  const edit = (next) => { setSaved(false); setProject((p) => ({ ...p, scenario: { ...p.scenario, ...next } })); };
  const editShot = (i, patch) =>
    edit({ shots: scenario.shots.map((s, j) => (i === j ? { ...s, ...patch } : s)) });
  const addShot = () =>
    edit({ shots: [...scenario.shots, { beat: "", line: "", speaker: "", seconds: 0 }] });
  const removeShot = (i) => edit({ shots: scenario.shots.filter((_, j) => j !== i) });
  // ★ 끌어 놓기는 "3번을 1번 자리로"다 — **뽑아서 끼운다**(맞바꾸기가 아니다).
  //   맞바꾸면 사이에 있던 장면들이 제자리에 남아, 놓은 자리와 눈에 보이던 자리가 어긋난다.
  const moveTo = (from, to) => {
    if (from === to || to < 0 || to >= scenario.shots.length) return;
    const next = [...scenario.shots];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    edit({ shots: next });
  };
  // 화살표 키로 한 칸 — 끌기는 마우스 전용이라, 버튼이 하던 일을 키가 이어받는다.
  const moveShot = (i, dir) => moveTo(i, i + dir);

  // ★ 라우트의 validateScenario 는 **하는 일이 빈 장면을 버린다**(lib/scenario.js) —
  //   화면 설계가 무엇을 그릴지 모르는 장면이라서다. checkScenario 는 그것을 재지 않으므로,
  //   말해 주지 않으면 사장님이 더한 장면이 저장에서 말없이 사라진다.
  const emptyBeat = (s) => !String(s?.beat || "").trim();
  // 지금 끌고 있는 장면 — 놓을 때 어디서 왔는지 알아야 한다.
  // ★ dataTransfer 에만 담지 않는다: 끄는 동안 어느 카드를 들고 있는지 화면에 비추려면
  //   렌더가 그 값을 봐야 하는데, dataTransfer 는 놓는 순간에만 읽을 수 있다.
  const [dragIdx, setDragIdx] = useState(null);

  // ★ 임시저장 — 확정하지 않고 저장만 한다(라우트의 PATCH 가 원래 그 자리다).
  //
  //   이 화면은 시나리오 단계의 **유일한 품질 관문**인데, 규칙이 어긋난 동안에는 [확정]이
  //   잠겨 있어 저장할 방법이 하나도 없었다 — 한 자리에서 전부 맞추지 못하면 자리를 뜨는
  //   순간 고친 것이 통째로 사라졌다(2026-08-16 최종 리뷰 Important 3).
  //   그래서 이 버튼은 **규칙이 어긋나도 눌린다.** 확정만이 규칙을 강제한다.
  //
  // ⚠️ 저장하면 확정이 풀린다(라우트 계약). 이미 컷을 나눈 프로젝트가 그 때문에 ④·⑤에서
  //    쫓겨나지 않는 것은 lib/steps.js 의 scenarioSettled 가 컷 각인을 함께 보기 때문이다.
  async function saveDraft() {
    setBusy(true); setErr(""); setSaved(false);
    const res = await fetch(`/api/projects/${id}/scenario`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "저장하지 못했어요");
      return;
    }
    setSaved(true);
  }

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
      <section className="panel panel--wide">
        <h2>{err ? "시나리오를 만들지 못했어요" : "시나리오를 짜는 중이에요"}</h2>
        {err && <p className="pgsub warn">{err}</p>}
        {/* ★ 실패한 자리에 문을 둔다 — 없으면 새로고침이 유일한 복구다 */}
        {err && (
          <button className="cta mt-lg" onClick={retry} disabled={busy}>
            다시 시도
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="panel panel--wide">
      <h2>시나리오를 확인해 주세요</h2>
      {err && <p className="pgsub warn">{err}</p>}

      {/* ★ 전달 방식(angle)은 **화면에서 걷었다**(2026-08-18 사용자 지시) — 사장님이 판단할
          것이 아니라 우리가 다음 단계 LLM 에 주는 지시다. 값은 그대로 만들어지고(lib/scenario.js)
          그대로 저장된다(이 화면이 `{ scenario }` 를 통째로 PATCH 한다) — 화면 설계·캐스팅이
          컷을 나눌 때 읽는 경로(lib/cuts.js:487)도 손대지 않았다.
          곁들여 사라진 것: 컷이 이미 있으면 "반영은 다음 컷 분할부터"라고 알리던 안내.
          그 문장은 칸이 있을 때만 필요한 말이었다(2026-08-16 Important 5) — 없는 칸을
          설명하면 거짓말이 된다. (그 문구를 여기 그대로 적지 않는다: 이 저장소의 화면 계약은
          소스 문자열을 훑어 재므로, 주석에 적은 낱말도 "칸이 남아 있다"로 읽힌다.) */}

      {/* ★ 내레이터 목소리도 걷었다. **다만 비어 있을 때는 남긴다** — 그 상태로는 확정이
          막히는데(lib/scenario-rules.js), 칸이 아예 없으면 빠져나올 수단이 없다.
          정상 흐름(모델이 채워 온 경우)에는 화면에 안 나온다.
          이 값은 클립 프롬프트에 실린다 — 고치면 그 컷의 영상이 낡는다
          (lib/cuts.js speechFor · lib/steps.js clipKey). 그래서 "반영은 다음에"가 아니다. */}
      {/* ★ 음악(배경음악)도 **화면에서 걷었다**(2026-08-18 둘째 판, 사용자 지시:
          "사용자한테 입력 받는 게 아닌 모델이 선정하는 걸로"). 아침에 칸을 뒀다가 같은 날
          걷은 이유는 전달 방식·내레이터 목소리와 같다 — 이 값은 사장님이 판단할 것이 아니라
          우리가 영상 모델에 주는 지시다.
          값은 그대로 만들어지고(lib/scenario.js) 그대로 저장되며 전 컷 클립 프롬프트에 같은
          글자로 실린다(lib/cuts.js clipContextClause). 화면에서만 사라진다. */}

      {hasNarration(scenario) && voiceOpen && (
        <>
          <div className="eyebrow">내레이터 목소리</div>
          {/* ★ 자리표시자만 영어다 — 이 칸의 값은 번역 단계 없이 영상 모델에 그대로 실린다
              (lib/cuts.js speechFor 의 `Voice:` 절, lib/scenario.js SYSTEM 의 언어 규칙).
              예시 값이 사장님이 무슨 말로 적을지를 정하는 가장 강한 신호라, 한국어 예시를
              두면 사장님이 한국어로 고치고 그 한국어가 그대로 fal 에 나간다 —
              "고칠 수 있는 척하는 칸"과 같은 종류의 거짓말이다(위 주석). */}
          <input className="field" value={scenario.narrator_voice || ""}
            placeholder="e.g. calm man in his 30s, low and steady tone"
            onChange={(e) => edit({ narrator_voice: e.target.value })} />
          <p className="pgsub">화면 밖에서 읽는 목소리예요 — 비워 두면 컷마다 다른 사람이 읽어요</p>
          {/* 왜 영어냐를 말해 준다 — 이유 없이 영어 예시만 있으면 사장님은 실수로 보고 고친다 */}
          <p className="pgsub">영상 모델이 이 글자를 그대로 읽어요 — <b>영어로</b> 적어 주세요</p>
          {/* ★ angle 칸의 안내와 짝이다 — 다만 방향이 반대다. angle 은 이미 만든 컷에
              **반영이 안 돼서** 말해 주고, 이 칸은 **곧바로 반영돼서** 말해 준다:
              이 값은 클립 프롬프트에 실리므로(lib/cuts.js speechFor) 고치면 그 장면의
              영상이 낡는다(lib/steps.js clipKey). 임시저장은 규칙을 안 물으므로 비워 둔 채로도
              저장된다 — 그때 Voice 절이 통째로 빠져 다시 만들면 컷마다 다른 사람이 읽는다.
              말 안 하면 사장님은 무엇을 잃는지 모른 채 ⑤에서 유료 버튼을 누른다. */}
          {(project?.cuts || []).some((c) => c?.video?.url) && (
            <p className="pgsub warn">고치면 그 장면의 영상을 <b>다시 만들어야 해요</b> — 크레딧이 들어요</p>
          )}
        </>
      )}

      {/* 합계는 늘 보인다 — 고치는 동안 목표에서 얼마나 벗어났는지가 이 화면의 유일한 눈금이다 */}
      <p className={`plan-note ${ok ? "pgsub" : "pgsub warn"}`}>
        장면 {scenario.shots.length}개 · 초 합계 {total}초{target ? ` / 목표 ${target}초` : ""}
      </p>
      {problems.map((p, i) => <p key={i} className="pgsub warn plan-note">{p}</p>)}

      {/* ★ 목록을 조작하는 버튼은 **목록 머리 오른쪽**이다(2026-08-18 셋째 판) —
          광고의 [수정하기]가 서는 자리와 같다. 예전에는 [장면 추가]가 목록 **아래 왼쪽**
          이라, 같은 일을 하는 손이 화면마다 다른 곳으로 갔다.
          `.plan-head` 는 오른쪽 정렬만 빌려 쓰고 구분선·여백은 걷는다(광고와 같은 규칙). */}
      <div className="step-actions plan-head">
        <div className="fwd">
          {/* ★ 기호 하나로(2026-08-18 사장님 지시). 삭제와 짝이 되는 자리라 모양도 짝이어야
              한다 — 한쪽만 글자면 두 버튼이 다른 종류로 보인다.
              라벨을 뺀 자리는 aria-label·title 이 대신한다(components/Icon.jsx 머리말). */}
          <button
            className="mini sc-add"
            onClick={addShot}
            disabled={busy}
            aria-label="장면 추가"
            title="장면을 하나 더해요"
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
      </div>

      <div className="plan-list">
        {scenario.shots.map((s, i) => (
          <div
            className={`plan-row${dragIdx === i ? " dragging" : ""}`}
            key={i}
            draggable={!busy}
            onDragStart={() => setDragIdx(i)}
            onDragEnd={() => setDragIdx(null)}
            // 놓기를 받으려면 기본 동작을 막아야 한다 — 빼면 커서만 바뀌고 아무 데도 못 놓는다
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) moveTo(dragIdx, i); setDragIdx(null); }}
          >
            {/* 번호가 곧 손잡이다 — 끌 수 있다는 것을 따로 그리지 않아도 알 수 있는 자리이고,
                초점을 두고 화살표 키를 누르면 키보드로도 옮긴다(끌기는 마우스 전용이다). */}
            <span
              className="num sc-grip"
              tabIndex={0}
              role="button"
              aria-label={`${i + 1}번 장면 — 끌어서 옮기거나 화살표 키로 옮겨요`}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") { e.preventDefault(); moveShot(i, -1); }
                if (e.key === "ArrowDown") { e.preventDefault(); moveShot(i, 1); }
              }}
            >
              {i + 1}
            </span>
            {/* ★ 장면 안쪽을 **광고 화면과 같은 모양**으로 맞췄다(2026-08-18 사장님 지시).
                광고는 `plan-field` 한 줄에 `<b>라벨</b> 값`, 초는 머리에 배지다. 여기는
                라벨을 값 위에 얹은 폼이라 같은 것을 두 모양으로 보여 주고 있었다.
                ★ 옮긴 것은 **형식뿐이다.** 초 편집·장면 추가·삭제·순서 이동은 그대로다 —
                  광고에는 그 길이 아예 없지만(장면 수를 못 바꾼다), 여기서는 초의 합을
                  목표에 맞추는 것이 **확정의 조건**이라 손댈 수단이 사라지면 안 된다.
                ★ 광고의 "읽기 기본 + [수정하기]" 토글은 안 옮긴다. 그건 형식이 아니라
                  **흐름**이다 — 광고는 받아 보는 화면이고 ②는 고치는 화면이다. */}
            <div className="plan-body sc-body">
              {/* 초 — 광고와 같은 자리(장면 머리)에 배지로. 다만 여기서는 눌러 고친다. */}
              <label className="badge sc-secs">
                <input type="number" value={s.seconds ?? 0} aria-label={`${i + 1}번 장면 길이(초)`}
                  onChange={(e) => editShot(i, { seconds: Math.round(Number(e.target.value) || 0) })} />
                초
              </label>
              {/* ★★ 글자 칸도 광고와 같은 **인라인 편집**이다(2026-08-18 둘째 판, 사장님 지시:
                  "텍스트 인풋도 통일 되었으면"). 앞선 판은 배치만 맞췄는데, 칸이 테두리와
                  배경을 가진 폼(input.field·textarea)이라 광고의 .editable 옆에 놓으면
                  여전히 다른 화면으로 보였다.
                  ★ 값을 children 으로 그대로 되돌려준다 — DOM 글자와 같으면 React 가 손대지
                    않아 커서가 튀지 않는다(④이미지의 지시문 칸과 같은 방식이다). */}
              <div className="plan-field">
                <b>역할</b>
                <span className="editable" contentEditable suppressContentEditableWarning
                  data-empty="이 장면이 하는 일"
                  onInput={(e) => editShot(i, { beat: e.currentTarget.textContent })}>
                  {s.beat || ""}
                </span>
              </div>
              {emptyBeat(s) && (
                <p className="pgsub warn">이 칸이 비어 있으면 이 장면은 저장되지 않아요</p>
              )}
              <div className="plan-field">
                <b>대사</b>
                <span className="editable" contentEditable suppressContentEditableWarning
                  data-empty="이 장면에서 하는 말"
                  onInput={(e) => editShot(i, { line: e.currentTarget.textContent })}>
                  {s.line || ""}
                </span>
              </div>
              {/* ★ 라벨을 "음성"으로(2026-08-18 사장님 지시). 광고에는 이 칸이 없지만 라벨의
                  **길이와 결**은 광고를 따른다 — 거기 라벨은 전부 두 글자다(역할·카메라·
                  조명·음향·동작·대사). "말하는 사람"만 여섯 글자라 라벨 칸을 혼자 넓혔다. */}
              <div className="plan-field">
                <b>음성</b>
                <span className="editable" contentEditable suppressContentEditableWarning
                  data-empty="화면 밖 목소리면 내레이션"
                  onInput={(e) => editShot(i, { speaker: e.currentTarget.textContent })}>
                  {s.speaker || ""}
                </span>
              </div>
              {/* ↑↓ 는 걷었다 — 한 칸씩만 옮겨서, 6번을 맨 위로 보내려면 다섯 번 눌러야 했고
                  누를 때마다 목록이 움직여 눈이 다시 자리를 찾아야 했다. 순서는 끌어서 옮긴다.
                  ★ 삭제는 남는다(순서가 아니라 없애는 일이라 실수로 끌려 사라지면 안 된다).
                    다만 **오른쪽 끝의 작은 아이콘**이다 — 가끔 쓰는 일이라 눈길이 먼저 닿을
                    자리가 아니고, 그렇다고 없앨 수도 없다.
                  ★ 아이콘만 두면 이름 없는 버튼이 된다 — 이 저장소는 아이콘 옆에 늘 글자를
                    두는데(components/Icon.jsx), 라벨을 뺀 자리는 aria-label 이 대신한다. */}
              <div className="sc-actions">
                <button
                  className="mini sc-del"
                  onClick={() => removeShot(i)}
                  disabled={busy}
                  aria-label={`${i + 1}번 장면 삭제`}
                  title="이 장면을 삭제해요"
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="step-actions">
        <BackButton stepKey="scenario" />
        {/* ★ 확정과 나란히 둔다 — 규칙이 어긋나 [확정]이 잠긴 동안에도 이쪽은 눌린다 */}
        <button className="mini" onClick={saveDraft} disabled={busy}>
          {saved ? "저장했어요" : "임시저장"}
        </button>
        <div className="fwd">
          {/* ★ 버튼 왼쪽 안내를 걷었다(2026-08-18 사장님 지시). 두 가지를 한 줄에 담고
              있었는데(다음에 무슨 일이 일어나는가 · 여기가 값 내기 전 마지막 자리다),
              버튼 이름이 이미 "확정하고 다음으로"라 앞엣것은 되풀이였고, 뒤엣것은 여기서
              할 일을 바꾸지 않는 정보였다 — 사장님은 어차피 이 화면을 고치고 나서 누른다.
              ⚠️ 값 내기 전 마지막 관문이라는 **사실**은 그대로다. 그것을 지키는 것은 이
                 문구가 아니라 라우트다(app/api/projects/[id]/scenario/route.js). */}
          <button className="cta" disabled={busy || !ok} onClick={confirmScenario}>
            확정하고 다음으로 →
          </button>
        </div>
      </div>
    </section>
  );
}
