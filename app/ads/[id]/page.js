"use client";

// /ads/[id] — 광고 영상 한 방 만들기의 마지막 화면. 페이지 넷이 아니라, doc.status 에 따라
// 한 화면이 넷으로 변한다: draft(시나리오 없음) · scenario(승인 대기) · rendering(굽는 중) · done(완성).
// (docs/superpowers/specs/2026-08-12-ad-video-oneshot-design.md:184)
//
// 이 화면이 유료 버튼([이대로 만들기]·[다시 만들기])을 든다 — 가격은 반드시 lib/pricing.js
// 에서 읽는다. 숫자를 여기 박으면 /ads/new · 이 화면 · 서버가 각자 다른 값을 말하게 된다.
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { priceLabel, adVideoPrice } from "../../../lib/pricing";
// 이 프로젝트가 어느 모델로 만들어지는지 — 사장님이 값을 치르기 전에 알아야 한다.
// adModel 은 모르는/없는 id 도 기본 모델로 안전하게 떨어진다(옛 문서 보호).
import { adModel } from "../../../lib/ad/models";
// 지나온 단계를 다시 볼 수 있는가 — 사이드바와 **같은 판정**을 쓴다(두 벌이면 갈린다).
import { adViewStep } from "../../../lib/ad/steps";
// 큐 대기 상한 — 서버(lib/ad/generate.js)와 같은 계산을 여기서도 부른다(Task 23).
// ★ 숫자를 이 화면에 다시 박지 마라. 두 벌이면 언젠가 갈린다 — 이 저장소가 반복해서
// 겪은 실패 모양이다(가격도 같은 이유로 lib/pricing.js 하나다). lib/ad/timing.js 는
// import 문이 없는 순수 함수라 "use client" 화면이 그대로 불러올 수 있다.
import { adPollTimeoutMs, adEstimatedMinutes } from "../../../lib/ad/timing";
// 사이드바와 공유하는 광고 프로젝트(components/AdProjectContext) — 사이드바의 하위 단계
// 표시가 여기서 읽어들인 값을 그대로 본다. 사이드바가 따로 fetch·폴링하지 않아도 되는 이유.
import { useAdProject } from "../../../components/AdProjectContext";
import { useMe } from "../../../components/MeContext";

// 폴링 주기 — 기존 단계 화면들(app/create/[id]/*/page.js)과 같다. ★ 이건 "화면이 서버
// 상태를 몇 초마다 묻는가"고, fal 큐 폴링 간격(서버 쪽, lib/ad/generate.js 의 4초)과는
// 다른 축이다 — 건드리지 않는다.
const POLL_MS = 2000;
// ⚠️ 예전엔 고정 10분이었다(app/create/[id]/done/page.js 와 맞춘 값). fal 이 큐 API로
// 바뀌며 서버 쪽 상한이 길이에 비례하게 됐고(15초≈13분·30초≈23분, lib/ad/timing.js),
// 화면이 고정 10분에서 먼저 포기하면 서버는 아직 도는데 "오래 걸린다"고 잘못 알린다.
// 그래서 고정값을 버리고 project.settings.seconds 로 매번 계산한다(아래 startPolling).

// 장면의 한 필드 — 볼 때는 글자, 고칠 때는 열린 칸.
//
// ★ contentEditable 을 값(v)으로 다시 그리지 않는다. React 가 편집 중인 노드의 자식을
// 갈아끼우면 커서가 맨 앞으로 튄다 — 그래서 초기 내용만 넣고(children) 이후는 브라우저에
// 맡긴 뒤, 보낼 때 DOM 에서 걷는다(rewriteWithEdits).
// (이 수법을 물려받았던 app/create/[id]/script/page.js 는 2026-08-16 에 사라졌다 —
//  같은 방식을 쓰는 단계별 화면은 지금 ⑥완성의 자막 손보기다.)
// ★ key 를 editing 으로 가른다 — 편집을 껐다 켜면 저장된 값으로 새로 그린다([취소]가
// 실제로 되돌리는 자리다).
function Field({ editing, name, v }) {
  return (
    <span
      key={editing ? "edit" : "read"}
      className="editable"
      data-field={name}
      {...(editing ? { contentEditable: true, suppressContentEditableWarning: true } : {})}
    >
      {v || (editing ? "" : "(없음)")}
    </span>
  );
}

