"use client";

// ⑥ 완성 — 클립을 이어붙이고 소리와 자막을 얹어 내려받을 mp4 를 만든다.
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useProject } from "../../../../components/ProjectContext";
import BackButton from "../../../../components/BackButton";
import { cutSeconds } from "../../../../lib/subtitles";
// 자막 편집기는 한 벌이다 — reel 완성 화면도 같은 컴포넌트를 쓴다(2026-08-25).
// 초기값 규칙(seedSubtitle)도 거기 산다: 두 화면이 각자 적으면 갈린다.
import SubtitleEditor, { seedSubtitle } from "../../../../components/SubtitleEditor";
import { isRenderStale, isClipStale, isImageStale, isSubtitleOnlyStale } from "../../../../lib/steps";
import { SUBTITLE_LANGS, speechLangOf } from "../../../../lib/subtitle-langs";
import { isSubtitleStale } from "../../../../lib/translate";
// 두드리는 루프는 화면마다 복붙하지 않는다 — 복붙본이 조금씩 갈려 ④이미지가
// images_error 를 영영 못 보던 버그가 났다(2026-08-14). 한 벌에서 온다.
import { startPolling } from "../../../../lib/poll";

// 자막의 모양(크기·글꼴·색·자리)을 고르는 자리는 components/SubtitleEditor.jsx 하나다 —
// 초기값 규칙(seedSubtitle)·빠른 위치 목록·드래그도 함께 거기 산다. 이 화면이 남겨 둔 것은
// **이 흐름에만 있는 것**뿐이다: 자막 언어·번역 검토·[영상에 적용]의 두 갈래.

