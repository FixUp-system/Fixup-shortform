"use client";

// 보관함 상세 — **보는 화면**이다. 만드는 화면이 아니다.
//
// 왜 새 화면인가(2026-08-14 사용자 요청): 보관함에서 카드를 누르면 곧장 제작 화면으로
// 갔다(/ads/[id]·/create/[id]). 그런데 거기서 하려던 일은 대개 "이게 무슨 영상이었지"를
// 확인하는 것인데, 제작 화면은 **유료 버튼을 들고 있다** — 확인하러 들어갔다가 값이
// 나가는 문 앞에 서게 된다. 그래서 보는 자리와 고치는 자리를 가른다.
//
// ★ 한 화면이 세 종류를 다 받는다(광고 kind:"ad" · 한 번에 굽기 kind:"film" · 기종 단계별).
//   읽는 문이 종류마다 갈려 있어서(서로를 404 로 거절한다) **차례로 두드린다.**
//   주소만으로는 종류를 알 수 없기 때문이다.
// ★ 값이 나가는 버튼은 여기 없다. 이어서 작업하려면 [이어서 작업하기]로 제작 화면에 간다.
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { adModel } from "../../../lib/ad/models";
import { I2V_MODELS, modelIdForProject, resolutionForProject } from "../../../lib/clip-limits";
import { axesOf, motionAxisFor } from "../../../lib/motion";
import { archiveVideoUrl } from "../../../lib/archive/video";
// 사람이 읽는 값으로 옮기는 자리 — 화풍 라벨과 붙인 레퍼런스(lib/archive/spec.js).
// 화면 안 삼항식으로 두면 값으로 잴 방법이 없다(옆 파일이 그 이유로 생겼다).
import { styleLabelOf, archiveRefs } from "../../../lib/archive/spec";
// 한 번에 굽는 영상의 단계 표 — 주소는 여기서만 만든다(화면이 손으로 적으면 표와 갈린다).
import { FILM_STEPS, filmStepHref, currentFilmStepKey } from "../../../lib/film/steps";
import { PICKABLE_FILM_MODES } from "../../../lib/film/mode";
// reel(컷마다 직접 말하는 영상)의 단계 표 — 같은 이유로 여기서만 주소를 만든다.
// ★★ 2026-08-21 리뷰 A1·A4 — isReelStepReachable·currentReelStepKey 를
//   lib/reel/steps.js 로 옮긴 것이 바로 이 소비자 때문이다(이 화면도 film 처럼
//   "지금 있어야 할 단계"로 보낸다).
import { REEL_STEPS, reelStepHref, currentReelStepKey } from "../../../lib/reel/steps";
// reel 은 **한 장 + 한 벌**로 만든다 — 보여 줄 프롬프트가 둘이다(아래 주석 참고).
//   판정은 lib 하나다(planReelBake) — 화면이 초를 다시 세면 제작 화면과 갈린다.
import { planReelBake, reelWholePrompt } from "../../../lib/reel/oneshot";

// 한 줄짜리 정보. 값이 없으면 줄째 안 그린다 — 빈 칸을 늘어놓으면 무엇이 없는지가 아니라
// 화면이 덜 만들어진 것처럼 보인다.
function Row({ label, children }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="brief-row">
      <b>{label}</b>
      <div className="val">{children}</div>
    </div>
  );
}

