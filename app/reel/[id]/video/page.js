"use client";

// 5 영상 — **컷별 굽기.** 여기서 크레딧이 나간다(app/film/[id]/[mode]/video/page.js 를
// 본으로 삼되, 굽는 문(POST clips)이 접수만 하고 백그라운드에서 돈다 — film 의 render 와
// 같은 결이라 그 화면의 폴링 배선을 그대로 옮긴다).
//
// ★ 폴링 루프는 lib/poll.js 한 벌이다 — 화면이 스스로 타이머를 돌리지 않는다.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useReelProject } from "../layout";
import { reelOf, isReelRendering } from "../../../../lib/reel/doc";
// ★★ 2026-08-25 — 굽기 갈래가 둘이다(통짜 · 컷별). 판정은 lib 의 순수 함수 하나다 —
//   canBakeReel 은 컷별 갈래에서 예전 canBakeReelClips 를 글자 그대로 부른다.
import { planReelBake, canBakeReel, isReelOneShotStale, reelSheetUrl, reelWholePrompt } from "../../../../lib/reel/oneshot";
import { isReelClipStale } from "../../../../lib/reel/steps";
import { startPolling } from "../../../../lib/poll";
import { REEL_STEPS, reelStepHref } from "../../../../lib/reel/steps";
import ReelBack from "../../../../components/ReelBack";