export default function DoneStepPage() {
  const { id } = useParams();
  const { project, setProject, load } = useProject();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const stopRef = useRef(null);

  // ★ 미리보기는 **자막 없는 원본** 위에 브라우저가 자막을 그린다. 자막이 구워진 완성본 위에
  // 얹으면 자막이 둘로 보인다. 원본이 없는 옛 프로젝트에서는 완성본을 재생하고 조절 UI 를 숨긴다.
  //
  // ⚠️ 이름이 **camelCase 다**(`rawUrl`). 이 저장소의 프로젝트 문서는 대체로 snake_case 인데
  // (`clip_regen_count`·`cuts_script_version`) render 만 composeVideo 의 반환값을 그대로
  // 스프레드해 저장한다(lib/pipeline.js) — 그래서 여기만 섞여 있다. `raw_url` 은 없는 필드다.
  const rawUrl = project?.render?.rawUrl || null;

  // 사장님이 고른 자막 설정. 화면이 값을 새로 정하지 않는다 — 기본값·되돌리기·범위는
  // lib/subtitles.js 하나가 쥔다(두 벌이 되면 언젠가 갈린다).
  const [sub, setSub] = useState(() => seedSubtitle(project));
  const [applying, setApplying] = useState(false);
  // 드래그 중인가 — 컴포넌트가 알려 준다. 그동안은 서버 값으로 덮어쓰지 않는다.
  const dragRef = useRef(false);

  useEffect(() => () => { stopRef.current?.(); stopRef.current = null; }, []);

  // 서버가 준 설정이 바뀌면 따라간다(불러오기·저장 뒤). 문자열로 비교하는 이유는 객체가
  // 매 렌더 새로 오기 때문이다 — 참조로 걸면 사장님이 만지는 중에도 계속 덮어쓴다.
  //
  // 옛 위치(subtitle_position)도 함께 본다 — settings.subtitle 이 아직 없는 프로젝트에서는
  // 그 값이 초기 자리를 정하므로, 칩으로 위치를 바꾸면 미리보기도 따라와야 한다.
  const savedSubtitle = JSON.stringify([
    project?.settings?.subtitle ?? null,
    project?.settings?.subtitle_position ?? null,
  ]);
  useEffect(() => {
    if (dragRef.current) return;
    setSub(seedSubtitle(project));
  }, [savedSubtitle]);

  // [영상에 적용] — 설정을 저장한 뒤 **영상에 반영한다.** 길은 코드가 고른다:
  // 컷·소리·그림이 낡았으면 전체를 다시 합치고, 자막만 달라졌으면 원본 위에 자막만 굽는다
  // (훨씬 빠르고 클립을 다시 받지 않는다). 사장님이 두 길을 구별할 이유가 없다 —
  // 옛 화면은 [자막 적용]과 [다시 합치기]를 나란히 두어, 어느 것이 영상에 반영하는
  // 것인지 알 수 없었다(2026-08-13 사용자 지적).
  async function applyToVideo() {
    if (applying || busy) return;
    // 몸통이 낡았으면 자막만 구워 봐야 옛 클립 위에 새 자막이 얹힌다 — 전체를 다시 합친다.
    // 전체 합성도 settings.subtitle 을 읽으므로 자막 설정은 그 길에서도 실린다.
    if (stale && !subtitleOnlyStale) {
      setApplying(true);
      try {
        const saved = await fetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings: { subtitle: sub } }),
        });
        if (!saved.ok) {
          throw new Error((await saved.json().catch(() => ({}))).error || "자막 설정을 저장하지 못했어요");
        }
      } catch (e) {
        setErr(e.message || "자막 설정을 저장하지 못했어요");
        setApplying(false);
        return;
      }
      setApplying(false);
      return start();
    }
    return applySubtitle();
  }

  // 설정을 저장한 뒤 **자막만** 다시 굽는다. 클립·소리·그림은 그대로라 값이 안 든다.
  // 저장을 먼저 하는 이유: 재굽기가 실패해도 고른 설정은 남아야 다음에 다시 시도할 수 있다.
  async function applySubtitle() {
    if (applying || busy) return;
    setApplying(true);
    setErr("");
    try {
      const saved = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { subtitle: sub } }),
      });
      if (!saved.ok) {
        throw new Error((await saved.json().catch(() => ({}))).error || "자막 설정을 저장하지 못했어요");
      }
      const res = await fetch(`/api/projects/${id}/subtitle`, { method: "POST" });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).error || "자막을 다시 굽지 못했어요");
      }
      await load(id).catch(() => {});
    } catch (e) {
      setErr(e.message || "자막을 다시 굽지 못했어요");
    } finally {
      setApplying(false);
    }
  }

  function beginPolling() {
    stopRef.current?.();
    setPollTimedOut(false);
    stopRef.current = startPolling({
      url: `/api/projects/${id}/render/status`,
      // ★★ 여기만 상한이 **10분**이다(다른 넷은 모듈 기본값 5분). 인코딩은 이미지 생성보다
      //    오래 걸릴 수 있어 원래 그렇게 잡혀 있었다. 이 줄을 빠뜨리면 상한이 반토막 나서
      //    정상적으로 6~9분 걸리는 합성이 "상태를 확인하지 못했어요"로 끝난다.
      //    합성이 멈춤 판정에서 빠져 있는 것(STALL_EXEMPT_PHASES)과 같은 이유다.
      timeoutMs: 10 * 60 * 1000,
      onTick: (st) => {
        setProject((p) => ({ ...p, status: st.status, render: st.render, render_error: st.render_error }));
        if (st.render_error) { setErr(st.render_error); return true; }
        // 완료 판정은 옮기기 전 그대로다 — 완성본이 붙었으면 끝이다.
        return !!st.render;
      },
      onStop: ({ timedOut }) => {
        // ★ ref 를 여기서 비운다. 아래 복원 effect 가 ref 의 참 여부로 "이미 돌고 있나"를
        //   판정하는데, 모듈은 자기 내부 handle 만 비운다 — 화면 ref 는 반환받은 중단
        //   함수를 계속 쥐어 항상 참이 되고, 스스로 끝난 폴링이 다시는 안 살아난다.
        stopRef.current = null;
        setBusy(false);
        if (timedOut) {
          setPollTimedOut(true);
          // ★ "오래 걸린다"가 아니다 — 상태를 못 읽은 것이다. 둘은 다른 사건이다.
          setErr("상태를 확인하지 못했어요 — 새로고침해 주세요");
        }
      },
    });
  }

  // 진입·새로고침 복원 — 합성 중이면 폴링을 잇는다
  useEffect(() => {
    if (busy && !stopRef.current && !pollTimedOut) beginPolling();
  }, [busy]);

  async function start() {
    setBusy(true); setErr("");
    const res = await fetch(`/api/projects/${id}/render`, { method: "POST" });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || "시작하지 못했어요");
      setBusy(false);
      return;
    }
    await load(id).catch(() => {});
    beginPolling();
  }

  // 자막 언어 — 화면이 앞서가지 않는다. 켜진 칩은 **서버가 저장한 값**에서만 나온다.
  // 낙관적으로 먼저 켜 두면, 라우트가 번역을 못 쓰는 답을 받아 저장을 접었을 때(502)
  // 화면은 이미 "일본어"를 켠 채라 사장님이 안 바뀐 것을 바뀐 것으로 믿는다.
  const [langErr, setLangErr] = useState("");
  // ★ boolean 이 아니라 **무엇을 옮기는 중인지**(언어 id)를 든다 — 재생성의 regening 과 같다.
  //   켜진 칩은 서버가 저장한 뒤에야 옮겨가므로, 기다리는 동안 사장님이 고른 언어는
  //   화면 어디에도 없다. 이 값만이 "일본어로 옮기는 중"이라고 이름을 부를 근거다.
  const [langBusy, setLangBusy] = useState(null);
  // ★ 기본 자막은 **말한 언어**다(2026-08-18). 일본어로 말하는 영상에 한국어 자막이 기본이면
  //   사장님은 아무것도 안 골랐는데 번역본을 보게 되고, 그 번역에 값이 든다.
  //   말한 언어를 안 고른 옛 프로젝트는 한국어라 예전과 같다.
  const sourceLang = speechLangOf(project);
  const lang = project?.settings?.subtitle_lang || sourceLang;

  // 언어를 고르거나(첫 인자) 낡은 컷을 [다시 번역]할 때(같은 언어를 다시 부른다) 쓴다 —
  // 라우트가 낡은 컷만 골라 다시 옮기므로 재호출이 곧 "다시 번역"이다.
  async function pickLang(langId) {
    if (langBusy) return;
    setLangBusy(langId);
    setLangErr("");
    try {
      const res = await fetch(`/api/projects/${id}/subtitle-lang`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: langId }),
      });
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).error || "번역이 안 돼서 언어를 저장하지 못했어요");
      }
      await load(id).catch(() => {});
    } catch (e) {
      setLangErr(e.message || "언어를 저장하지 못했어요 — 자막 언어는 그대로예요");
    } finally {
      setLangBusy(null);
    }
  }

  // 번역 손보기 — ②대본 화면의 contentEditable 방식 그대로다(새 편집 UI를 만들지 않는다).
  // 라우트가 저장하며 of 를 지금 문장으로 다시 찍어 isSubtitleStale 이 손으로 고친
  // 번역을 낡음으로 잡지 않게 한다.
  async function saveTranslation(idx, text) {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cut: { idx, subtitleLang: lang, subtitleText: text } }),
    }).catch(() => null);
    if (!res || !res.ok) { setLangErr("번역을 저장하지 못했어요"); return; }
    setLangErr("");
    await load(id).catch(() => {});
  }

  const cuts = project?.cuts || [];
  const render = project?.render;
  const clipCount = cuts.filter((c) => c.video?.url).length;
  // 완성본 길이는 컷마다 낭독·클립 중 긴 쪽을 더한 값이다 — 낭독 합으로 예고하면
  // 만든 뒤에 다른 초가 나온다(눈금 올림 때문에 클립이 거의 항상 더 길다)
  // ★ cutSeconds 가 컷만 보고 판정한다 — 소리 파일이 있으면 합성이 낭독 길이로 자르고,
  // 없으면(클립이 스스로 말한다) 못 자르니 받은 클립 길이다. 화면이 예고하는 초가
  // 합성 결과와 같은 자를 쓴다.
  const totalSeconds = cuts.reduce((s, c) => s + cutSeconds(c), 0);
  // 컷을 고친 뒤라면 이 완성본은 옛 소리·옛 그림으로 만든 것이다.
  // 합성은 0원이라 막을 게 아니라 바로 다시 만들게 하는 것이 맞다.
  //
  // 완성본 자체의 각인만 보면 안 된다. renderKey 는 소리·클립 주소와 문장만 이어 붙이므로
  // **④로 돌아가 그림을 다시 만든 것만으로는 완성본이 낡지 않는다** — 그림 주소는 클립 각인
  // (clipKey)에만 들어 있다. 앞 단계의 [다음] 잠금이 그것을 막아 줄 거라 봤지만, 사이드바는
  // status 만 보고 링크를 여니(isReachable) 잠금을 지나쳐 ⑥으로 바로 들어올 수 있다.
  // 그래서 ⑥이 스스로 클립·그림까지 본다. 안 그러면 옛 클립으로 만든 mp4 가 그대로 내려받히고,
  // 거기서 [다시 합치기]를 눌러도 옛 클립으로 다시 합쳐져 "안 낡음"으로 굳는다.
  // ⚠️ some(isImageStale) 로 넘기면 배열 번호가 project 자리에 들어가 화풍 판정이 죽는다.
  const stale = isRenderStale(project) || cuts.some((c) => isClipStale(c, project)) || cuts.some((c) => isImageStale(c, project));
  // 낡음의 원인을 갈라 말한다 — 자막 위치만 바꾼 것을 "옛 소리·옛 그림" 이라 하면
  // 사장님이 자기가 무엇을 망가뜨렸나로 읽는다. 갈래는 둘이면 충분하다.
  // 낡음이 **자막 설정뿐**이면 이미 있는 완성본은 멀쩡하다 — 옛 자막이 구워져 있을 뿐이다.
  // 그때까지 [내려받기]를 치우면, 색만 바꿔 보려다 재굽기가 실패한 사장님이 **있던 파일마저**
  // 못 받는다(재굽기 실패해도 설정 PATCH 는 이미 저장돼 낡음으로 잡힌다). 경고는 그대로 띄운다.
  const subtitleOnlyStale = isSubtitleOnlyStale(project);
  const staleMessage = subtitleOnlyStale
    ? "자막을 바꿨어요 — 다시 합치면 새 자막으로 나와요"
    : "컷을 고친 뒤라 이 영상은 옛 소리·옛 그림으로 만든 것이에요 — 다시 합쳐 주세요";

  // 고치는 중인가 — 저장된 설정과 지금 고른 값이 다른가.
  //
  // ★ 이것이 재생기의 갈림이다. 옛 화면은 **늘 자막 없는 원본**을 틀어서, 적용이 실제로
  // 되고 있어도(구운 파일은 설정을 정확히 반영한다) 사장님 눈에는 "영상이 그대로"였다.
  // 고치는 중에는 미리보기(원본 + 브라우저가 그리는 자막), 아니면 **진짜 완성본**을 튼다.
  // 그 갈림 자체는 편집기(components/SubtitleEditor.jsx)가 쥔다 — 두 흐름이 같아야 한다.
  const dirty = JSON.stringify(sub) !== JSON.stringify(seedSubtitle(project));

  // ★ 완성본 URL 은 늘 같다(/api/renders/<id>.mp4) — 다시 구워도 <video> 는 옛 파일을
  // 그대로 쓴다. 각인(render.ts)을 실어 다른 주소로 만든다. 라우트는 질의문자를 안 본다.
  const finalSrc = render?.url ? `${render.url}?v=${render.ts || 0}` : null;

  if (!clipCount) return <p className="pgsub">영상을 먼저 만들어 주세요.</p>;

  // ★ panel--stage — 완성 화면 전용 폭이다. panel--narrow(760 고정)는 대본·구성·브리핑도
  // 함께 쓰므로 건드리지 않는다. 여기만 내용에 맞춰 자라고(최대 960), 그 폭을 정하는 것은
  // 영상 비율이다(편집기가 상자에 --ar 로 실어 준다).
  return (
    <section className="panel panel--narrow panel--stage">
      <h2>완성본을 내려받습니다 <span className="badge vlm">완성</span></h2>
      {err && <p className="pgsub warn">{err}</p>}
      {/* 지난번 시도가 왜 실패했는지 — 라우트가 render_error 에 남겨 둔다. 진입·새로고침으로
          err(이번 화면의 오류)이 비어 있어도 사유가 보여야 사장님이 다시 누를지 판단한다.
          err 이 있으면 같은 말이 두 번 나오므로 그때는 안 띄운다. 성공하면 null 로 지워진다. */}
      {!err && project?.render_error && <p className="pgsub warn">{project.render_error}</p>}

      {!render ? (
        <>
          <p className="pgsub">
            컷 {clipCount}개를 이어 붙이고 목소리와 자막을 얹어요 · 약 {Math.round(totalSeconds)}초
          </p>
          <div className="brief">
            <div className="brief-row"><b>이어붙이기</b><div className="val">컷 {clipCount}개를 순서대로</div></div>
            <div className="brief-row"><b>소리</b><div className="val">컷마다 읽은 목소리를 그대로</div></div>
            {/* ★ "화면에 태워요" 를 걷었다(2026-08-17 사용자 지적). ffmpeg 쪽 낱말(burn-in)이
                화면까지 새어 나온 자리다 — 사장님에게 "태운다"는 없애는 것처럼 들린다.
                뒷단 주석에서는 그 낱말을 그대로 쓴다(lib/subtitles.js 가 하는 일이 그것이다).
                화면 문구는 바로 위 안내("목소리와 자막을 얹어요")와 같은 말을 쓴다. */}
            <div className="brief-row"><b>자막</b><div className="val">컷마다 문장을 얹어요 — 틱톡·릴스 버튼에 가리지 않는 위치에</div></div>
            <div className="brief-row"><b>비율</b><div className="val">{project?.settings?.aspect_ratio || "9:16"}</div></div>
          </div>
        </>
      ) : render.fake ? (
        <>
          <p className="pgsub">합성까지 마쳤어요 — 약 {Math.round(render.seconds || 0)}초짜리로.</p>
          <div className="brief">
            <div className="brief-row">
              <b>파일</b>
              <div className="val">
                가짜 모드라 파일은 만들어지지 않았어요.
                <br />실제로 만들려면 <code className="mono">SHOTFORM_FAKE</code> 를 끄고 다시 눌러 주세요.
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {stale && (
            <div className="script-src warn">{staleMessage}</div>
          )}
          {render.noSubtitles && (
            <div className="script-src warn">
              이 합성 방식에서는 자막이 들어가지 않아요 (SHOTFORM_COMPOSER=fal)
            </div>
          )}
          {/* ★ 자막 편집기는 **한 벌이다**(components/SubtitleEditor.jsx) — reel 완성 화면도
              같은 것을 쓴다. 조절판을 **영상 왼쪽**에 세우는 것도(2026-08-13 사용자 요청)
              그 안이다. 여기서 넘기는 것은 **이 흐름에만 있는 것**뿐이다:
              언어 줄(topSlot) · 번역 검토(children) · [영상에 적용]의 두 갈래. */}
          <SubtitleEditor
            cuts={cuts}
            aspectRatio={project?.settings?.aspect_ratio}
            lang={lang}
            sub={sub}
            onChange={setSub}
            rawUrl={rawUrl}
            finalSrc={finalSrc}
            dirty={dirty}
            /* 자막 없는 원본이 없는 옛 프로젝트에서는 조절판을 안 그린다 —
                구워진 자막 위에 미리보기를 얹으면 자막이 둘로 보인다. */
            editable={!!rawUrl}
            applying={applying}
            busy={busy}
            onDragging={(v) => { dragRef.current = v; }}
            onApply={applyToVideo}
            /* ★★ 잠금이 `dirty` 하나였다(2026-08-18 사장님 지적: "언어를 바꾸면 적용
                버튼이 안 눌려"). 그 값은 **자막 설정**만 비교하는데, 언어는 고르는 즉시
                서버에 저장되므로(pickLang) 거기 안 걸린다 — 영상에는 옛 언어가 구워져
                있는데 버튼은 잠긴 채 "적용됨"이라고 말했다.
                ★ 잠금과 문구가 **같은 값**을 본다. 갈리면 잠긴 버튼이 "영상에 적용"이라
                  하거나 눌리는 버튼이 "적용됨"이라 한다. */
            applyDisabled={applying || busy || (!dirty && !stale)}
            applyLabel={applying || busy ? "영상에 반영하는 중…" : (dirty || stale) ? "영상에 적용" : "적용됨"}
            topSlot={(
              <>
                  <div className="sub-row">
                    <span className="sub-label">언어</span>
                    {/* 켜진 칩은 project.settings.subtitle_lang(서버가 저장한 값)에서만 나온다 —
                        고르는 순간 낙관적으로 켜면, 라우트가 번역을 못 써 저장을 접었을 때(502)
                        화면만 바뀐 채로 남는다. */}
                    <div className="chips">
                      {SUBTITLE_LANGS.map((l) => (
                        <button
                          key={l.id}
                          className={`chip${lang === l.id ? " on" : ""}`}
                          disabled={langBusy || applying}
                          onClick={() => pickLang(l.id)}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* ★ 옮기는 데 한참 걸린다 — 그 동안 바뀌는 것이 "칩이 회색이 된다" 하나뿐이면
                      사장님 눈에는 눌리지 않은 것과 같다. 셋을 함께 말한다: **무엇을**(고른 언어
                      이름) · **하는 중**(도는 표시) · **왜 걸리는지**(컷마다 옮긴다).
                      자리는 오류 문구와 같은 자리다 — 언어 줄 바로 아래라 시선이 이미 거기 있다.
                      ⚠️ 칩 안에 넣지 않는다: 이 줄의 칩은 줄바꿈이 막혀 있어(.sub-row .chips)
                         글자가 늘면 칩이 칸 밖으로 밀린다. */}
                  {langBusy && (
                    <p className="pgsub">
                      <span className="spinner" />
                      {SUBTITLE_LANGS.find((l) => l.id === langBusy)?.label}로 옮기는 중이에요 — 컷마다 옮겨서 잠깐 걸려요
                    </p>
                  )}
                  {langErr && <p className="pgsub warn">{langErr}</p>}
              </>
            )}
          >
            {lang !== "ko" && (
              <div className="plan-list sub-translations">
                <div className="eyebrow">번역 검토 <small>눌러서 고쳐요 — 고치면 지금 원문 기준으로 다시 낡지 않아요</small></div>
                {cuts.filter((c) => !c.silent).map((c) => {
                  const stale = isSubtitleStale(c, lang, sourceLang);
                  const translated = c.subtitles?.[lang]?.text || "";
                  return (
                    <div className="plan-row" key={c.idx}>
                      <span className="num">{c.idx + 1}</span>
                      <div className="plan-body">
                        <div className="preview-sentence">“{c.sentence}”</div>
                        <div className="plan-field">
                          <b>번역</b>
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            className="editable"
                            onBlur={(e) => {
                              const v = e.currentTarget.textContent.trim();
                              if (v && v !== translated) saveTranslation(c.idx, v);
                            }}
                          >
                            {translated || "(아직 번역이 없어요)"}
                          </span>
                        </div>
                        {stale && (
                          <div className="badges">
                            <span className="badge warn">번역이 낡았어요</span>
                            <button className="mini" disabled={langBusy} onClick={() => pickLang(lang)}>
                              다시 번역
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SubtitleEditor>

          {/* 원본이 없는 옛 프로젝트 — 자막이 이미 구워져 있어 그 위에 미리보기를 얹을 수 없다.
              조절 UI 를 그냥 숨기기만 하면 사장님은 이 기능이 있는지조차 모른다. 아래에 이미
              있는 [다시 합치기]로 이어 준다 — 한 번 다시 만들면 원본이 함께 남는다. */}
          {!rawUrl && (
            <p className="pgsub">
              자막을 옮기거나 폰트·색·크기를 고치려면 아래 [다시 합치기]로 완성본을 한 번 다시 만들어 주세요.
            </p>
          )}
        </>
      )}

      {/* --result — 결과를 받는 줄이다. 큰 버튼 치수가 이 이름 아래에만 산다(globals.css) */}
      <div className="step-actions step-actions--result">
        <BackButton stepKey="done" />
        {/* 완성본이 있으면 사장님이 하고 싶은 일은 내려받기다 — 그것을 주 버튼으로 둔다.
            다시 합치기는 컷을 고쳤을 때만 쓰는 보조 동작이다. */}
        <div className="fwd">
          {render && !render.fake && render.url && (!stale || subtitleOnlyStale) ? (
            <>
              {/* ★ 조절 패널이 있으면 [영상에 적용] 하나가 두 길을 다 맡는다 — 여기에
                  [다시 합치기]를 또 두면 어느 것이 영상에 반영하는 버튼인지 알 수 없다.
                  패널이 없는 옛 프로젝트(원본 없음)에서만 이 길이 필요하다. */}
              {!rawUrl && (
                <button className="mini" disabled={busy} onClick={start}>
                  {busy ? "합치는 중…" : "다시 합치기"}
                </button>
              )}
              {/* ★ ?dl=1 — 서명 URL 로 302 하면 다른 출처가 되어 아래 속성이 무시된다.
                  첨부로 내려줄지를 Storage 가 정하게 하는 신호다(app/api/renders/[name]).
                  ⚠️ 이 주석에 그 속성 이름을 적지 마라 — tests/staleness-ui.test.js 가
                  낱말의 첫 등장으로 앵커를 찾는다(적었다가 그 테스트를 깼다). */}
              <a className="cta" href={`${render.url}?dl=1`} download>
                내려받기
              </a>
            </>
          ) : (
            <>
              {/* ★ 조절 패널이 있는 상태(완성본 + 원본이 있다)에서는 영상을 만드는 버튼이
                  위의 [영상에 적용] 하나다 — 여기에 또 두면 둘 중 무엇을 눌러야 반영되는지
                  알 수 없다. 컷이 낡은 경우도 그 버튼이 전체 재합성으로 보낸다. */}
              <span className="hint">
                {render && rawUrl
                  ? "위의 [영상에 적용]을 누르면 지금 내용으로 다시 만들어요"
                  : stale
                  ? "다시 합치면 지금 내용으로 내려받을 수 있어요"
                  : render
                  ? "컷을 고쳤다면 다시 합쳐 주세요"
                  : "합치는 데 조금 걸려요"}
              </span>
              {!(render && rawUrl) && (
                <button className="cta" disabled={busy} onClick={start}>
                  {busy ? "합치는 중…" : render ? "다시 합치기" : "완성본 만들기"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