function ArchiveDetailPageBody() {
  // ★ 어디서 왔는지 주소가 말해 준다(2026-08-19). [보관함으로]가 **두 곳**이라 값을
  //   한 자리에서 판다 — 두 번 적으면 언젠가 한쪽만 고쳐져 갈린다.
  const backTo = useSearchParams().get("scope") === "all" ? "/archive?scope=all" : "/archive";
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      // 종류 전용 문을 먼저 묻고, 아니면 기존(단계별) 문으로 간다. 전용 문의 응답은
      // kind 를 달고 와서 한 번에 판정된다(양방향 격리라 서로를 404 로 거절한다).
      //
      // ★ film 문을 빠뜨리면 film 카드는 **눌러도 아무것도 안 열린다** — /api/ads 도
      //   /api/projects 도 그 문서를 404 로 거절하기 때문이다(2026-08-19에 실제로 그랬다).
      //   종류가 늘 때 여기 한 줄을 더하는 것을 tests/step-doc-gate.test.js 가 잰다.
      // ★★ 2026-08-21 리뷰 A1 — reel 이 정확히 그 상태였다: 사이드바 진입점도 없었고
      //   이 배열에도 없어서 주소를 직접 쳐야만 열렸다. `/api/reel/${id}` 를 더한다
      //   (app/api/reel/[id]/route.js — 이 태스크(Task 12) 도중에야 생긴 문).
      for (const url of [`/api/ads/${id}`, `/api/film/${id}`, `/api/reel/${id}`, `/api/projects/${id}`]) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const data = await res.json();
          if (alive) setDoc(data);
          return;
        } catch {
          // 다음 문을 두드린다
        }
      }
      if (alive) setErr("찾을 수 없어요 — 지워졌거나 다른 계정의 영상일 수 있어요");
    })();
    return () => { alive = false; };
  }, [id]);

  if (err) {
    return (
      <>
        <h1 className="pgtitle">{err}</h1>
        <Link href={backTo} className="cta">보관함으로</Link>
      </>
    );
  }
  if (!doc) return <p className="pgsub">불러오는 중…</p>;

  const isAd = doc.kind === "ad";
  // ★ film 도 여기까지 온다(2026-08-19). 갈라 두지 않으면 "종류가 없는 옛 문서"로 떨어져
  //   [이어서 작업하기]가 단계별 화면(/create/…)을 가리킨다 — 그 화면의 문은 film 문서를
  //   404 로 거절하므로 눌러도 막다른 길이다.
  const isFilm = doc.kind === "film";
  // ★★ 2026-08-21 리뷰 A1 — reel 도 같은 이유로 갈라 둔다. 안 가르면 "종류가 없는 옛
  //   문서"로 떨어져 [이어서 작업하기]가 /create/… 를 가리키는데, 그 화면의 문
  //   (GET /api/projects/[id])은 kind:"reel" 문서를 404 로 거절한다(위 for 루프와 같은
  //   격리, lib/projects.js 의 isStepDoc).
  const isReel = doc.kind === "reel";
  const s = doc.settings || {};
  // ★★ 2026-08-27 — reel 이 보여 주는 것은 **컷별 지시가 아니라 프롬프트 둘**이다
  //   (사장님 지시: "영상 생성하는 방식이 변경되었기 때문에 이미지 생성 프롬프트와
  //   영상 프롬프트로 변경해줘").
  //
  //   뿌리 — 이 흐름은 이제 **스토리보드 한 장**을 그리고 그 한 장을 통째로 넘겨 굽는다.
  //   컷마다 문장·화면·움직임을 적어 컷별로 만들던 시절의 표를 그대로 보여 주면,
  //   **이 영상이 실제로 어떻게 만들어졌는지를 잘못 말하는 화면**이 된다.
  //
  //   · 이미지 생성 프롬프트 — 그 한 장을 그린 글. 칸마다 같은 값이 각인돼 있다
  //     (app/api/reel/[id]/images/route.js 의 `of`) — 그래서 **첫 값 하나**면 된다.
  //   · 영상 프롬프트 — 통짜는 한 벌(reelWholePrompt: 사장님이 ④에서 고쳤으면 그 글,
  //     아니면 시나리오 원문), 컷별(16초 이상)은 컷마다의 지문이다.
  //     ★ 여기서 doc.scenario.text 를 그냥 쓰면 **고친 프롬프트가 안 보인다** — 옛 화면이
  //       그랬다(고쳐 놓고도 보관함에는 원문이 떴다).
  const reelImagePrompt = isReel ? (doc.cuts || []).map((c) => c.image?.of).find(Boolean) || "" : "";
  const reelOneShot = isReel && planReelBake(doc).mode === "oneshot";
  const reelWhole = isReel ? reelWholePrompt(doc) : "";
  const reelCutPrompts = isReel ? (doc.cuts || []).map((c) => c.clip_prompt || "") : [];
  const reelHasCutPrompts = reelCutPrompts.some(Boolean);
  // 한 벌로 보여 줄 것인가 — 통짜이거나, 컷별 지문이 아직 하나도 없을 때다(그때는
  // 굽기가 읽을 글이 시나리오 원문 하나다).
  const reelShowsWhole = reelOneShot || !reelHasCutPrompts;
  const reelHasVideoPrompt = reelShowsWhole ? !!reelWhole : reelHasCutPrompts;
  // 완성본 주소 — 종류마다 사는 자리가 다르다. 판정은 순수 함수 한 벌이다(lib/archive/video.js).
  // ★ 화면 안 삼항식으로 두었더니 film 갈래만 **객체**를 내서 재생·내려받기가 둘 다 죽었다.
  //   그 함수의 주석에 왜 값으로 재야 하는지가 있다.
  // ★★ 2026-08-21 리뷰 C2 — reel 갈래도 그 함수 **안에** 있다(lib/archive/video.js).
  //   한때 이 화면 안에서 doc.reel?.video?.url 을 직접 판독했는데, 그것이 바로 그 파일이
  //   막으려는 사고였다(판독이 화면으로 되돌아가면 다음 종류가 늘 때 또 갈릴 수 있다).
  const video = archiveVideoUrl(doc);
  // 이어서 작업하는 자리 — 종류마다 제작 화면이 다르다.
  // ★★ 한 번에 굽는 영상은 **단계별 흐름**으로 보낸다(2026-08-20). 사이드바 메뉴와 같은
  //   곳이어야 한다 — 갈리면 어느 문으로 들어왔느냐에 따라 다른 화면이 나온다.
  // ★ 주소를 손으로 적지 않는다. lib/film/steps.js 의 표가 만든다 — 세그먼트를 바꿀 때
  //   여기만 옛 주소로 남으면 시험은 그린인데 눌러 보면 404 다(오늘 그 사고를 겪었다).
  // ★ 지금 있어야 할 단계로 보낸다. 시나리오가 없으면 시나리오로, 그림이 있으면 영상으로 —
  //   가드가 어차피 그리로 돌려보내지만, 처음부터 맞게 보내면 화면이 한 번 덜 튄다.
  const filmHref = () => {
    const mode = PICKABLE_FILM_MODES[0].id;
    const step = FILM_STEPS.find((s) => s.key === currentFilmStepKey(doc, mode));
    return filmStepHref(step, id, mode);
  };
  // ★★ 2026-08-21 리뷰 A1 — reel 도 같은 결이다: 지금 있어야 할 단계로 보낸다(시나리오가
  //   없으면 시나리오로, 클립까지 다 있으면 완성으로). 주소는 lib/reel/steps.js 의 표가
  //   만든다 — 손으로 적으면 세그먼트를 바꿀 때 여기만 옛 주소로 남는다.
  const reelHref = () => {
    const step = REEL_STEPS.find((s) => s.key === currentReelStepKey(doc));
    return reelStepHref(step, id);
  };
  const workHref = isAd ? `/ads/${id}` : isFilm ? filmHref() : isReel ? reelHref() : `/create/${id}/briefing`;
  // 모델은 **전체 이름**으로 적는다 — 여기는 모델 묶음 밖이라 "2.0" 만 적으면 무엇의
  // 2.0 인지 알 수 없다. 이름은 표에서 온다(화면이 짓지 않는다).
  //
  // ★ film 은 이 표들(광고표·단계별 I2V 표) 중 어디에도 없다. 억지로 태우면 화면이 **그 문서에
  //   없는 모델·화질을 지어낸다** — 없는 값은 줄째 안 그리는 것이 이 화면의 규칙이다(Row).
  const modelId = isAd ? s.model : isFilm ? null : modelIdForProject(doc);
  const modelLabel = isFilm
    ? null
    : isAd
      ? adModel(s.model)?.name || adModel(s.model)?.label
      : I2V_MODELS.find((m) => m.id === modelId)?.label || modelId;
  const resolution = isAd ? s.resolution : isFilm ? null : resolutionForProject(doc);
  const seconds = isAd ? s.seconds : isFilm ? s.seconds ?? null : s.target_seconds;
  // ★ 화풍은 표(lib/styles.js)의 라벨로 옮긴다 — 그전에는 id 가 그대로 떴다(`vlog`).
  const styleLabel = styleLabelOf(doc);
  // ★ 붙인 사진 — 장수가 아니라 그림과 종류를 보여 준다.
  const refs = archiveRefs(doc);

  return (
    <>
      <h1 className="pgtitle">
        {isAd ? "원클릭 영상" : isFilm ? "한 번에 굽는 영상" : isReel ? "단계별 영상" : "영상 만들기 (단계별)"}
      </h1>
      <p className="pgsub">이 영상이 어떻게 만들어졌는지 볼 수 있어요.</p>

      <section className="panel panel--library">
        <div className="done-stage">
          <div className="sub-eyebrow">만든 정보</div>

          <div className="sub-editor">
            <div className="brief">
              {/* ★★★ 2026-09-01 사장님 지시 — **한눈에 들어오게.** 그전에는 사양 다섯이
                  줄 다섯을 차지해, 정작 궁금한 "어떻게 만들었나"가 세로로 흩어져 있었다.
                  한 줄 칩으로 모으면 훑는 눈이 한 번에 지나간다.
                  ★ 없는 값은 칩째 안 그린다 — 이 화면의 규칙 그대로다(Row 와 같은 뜻).
                  ★ 화풍은 **라벨**로 그린다(lib/archive/spec.js) — 그전에는 `s.style` 을
                    그대로 그려 `vlog` 라는 영어 id 가 새어 나왔다. 옆 값들은 전부
                    사람 말이었으므로 거기만 깨져 보였다. */}
              <div className="spec-chips">
                {modelLabel && <span className="spec-chip"><b>모델</b>{modelLabel}</span>}
                {seconds ? <span className="spec-chip"><b>길이</b>{seconds}초</span> : null}
                {resolution && <span className="spec-chip"><b>화질</b>{resolution}</span>}
                {s.aspect_ratio && <span className="spec-chip"><b>비율</b>{s.aspect_ratio}</span>}
                {styleLabel && <span className="spec-chip"><b>화풍</b>{styleLabel}</span>}
              </div>

              {/* ★★★ **붙인 레퍼런스를 그림으로 보여 준다**(사장님 지시: "사용자가 첨부한
                  레퍼런스는 어떤건지"). 그전에는 "3장"이라고만 적혀 있어서, 무엇을 붙였는지
                  알려면 제작 화면까지 들어가야 했다.
                  ★ 종류(로고·제품·인물)를 함께 적는다 — 같은 사진이라도 모델에게 시킨 일이
                    다르다(lib/photos.js 의 PHOTO_ROLES). */}
              {refs.length > 0 && (
                <div className="brief-refs">
                  {refs.map((r) => (
                    <figure className="ref-card" key={r.id || r.url}>
                      <img src={r.url} alt={r.label} loading="lazy" />
                      <figcaption>{r.label}</figcaption>
                    </figure>
                  ))}
                </div>
              )}

              <Row label="사용자 입력">
                {doc.material?.text ? (
                  <span className="script-src">{doc.material.text}</span>
                ) : null}
              </Row>
            </div>

            {/* 영상을 만든 글 — 광고·reel 은 시나리오 지시문 하나, 단계별은 원고다.
                ★ **접어 둔다.** 시나리오는 4,000자까지라 펼쳐 두면 위의 짧은 정보(모델·길이)가
                  저 아래로 밀린다. <details> 를 쓰는 이유: 키보드·스크린리더 동작이 이미
                  붙어 있다 — useState 로 흉내 내면 그것을 직접 만들어야 하고 대개 빠뜨린다.
                ★★ 2026-08-21 리뷰 A1 — reel 도 doc.scenario.text 다(lib/ad/scenario.js 의
                  generateScenario 를 그대로 쓴다, app/api/reel/[id]/scenario/route.js) —
                  광고와 같은 자리라 조건에 더한다. reel 에는 doc.script 가 아예 없어서
                  안 더하면 이 화면에 프롬프트 글이 통째로 안 보인다. */}
            {isAd && doc.scenario?.text && (
              <details className="lib-fold">
                <summary>프롬프트 — 영상 모델에 넘긴 글</summary>
                <p className="script-src">{doc.scenario.text}</p>
              </details>
            )}

            {/* ── reel — **프롬프트 둘**이다(2026-08-27). 만드는 방식이 그렇기 때문이다:
                한 장을 그리고(이미지 생성 프롬프트) 그 한 장을 통째로 넘겨 굽는다(영상 프롬프트). */}
            {isReel && reelImagePrompt && (
              <details className="lib-fold">
                <summary>이미지 생성 프롬프트</summary>
                <p className="script-src">{reelImagePrompt}</p>
              </details>
            )}
            {isReel && reelHasVideoPrompt && (
              <details className="lib-fold">
                <summary>
                  영상 프롬프트
                  {/* ★ 컷별 갈래(16초 이상)에서만 개수를 말한다 — 통짜는 한 벌이라
                      "1개"라고 적으면 없는 단위를 지어내는 것이다. */}
                  {reelShowsWhole ? "" : ` — 컷 ${reelCutPrompts.length}개`}
                </summary>
                {reelShowsWhole ? (
                  <p className="script-src">{reelWhole}</p>
                ) : (
                  <div className="plan-list">
                    {reelCutPrompts.map((body, i) => (
                      <div className="plan-row" key={i}>
                        <span className="num">{i + 1}</span>
                        <div className="plan-body">
                          <span className="script-src">{body || "-"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </details>
            )}
            {!isAd && !isReel && doc.script?.text && (
              <details className="lib-fold">
                <summary>프롬프트 — 낭독한 원고</summary>
                <p className="script-src">{doc.script.text}</p>
              </details>
            )}

            {/* 장면·컷 — 광고는 shots, 단계별은 cuts. 이름만 다르고 사장님이 보는 것은 같다.
                ★★ reel 은 여기 안 온다(2026-08-27) — 위의 프롬프트 둘이 그 자리를 대신한다.
                   컷별 문장·화면·움직임은 **컷마다 따로 굽던 시절**의 표라, 한 장으로 만드는
                   지금 그것을 보여 주면 만들어진 방식을 잘못 말하게 된다. */}
            {!isReel && (isAd ? doc.scenario?.shots : doc.cuts)?.length > 0 && (
              <details className="lib-fold">
                <summary>장면 {(isAd ? doc.scenario.shots : doc.cuts).length}개 — 컷별 지시</summary>
                <div className="plan-list">
                  {(isAd ? doc.scenario.shots : doc.cuts).map((c, i) => (
                    <div className="plan-row" key={i}>
                      <span className="num">{i + 1}</span>
                      <div className="plan-body">
                        {Number.isFinite(c.seconds) && <span className="badge">{c.seconds}초</span>}
                        {isAd ? (
                          <>
                            <div className="plan-field"><b>역할</b><span>{c.beat || "-"}</span></div>
                            <div className="plan-field"><b>카메라</b><span>{c.camera || "-"}</span></div>
                            {c.line && <div className="plan-field"><b>대사</b><span>{c.line}</span></div>}
                          </>
                        ) : (
                          <>
                            <div className="plan-field"><b>문장</b><span>{c.sentence || "-"}</span></div>
                            <div className="plan-field"><b>화면</b><span>{c.shows || "-"}</span></div>
                            {/* 움직임 — ★ 순서가 lib/cuts.js 의 buildClipPrompt 와 같아야 한다:
                                축이 있으면 축을, 없으면 옛 motion 을, 그것도 없으면 폴백 문구를.
                                여기가 보여 주는 것은 "이 영상이 어떻게 만들어졌는가"라서,
                                프롬프트가 안 쓰는 값을 적으면 그 자리에서 거짓말이 된다
                                (옛 motion 만 그리던 시절이 그랬다 — 축을 가진 컷은 안 쓰는
                                 값을 보여 주고, 축만 있는 컷은 움직임 줄이 통째로 사라졌다).
                                이름표는 MOTION_AXES 의 label 에서 온다 — 목록에서 축 한 줄을
                                빼면 여기서도 함께 사라진다.
                                ⚠️ 편집 칸을 두지 않는다. 여기는 보는
                                   자리다 — 그 성격을 바꾸지 않는다. */}
                            {(() => {
                              const axes = axesOf(c);
                              if (axes.length > 0) {
                                return axes.map((a) => (
                                  <div className="plan-field" key={a.id}>
                                    <b>{motionAxisFor(a.id)?.label}</b><span>{a.text}</span>
                                  </div>
                                ));
                              }
                              return (
                                <div className="plan-field">
                                  <b>움직임</b><span>{c.motion || "거의 정지, 아주 느린 카메라 이동"}</span>
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* 완성본 — 아직 없으면 그 자리를 비워 두지 않고 그렇게 말한다 */}
          <div className="preview-pane done-preview">
            {video ? (
              <div className="preview-frame">
                <video className="preview-video" controls src={video} />
              </div>
            ) : (
              // 자리를 비워 두지 않는다 — 글자만 남으면 이 칸이 글자 높이로 쪼그라들어
              // 왼쪽 정보 칸과 나란히 서지 못한다(2026-08-19 실측 360×40).
              <div className="empty-frame">
                <p>
                  아직 완성본이 없어요
                  <span>마지막 단계까지 만들면 여기에서 볼 수 있어요</span>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="step-actions">
          <Link href={backTo} className="mini">보관함으로</Link>
          <div className="fwd">
            {video && (
              <a className="mini" href={`${video}?dl=1`} download>내려받기</a>
            )}
            {/* ★ 값이 나가는 버튼은 이 화면에 없다 — 만드는 일은 제작 화면에서 한다.
                ★ 고칠 수 없는 영상이면 이 길도 안 그린다 — 눌러도 404 이기 때문이다.
                ★★ 2026-09-01 — 판정이 `mine` 에서 **`editable`** 로 바뀌었다.
                  옛 주석은 "제작 화면은 소유자만 열 수 있다"였는데 **그 전제가 낡았다**:
                  2026-08-27 부터 운영자는 남의 것도 고칠 수 있다(lib/projects.js 의
                  ownerScope). 즉 뒷문은 이미 열려 있었고 이 문만 옛 전제로 닫혀 있었다.
                  ★ 지우기는 그대로 `mine` 이다(components/ProjectCards.jsx).
                  옛 응답에 editable 이 없을 수 있으므로 **false 일 때만** 감춘다. */}
            {doc.editable !== false && (
              <Link href={workHref} className="cta">이어서 작업하기 →</Link>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

// ★ useSearchParams 는 Suspense 경계 안에서만 쓸 수 있다(Next App Router).
export default function ArchiveDetailPage() {
  return (
    <Suspense fallback={null}>
      <ArchiveDetailPageBody />
    </Suspense>
  );
}
