"use client";

// /film/[id]/[mode]/video — 4 영상. **여기서 크레딧이 나간다.**
//
// ★ 옛 한 화면(app/film/one/[mode]/page.js)의 굽기 <section> 과 live·stopRef·
//   beginPolling·startRender 를 그대로 옮겨 담았다.
//
// ★ 폴링 루프는 lib/poll.js 한 벌이다 — 화면에서 setInterval 을 직접 돌리지 않는다
//   (복붙한 루프들이 조금씩 다르게 틀렸다: lib/poll.js 머리말).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFilmProject } from "../../../../../components/FilmProjectContext";
import { filmMode } from "../../../../../lib/film/mode";
import { filmOf } from "../../../../../lib/film/doc";
import { filmGates } from "../../../../../lib/film/gates";
import { startPolling } from "../../../../../lib/poll";
import { FILM_STEPS, filmStepHref } from "../../../../../lib/film/steps";

export default function FilmVideoPage() {
  const { id, mode } = useParams();
  const { project, reload } = useFilmProject();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  // 상태 라우트가 준 마지막 응답의 **이 방식** 한 칸. 문서(GET /api/film/[id])에는 없는
  // canDraw·triesLeft 가 여기에만 실려 온다 — 그 둘이 막다른 길을 걷어내는 열쇠다.
  const [live, setLive] = useState(null);
  const stopRef = useRef(null);

  // ★★ 방식을 건너가면(같은 프로젝트, 다른 mode) 이 컴포넌트는 **마운트된 채로 남는다.**
  //   그래서 값을 비우는 것만으로는 부족하다 — 돌던 폴링의 onTick 은 **옛 mode 를 클로저에
  //   가두고** 있어서, 비워 놓아도 다음 회차가 옆 방식의 status·images·video 로 다시 채운다.
  //   실제로 order 가 굽는 중에 건너가면 refs 칸에 order 의 영상이 떴다 — 두 편을 나란히
  //   재는 것이 이 기능의 전부인데 그 판정이 오염된다. 게다가 아래 복원 effect 는 손잡이가
  //   차 있어서(!stopRef.current) 새 방식용 폴링을 **시작하지도 못한다.**
  //   그래서 **떼고** 비운다. 그러면 복원 effect 가 새 mode 로 다시 붙는다(id 도 같다).
  useEffect(() => {
    stopRef.current?.();
    stopRef.current = null;
    setLive(null);
  }, [mode, id]);

  // 떠날 때는 반드시 뗀다 — 안 떼면 화면을 나가도 서버를 계속 두드린다.
  useEffect(() => () => { stopRef.current?.(); stopRef.current = null; }, []);

  // ★ 상태 라우트를 두드린다. 굽기는 큐를 타서 몇 분이 걸리고(출력 1초당 ≈33.5초),
  //   그동안 화면이 안 바뀌면 사장님은 굳은 줄 알고 다시 누른다 — 그것이 이중 청구다.
  //   이 라우트는 두드릴 때마다 **수거까지** 한다(서버리스에는 응답 뒤에 도는 자리가 없다).
  function beginPolling() {
    stopRef.current?.();
    stopRef.current = startPolling({
      url: `/api/film/${id}/status`,
      // ★ 기본값(5분)을 그대로 받지 않는다 — 15초짜리도 큐에서 십몇 분이 걸린다.
      //   대신 아래 onTick 이 **끝나면 스스로 멈춘다**(무한정 두드리지 않는다).
      timeoutMs: Infinity,
      onTick: (st) => {
        const f = st?.films?.[mode] || null;
        setLive(f);
        // ★ 판정은 화면과 **같은 함수**다 — 만료된 "drawing" 은 drawingNow 가 false 라,
        //   눌러앉은 상태로 영원히 두드리지 않는다.
        const g = filmGates(f);
        return !(g.rendering || g.drawingNow);
      },
      onStop: ({ timedOut }) => {
        // ★ 반드시 비운다. startPolling 이 돌려주는 것은 "떼기"라 스스로 끝난 폴링에서는
        //   안 불리고, 안 비우면 손잡이가 영원히 truthy 라 아래 복원이 다시 안 붙는다.
        stopRef.current = null;
        if (timedOut) setErr("상태 확인이 오래 걸리고 있어요 — 새로고침해 주세요");
      },
    });
  }

  // 굽기 — **여기서 크레딧이 나간다.** 서버도 rendering 이면 거절하지만(이중 청구 방지),
  // 화면이 먼저 잠그는 이유는 사장님이 400 을 보기 전에 못 누르게 하는 것이다.
  async function startRender() {
    setBusy("render"); setErr("");
    const res = await fetch(`/api/film/${id}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "굽지 못했어요");
    await reload(id).catch((e) => setErr(e.message));
    setLive(null);
    setBusy("");
    // 접수는 202 다(굽기는 큐를 탄다) — 여기서 바로 두드리기 시작한다.
    // ★ 접수된 때만 부른다. 402(잔액)·400·409 에도 부르면, 굽는 것이 없는데도 수거까지
    //   하는 GET 을 한 번 헛되이 두드린다.
    if (res.ok) beginPolling();
  }

  // ★ 상태 라우트가 준 값이 있으면 그것이 최신이다(문서보다 앞선다 — 수거까지 마친 값이다).
  const film = live || filmOf(project, mode);
  const here = filmMode(mode);
  const { rendering, drawingNow, locked } = filmGates(film, !!busy);

  // 진입·새로고침 복원 — 굽는 중이거나 그리는 중이면 폴링을 잇는다.
  // ★★ mode 가 deps 에 **있어야 한다.** 위 [mode, id] effect 가 폴링을 떼고 나면 다시
  //   붙이는 것은 여기뿐인데, 두 방식이 **동시에 같은 상태**면(둘 다 굽는 중) 플래그가
  //   true → true 로 그대로라 deps 가 안 바뀌고 이 effect 가 아예 안 돈다.
  useEffect(() => {
    if (!id) return;
    if ((rendering || drawingNow) && !stopRef.current) beginPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mode, rendering, drawingNow]);

  const doneStep = FILM_STEPS.find((s) => s.key === "done");
  const imagesStep = FILM_STEPS.find((s) => s.key === "images");

  return (
    <section className="panel panel--wide">
      <h2>영상</h2>
      <p className="pgsub">{here.label} · 그림 {film.images?.length || 0}장으로 구워요</p>
      {err && <p className="pgsub warn">{err}</p>}
      {film.error && <p className="pgsub warn">{film.error}</p>}
      {rendering && (
        // 폴링이 붙었으니 화면이 스스로 갱신된다(상태 라우트가 두드릴 때마다 수거도 한다).
        <p className="pgsub">영상을 만드는 중이에요 — 다 되면 여기에 나타나요.</p>
      )}

      {film.video?.url && (
        <div className="preview-pane done-preview">
          <div className="preview-frame">
            <video className="preview-video" controls src={film.video.url} />
          </div>
        </div>
      )}

      <div className="step-actions">
        <Link className="mini" href={filmStepHref(imagesStep, id, mode)}>← 그림으로</Link>
        <div className="fwd">
          <span className="hint">
            {rendering || drawingNow ? "만드는 중에는 다시 누를 수 없어요" : "이대로 만들면 크레딧이 나가요 — 되돌릴 수 없어요"}
          </span>
          {/* ★★ 굽는 중이거나 그림을 만드는 중이면 잠긴다(locked). 두 번 누르면 회차가
              두 번 열려 값이 두 번 걷힌다. 그림이 없으면 굽지 않는다 — 참조 없이 나가면
              이 경로의 뜻이 사라지는데 값은 그대로 든다. */}
          <button className="cta" disabled={locked || !film.images?.length} onClick={startRender}>
            {busy === "render" ? "시작하는 중…" : film.video?.url ? "다시 굽기 →" : "이대로 굽기 →"}
          </button>
        </div>
      </div>

      {film.video?.url && (
        <div className="step-actions">
          <div className="fwd">
            <Link className="cta" href={filmStepHref(doneStep, id, mode)}>완성으로 →</Link>
          </div>
        </div>
      )}
    </section>
  );
}
