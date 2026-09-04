"use client";

// 6 완성 — 컷마다 만든 클립을 이어 붙이고 자막을 태운다(POST render, 로컬 ffmpeg라
// 0원 — app/api/reel/[id]/render/route.js 머리말). app/film/[id]/[mode]/video/page.js 의
// 폴링 배선을 본으로 삼되, **10분 상한**을 명시로 준다(기본값 5분을 그대로 받지 않는다 —
// 합성은 컷 여럿을 잇고 자막을 태우느라 그보다 오래 걸릴 수 있다).
//
// ★★ 자막의 모양(크기·글꼴·색·자리)은 **단계별 완성 화면과 같은 편집기**로 고른다
//   (components/SubtitleEditor.jsx, 2026-08-25 사장님 지시). 두 벌을 만들지 않는다 —
//   기본값·범위·되돌리기는 그 아래 lib/subtitles.js 하나가 계속 쥔다.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useReelProject } from "../layout";
import { reelOf, reelErrorFor, isReelRendering } from "../../../../lib/reel/doc";
import { startPolling } from "../../../../lib/poll";
import { REEL_STEPS, reelStepHref } from "../../../../lib/reel/steps";
import ReelBack from "../../../../components/ReelBack";
import { speechLangOf } from "../../../../lib/subtitle-langs";
import { narrationChanged, bakedNarration, SAID_MAX } from "../../../../lib/reel/narration";
import AutoTextarea from "../../../../components/AutoTextarea";
import SubtitleEditor, { seedSubtitle } from "../../../../components/SubtitleEditor";

const DONE_TIMEOUT_MS = 10 * 60 * 1000;

