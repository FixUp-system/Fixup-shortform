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
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useReelProject } from "../layout";
import { REEL_STEPS, reelStepHref } from "../../../../lib/reel/steps";
import { scenarioLock } from "../../../../lib/reel/doc";
import ReelBack from "../../../../components/ReelBack";

export default function ReelScenarioPage() {
  const { id } = useParams();
  // ★ 제목은 **표가 쉠다** — 화면이 손으로 적으면 라벨을 바꿀 때 여기만 낡는다.
  const stepLabel = REEL_STEPS.find((x) => x.key === "scenario")?.label || "";
  const { project, reload } = useReelProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // ★ 사장님이 한국어로 적는 수정 요청. 보낸 뒤에는 비운다 — 반영된 요청이 칸에 남아
  //   있으면 다음에 또 누를 때 같은 요청이 두 번 실린다.
  const [note, setNote] = useState("");

  const scenario = project?.scenario;
  const lock = scenarioLock(project);
  const imagesStep = REEL_STEPS.find((x) => x.key === "images");

  // 시나리오 — 무료(LLM 만 쓴다)다.
  async function makeScenario() {
    setBusy(true); setErr("");
    // ★ 요청이 있을 때만 실는다 — 빈 문자열을 보내도 서버가 걸러 내지만,
    //   여기서 안 실으면 자동 생성(useEffect)의 지문이 예전과 글자 그대로다.
    const res = await fetch(`/api/reel/${id}/scenario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(note.trim() ? { note: note.trim() } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "시나리오를 만들지 못했어요"); setBusy(false); return; }
    // ★ 응답이 전체 문서가 아니다(위 머리말) — 다시 읽어야 최신 project 가 된다.
    await reload(id).catch((e) => setErr(e.message));
    setNote("");
    setBusy(false);
  }

  // ★★ 시나리오가 **처음** 만들어진 직후 이미지를 한 번 만든다(2026-08-25 사장님 결정).
  //
  // ⚠️ 시나리오 자동 생성과 성질이 다르다 — 이미지는 **돈이 나간다**(스토리보드 한 장 $0.401).
  //   그래서 "화면을 열 때마다"가 아니라 **한 번뿐**이다. 되돌아와도 다시 안 돈다.
  // ★ 한 번을 어떻게 보장하나: 문서에 `reel.autoImaged` 를 남긴다. ref 로만 막으면
  //   새로고침 한 번에 그 기억이 사라져 또 나간다(ref 는 브라우저 안에서만 산다).
  // ★ 이미 그림이 있으면 안 만든다 — 사장님이 이미 만들었거나 앞서 자동으로 만든 것이다.
  const autoImageRef = useRef(false);
  useEffect(() => {
    if (autoImageRef.current) return;
    if (!project || busy) return;
    if (!scenario?.text) return;                       // 시나리오가 아직 없다
    if (project?.reel?.autoImaged) return;             // 이미 한 번 돌았다
    if ((project.cuts || []).some((c) => c?.image?.url)) return; // 그림이 이미 있다
    autoImageRef.current = true;
    (async () => {
      // 실패해도 조용히 넘어간다 — ③이미지 생성 화면에 버튼이 있고 거기서 사유가 보인다.
      //   여기서 오류를 띄우면 시나리오를 보러 온 사장님에게 이미지 이야기를 하게 된다.
      await fetch(`/api/reel/${id}/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto: true }),
      }).catch(() => {});
      await reload(id).catch(() => {});
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, scenario?.text, busy]);

  // ★★ **누르지 않아도 만들어진다**(2026-08-25 사장님 지시).
  //   ①입력에서 [시작하기]를 누르면 프로젝트만 만들고 이 화면으로 온다 —
  //   생성은 **여기서** 한다. LLM 이 수십 초 걸리는데 ①에서 기다리게 하면
  //   화면이 멈춘 것처럼 보인다. 여기서는 "쓰는 중…"을 보여 줄 수 있다.
  //
  // 세 가지를 지킨다:
  //   ① **이미 있으면 안 만든다** — 다시 쓰면 이미 값을 치른 그림·클립이 통째로
  //      낡는다(각인이 바뀜다). ②로 되돌아올 때마다 그러면 돈이 생다.
  //   ② **잠겼으면 안 만든다** — scenarioLock 은 클립을 구운 뒤를 막는다.
  //      화면과 서버가 같은 판정을 본다는 이 저장소 규율(파일 머리말).
  //   ③ **두 번 안 부른다** — 개발 모드는 effect 를 두 번 돌린다. ref 로 막는다.
  // ★ 실패하면 그대로 이 화면에 남는다 — 오류와 [다시 쓰기]가 아래에 있다.
  //   그래서 버튼을 지우지 않는다(자동은 첫 방문 한 번이고 버튼이 그 폴백이다).
  const autoRef = useRef(false);
  useEffect(() => {
    if (autoRef.current) return;
    if (!project) return;          // 문서를 아직 못 읽었다
    if (scenario?.text) return;    // ①
    if (lock) return;              // ②
    autoRef.current = true;        // ③
    makeScenario();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, scenario?.text, lock]);

  // ★ 다시 쓰는 버튼은 **한 번만 적는다** — 자리가 둘(프롬프트 칸 안 / 시나리오가 아직
  //   없을 때의 실행줄)이지만 둘은 동시에 안 뜬다. 손으로 두 번 적으면 라벨이 갈린다.
  // ★★ 2026-08-25 — 쓰는 동안 **감추지 않는다.** 옛 코드는 `busy ? null` 로 버튼을 통째로
  //   지웠는데, 자리가 비니 **눌렀는지조차 알 수 없었다** — 사장님이 그래서 "프로덕션에
  //   반영이 안 되는 것 같다"고 했다(실제로는 정상적으로 돌아 컷까지 바뀌어 있었다).
  //   그 자리에 도는 표시와 함께 "쓰는 중…" 을 남긴다. 누를 것이 있는 것처럼 보이지
  //   않게 버튼이 아니라 **글**로 둔다(④프롬프트의 같은 자리와 모양을 맞춘다).
  const rewriteBtn = busy ? (
    <p className="pgsub"><span className="spinner" aria-hidden="true" /> 쓰는 중…</p>
  ) : (
    <button className="mini" disabled={!!lock} onClick={makeScenario}>
      {note.trim() ? "이대로 고치기" : "다시 쓰기"}
    </button>
  );

  return (
    <section className="panel panel--wide">
      <h2>{stepLabel}</h2>
      {err && <p className="pgsub warn">{err}</p>}
      {/* ★ 다시 쓰는 중에도 알린다 — 아래 버튼 자리에만 표시가 있으면, 긴 글을 읽고
          있던 사장님은 그 자리를 안 본다. */}
      {busy && scenario?.text && (
        <p className="pgsub"><span className="spinner" aria-hidden="true" /> 시나리오를 다시 쓰고 있어요 — 다 되면 위 글이 바뀌어요.</p>
      )}
      {scenario?.text ? (
        <p className="script-src">{scenario.text}</p>
      ) : (
        <p className="pgsub">
          {busy ? (
            <><span className="spinner" aria-hidden="true" /> 시나리오를 쓰고 있어요 — 잠시만 기다려 주세요.</>
          ) : "아직 시나리오가 없어요 — 아래에서 다시 쓸 수 있어요."}
        </p>
      )}
      {lock && <p className="pgsub">{lock.message}</p>}

      {/* ★★ 사장님이 **한국어로** 고쳐 달라고 적는 자리(2026-08-25).
          칸을 직접 고치는 것(edits)과 다른 축이다 — "이 문구를 이렇게 바꿔 줘"를
          그대로 적으면 그 말이 지시문에 실린다(lib/ad/scenario.js 의 note 블록).
          ★ 잠겼으면 안 보인다 — 누를 수 없는 칸을 보여 주면 고칠 수 있는 것처럼 읽힌다. */}
      {!lock && scenario?.text && (
        <div className="note-form">
          <textarea
            className="field"
            rows={3}
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
            placeholder="고치고 싶은 것을 적어 주세요 — 예) 따뜻한 한 잔이 기다리는 곳을 따뜻한 한 잔과 함께 기다릴 수 있는 곳으로 고쳐 줘"
          />
          {/* ⚠️ 시나리오를 고치면 컷이 바뀌고, 그러면 그 컷을 근거로 만든 이미지가
              안 맞게 된다. **항상** 말한다 — 그림이 있을 때만 띄우면 그림을 만들기 전에
              고치려는 사람은 이 사실을 모른 채 지나간다. */}
          {/* ★ 안내문과 버튼은 **같은 줄**이다(2026-08-25 사장님 지시).
              줄을 나누면 안내가 본문처럼 읽히고 버튼과 상관없는 말로 보인다. */}
          <div className="note-act">
            <p className="pgsub note-hint">시나리오를 수정하면 이미지를 다시 생성해야 해요.</p>
            {rewriteBtn}
          </div>
        </div>
      )}

      <div className="step-actions">
        <ReelBack step="scenario" id={id} />
        {/* ★ 시나리오가 아직 없을 때만 여기 선다 — 있을 때는 위 프롬프트 칸 안에 있다.
            둘은 동시에 안 뜬다. 지우지 않는 이유는 실패했을 때 다시 누를 유일한 길이라서다. */}
        {!scenario?.text && rewriteBtn}
        {scenario?.text && (
          <div className="fwd">
            <Link className="cta" href={reelStepHref(imagesStep, id)}>그림으로 →</Link>
          </div>
        )}
      </div>
    </section>
  );
}
