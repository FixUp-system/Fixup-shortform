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
import { prettyPrompt } from "../../../lib/ad/prompt-view";
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
import AdOptionTray from "../../../components/AdOptionTray";
import { MAX_MATERIAL_TEXT } from "../../../lib/material";
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
// ★ attr — 걷는 자리를 가르는 속성 이름이다(장면은 data-field, 전역은 data-global).
//   같은 이름을 쓰면 장면 수집이 전역 칸까지 빨아들인다.
function Field({ editing, name, v, attr = "data-field" }) {
  return (
    <span
      key={editing ? "edit" : "read"}
      className="editable"
      {...{ [attr]: name }}
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
  // ★ setBusyStep — 사이드바가 "지금 이 단계가 돈다"를 읽는 자리다(2026-08-21).
  //   ⚠️ 이걸 빠뜨렸다가 startRender 가 fetch 를 부르기 **전에** ReferenceError 로 죽어
  //     굽기가 시작조차 안 됐다. 화면은 아무 말도 안 했다(콘솔에만 났다).
  const { project, setProject, load, setView, setBusyStep } = useAdProject();
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
  // 전역 값은 editRef 밖에 있다(장면 목록과 다른 덩어리다) — 걷는 자리를 따로 둔다.
  const globalRef = useRef(null);

  // ①입력을 고치는 상태. **저장된 값에서 시작한다** — 그것이 "기존 입력이 유지된 화면"이다.
  // ★ project 가 늦게 오므로(컨텍스트가 불러온다) 도착하면 한 번 채운다. 그 뒤에는
  //   사장님이 고친 값을 덮지 않는다 — 폴링이 project 를 새로 받을 때마다 입력이
  //   되돌아가면 글을 쓸 수가 없다.
  const [draftText, setDraftText] = useState("");
  const [draftOpts, setDraftOpts] = useState(null);
  const [saved, setSaved] = useState(false);
  // 굽기가 몇 분째인가 — 기준은 **문서의 시작 시각**이다(ad_job.startedAt). 화면이
  // 자기 시계로 세면 새로고침할 때마다 0 분으로 되돌아가 "멈춘 것 같다"가 더 심해진다.
  const [elapsed, setElapsed] = useState(null);
  useEffect(() => {
    const startedAt = Number(project?.ad_job?.startedAt) || 0;
    if (project?.status !== "rendering" || !startedAt) { setElapsed(null); return; }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 60000)));
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [project?.status, project?.ad_job?.startedAt]);

  const filledRef = useRef(false);
  useEffect(() => {
    if (filledRef.current || !project?.settings) return;
    filledRef.current = true;
    setDraftText(project.material?.text || "");
    const st = project.settings;
    setDraftOpts({
      format: st.format, mood: st.mood, style: st.style, lang: st.narration_lang,
      aspect: st.aspect_ratio, model: st.model, seconds: st.seconds, resolution: st.resolution,
    });
  }, [project]);

  // 무엇이 바뀌었나 — 안 바뀐 것을 PATCH 로 보내면 라우트가 등급·해상도를 다시 재는데,
  // 등급이 내려간 뒤 옛 문서를 열기만 해도 403 이 날 수 있다(그 라우트 주석 참고).
  const dirty = !!draftOpts && !!project?.settings && (
    draftText !== (project.material?.text || "") ||
    draftOpts.format !== project.settings.format ||
    draftOpts.mood !== project.settings.mood ||
    draftOpts.style !== project.settings.style ||
    draftOpts.lang !== project.settings.narration_lang ||
    draftOpts.aspect !== project.settings.aspect_ratio ||
    draftOpts.model !== project.settings.model ||
    draftOpts.seconds !== project.settings.seconds ||
    draftOpts.resolution !== project.settings.resolution
  );

  // 저장 — PATCH 하나다. 판정(등급·길이·해상도)은 전부 서버가 한다.
  async function saveDraft() {
    if (!dirty) return true;
    // ★ 저장하는 동안에도 ①입력 줄이 깜박여야 한다 — [시나리오 만들기]는 저장 뒤에
    //   시나리오를 부르므로, 이 자리가 비어 있으면 **몇 초 동안 아무 신호가 없다**.
    setBusy(true); setErr(""); setSaved(false); setBusyStep("draft");
    const res = await fetch(`/api/ads/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        material: { text: draftText },
        settings: {
          format: draftOpts.format, mood: draftOpts.mood, style: draftOpts.style,
          narration_lang: draftOpts.lang, aspect_ratio: draftOpts.aspect,
          model: draftOpts.model, seconds: draftOpts.seconds, resolution: draftOpts.resolution,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false); setBusyStep(null);
    if (!res.ok) { setErr(data.error || "저장하지 못했어요"); return false; }
    setProject(data);
    setSaved(true);
    return true;
  }

  // 고친 것이 있으면 **저장하고 나서** 시나리오를 만든다 — 안 그러면 사장님이 방금 고친
  // 값이 아니라 저장된 옛 값으로 시나리오가 쓰인다(고친 것이 조용히 버려진다).
  async function saveThenScenario() {
    if (await saveDraft()) makeScenario();
  }

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
      // ★ 사이드바 깜박임도 여기서 끈다 — 끄는 자리를 한 군데로 모은다(성공·실패·시간
      //   초과가 전부 이 함수를 지난다). 따로 두면 어느 갈래에서 켜진 채로 남는다.
      setBusyStep(null);
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
      // 새로고침으로 들어와도 "굽는 중"이 사이드바에 보여야 한다.
      setBusyStep("rendering");
      startPolling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.status]);

  // 시나리오 만들기·다시 쓰기·고친 대로 다시 쓰기 — **같은 라우트**다. LLM 만 쓰고 무료다.
  //
  // ★ edited(`{ shots, globals }`)를 넘기면 고친 컷과 **영상 전체 값**이 함께 간다.
  // 무엇이 실제로 고쳐졌는지는 서버가 저장된 시나리오와 대조해 판정한다 — 화면은
  // "지금 보이는 값들"을 그대로 보낼 뿐이다(pickEditedShots · pickEditedGlobals).
  // ★ 인자 없이 부르면 [다시 쓰기]다. **onClick 에 직접 묶지 마라** — 클릭 이벤트가
  //   edited 자리로 들어간다(그래서 이 파일의 모든 호출이 `() => makeScenario()` 다).
  async function makeScenario(edited) {
    // ★ 사이드바가 깜박일 수 있게 **어느 단계가 도는지** 올린다(2026-08-21).
    //   시나리오 만들기는 동기 호출이라 status 가 안 바뀐다 — 이 값이 유일한 신호다.
    setBusy(true); setErr(""); setBusyStep("scenario");
    const res = await fetch(`/api/ads/${id}/scenario`, {
      method: "POST",
      ...(edited
        ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ shots: edited.shots, globals: edited.globals }),
          }
        : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "시나리오를 만들지 못했어요"); setBusy(false); setBusyStep(null); return; }
    setProject(data);
    setEditing(false);
    setBusy(false); setBusyStep(null);
  }

  // 고친 대로 다시 쓰기 — 편집 중인 화면에서 값을 걷어 위 함수에 넘긴다.
  //
  // ★ DOM 에서 걷는다(useState 로 매 글자를 붙들지 않는다). contentEditable 을 제어
  // 컴포넌트로 만들면 한 글자마다 리렌더가 돌아 커서가 맨 끝으로 튄다 — 이 저장소가
  // ⑥완성 화면(app/create/[id]/done/page.js)의 자막 손보기에서 이미 같은 방식을 쓴다.
  function rewriteWithEdits() {
    const rows = editRef.current?.querySelectorAll("[data-shot]") || [];
    const shots = Array.from(rows).map((row) => {
      const out = {};
      for (const el of row.querySelectorAll("[data-field]")) {
        out[el.dataset.field] = (el.textContent || "").trim();
      }
      return out;
    });
    // 영상 전체 값도 같은 방식으로 걷는다. **무엇이 실제로 고쳐졌는지는 서버가 판정한다**
    // (lib/ad/scenario.js 의 pickEditedGlobals) — 여기서는 지금 화면의 값을 그대로 보낸다.
    const globals = {};
    for (const el of globalRef.current?.querySelectorAll("[data-global]") || []) {
      globals[el.dataset.global] = (el.textContent || "").trim();
    }
    makeScenario({ shots, globals });
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
    setBusy(true); setErr(""); setBusyStep("rendering"); setPollTimedOut(false);
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
      <h1 className="pgtitle">원클릭 영상</h1>
      {/* 이 영상이 어느 모델로 만들어지는지 — 유료 버튼([이대로 만들기])을 누르기 전에 알아야 한다 */}
      <p className="pgsub">{model.label} 모델 · {model.hint}</p>
      {err && <p className="pgsub warn">{err}</p>}
      {/* 배경에서 굽다 실패한 것 — 위치를 status 마다 가르지 않는다. 사장님이 못 보면 안 된다. */}
      {video_error && <p className="pgsub warn">{video_error}</p>}

      {/* ①입력 — **고칠 수 있는 자리**다(2026-08-21 사장님 지적). 그전에는 "시나리오를
          만들어 주세요" 한 줄뿐이라, 시나리오를 보고 나서 소재나 옵션을 고치려면
          /ads/new 로 가야 했고 거기는 **새 프로젝트를 만드는 자리**라 빈 화면이 떴다.
          ★ 트레이는 첫 화면과 **같은 컴포넌트**다(components/AdOptionTray.jsx) —
            두 벌이면 한쪽이 낡는다.
          ★ 저장은 PATCH 하나다(app/api/ads/[id]/route.js) — 그 라우트가 등급·해상도·
            길이를 이미 다 판정한다. 화면이 다시 판정하지 않는다. */}
      {view === "draft" && (
        <section className="panel panel--wide">
          <h2>무엇을 만들까요</h2>
          <textarea
            className="composer-text"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            rows={6}
            maxLength={MAX_MATERIAL_TEXT}
            placeholder="제품·특징·하고 싶은 이야기를 적어 주세요"
          />
          <AdOptionTray
            value={draftOpts}
            onChange={(patch) => setDraftOpts((v) => ({ ...v, ...patch }))}
            showCredits={showCredits}
            admin={me?.isAdmin === true}
            tier={me?.tier}
          />
          {(project?.material?.photos || []).length > 0 && (
            <p className="pgsub">사진 {project.material.photos.length}장이 붙어 있어요.</p>
          )}
          {saved && <p className="pgsub">저장했어요.</p>}
          <div className="step-actions">
            <button className="mini" disabled={busy || !dirty} onClick={saveDraft}>
              {busy ? "저장 중…" : dirty ? "저장하기" : "바뀐 것 없음"}
            </button>
            <div className="fwd">
              <button className="cta" disabled={busy} onClick={saveThenScenario}>
                {busy ? "쓰는 중…" : "시나리오 만들기 →"} <span className="cr">무료</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {view === "scenario" && (
        <section className="panel panel--wide">
          <h2>시나리오를 확인해 주세요</h2>
          {/* ★ 영상 프롬프트 원문 — 이 글이 **그대로** 영상 모델에 간다(코드가 아무것도
              안 붙인다). 사장님이 읽고 [이대로 만들기]를 누를지 정하는 자리라 읽히게
              끊는다: prettyPrompt 가 단 머리말과 장면 시간 앞에 줄을 넣고,
              `direction-lines`(white-space: pre-line)가 그 줄을 살린다.
              ⚠️ 원문을 바꾸지 않는다 — 공백을 줄바꿈으로 바꿀 뿐이다. */}
          <p className="script-src direction-lines">{prettyPrompt(scenario?.text)}</p>

          {/* 편집 머리 — [수정하기]는 **고칠 수 있는 것 전부보다 위**에 있어야 손이 먼저 닿는다.
              ★ 2026-08-21 — 전역 값(인물·무대…)도 고칠 수 있게 되면서 이 자리가 장면 목록
                앞이 아니라 **전역 값 앞**으로 올라왔다. 그 아래 두 덩어리가 다 편집 대상이다.
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
              고치고 싶은 곳을 눌러 바로 고치세요. <b>인물·무대·옷차림</b> 같은 영상 전체 값도
              고칠 수 있어요 — 고친 것은 그대로 지키고 나머지를 거기에 맞춰 다시 씁니다.
              장면 길이(초)는 전체 길이에 맞춰져 있어 고칠 수 없어요.
            </p>
          )}

          {/* ★★★ **영상 전체에 걸리는 값들** — 보여 주고(2026-08-21), 고칠 수 있게 한다.
              그전에는 지시문(text)과 장면만 그려서, 사장님이 "이 사람이 누구고 어디서
              찍고 무슨 옷을 입나"를 확인할 자리가 없었다 — 정작 그 값들이 굽기 지시문에
              실려 화면을 정하는데도. 시나리오 단계는 **사람이 멈춰 서는 유일한 자리**라
              (lib/ad/steps.js 의 waits) 여기서 못 보면 어디서도 못 본다.

              ★★ 그리고 **고칠 수 있어야 한다.** AI 가 "20대 여성"으로 잡았는데 사장님이
                40대 남성을 원하면, 그전에는 [다시 쓰기]로 통째로 새로 뽑는 수밖에 없었고
                그러면 마음에 들던 장면·대사까지 다 바뀌었다. 영상 한 편이 $2~7 이라
                시나리오에서 맞추는 것이 가장 싼 길이다.

              ★ 읽을 때는 **값이 있는 칸만** 그린다 — 사람이 없는 영상에서 "인물 (빈칸)"이
                뜨면 우리가 빠뜨린 것처럼 보인다.
              ★ 고칠 때는 **일곱 칸을 다 편다** — 비어 있는 칸이야말로 사장님이 채우고 싶은
                자리다(사람을 넣고 싶은데 AI 가 안 넣은 경우).
              ⚠️ 이 목록은 서버(lib/ad/scenario.js 의 EDITABLE_GLOBAL_FIELDS)와 **같아야
                한다**. 화면은 그 파일을 import 할 수 없어(서버 전용) 목록이 두 벌인데,
                tests/ad-scenario-globals.test.js 가 둘을 대조한다. */}
          {(() => {
            const all = [
              ["이야기", "angle"],
            ];
            const rows = editing
              ? all
              : all.filter(([, f]) => typeof scenario?.[f] === "string" && scenario[f].trim());
            if (!rows.length) return null;
            return (
              <div className="plan-list" ref={globalRef}>
                <div className="plan-row">
                  <div className="plan-body">
                    {rows.map(([label, f]) => (
                      <div className="plan-field" key={f}>
                        <b>{label}</b>
                        <Field editing={editing} name={f} v={scenario?.[f]} attr="data-global" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="plan-list" ref={editRef}>
            {(scenario?.shots || []).map((shot, i) => (
              <div className="plan-row" key={i} data-shot={i}>
                <span className="num">{i + 1}</span>
                <div className="plan-body">
                  {/* 초 — 장면 머리에 작게. Number.isFinite 로 감싼다: 이 필드가 없는(연출
                      필드 개편 전에 만든) 옛 시나리오에서는 undefined가 그대로 안 뜨게 한다. */}
                  {Number.isFinite(shot.seconds) && <span className="badge">{shot.seconds}초</span>}
                  {/* ★★ 2026-08-27 — 카메라·조명·음향·동작 칸을 걷었다. 그 값들은 이제
                      **영상 프롬프트(위 script-src)** 안에 있고, 시나리오는 그것을 장면별로
                      옮겨 적은 자막용 목록이다. 없는 값을 빈칸으로 그리면 우리가 빠뜨린
                      것처럼 보인다. */}
                  <div className="plan-field"><b>역할</b><Field editing={editing} name="beat" v={shot.beat} /></div>
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
          {/* ★ 깜박이는 점 + 지난 시간. 그전에는 문장 하나뿐이라 "돌고 있는지 멈췄는지"를
              화면이 말해 주지 않았다(2026-08-21 사장님 지적) — 8분이 걸리는 자리라
              **살아 있다는 신호**가 계속 있어야 한다. 색·모션만으로 말하지 않는다:
              지난 시간이 글자로 함께 올라간다. */}
          <p className="pgsub running-line">
            <span className="running-dot" aria-hidden="true" />
            영상을 만드는 중이에요 — 보통 {adEstimatedMinutes(settings?.seconds)}분쯤 걸려요
            {elapsed !== null && ` · ${elapsed}분째`}
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
            <button className="mini" disabled={busy} onClick={() => makeScenario()}>
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
