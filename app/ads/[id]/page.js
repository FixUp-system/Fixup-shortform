"use client";

// /ads/[id] — 광고 영상 한 방 만들기의 마지막 화면. 페이지 넷이 아니라, doc.status 에 따라
// 한 화면이 넷으로 변한다: draft(시나리오 없음) · scenario(승인 대기) · rendering(굽는 중) · done(완성).
// (docs/superpowers/specs/2026-08-12-ad-video-oneshot-design.md:184)
//
// 이 화면이 유료 버튼([이대로 만들기]·[다시 만들기])을 든다 — 가격은 반드시 lib/pricing.js
// 에서 읽는다. 숫자를 여기 박으면 /ads/new · 이 화면 · 서버가 각자 다른 값을 말하게 된다.
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { priceLabel, adVideoPrice } from "../../../lib/pricing";
// 이 프로젝트가 어느 모델로 만들어지는지 — 사장님이 값을 치르기 전에 알아야 한다.
// adModel 은 모르는/없는 id 도 기본 모델로 안전하게 떨어진다(옛 문서 보호).
import { adModel } from "../../../lib/ad/models";
// 큐 대기 상한 — 서버(lib/ad/generate.js)와 같은 계산을 여기서도 부른다(Task 23).
// ★ 숫자를 이 화면에 다시 박지 마라. 두 벌이면 언젠가 갈린다 — 이 저장소가 반복해서
// 겪은 실패 모양이다(가격도 같은 이유로 lib/pricing.js 하나다). lib/ad/timing.js 는
// import 문이 없는 순수 함수라 "use client" 화면이 그대로 불러올 수 있다.
import { adPollTimeoutMs, adEstimatedMinutes } from "../../../lib/ad/timing";
// 사이드바와 공유하는 광고 프로젝트(components/AdProjectContext) — 사이드바의 하위 단계
// 표시가 여기서 읽어들인 값을 그대로 본다. 사이드바가 따로 fetch·폴링하지 않아도 되는 이유.
import { useAdProject } from "../../../components/AdProjectContext";

// 폴링 주기 — 기존 단계 화면들(app/create/[id]/*/page.js)과 같다. ★ 이건 "화면이 서버
// 상태를 몇 초마다 묻는가"고, fal 큐 폴링 간격(서버 쪽, lib/ad/generate.js 의 4초)과는
// 다른 축이다 — 건드리지 않는다.
const POLL_MS = 2000;
// ⚠️ 예전엔 고정 10분이었다(app/create/[id]/done/page.js 와 맞춘 값). fal 이 큐 API로
// 바뀌며 서버 쪽 상한이 길이에 비례하게 됐고(15초≈13분·30초≈23분, lib/ad/timing.js),
// 화면이 고정 10분에서 먼저 포기하면 서버는 아직 도는데 "오래 걸린다"고 잘못 알린다.
// 그래서 고정값을 버리고 project.settings.seconds 로 매번 계산한다(아래 startPolling).