export default function ReelVideoPage() {
  const { id } = useParams();
  const { project, reload } = useReelProject();
  const [busy, setBusy] = useState("");
  // ★ 사장님이 한국어로 적는 수정 요청 — ②③④와 같은 모양이다.
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  // 큰 재생기에 트는 컷 번호(컷별 갈래에서만 쓴다). null 이면 첫 완성 컷이다.
  const [playIdx, setPlayIdx] = useState(null);
  // 상태 라우트가 준 마지막 응답. 문서(GET /api/reel/[id])보다 최신이다 — 폴링이 두드릴
  // 때마다 상태 라우트가 그 사이 완성된 컷을 이미 읽었을 수 있어서다.
  const [live, setLive] = useState(null);
  const stopRef = useRef(null);

  // 떠날 때는 반드시 뗀다 — 안 떼면 화면을 나가도 서버를 계속 두드린다.
  useEffect(() => () => { stopRef.current?.(); stopRef.current = null; }, []);

  function beginPolling() {
    stopRef.current?.();
    stopRef.current = startPolling({
      url: `/api/reel/${id}/status`,
      // ★ 기본값(5분)을 그대로 받지 않는다 — 컷이 여럿이면 큐에서 그보다 오래 걸릴 수
      //   있다. 대신 onTick 이 **끝나면 스스로 멈춘다**(무한정 두드리지 않는다).
      timeoutMs: Infinity,
      onTick: (st) => {
        setLive(st);
        // "rendering" 이 아니게 되면(성공은 "clips", 실패는 "error") 멈춘다.
        return st?.status !== "rendering";
      },
      onStop: ({ timedOut }) => {
        // ★ 반드시 비운다 — 안 비우면 손잡이가 영원히 truthy 라 아래 복원이 다시 안 붙는다.
        stopRef.current = null;
        if (timedOut) setErr("상태 확인이 오래 걸리고 있어요 — 새로고침해 주세요");
        // 문서를 다시 읽는다 — 상태 라우트는 cuts.video 는 실어도 material·reel 전체는
        // 안 준다(app/api/reel/[id]/status/route.js 의 계약). 다음 단계(완성) 가드가
        // 최신 컷을 봐야 한다.
        reload(id).catch((e) => setErr(e.message));
      },
    });
  }

  // 굽기 — **여기서 크레딧이 나간다.** 서버도 rendering 이면 거절하지만(이중 청구 방지),
  // 화면이 먼저 잠그는 이유는 사장님이 400/409 를 보기 전에 못 누르게 하는 것이다.
  async function startClips() {
    setBusy("clips"); setErr("");
    // ★★ 수정 요청이 적혀 있으면 **굽기 전에 프롬프트에 반영한다**(2026-08-25).
    //   ④가 쓰는 것과 **같은 문**이다(POST /prompts). 그래야 굽기가 새 지문을 쓰고,
    //   각인(video.of)도 그 값을 따라 낡음 판정이 맞는다.
    // ★★ 예전에는 적은 말을 전체 프롬프트 **끝에 글자 그대로 붙였다**. 붙인 한국어가
    //   ④의 위 글에 그대로 보여 사장님이 지웠다("삭제") — 지금은 LLM 이 다시 쓴다.
    // ★ 갈래마다 고칠 자리가 다르다: 통짜는 **한 벌 전체**(whole), 컷별은 **모든 컷의
    //   지문**(only 에 전 컷). 컷별에서 whole 로 보내면 굽기가 안 읽는 자리에 적히고,
    //   값은 나가는데 적은 말이 영상에 한 글자도 안 닿는다.
    // ★ 반영이 실패하면 **굽지 않는다** — 적은 말이 안 닿은 채 돈이 나가는 것을 막는다.
    const ask = note.trim();
    if (ask) {
      const saved = await fetch(`/api/reel/${id}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          oneShot ? { whole: true, note: ask } : { only: cuts.map((_, i) => i), note: ask }
        ),
      });
      if (!saved.ok) {
        const d = await saved.json().catch(() => ({}));
        setErr(d.error || "수정 요청을 반영하지 못했어요");
        setBusy("");
        return;
      }
      setNote("");
      await reload(id).catch(() => {});
    }
    const res = await fetch(`/api/reel/${id}/clips`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "굽지 못했어요"); setBusy(""); return; }
    setLive(null);
    setBusy("");
    // 접수만 됐다(fire-and-forget) — 여기서부터 두드리기 시작한다.
    beginPolling();
  }

  const reel = reelOf(project);
  const cuts = live?.cuts || project?.cuts || [];
  // ★ 전체 프롬프트 — ④에서 고친 것이 있으면 그것, 없으면 시나리오 원문이다.
  //   판정은 lib 의 순수 함수 하나다 — 화면이 조립하면 ④와 갈린다.
  const wholePrompt = reelWholePrompt(project);
  const status = live?.status ?? reel.status;
  const rendering = status === "rendering";
  // ★★ 2026-08-21 리뷰 A2 — 프롬프트뿐 아니라 그림까지 본다(`/clips` 의 청구 앞 검사와
  //   같은 값). 프롬프트만 보면 화면이 열어 준 버튼이 서버 배경 작업에서 청구 뒤 실패한다.
  const ready = canBakeReel(project);
  const doneCount = cuts.filter((c) => c?.video?.url).length;
  // ★ 갈래는 **문서**로 판정한다 — 상태 라우트(live)는 settings·scenario 를 안 싣는다.
  const oneShot = planReelBake(project).mode === "oneshot";
  const sheetUrl = reelSheetUrl(project?.cuts || []);
  const oneShotStale = oneShot && isReelOneShotStale(project);

  // 진입·새로고침 복원 — 굽는 중이면 폴링을 잇는다.
  useEffect(() => {
    if (!id) return;
    if (isReelRendering(reelOf(project)) && !stopRef.current) beginPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, project?.reel?.status]);

  const promptsStep = REEL_STEPS.find((s) => s.key === "prompts");
  const doneStep = REEL_STEPS.find((s) => s.key === "done");

  // 큰 자리에서 트는 것 — 통짜는 늘 그 한 편, 컷별은 사장님이 고른 컷(없으면 첫 완성 컷).
  // ★ 번호를 쥐고 객체를 안 쥔다 — 폴링이 새 문서를 주면 옛 객체는 낡은 주소를 가리킨다.
  const playing = oneShot
    ? cuts[0]
    : (cuts.find((c) => c.idx === playIdx && c.video?.url) || cuts.find((c) => c.video?.url));

  // 수정 요청 칸이 뜨는 조건 — 만든 뒤이고, 굽는 중이 아닐 때다.
  // ★ 굽는 버튼의 자리가 이 값으로 갈린다(둘은 **동시에 안 뜬다**).
  const asking = doneCount > 0 && !rendering;

  // ★★ 굽는 버튼은 **한 번만 적는다**(2026-08-25 사장님 지시 — ②③④와 통일).
  //   ②시나리오·③이미지가 이미 이 모양이다: 자리가 둘(수정 요청 칸 안 / 아직 안 만들었을
  //   때의 실행줄)인데 둘이 동시에 안 뜨므로 손으로 두 번 적으면 라벨이 갈린다.
  //   ★ 생김새도 맞춘다 — ②③④가 전부 `.mini` 다. 여기만 `.cta` 라 다른 종류로 보였다.
  //   ★ "그 줄에 혼자 선다"는 규율은 그대로다: 칸 안에서도 이 버튼 하나뿐이고,
  //     아직 안 만들었을 때의 실행줄에도 이것 하나뿐이다(되돌아가는 링크는 아래 줄이다).
  const bakeBtn = (
    <button className="mini" disabled={rendering || !!busy || !ready} onClick={startClips}>
      {/* ★ 화살표를 안 붙인다 — 굽는 버튼이지 다음 화면으로 가는 버튼이 아니다. */}
      {busy === "clips" ? "시작하는 중…" : doneCount > 0 ? "다시 만들기" : "영상 만들기"}
    </button>
  );

  return (
    <section className="panel panel--wide">
      <h2>영상</h2>
      {/* ★★ 통짜 갈래에서는 아무 말도 안 한다(2026-08-25 사장님 지시 — "스토리보드 한 장으로
          N컷" 문구 삭제). 스토리보드 한 장을 통째로 넘긴다는 것은 **안쪽 사정**이지
          사장님이 알아야 할 일이 아니다(이 화면의 말투 규칙과 같다).
          ★ 컷별 갈래의 "컷 N개 중 M개"는 남긴다 — 그것은 안쪽 사정이 아니라 진척이다. */}
      {!oneShot && <p className="pgsub">컷 {cuts.length}개 중 {doneCount}개를 만들었어요</p>}
      {err && <p className="pgsub warn">{err}</p>}
      {(live?.error || reel.error) && <p className="pgsub warn">{live?.error || reel.error}</p>}
      {/* ★★ 굽는 동안 **되고 있다는 것이 보여야 한다**(2026-08-25 사장님 지시:
          "영상 생성 같은 경우에는 시간이 오래걸리기 때문에 꼭 필요한 작업이야").
          한 줄짜리 안내만 두면 멈춘 것과 구별이 안 된다 — 도는 표시와 함께 **어디까지
          왔는지**를 같이 말한다.
          ★ 통짜 갈래는 "컷 n/m"이 거짓말이다 — 한 번에 한 편을 굽는다.
          ⚠️ 이 화면의 상태 라우트는 progress·stalled_for_ms 를 안 싣는다
          (app/api/reel/[id]/status/route.js 의 계약). 그래서 단계별 흐름처럼 "멈춘 것
          같아요"까지는 못 가른다 — 실어 보내게 되면 그때 generationState 로 옮긴다. */}
      {rendering && (
        <p className="pgsub">
          <span className="spinner" aria-hidden="true" />{" "}
          {oneShot
            ? "한 편을 통째로 굽고 있어요 — 몇 분 걸려요. 다 되면 여기에 나타나요."
            : `컷 ${doneCount}/${cuts.length} 만드는 중이에요 — 다 되면 여기에 나타나요.`}
        </p>
      )}

      {/* 통짜 갈래 — 보여 줄 것이 **한 편**이다(굽기 전에는 스토리보드 원본).
          ★★ 만든 영상은 **볼 수 있어야 한다**(2026-08-25 사장님 지시). 예전에는
          muted·loop 에 controls 가 없어 첫 프레임만 박힌 그림처럼 서 있었다 — 만들어
          놓고 ⑥까지 가야 볼 수 있었다. 이제 여기서 바로 재생한다.
          ★ 자동재생은 안 건다 — 소리가 있는 영상이라 화면에 들어서자마자 울린다. */}
      {/* ★ 만들어진 영상은 **여기서 튼다**. 옛 화면은 86px 썸네일뿐이라 ⑥완성까지 가야
          볼 수 있었다. 통짜는 한 편이니 그것을, 컷별은 **고른 컷**을 큰 자리에 튼다.
          ★ 자동재생은 안 건다 — 소리가 있어 화면에 들어서자마자 울린다. */}
      {playing?.video?.url && (
        <video
          className="vid-result vid-result--center"
          key={playing.video.url}
          src={playing.video.url}
          controls
          playsInline
          preload="metadata"
        />
      )}
      {/* ★ 낡음 경고가 갈 곳이 없어졌다 — 통짜 갈래는 영상이 나오면 아래 칸을 안 그린다
          (그 칸의 배지가 원래 이 말을 했다). 재생기 옆에서 말한다. */}
      {oneShot && oneShotStale && cuts[0]?.video?.url && (
        <p className="pgsub warn">그림이나 시나리오가 바뀌었어요 — 다시 만들어 주세요.</p>
      )}

      {/* ★★ 통짜 갈래에서 **영상이 나온 뒤에는 이 칸을 안 그린다**(2026-08-25 사장님 지시).
          위에 재생기가 서 있는데 그 아래 86px 네모가 같은 것을 한 번 더 보여 주고 있었다.
          굽기 전·굽는 중에만 남긴다 — 그때는 보여 줄 것이 스토리보드뿐이라 이 칸이 유일하다.
          ★ 컷별 갈래의 썸네일은 그대로 둔다 — 그것은 중복이 아니라 **고르는 자리**다. */}
      {oneShot ? (
        !cuts[0]?.video?.url && (
          <div className="uploads">
            <div className="up photo-mark">
              {sheetUrl ? (
                <img className="thumb-media" src={sheetUrl} alt="스토리보드" />
              ) : (
                <div className="thumb-media" />
              )}
              {/* ★ 덮개다(absolute) — 스토리보드를 지우지 않고 그 위에서 돈다.
                  무엇을 굽는 중인지 옛 그림으로 알 수 있다. */}
              {rendering && (
                <div className="frame-busy"><span className="spinner" aria-hidden="true" /></div>
              )}
              {oneShotStale && <span className="tag warn">다시 만들어야 해요</span>}
            </div>
          </div>
        )
      ) : cuts.length > 0 && (
        <div className="uploads">
          {cuts.map((c) => (
            <div
              key={c.idx}
              className="up photo-mark"
              /* ★ 누르면 위 재생기가 그 컷으로 바뀐다 — 컷마다 재생기를 두면 4초짜리
                 조각 열두 개가 각자 조작판을 달고 서 있다. */
              onClick={() => c.video?.url && setPlayIdx(c.idx)}
            >
              {c.video?.url ? (
                <video className="thumb-media" src={c.video.url} muted playsInline preload="metadata" />
              ) : c.image?.url ? (
                <img className="thumb-media" src={c.image.url} alt={`컷 ${c.idx + 1}`} />
              ) : (
                <div className="thumb-media" />
              )}
              {/* ★ 아직 안 나온 컷만 돈다 — 끝난 컷은 이미 영상이다. */}
              {rendering && !c.video?.url && (
                <div className="frame-busy"><span className="spinner" aria-hidden="true" /></div>
              )}
              {(c.stale ?? isReelClipStale(c)) && c.video?.url && (
                <span className="tag warn">다시 만들어야 해요</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ★ 만드는 버튼은 **그 줄에 혼자** 둔다 — 되돌아가는 링크와 나란히
          있으면 둘 다 "지금 할 일"처럼 읽힌다(2026-08-25 사장님 지적). */}
      {/* ★★ 수정 요청 — ②③④와 같은 모양이다(2026-08-25 사장님 지시).
          적은 말은 [다시 만들기]를 누를 때 **전체 프롬프트에 반영된 뒤** 굽기로 간다.
          ★ 자동으로 안 나간다 — 영상은 이 흐름에서 가장 비싸다.
          ★ 만든 뒤에만 보인다 — 만들기 전에는 고칠 것이 없다. */}
      {asking && (
        <div className="note-form">
          <textarea
            className="field"
            rows={3}
            value={note}
            disabled={!!busy}
            onChange={(e) => setNote(e.target.value)}
            placeholder="고치고 싶은 것을 적어 주세요 — 예) 마지막을 좀 더 천천히 끝내 줘"
          />
          {/* ★ 안내문은 버튼 바로 왼쪽 — ②③④와 같은 모양이다. */}
          <div className="note-act">
            <p className="pgsub note-hint">다시 만들면 지금 영상은 사라져요.</p>
            {bakeBtn}
          </div>
        </div>
      )}

      {/* ★ 아직 안 만들었거나 굽는 중일 때만 여기 선다 — 그때는 위 칸이 안 보인다.
          지우지 않는 이유는 처음 굽는 유일한 길이라서다(②시나리오와 같은 처방). */}
      {!asking && (
        <div className="step-actions step-actions--bare">
          <div className="fwd">{bakeBtn}</div>
        </div>
      )}

      {/* ★ 맨 아래 줄 — 왼쪽 끝이 [이전으로], 오른쪽이 다음이다(.fwd 가 margin-left:auto).
          이전 버튼은 components/ReelBack.jsx 하나가 그린다 — 화면마다 손으로 적어서
          이름도 자리도 갈렸던 것이 원래 문제였다(2026-08-25 사장님 지적). */}
      {/* ★ 굽기 전에도 되돌아갈 수 있어야 한다 — 이 줄은 doneCount 와 무관하게
          항상 그리고, [완성으로]만 조건부로 둔다. */}
      <div className="step-actions">
        <ReelBack step="video" id={id} />
        {doneCount > 0 && (
          <div className="fwd">
            <Link className="cta" href={reelStepHref(doneStep, id)}>완성으로 →</Link>
          </div>
        )}
      </div>
    </section>
  );
}
