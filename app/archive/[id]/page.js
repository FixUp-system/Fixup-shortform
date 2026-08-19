"use client";

// 보관함 상세 — **보는 화면**이다. 만드는 화면이 아니다.
//
// 왜 새 화면인가(2026-08-14 사용자 요청): 보관함에서 카드를 누르면 곧장 제작 화면으로
// 갔다(/ads/[id]·/create/[id]). 그런데 거기서 하려던 일은 대개 "이게 무슨 영상이었지"를
// 확인하는 것인데, 제작 화면은 **유료 버튼을 들고 있다** — 확인하러 들어갔다가 값이
// 나가는 문 앞에 서게 된다. 그래서 보는 자리와 고치는 자리를 가른다.
//
// ★ 한 화면이 두 종류를 다 받는다(광고 kind:"ad" · 기존 단계별). 읽는 문이 갈려 있어서
//   (/api/ads/[id] 와 /api/projects/[id] 가 서로를 404 로 거절한다) **광고를 먼저 묻고
//   아니면 기존 문으로** 간다. 주소만으로는 종류를 알 수 없기 때문이다.
// ★ 값이 나가는 버튼은 여기 없다. 이어서 작업하려면 [이어서 작업하기]로 제작 화면에 간다.
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { adModel } from "../../../lib/ad/models";
import { I2V_MODELS, modelIdForProject, resolutionForProject } from "../../../lib/clip-limits";
import { axesOf, motionAxisFor } from "../../../lib/motion";

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
      // 광고를 먼저 묻는다 — 기존 문서가 훨씬 많지만, 광고 쪽 응답이 kind 를 달고 와서
      // 한 번에 판정된다. 404 면 기존 문으로 간다(양방향 격리라 서로를 404 로 거절한다).
      for (const url of [`/api/ads/${id}`, `/api/projects/${id}`]) {
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
  const s = doc.settings || {};
  // 완성본 — 광고는 videos[0], 단계별은 render 다. 둘 다 없으면 아직 안 만든 것이다.
  const video = isAd ? doc.videos?.[0]?.url : doc.render?.url;
  // 이어서 작업하는 자리 — 종류마다 제작 화면이 다르다.
  const workHref = isAd ? `/ads/${id}` : `/create/${id}/briefing`;
  // 모델은 **전체 이름**으로 적는다 — 여기는 모델 묶음 밖이라 "2.0" 만 적으면 무엇의
  // 2.0 인지 알 수 없다. 이름은 표에서 온다(화면이 짓지 않는다).
  const modelId = isAd ? s.model : modelIdForProject(doc);
  const modelLabel = isAd
    ? adModel(s.model)?.name || adModel(s.model)?.label
    : I2V_MODELS.find((m) => m.id === modelId)?.label || modelId;
  const resolution = isAd ? s.resolution : resolutionForProject(doc);
  const seconds = isAd ? s.seconds : s.target_seconds;

  return (
    <>
      <h1 className="pgtitle">{isAd ? "광고 영상" : "영상 만들기 (단계별)"}</h1>
      <p className="pgsub">이 영상이 어떻게 만들어졌는지 볼 수 있어요.</p>

      <section className="panel panel--library">
        <div className="done-stage">
          <div className="sub-eyebrow">만든 정보</div>

          <div className="sub-editor">
            <div className="brief">
              <Row label="사용자 입력">
                {doc.material?.text ? (
                  <span className="script-src">{doc.material.text}</span>
                ) : null}
              </Row>
              <Row label="사진">
                {doc.material?.photos?.length ? `${doc.material.photos.length}장` : null}
              </Row>
              <Row label="모델">{modelLabel || null}</Row>
              <Row label="길이">{seconds ? `${seconds}초` : null}</Row>
              <Row label="화질">{resolution || null}</Row>
              <Row label="비율">{s.aspect_ratio || null}</Row>
              <Row label="화풍">{s.style?.preset || s.style || null}</Row>

            </div>

            {/* 영상을 만든 글 — 광고는 시나리오 지시문 하나, 단계별은 원고다.
                ★ **접어 둔다.** 시나리오는 4,000자까지라 펼쳐 두면 위의 짧은 정보(모델·길이)가
                  저 아래로 밀린다. <details> 를 쓰는 이유: 키보드·스크린리더 동작이 이미
                  붙어 있다 — useState 로 흉내 내면 그것을 직접 만들어야 하고 대개 빠뜨린다. */}
            {isAd && doc.scenario?.text && (
              <details className="lib-fold">
                <summary>프롬프트 — 영상 모델에 넘긴 글</summary>
                <p className="script-src">{doc.scenario.text}</p>
              </details>
            )}
            {!isAd && doc.script?.text && (
              <details className="lib-fold">
                <summary>프롬프트 — 낭독한 원고</summary>
                <p className="script-src">{doc.script.text}</p>
              </details>
            )}

            {/* 장면·컷 — 광고는 shots, 단계별은 cuts. 이름만 다르고 사장님이 보는 것은 같다. */}
            {(isAd ? doc.scenario?.shots : doc.cuts)?.length > 0 && (
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
                ★ 남이 만든 영상이면(mine === false) 이 길도 안 그린다: 제작 화면은
                  소유자만 열 수 있어(getProject 가 소유자를 요구한다) 눌러도 404 다.
                  옛 응답에 mine 이 없을 수 있으므로 **false 일 때만** 감춘다. */}
            {doc.mine !== false && (
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