export default function AdDetailPage() {
  const { id } = useParams();
  // project·setProject·load 는 컨텍스트에서 온다(null = 아직 못 불러왔다) — 사이드바가
  // 같은 값을 읽어 하위 단계를 그린다. 이 화면이 유일한 발신자이고, 사이드바는 수신만 한다.
  const { project, setProject, load } = useAdProject();
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const pollRef = useRef(null);

  // id 가 바뀌면 먼저 비운다 — 안 비우면 방금 전 광고의 상태(사이드바 하위 단계 포함)가
  // 새 광고를 불러오는 동안 잠깐 남는다.
  useEffect(() => {
    setProject(null);
    setLoadErr("");
    load(id).catch((e) => setLoadErr(e.message || "찾을 수 없어요"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => () => { clearInterval(pollRef.current); pollRef.current = null; }, []);

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

  // 시나리오 만들기·다시 쓰기 — 같은 라우트다. LLM 만 쓰고 무료다.
  async function makeScenario() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/ads/${id}/scenario`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "시나리오를 만들지 못했어요"); setBusy(false); return; }
    setProject(data);
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

  const { status, settings, scenario, videos, video_error } = project;
  const video = videos?.[0] || null;
  // 이 프로젝트가 어느 모델인지 — adModel 은 항상 값을 준다(모르면 기본 모델).
  const model = adModel(settings?.model);
  // 이 프로젝트 길이의 정가 — 숫자는 여기서 만들지 않는다, pricing.js 가 만든다.
  // ★ 모델을 같이 넘긴다 — 안 넘기면 항상 2.0(가장 싼) 값으로 계산돼 2.5 프로젝트에
  // 틀린 가격이 뜬다(app/api/ads/[id]/render/route.js 가 실제 청구에 쓰는 값과 갈린다).
  const price = priceLabel(adVideoPrice(settings?.seconds, settings?.model));

  // 아래 네 갈래(draft·scenario·rendering·done+video) 중 어디에도 안 걸리는 경우 —
  // 모르는 status 이거나(나중에 상태가 하나 늘 수 있다), status 는 "done"인데 videos 가
  // 비어 있는 저장 어긋남이다. 둘 다 지금 파이프라인에서는 안 생기지만, 안 생긴다는 것과
  // 화면이 그 경우를 다룰 수 있다는 것은 다른 얘기다 — 막히면 이 화면에는 비개발자만 있다.
  const handled =
    status === "draft" ||
    status === "scenario" ||
    status === "rendering" ||
    (status === "done" && !!video);

  return (
    <>
      <h1 className="pgtitle">광고 영상</h1>
      {/* 이 영상이 어느 모델로 만들어지는지 — 유료 버튼([이대로 만들기])을 누르기 전에 알아야 한다 */}
      <p className="pgsub">{model.label} 모델 · {model.hint}</p>
      {err && <p className="pgsub warn">{err}</p>}
      {/* 배경에서 굽다 실패한 것 — 위치를 status 마다 가르지 않는다. 사장님이 못 보면 안 된다. */}
      {video_error && <p className="pgsub warn">{video_error}</p>}

      {status === "draft" && (
        <section className="panel panel--wide">
          <p className="pgsub">시나리오를 만들어 주세요 — 무료예요. 마음에 안 들면 몇 번이든 다시 쓸 수 있어요.</p>
          <button className="cta" disabled={busy} onClick={makeScenario}>
            {busy ? "쓰는 중…" : "시나리오 만들기 →"} <span className="cr">무료</span>
          </button>
        </section>
      )}

      {status === "scenario" && (
        <section className="panel panel--wide">
          <h2>시나리오를 확인해 주세요</h2>
          <p className="script-src">{scenario?.text}</p>

          <div className="plan-list">
            {(scenario?.shots || []).map((shot, i) => (
              <div className="plan-row" key={i}>
                <span className="num">{i + 1}</span>
                <div className="plan-body">
                  {/* 초 — 장면 머리에 작게. Number.isFinite 로 감싼다: 이 필드가 없는(연출
                      필드 개편 전에 만든) 옛 시나리오에서는 undefined가 그대로 안 뜨게 한다. */}
                  {Number.isFinite(shot.seconds) && <span className="badge">{shot.seconds}초</span>}
                  <div className="plan-field"><b>비트</b><span className="editable">{shot.beat || "(없음)"}</span></div>
                  <div className="plan-field"><b>카메라</b><span className="editable">{shot.camera || "(없음)"}</span></div>
                  {/* 조명·음향 — CF 연출·촬영 감독 SYSTEM(be1cc9c)이 새로 낸다. 컨트롤러 판단:
                      전부 보여주되 한 줄씩 작게(나중에 줄이는 게 늘리는 것보다 쉽다). 옛
                      시나리오엔 없을 수 있어 있을 때만 그린다. */}
                  {shot.lighting && <p className="script-src">조명 · {shot.lighting}</p>}
                  {shot.sound && <p className="script-src">음향 · {shot.sound}</p>}
                  <div className="plan-field"><b>동작</b><span className="editable">{shot.action || "(없음)"}</span></div>
                  {shot.line && (
                    <div className="plan-field"><b>대사</b><span className="editable">{shot.line}</span></div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="step-actions">
            {/* 다시 쓰기 — 싼 문. LLM 만 쓰고 무료다(위 도입 문구와 같은 값). */}
            <button className="mini" disabled={busy} onClick={makeScenario}>
              {busy ? "쓰는 중…" : "다시 쓰기 · 무료"}
            </button>
            <div className="fwd">
              <span className="hint">이대로 만들면 크레딧이 나가요 — 되돌릴 수 없어요</span>
              {/* 이대로 만들기 — 비싼 문. .cta .cr 이 버튼 안에서 값을 강조한다(app/ads/new/page.js 와 같은 자리). */}
              <button className="cta" disabled={busy} onClick={startRender}>
                {busy ? "시작하는 중…" : "이대로 만들기 →"} <span className="cr">{price}</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {status === "rendering" && (
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

      {status === "done" && video && (
        <section className="panel panel--narrow">
          <h2>완성했어요 <span className="badge vlm">완성</span></h2>
          <div className="preview-pane done-preview">
            <div className="preview-frame">
              <video className="preview-video" controls src={video.url} />
            </div>
          </div>
          <div className="step-actions">
            <div className="fwd">
              {/* 다시 만들기 — 이것도 같은 유료 라우트다. 정가가 또 나간다는 것을 문구로 밝힌다. */}
              <button className="mini" disabled={busy} onClick={startRender}>
                {busy ? "만드는 중…" : `다시 만들기 · ${price}`}
              </button>
              <a className="cta" href={video.url} download>
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