export default function AdDetailPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  // project·setProject·load 는 컨텍스트에서 온다(null = 아직 못 불러왔다) — 사이드바가
  // 같은 값을 읽어 하위 단계를 그린다. 이 화면이 유일한 발신자이고, 사이드바는 수신만 한다.
  const { project, setProject, load, setView } = useAdProject();
  // 크레딧을 끈 동안(내부 QA)에는 값 이야기를 안 한다 — 판정은 서버가 내려 준 gated 하나다.
  const { me } = useMe();
  const showCredits = me?.gated !== false;
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  // 컷 편집 모드 — 켜면 장면 필드가 열리고 유료 버튼이 숨는다.
  const [editing, setEditing] = useState(false);
  const pollRef = useRef(null);
  // 편집한 값을 걷어올 자리(장면 목록). 아래 rewriteWithEdits 주석 참고.
  const editRef = useRef(null);

  // id 가 바뀌면 먼저 비운다 — 안 비우면 방금 전 광고의 상태(사이드바 하위 단계 포함)가
  // 새 광고를 불러오는 동안 잠깐 남는다.
  useEffect(() => {
    setProject(null);
    setLoadErr("");
    load(id).catch((e) => setLoadErr(e.message || "찾을 수 없어요"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => () => { clearInterval(pollRef.current); pollRef.current = null; }, []);

  // 보는 단계를 사이드바에 알린다 — 사이드바는 주소를 스스로 안 읽는다(수신만 한다).
  // 화면을 떠나면 비운다: 안 비우면 다른 화면으로 갔다가 돌아왔을 때 옛 단계가 켜져 있다.
  useEffect(() => {
    setView(adViewStep(searchParams.get("step"), project?.status));
    return () => setView(null);
  }, [searchParams, project?.status, setView]);

  function startPolling() {
    clearInterval(pollRef.current);
    setPollTimedOut(false);
    let failures = 0;
    const startedAt = Date.now();
    // 이 굽기의 길이 — project 는 클로저로 최신값을 본다(호출 시점의 state). 서버가
    // Number(settings.seconds) || 15 로 기본값을 두는 것과 같은 기본값을 쓴다
    // (lib/ad/generate.js) — 갈리면 표시되는 예상 시간과 실제 상한이 서로 다른 길이
    // 기준으로 계산된다.
    const effectiveSeconds = Number(project?.settings?.seconds) || 15;
    const timeoutMs = adPollTimeoutMs(effectiveSeconds);
    const stop = (timedOut) => {
      clearInterval(pollRef.current);
      pollRef.current = null;
      setBusy(false);
      if (timedOut) {
        setPollTimedOut(true);
        setErr("만드는 데 오래 걸리고 있어요 — 새로고침하거나 다시 시도해 주세요");
      }
    };
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > timeoutMs) return stop(true);
      try {
        const res = await fetch(`/api/ads/${id}/status`);
        if (!res.ok) throw new Error();
        failures = 0;
        const st = await res.json();
        // doc 통짜가 아니라 상태·완성본·오류만 온다(app/api/ads/[id]/status/route.js) —
        // 굽기가 fire-and-forget 이라 실패가 여기로만 온다.
        setProject((p) => ({
          ...p,
          status: st.status,
          videos: st.video ? [st.video] : p?.videos || [],
          video_error: st.error || null,
        }));
        if (st.status !== "rendering") stop(false);
      } catch {
        failures += 1;
        if (failures >= 5) stop(true);
      }
    }, POLL_MS);
  }

  // 진입·새로고침 복원 — 굽는 중이었으면 폴링을 잇는다
  useEffect(() => {
    if (project?.status === "rendering" && !pollRef.current && !pollTimedOut) {
      setBusy(true);
      startPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.status]);

  // 시나리오 만들기·다시 쓰기·고친 대로 다시 쓰기 — **같은 라우트**다. LLM 만 쓰고 무료다.
  //
  // ★ edited 를 넘기면 고친 컷이 함께 간다. 무엇이 실제로 고쳐졌는지는 서버가 저장된
  // 시나리오와 대조해 판정한다 — 화면은 "지금 보이는 장면들"을 그대로 보낼 뿐이다.
  async function makeScenario(edited) {
    setBusy(true); setErr("");
    const res = await fetch(`/api/ads/${id}/scenario`, {
      method: "POST",
      ...(edited ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ shots: edited }) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "시나리오를 만들지 못했어요"); setBusy(false); return; }
    setProject(data);
    setEditing(false);
    setBusy(false);
  }

  // 고친 대로 다시 쓰기 — 편집 중인 화면에서 값을 걷어 위 함수에 넘긴다.
  //
  // ★ DOM 에서 걷는다(useState 로 매 글자를 붙들지 않는다). contentEditable 을 제어
  // 컴포넌트로 만들면 한 글자마다 리렌더가 돌아 커서가 맨 끝으로 튄다 — 이 저장소가
  // ⑥완성 화면(app/create/[id]/done/page.js)의 자막 손보기에서 이미 같은 방식을 쓴다.
  function rewriteWithEdits() {
    const rows = editRef.current?.querySelectorAll("[data-shot]") || [];
    const edited = Array.from(rows).map((row) => {
      const out = {};
      for (const el of row.querySelectorAll("[data-field]")) {
        out[el.dataset.field] = (el.textContent || "").trim();
      }
      return out;
    });
    makeScenario(edited);
  }

  // 되돌리기 — 직전 시나리오로. LLM 을 안 부르니 회차도 안 먹는다(서버가 지킨다).
  async function undoScenario() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/ads/${id}/scenario/undo`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "되돌리지 못했어요"); setBusy(false); return; }
    setProject(data);
    setEditing(false);
    setBusy(false);
  }

  // 이대로 만들기·다시 만들기 — 같은 라우트다. ★ 여기서 크레딧이 나간다.
  async function startRender() {
    setBusy(true); setErr(""); setPollTimedOut(false);
    const res = await fetch(`/api/ads/${id}/render`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "시작하지 못했어요");
      setBusy(false);
      return;
    }
    // 굽기는 fire-and-forget 이라 이 202 응답에는 최신 status 가 안 실린다 —
    // 낙관적으로 먼저 옮기고, 폴링이 실제 값(완성 또는 실패)으로 덮는다.
    setProject((p) => ({ ...p, status: "rendering", video_error: null }));
    startPolling();
  }

  if (project === null) {
    if (loadErr) return <p className="pgsub warn">{loadErr}</p>;
    return <p className="pgsub">불러오는 중…</p>;
  }

  const wanted = searchParams.get("step");
  const { status, settings, scenario, videos, video_error } = project;
  const video = videos?.[0] || null;
  // 이 프로젝트가 어느 모델인지 — adModel 은 항상 값을 준다(모르면 기본 모델).
  const model = adModel(settings?.model);
  // 이 프로젝트 길이의 정가 — 숫자는 여기서 만들지 않는다, pricing.js 가 만든다.
  // ★ 모델을 같이 넘긴다 — 안 넘기면 항상 2.0(가장 싼) 값으로 계산돼 2.5 프로젝트에
  // 틀린 가격이 뜬다(app/api/ads/[id]/render/route.js 가 실제 청구에 쓰는 값과 갈린다).
  // ★ 화질(resolution)까지 넘긴다. 안 넘기면 이 화면만 **720p 값**을 말한다 —
  //   실제 청구는 세 인자를 다 넘기므로(app/api/ads/[id]/render/route.js·lib/charges.js)
  //   1080p 를 고른 사장님이 화면에서 본 값보다 더 많이 빠져나간다(2026-08-13 실사용에서 잡힘).
  // ★ 값을 못 구해도 **화면은 살아야 한다**(2026-08-13 실측).
  //
  // 모델 목록에서 사라진 id 를 가진 옛 문서가 있다(2026-08-13 에 "기본/저가" 등급을
  // 걷어냈다). adVideoPrice 는 모르는 모델에 던지는데 — 그게 맞다, 틀린 금액으로 청구하는
  // 것보다 낫다 — 렌더 도중 던지면 React 가 **화면 전체를 버린다.** 실제로 보관함에서
  // 그 프로젝트를 누르면 "Application error" 만 뜨고 시나리오도 완성본도 못 봤다.
  //
  // 값을 못 구하는 것과 화면이 사라지는 것은 전혀 다른 일이다. 여기서 받아 내고,
  // 아래에서 **모른다고 말하고 유료 버튼을 잠근다**(얼마 나갈지 모르는 채로 누르게 하지 않는다).
  // 모델 목록은 앞으로도 바뀐다 — 이 보호는 그때마다 다시 필요하다.
  let price = null;
  try {
    price = priceLabel(adVideoPrice(settings?.seconds, settings?.model, settings?.resolution));
  } catch {
    price = null;
  }

  // 아래 네 갈래(draft·scenario·rendering·done+video) 중 어디에도 안 걸리는 경우 —
  // 모르는 status 이거나(나중에 상태가 하나 늘 수 있다), status 는 "done"인데 videos 가
  // 비어 있는 저장 어긋남이다. 둘 다 지금 파이프라인에서는 안 생기지만, 안 생긴다는 것과
  // 화면이 그 경우를 다룰 수 있다는 것은 다른 얘기다 — 막히면 이 화면에는 비개발자만 있다.
  // ★ **보는 단계**와 **실제 상태**를 가른다(2026-08-13).
  // 주소의 ?step 이 지나온 단계면 그 화면을 그린다 — 시나리오를 다시 보고 싶어도
  // 돌아갈 길이 없었다. 없거나 아직 안 온 단계면 지금 상태를 그대로 따른다.
  //
  // ⚠️ 폴링·자동 진행은 **status** 를 본다(view 가 아니다). 보고 있는 화면이 진행을
  // 멈추거나 되돌리면 안 된다 — 굽는 중에 시나리오를 들춰 봐도 굽기는 계속 돈다.
  // 규칙은 lib/ad/steps.js 에 한 벌만 둔다 — 위 useEffect(사이드바에 알리는 자리)와
  // 여기가 같은 함수를 부른다. 두 벌이면 화면과 사이드바가 서로 다른 단계를 가리킨다.
  const view = adViewStep(wanted, status);

  const handled =
    view === "draft" ||
    view === "scenario" ||
    view === "rendering" ||
    (view === "done" && !!video);

  return (
    <>
      <h1 className="pgtitle">광고 영상</h1>
      {/* 이 영상이 어느 모델로 만들어지는지 — 유료 버튼([이대로 만들기])을 누르기 전에 알아야 한다 */}
      <p className="pgsub">{model.label} 모델 · {model.hint}</p>
      {err && <p className="pgsub warn">{err}</p>}
      {/* 배경에서 굽다 실패한 것 — 위치를 status 마다 가르지 않는다. 사장님이 못 보면 안 된다. */}
      {video_error && <p className="pgsub warn">{video_error}</p>}

      {view === "draft" && (
        <section className="panel panel--wide">
          <p className="pgsub">시나리오를 만들어 주세요 — 무료예요. 마음에 안 들면 몇 번이든 다시 쓸 수 있어요.</p>
          <button className="cta" disabled={busy} onClick={makeScenario}>
            {busy ? "쓰는 중…" : "시나리오 만들기 →"} <span className="cr">무료</span>
          </button>
        </section>
      )}

      {view === "scenario" && (
        <section className="panel panel--wide">
          <h2>시나리오를 확인해 주세요</h2>
          <p className="script-src">{scenario?.text}</p>

          {/* 장면 목록의 머리 — [수정하기]가 1번 장면보다 **위**에 있어야 손이 먼저 닿는다.
              편집 중에는 [취소]로 바뀐다(같은 자리에서 켜고 끈다). */}
          {/* ★ 편집은 **실제 상태(status)** 로 잠근다. view 로 판정하면 완성본을
              ?step=scenario 로 열었을 때 [수정하기]가 그대로 떠서, 고치는 순간 status 가
              scenario 로 되돌아간다 — "done 에서는 숨긴다"가 주소 한 줄로 뚫린다.
              (실제 화면에서 잡았다. 보는 단계와 실제 상태를 가른 이 화면의 규칙 그대로다.) */}
          <div className="step-actions plan-head">
            {/* .fwd 가 margin-left:auto 라 오른쪽 끝에 붙는다 — 이 화면의 다른 실행
                버튼들과 같은 자리다. 새 CSS 규약을 만들지 않는다. */}
            <div className="fwd">
              {status === "scenario" &&
                (editing ? (
                  <button className="mini" disabled={busy} onClick={() => setEditing(false)}>
                    취소
                  </button>
                ) : (
                  <button className="mini" disabled={busy} onClick={() => setEditing(true)}>
                    수정하기
                  </button>
                ))}
            </div>
          </div>
          {editing && (
            <p className="pgsub">
              고치고 싶은 곳을 눌러 바로 고치세요 — 고친 장면은 그대로 지키고 나머지는 다시 씁니다.
              장면 길이(초)는 전체 길이에 맞춰져 있어 고칠 수 없어요.
            </p>
          )}

          <div className="plan-list" ref={editRef}>
            {(scenario?.shots || []).map((shot, i) => (
              <div className="plan-row" key={i} data-shot={i}>
                <span className="num">{i + 1}</span>
                <div className="plan-body">
                  {/* 초 — 장면 머리에 작게. Number.isFinite 로 감싼다: 이 필드가 없는(연출
                      필드 개편 전에 만든) 옛 시나리오에서는 undefined가 그대로 안 뜨게 한다. */}
                  {Number.isFinite(shot.seconds) && <span className="badge">{shot.seconds}초</span>}
                  <div className="plan-field"><b>역할</b><Field editing={editing} name="beat" v={shot.beat} /></div>
                  <div className="plan-field"><b>카메라</b><Field editing={editing} name="camera" v={shot.camera} /></div>
                  {/* 조명·음향 — CF 연출·촬영 감독 SYSTEM(be1cc9c)이 새로 낸다. 컨트롤러 판단:
                      전부 보여주되 한 줄씩 작게(나중에 줄이는 게 늘리는 것보다 쉽다). 옛
                      시나리오엔 없을 수 있어 있을 때만 그린다.
                      ★ 편집 중에는 비어 있어도 그린다 — 안 그러면 옛 시나리오에서 그 줄을
                      **채워 넣을 길이 없다**(고칠 수는 있는데 만들 수는 없는 상태가 된다). */}
                  {(editing || shot.lighting) && (
                    <div className="plan-field"><b>조명</b><Field editing={editing} name="lighting" v={shot.lighting} /></div>
                  )}
                  {(editing || shot.sound) && (
                    <div className="plan-field"><b>음향</b><Field editing={editing} name="sound" v={shot.sound} /></div>
                  )}
                  <div className="plan-field"><b>동작</b><Field editing={editing} name="action" v={shot.action} /></div>
                  {(editing || shot.line) && (
                    <div className="plan-field"><b>대사</b><Field editing={editing} name="line" v={shot.line} /></div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="step-actions">
            {/* 다시 쓰기 — 싼 문. LLM 만 쓰고 무료다(위 도입 문구와 같은 값).
                ★ onClick={makeScenario} 로 바로 묶지 않는다 — 그러면 클릭 이벤트가
                첫 인자로 들어가 "고친 컷"으로 오해된다(포인트프리 함정, 이 저장소가
                filter 에서 이미 밟았다). */}
            {/* ★ 편집 중에는 안 그린다. 편집 중에도 그렸더니 "고친 대로 다시 쓰기" 문구의
                버튼이 둘이 됐는데, **이쪽은 편집분을 안 싣는다** — 사장님이 공들여 고친
                것이 말없이 사라지는 문이었다(실제 화면에서 잡았다. 소스 훑기도 빌드도
                문법이 멀쩡해서 못 잡는 자리다). 편집을 그만두는 길은 위 [취소]다. */}
            {!editing && (
              <button className="mini" disabled={busy} onClick={() => makeScenario()}>
                {busy ? "쓰는 중…" : "다시 쓰기 · 무료"}
              </button>
            )}
            {/* 되돌리기 — 직전 것이 있을 때만. 없는 길을 띄우면 눌러 보고서야 없는 줄 안다 */}
            {scenario?.prev && !editing && (
              <button className="mini" disabled={busy} onClick={undoScenario}>
                되돌리기
              </button>
            )}
            {editing && (
              <div className="fwd">
                <span className="hint">고친 장면은 그대로 지키고 나머지를 다시 씁니다 — 무료예요</span>
                <button className="cta" disabled={busy} onClick={rewriteWithEdits}>
                  {busy ? "쓰는 중…" : "고친 대로 다시 쓰기 →"} <span className="cr">무료</span>
                </button>
              </div>
            )}
            {/* ★ 편집 중에는 유료 버튼을 아예 안 그린다. 고치는 중에 값이 나가는 문이
                열려 있으면, 아직 반영도 안 된 화면을 보고 [이대로 만들기]를 누른다. */}
            {!editing && (
              <div className="fwd">
                {/* 값을 못 구했으면 그렇게 말한다 — 숫자를 지어내지 않는다(위 price 주석 참고) */}
                <span className="hint">
                  {price === null
                    ? "이 영상의 가격을 알 수 없어요 — 지금은 만들 수 없습니다"
                    : showCredits
                      ? "이대로 만들면 크레딧이 나가요 — 되돌릴 수 없어요"
                      : "이대로 만들면 되돌릴 수 없어요"}
                </span>
                {/* 이대로 만들기 — 비싼 문. .cta .cr 이 버튼 안에서 값을 강조한다(app/ads/new/page.js 와 같은 자리).
                    ★ 정가를 모르면 잠근다 — 얼마 나갈지 모르는 채로 누르게 하지 않는다. */}
                <button className="cta" disabled={busy || price === null} onClick={startRender}>
                  {busy ? "시작하는 중…" : "이대로 만들기 →"}{showCredits && <span className="cr">{price}</span>}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {view === "rendering" && (
        <section className="panel panel--wide">
          {/* 짐작할 수 있는 말이 없으면 사장님은 고장난 줄 안다(15초짜리도 8분 가까이
              걸린다, 실측 근거는 lib/ad/timing.js). 상한(분 단위 십몇 분)이 아니라
              "보통 이 정도"인 추정치를 보여준다 — 상한을 그대로 보여주면 실제보다
              훨씬 길어 보인다. */}
          <p className="pgsub">
            영상을 만드는 중이에요 — 길이에 따라 다르지만 보통 {adEstimatedMinutes(settings?.seconds)}분쯤 걸려요…
          </p>
        </section>
      )}

      {view === "done" && video && (
        <section className="panel panel--narrow">
          <h2>완성했어요 <span className="badge vlm">완성</span></h2>
          <div className="preview-pane done-preview">
            <div className="preview-frame">
              <video className="preview-video" controls src={video.url} />
            </div>
          </div>
          {/* --result — 결과를 받는 줄이다(⑥완성과 같은 이름·같은 치수) */}
          <div className="step-actions step-actions--result">
            <div className="fwd">
              {/* ★★ 여기 있던 유료 재생성 버튼을 걷었다(2026-08-18 사장님 지시). 완성 화면은
                  결과를 **확인하는 자리**인데, 그 버튼은 누르는 순간 정가가 통째로 다시 나가는
                  문이었고 손이 가장 먼저 닿는 자리에 있었다. 보관함에서 "이어서 작업하기"로
                  들어온 사장님이 원하는 것은 대개 **고치는 것**이고, 고치는 자리는 시나리오다.
                  ★ 유료로 새로 만드는 길이 사라지는 것은 아니다 — 시나리오 화면에 그 문이
                    그대로 있고, 고친 뒤에 만들면 그때 값을 낸다. 즉 **값을 내기 전에 무엇을
                    바꿀지 정하는 순서**가 된다.
                  ⚠️ 이 주석에 그 버튼의 옛 문구를 그대로 적지 않는다 — 이 저장소의 화면
                     계약은 소스 문자열을 훑어 재므로 주석 속 낱말도 "버튼이 남아 있다"로 읽는다. */}
              <Link className="mini" href={`/ads/${id}?step=scenario`}>
                이전 단계로 돌아가기
              </Link>
              {/* ?dl=1 — ⑥완성과 같은 이유(서명 URL 302 뒤에는 그 속성이 안 먹는다) */}
              <a className="cta" href={`${video.url}?dl=1`} download>
                내려받기
              </a>
            </div>
          </div>
        </section>
      )}

      {/* 기본 갈래 — 위 넷 중 어디에도 안 걸렸을 때. 화면이 비면 안 되고, 누를 것이 하나는
          있어야 한다(리뷰 지적). 시나리오가 있으면 다시 쓰게, 없으면 새로 쓰게 하고,
          그것도 못 미더우면 최소한 보관함으로는 나갈 수 있게 한다. */}
      {!handled && (
        <section className="panel panel--wide">
          <p className="pgsub warn">
            지금 상태({status || "알 수 없음"})를 이 화면이 몰라요 — 그래도 나갈 길은 있어요.
          </p>
          <div className="step-actions">
            <button className="mini" disabled={busy} onClick={makeScenario}>
              {busy ? "쓰는 중…" : scenario?.text ? "다시 쓰기 · 무료" : "시나리오 만들기 · 무료"}
            </button>
            <div className="fwd">
              <Link href="/archive" className="cta">보관함으로</Link>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
