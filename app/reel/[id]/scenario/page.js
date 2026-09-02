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
import { reelNarration, narrationLimit } from "../../../../lib/reel/narration";
import { speechLangOf } from "../../../../lib/subtitle-langs";
// ★ 실패를 사장님 말로 옮기는 자리는 lib/failure.js 하나다 — 화면이 문구를 손으로 적으면
//   그 화면만 다른 말을 하게 된다(2026-09-02: 504 가 "시나리오를 만들지 못했어요" 로 뭉개졌다).
import { failureFromResponse } from "../../../../lib/failure";

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
  // ★ 판독은 lib/reel/narration.js 하나다 — 화면이 `scenario.narration.text` 를 손으로 읽으면
  //   지시문·자막과 판정이 갈린다(그 파일 머리말). 옛 문서에서는 null 이다.
  const narration = reelNarration(project);
  // 상한은 목표 초에서 나온다(15초 → 82자). 못 재면 0 이고, 그때는 분모를 안 적는다.
  const narrationCap = narrationLimit(
    project?.settings?.target_seconds || project?.settings?.seconds,
    speechLangOf(project)
  );
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
    // ★ 본문이 JSON 이 아닐 수 있다 — 함수가 시간으로 죽으면 Vercel 이 504 에 HTML 을 준다.
    //   그때 빈 객체가 되고, 아래 판정기가 **상태 코드로** 사유를 짓는다.
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(failureFromResponse(res.status, data).message); setBusy(false); return; }
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
  //
  // ★★ 2026-08-27 — 쓰는 동안에는 **이 버튼도 그 옆의 안내문도 안 그린다**(사장님 지시).
  //   그전에는 그 자리에 "쓰는 중…" 을 글로 남겼는데, 그러면 도는 표시가 **두 곳**에
  //   생겼다 — 시나리오 자리와 [이전으로] 옆이다. 사장님 말: "이전으로 옆에는 표시될
  //   필요가 없다 · 다시 쓸 때는 원래 시나리오 자리에 '시나리오를 다시 쓰고 있어요'만
  //   보이면 된다."
  //   ★ 08-25 의 규율("버튼을 감추면 눌렀는지조차 알 수 없다")은 깨지지 않는다 —
  //     그때 진짜 문제는 **아무 표시도 없던 것**이었다. 지금은 시나리오 자리 한 곳이
  //     도는 표시와 함께 무슨 일이 일어나는지 말한다. 말하는 자리가 하나로 모였을 뿐이다.
  //   ★ 지우는 것이 아니다 — busy 가 풀리면 돌아온다(실패했을 때 다시 누를 유일한 길).
  const rewriteBtn = (
    <button className="mini" disabled={!!lock || busy} onClick={makeScenario}>
      {note.trim() ? "이대로 고치기" : "다시 쓰기"}
    </button>
  );

  return (
    <section className="panel panel--wide">
      <h2>{stepLabel}</h2>
      {err && <p className="pgsub warn">{err}</p>}
      {/* ★★ 무슨 일이 일어나는지 말하는 자리는 **여기 하나**다(2026-08-27 사장님 지시).
          다시 쓰는 동안에는 **옛 글을 안 보여 준다** — 곧 사라질 글을 읽고 있으면 바뀐
          줄도 모르고, 그 위아래로 도는 표시가 여럿이면 어디를 봐야 할지 알 수 없다.
          ★ 처음 쓰는 것과 다시 쓰는 것은 다른 말이다 — "다시"를 잘못 붙이면 없는 이력을
            지어내는 것이다(lib/progress.js 의 busyLabel 과 같은 결). */}
      {busy ? (
        <p className="pgsub">
          <span className="spinner" aria-hidden="true" />{" "}
          {/* ★ 꼬리말을 안 붙인다(2026-08-27 사장님 지시) — "다 되면 …" 은 화면을 보면
              아는 일이라 말할수록 길어진다. */}
          {scenario?.text ? "시나리오를 다시 쓰고 있어요" : "시나리오를 쓰고 있어요"}
        </p>
      ) : scenario?.text ? (
        <p className="script-src">{scenario.text}</p>
      ) : (
        <p className="pgsub">아직 시나리오가 없어요 — 아래에서 다시 쓸 수 있어요.</p>
      )}

      {/* ★★ 내레이션 **한 벌**(2026-08-27). 지금까지 말은 위 지시문 안에 장면마다 흩어져
          있어 사장님이 "무슨 말을 하는 영상인가"를 한눈에 볼 수 없었다. 이제 그 말이 한
          덩어리라 여기 그대로 보인다.
          ★ **읽는 글이다** — 고치는 칸을 따로 열지 않는다. 이 화면의 수정 축은 아래 한국어
            칸 하나이고, 한 벌만 직접 고치면 지시문(text)과 갈려 그림까지 어긋난다.
          ★ 글자 수는 **게이트가 재는 값과 같은 함수**로 적는다(narrationLimit) — 두 벌로
            재면 화면이 "넉넉하다"고 말하는데 말이 잘리는 일이 생긴다.
          ★ 옛 문서에는 이 자리가 **아예 안 뜬다**(reelNarration 이 null 이다) — 빈 칸을
            만들면 없는 기능이 있는 것처럼 읽힌다. */}
      {!busy && narration && (
        <div className="narration-one">
          <p className="pgsub">
            내레이션 · {narration.text.length}
            {narrationCap ? `/${narrationCap}` : ""}자
          </p>
          <p className="script-src">{narration.text}</p>
        </div>
      )}
      {lock && <p className="pgsub">{lock.message}</p>}

      {/* ★★ 사장님이 **한국어로** 고쳐 달라고 적는 자리(2026-08-25).
          칸을 직접 고치는 것(edits)과 다른 축이다 — "이 문구를 이렇게 바꿔 줘"를
          그대로 적으면 그 말이 지시문에 실린다(lib/ad/scenario.js 의 note 블록).
          ★ 잠겼으면 안 보인다 — 누를 수 없는 칸을 보여 주면 고칠 수 있는 것처럼 읽힌다. */}
      {/* ★★ 쓰는 동안에도 이 칸은 **그대로 서 있다**(2026-08-27 사장님 지시: "사용자
          입력폼은 유지된 상태에서 상단에 …만 뜨면 될 것 같아"). 칸이 통째로 사라지면
          화면이 접혔다 펴져 어디를 보고 있었는지 잃는다.
          ★ 다만 **안내문은 누르기 전에만** 뜬다(같은 지시) — 이미 누른 뒤에 읽어야 할
            말이 아니다. 도는 표시는 위 시나리오 자리 하나가 맡는다. */}
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
            {!busy && <p className="pgsub note-hint">시나리오를 수정하면 이미지를 다시 생성해야 해요.</p>}
            {rewriteBtn}
          </div>
        </div>
      )}

      <div className="step-actions">
        <ReelBack step="scenario" id={id} />
        {/* ★ 시나리오가 아직 없을 때만 여기 선다 — 있을 때는 위 프롬프트 칸 안에 있다.
            둘은 동시에 안 뜬다. 지우지 않는 이유는 실패했을 때 다시 누를 유일한 길이라서다.
            ★★ 2026-08-27 — 쓰는 동안에는 이 자리를 **비운다**(사장님 지시). 자동 생성 중에
            [이전으로] 옆에 "쓰는 중…"이 서 있었는데, 진행은 위 시나리오 자리가 이미 말한다. */}
        {!scenario?.text && !busy && rewriteBtn}
        {scenario?.text && (
          <div className="fwd">
            {/* ★ 이름은 **가서 무엇이 되는가**로 적는다(2026-08-27 사장님 지시) — 다음 화면에서
                이미지가 만들어진다. 단계 이름("그림")을 빌리면 그 화면이 무엇을 하는
                자리인지는 말하지 않는다. */}
            <Link className="cta" href={reelStepHref(imagesStep, id)}>이미지 생성 →</Link>
          </div>
        )}
      </div>
    </section>
  );
}