export default function ReelDonePage() {
  const { id } = useParams();
  const { project, reload } = useReelProject();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const stopRef = useRef(null);

  // 사장님이 고른 자막 설정. 화면이 값을 새로 정하지 않는다 — 초기값도 편집기가 쥔
  // 같은 규칙(seedSubtitle)에서 온다.
  const [sub, setSub] = useState(() => seedSubtitle(project));
  // 드래그 중인가 — 그동안은 서버 값으로 덮어쓰지 않는다(끄는 중에 값이 튄다).
  const dragRef = useRef(false);

  // ★★★ 2026-09-04 — **자막 글자.** 이 영상이 말한 문장이고, 자막은 그것을 태운다
  //   (lib/reel/narration.js 의 bakedNarration). 굽는 순간 코드가 적지만 **이미 구운
  //   편에는 없어서**, 구운 뒤 내레이션을 고치면 자막과 소리가 갈렸다(2026-09-03 신고).
  //   고치려고 다시 굽게 하면 글자 하나에 한 편 값이 나가므로 **여기서 0원에 고친다.**
  const [said, setSaid] = useState(() => bakedNarration(project)?.text || "");

  useEffect(() => () => { stopRef.current?.(); stopRef.current = null; }, []);

  // 서버가 준 설정이 바뀌면 따라간다(불러오기·저장 뒤). 문자열로 비교하는 이유는 객체가
  // 매 렌더 새로 오기 때문이다 — 참조로 걸면 사장님이 만지는 중에도 계속 덮어쓴다.
  const savedSubtitle = JSON.stringify(project?.settings?.subtitle ?? null);
  useEffect(() => {
    if (dragRef.current) return;
    setSub(seedSubtitle(project));
  }, [savedSubtitle]);

  // 저장된 글자가 바뀌면 따라간다(저장·불러오기 뒤). 설정과 같은 처방이다.
  const savedSaid = bakedNarration(project)?.text || "";
  useEffect(() => { setSaid(savedSaid); }, [savedSaid]);

  function beginPolling() {
    stopRef.current?.();
    stopRef.current = startPolling({
      url: `/api/reel/${id}/status`,
      timeoutMs: DONE_TIMEOUT_MS,
      // ★ await 한다. 완성 여부(reel.video.url)는 상태 라우트에 안 실린다
      //   (app/api/reel/[id]/status/route.js 의 계약 — status·error·cuts 뿐이다) —
      //   그래서 멈춘 뒤가 아니라 **멈추기로 정하는 바로 그 자리**에서 전체 문서를
      //   다시 읽어야, onStop 이 오기 전에도 최신 값을 화면에 반영할 수 있다.
      onTick: async (st) => {
        if (st?.status === "rendering") return false;
        await reload(id).catch((e) => setErr(e.message));
        return true;
      },
      onStop: ({ timedOut }) => {
        stopRef.current = null;
        if (timedOut) setErr("상태 확인이 오래 걸리고 있어요 — 새로고침해 주세요");
      },
    });
  }

  // 고친 자막을 저장한다 — **굽기 전에** 부른다.
  //
  // ★ 문이 다르다: 단계별 흐름의 `/api/projects/[id]` 는 종류가 있는 문서를 404 로 막으므로
  //   reel 은 자기 문(`/api/reel/[id]`)으로 저장한다. 보내는 값의 **모양은 같다**
  //   ({ settings: { subtitle } }) — 되돌리기 규칙도 라우트가 같은 normalizeSubtitle 을 쓴다.
  // ★ 실패하면 굽지 않는다 — 옛 자막으로 구워 놓고 "적용했다"고 보이면 안 된다.
  async function saveSubtitle() {
    const res = await fetch(`/api/reel/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { subtitle: sub } }),
    }).catch(() => null);
    if (!res || !res.ok) {
      throw new Error((await res?.json().catch(() => ({})))?.error || "자막 설정을 저장하지 못했어요");
    }
    await reload(id).catch(() => {});
  }

  // 자막 **글자**만 저장한다 — 굽지 않는다. 값이 안 나가는 것이 이 문의 요점이다.
  // ★ 저장만 하고 굽지 않는 이유: 굽기(합성)는 몇 분 걸린다. 글자를 고칠 때마다 그것을
  //   끌고 가면 고치는 일이 무거워진다 — 다 고친 뒤 [다시 만들기] 한 번이면 된다.
  async function saveSaid() {
    setBusy("said"); setErr("");
    const res = await fetch(`/api/reel/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ said }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res || !res.ok) {
      setErr(data?.error || "자막 글자를 저장하지 못했어요");
      setBusy("");
      return;
    }
    await reload(id).catch((e) => setErr(e.message));
    setBusy("");
  }

  async function startRender() {
    setBusy("render"); setErr("");
    // ★ 저장이 먼저다 — 굽기는 문서에 저장된 settings.subtitle 을 읽는다
    //   (app/api/reel/[id]/render/route.js). 순서가 뒤집히면 방금 고친 자막이 아니라
    //   옛 자막으로 구워지고, 화면만 새 자막을 보여 준다.
    try {
      await saveSubtitle();
    } catch (e) {
      setErr(e.message || "자막 설정을 저장하지 못했어요");
      setBusy("");
      return;
    }
    const res = await fetch(`/api/reel/${id}/render`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "완성하지 못했어요"); setBusy(""); return; }
    await reload(id).catch((e) => setErr(e.message));
    setBusy("");
    beginPolling();
  }

  const reel = reelOf(project);
  const rendering = isReelRendering(reel);
  const cuts = project?.cuts || [];
  const hasClips = cuts.some((c) => c?.video?.url);

  // 진입·새로고침 복원 — 합성 중이면 폴링을 잇는다.
  useEffect(() => {
    if (!id) return;
    if (rendering && !stopRef.current) beginPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, rendering]);

  // ★ 자막이 **안 구워진** 영상 — 미리보기는 그 위에만 그린다(구워진 완성본 위에 얹으면
  //   자막이 둘로 보인다). reel 의 완성본은 원본(-raw)을 문서에 안 남기므로 **클립**을 쓴다:
  //   자막은 합성에서 굽히니 클립에는 아직 자막이 없고, 비율도 같다. 덕분에 처음 굽기
  //   **전에도** 자막을 골라 볼 수 있다 — 이 흐름에서는 그쪽이 더 자연스럽다.
  const rawUrl = reel.video?.rawUrl || cuts.find((c) => c?.video?.url)?.video?.url || null;
  // ★★ 완성본 주소는 **늘 같다**(/api/renders/<id>.mp4) — 다시 구워도 <video> 는 옛
  //   파일을 그대로 쓴다. 각인(video.ts)을 실어 다른 주소로 만든다. 라우트는 질의문자를
  //   안 본다. 단계별 흐름이 먼저 쓴 처방 그대로다(app/create/[id]/done/page.js).
  //   ⚠️ 이것이 없어서 사장님이 "자막이 안 바뀐다"를 두 번 겪었다(2026-08-25).
  const finalSrc = reel.video?.url ? `${reel.video.url}?v=${reel.video.ts || 0}` : null;
  // 고치는 중인가 — 저장된 설정과 지금 고른 값이 다른가. 편집기가 이 값으로 재생기를 가른다.
  const dirty = JSON.stringify(sub) !== JSON.stringify(seedSubtitle(project));
  // 자막 언어 — 굽는 쪽과 같은 자를 쓴다(app/api/reel/[id]/render/route.js).
  const lang = project?.settings?.subtitle_lang || speechLangOf(project);

  return (
    <section className="panel panel--wide">
      <h2>완성</h2>
      {err && <p className="pgsub warn">{err}</p>}
      {/* ★ 이 단계(합성)의 오류만 읽는다 — ⑤영상의 실패가 여기 뜨면 안 된다. */}
      {reelErrorFor(reel, "done") && <p className="pgsub warn">{reelErrorFor(reel, "done")}</p>}
      {/* ★★ 2026-09-03 — 자막은 **파일 속 소리**를 따른다(lib/reel/narration.js 의
          bakedNarration). 그래서 내레이션 글자를 고쳐도 이미 구운 이 영상의 자막은 안
          바뀐다 — 그것이 맞다. 바꾸면 소리는 옛 문장인데 자막만 새 문장이 되어, 사장님이
          신고한 "아예 다른 자막"이 된다.
          ★ 대신 **바뀐 사실을 말해 준다.** 조용히 두면 "고쳤는데 반영이 안 된다"로 읽힌다 —
            이 저장소가 사진 누락에서 이미 겪은 종류의 오해다.
          ★ 다시 굽는 것은 돈이 드는 일이라(한 편 $4.5) **여기서 버튼을 열지 않는다.**
            돈 나가는 자리는 영상 화면 하나다. */}
      {narrationChanged(project) && (
        <p className="pgsub warn">
          내레이션을 고치셨어요 — 이 영상의 자막은 영상이 말하는 문장 그대로예요.
          고친 문장을 영상에 넣으려면 영상 화면에서 다시 만들어 주세요.
          자막 글자만 맞추시려면 아래 칸에서 고치시면 돼요.
        </p>
      )}
      {/* ★★ 2026-08-25 — 도는 표시를 붙이고 **busy 도 함께 본다**(사장님: "이대로 완성하기
          누르면 지금 진행되고 있는지 잘 모르겠어").
          ★ 왜 busy 인가: 누른 직후에는 busy 만 참이다. reel.status 가 "rendering" 이 되고
            폴링이 그것을 읽어 오기 전까지 rendering 은 아직 거짓이라, 그 사이 **아무
            표시도 없이 버튼만 잠겨** 있었다. 그 빈 구간이 바로 사장님이 겪은 자리다.
          ⚠️ 진척(n/m)은 못 쓴다 — 합성은 ffmpeg 단일 작업이라 중간값이 없다(단계별 흐름도
            같은 이유로 합성을 멈춤 판정에서 뺐다: STALL_EXEMPT_PHASES). */}
      {(rendering || busy === "render") && (
        <p className="pgsub">
          <span className="spinner" aria-hidden="true" /> 영상을 이어 붙이는 중이에요 — 몇 분 걸려요. 다 되면 여기에 나타나요.
        </p>
      )}

      {(rawUrl || finalSrc) && (
        <SubtitleEditor
          cuts={cuts}
          aspectRatio={project?.settings?.aspect_ratio}
          lang={lang}
          sub={sub}
          onChange={setSub}
          rawUrl={rawUrl}
          finalSrc={finalSrc}
          dirty={dirty}
          /* 자막 없는 영상이 없으면(클립도 완성본도 없다) 조절판을 안 그린다 —
             구워진 완성본 위에 미리보기를 얹으면 자막이 둘로 보인다. */
          editable={!!rawUrl}
          applying={rendering || !!busy}
          busy={rendering || !!busy}
          /* ★ 실행 버튼은 안 넘긴다 — 이 화면에서 영상을 만드는 버튼은 아래의
             [다시 만들기] 하나다. 둘을 두면 어느 것이 반영하는 버튼인지 알 수 없다
             (단계별 완성 화면이 2026-08-13 에 같은 이유로 버튼을 하나로 합쳤다). */
          onDragging={(v) => { dragRef.current = v; }}
        />
      )}

      {/* ★★★ 2026-09-04 — **자막 글자를 여기서 고친다.**
          ★ 통짜로 구운 편에만 뜬다 — 컷별 갈래는 컷마다 sentence 가 자막이라 축이 다르다
            (lib/reel/narration.js 의 putSaid 가 같은 판정을 한다. 화면은 가림막일 뿐이다).
          ★ 새 CSS 를 안 만든다 — ②시나리오의 수정 요청 칸과 같은 옷을 입는다.
          ★ **돈이 안 나가는 버튼**이라 자기 자리에 둘 수 있다. 값이 나가는 버튼은 아래
            실행줄의 [다시 만들기] 하나다(이 저장소의 규율). */}
      {cuts[0]?.video?.whole === true && cuts[0]?.video?.url && (
        <div className="note-form">
          <p className="pgsub">자막 글자 — 이 영상이 말하는 문장이에요. 비우면 시나리오의 내레이션을 따라요.</p>
          <AutoTextarea
            className="field"
            rows={3}
            value={said}
            maxLength={SAID_MAX}
            disabled={rendering || !!busy}
            onChange={(e) => setSaid(e.target.value)}
            placeholder="영상이 말하는 문장을 그대로 적어 주세요"
          />
          <div className="note-act">
            {said.trim() !== savedSaid.trim() && busy !== "said" && (
              <p className="pgsub note-hint">저장한 뒤 다시 만들어야 영상에 들어가요.</p>
            )}
            <button
              type="button"
              className="tag"
              disabled={said.trim() === savedSaid.trim() || rendering || !!busy}
              onClick={saveSaid}
            >
              {busy === "said" ? "저장하는 중…" : "자막 글자 저장"}
            </button>
          </div>
        </div>
      )}

      {/* ★★ 실행줄은 **하나다**(2026-08-25 사장님 지시). 예전에는 [이대로 완성하기]가
          자기 줄을 따로 갖고 그 아래에 [이전으로] 줄이 또 있었다 — 줄이 둘이면 어느
          것이 이 화면의 맨 아래인지 흐려진다. 왼쪽 끝이 [이전으로], 오른쪽이 실행이다.
          ★ 이 줄은 **항상** 그린다 — 아직 영상을 못 만든 사장님에게도 돌아갈 길이 있어야 한다. */}
      <div className="step-actions">
        <ReelBack step="done" id={id} />
        <div className="fwd">
          {/* ★ 남긴 것은 하나다 — 고친 자막이 아직 영상에 안 들어갔다는 사실.
              이건 설명이 아니라 **모르면 고친 것을 잃는** 경고다.
              값이나 안쪽 사정(무료·컷을 잇는다)은 버튼 옆에서 설명하지 않는다(2026-08-25). */}
          {dirty && !rendering && (
            <span className="hint">고친 자막은 옆 버튼을 눌러야 영상에 들어가요</span>
          )}
          <button className="cta" disabled={rendering || !!busy || !hasClips} onClick={startRender}>
            {/* ★ 화살표를 안 붙인다 — 다음 화면으로 가는 버튼이 아니라 굽는 버튼이다. */}
            {busy === "render" ? "시작하는 중…" : reel.video?.url ? "다시 만들기" : "이대로 완성하기"}
          </button>
          {/* ★★ 내려받기(2026-08-25 사장님 지적: "영상 다운 버튼도 없다"). 단계별
              흐름과 보관함에는 있는데 reel 만 빠져 있었다 — 완성 화면을 만들 때
              자막 편집기만 가져오고 그 주변 장치를 안 가져온 것이다.
              ★ 완성본이 있으면 사장님이 하고 싶은 일은 **내려받기**다 — 보관함보다 앞에 둔다.
              ★ ?dl=1 — 서명 URL 로 302 하면 다른 출처가 되어 아래 속성이 무시된다.
                첨부로 내려줄지를 Storage 가 정하게 하는 신호다(app/api/renders/[name]).
              ★ 각인(?v=)이 붙은 finalSrc 를 쓰지 않는다 — 내려받기는 늘 최신 파일을
                받으면 되고, 질의문자가 둘이면 라우트가 읽는 이름이 헷갈린다. */}
          {reel.video?.url && (
            <a className="cta" href={`${reel.video.url}?dl=1`} download>내려받기</a>
          )}
          {reel.video?.url && <Link className="cta" href="/archive">보관함으로 →</Link>}
        </div>
      </div>
    </section>
  );
}
