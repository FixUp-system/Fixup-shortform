"use client";

// /film/[mode] — 한 번에 굽는 영상. **한 화면이 두 방식을 다 받는다.**
//
// ★★ 왜 화면이 하나인가: 이 기능의 목적은 "장면 순서 vs 참고 그림 중 어느 쪽이 나은가"를
//   재는 것이다. 화면을 둘로 두면 한쪽에만 붙은 버튼·한쪽에만 뜬 안내가 그대로 실험 조건의
//   차이가 된다 — 그러면 결과의 차이가 방식 때문인지 화면 때문인지 알 수 없다.
//   갈리는 것은 주소의 mode 하나뿐이고, 그 뜻은 lib/film/mode.js 의 표가 정한다.
//
// ★ 프로젝트는 주소의 ?id 로 잇는다. 같은 프로젝트를 두 방식으로 굽는 것이 이 기능이라,
//   [다른 방식으로 굽기]는 **id 를 그대로 들고** 옆 방식으로 건너간다 — 그래야 두 편이
//   같은 시나리오를 쓴다(시나리오 라우트가 방식을 안 보는 이유와 같다).
//
// ⚠️ 상태 폴링은 아직 없다(상태 라우트가 다음 태스크다). 굽기를 접수하면 화면은 "만드는 중"
//   에서 멈추고, 사장님은 새로고침으로 확인한다 — 그 사실을 화면이 **말로 알린다**.
//   그동안 유료 버튼은 잠긴 채다.
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
// 방식의 표·판정은 여기 하나다. 라벨·귀띔을 화면에 복사하면 표와 갈린다.
// (mode.js·doc.js 는 import 가 없는 순수 모듈이라 "use client" 화면이 그대로 부를 수 있다.)
import { FILM_MODES, isFilmMode, filmMode } from "../../../lib/film/mode";
import { filmOf } from "../../../lib/film/doc";
import { ASPECTS, DEFAULT_ASPECT_ID, aspectFor } from "../../../lib/aspects";
// 사진 상한 — 서버(app/api/film/route.js)와 **같은 파일**에서 읽는다. 손으로 두 벌 적으면
// 화면은 통과시키는데 서버가 400 을 내고, 사장님은 다 올린 뒤에야 거절당한다.
import { MAX_PHOTOS } from "../../../lib/photos";

export default function FilmPage() {
  const { mode } = useParams();
  const router = useRouter();
  const search = useSearchParams();
  const id = search.get("id");

  const [project, setProject] = useState(null);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState([]); // {id, filename, url}
  const [aspect, setAspect] = useState(DEFAULT_ASPECT_ID);
  // busy 는 "지금 무슨 일을 시켰는가" 다(빈 문자열이면 아무 일도 안 시킨 것). 버튼 글자를
  // 바꾸는 데도 쓰므로 boolean 하나로 겸하지 않는다.
  const [busy, setBusy] = useState("");
  // 사진이 아직 올라가는 중인가. ★ busy 로 겸할 수 없다 — 2026-08-18 에 업로드가 0.57초
  // 져서 사진 0장으로 나갔고, 사진 없는 광고에 $3.63 을 치렀다. 이 경로에서 사진은
  // **그림의 참조**라 없으면 제품이 딴 물건으로 그려진다.
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  // 주소의 id 로 프로젝트를 읽는다. film 문서도 kind 가 "ad" 가 아니라 이 문을 지난다
  // (app/api/projects/[id]/route.js). 방식별 산출물은 이 문서 안의 films 에 두 벌로 있다.
  useEffect(() => {
    if (!id) { setProject(null); return; }
    let alive = true;
    fetch(`/api/projects/${id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) { setErr(data.error || "찾을 수 없어요"); return; }
        setProject(data);
      })
      .catch(() => { if (alive) setErr("불러오지 못했어요"); });
    return () => { alive = false; };
  }, [id]);

  // ★★ 실패를 삼키지 않는다. 굽기 202 뒤의 reload 가 조용히 실패하면 화면은 rendering 을
  //   모른 채 [굽기]를 다시 연다 — 그러면 **화면 잠금이 사라지고 서버가 유일한 방어선**이
  //   된다(서버는 409·400 으로 막지만, 방어선이 하나만 남는 것을 설계로 삼지 않는다).
  //   못 읽었으면 화면이 그렇게 말하고, 사장님은 새로고침으로 지금 상태를 확인한다.
  async function reload() {
    if (!id) return;
    try {
      const res = await fetch(`/api/projects/${id}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || "지금 상태를 확인하지 못했어요 — 새로고침해 주세요");
        return;
      }
      setProject(data);
    } catch {
      setErr("지금 상태를 확인하지 못했어요 — 새로고침해 주세요");
    }
  }

  async function onFiles(e) {
    const files = Array.from(e.target.files);
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setErr(`사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요`);
    // ★ 켜는 자리가 첫 await 앞이어야 한다. 뒤에 두면 그 사이에 눌린 버튼이 이미 이겼다.
    setUploading(true);
    try {
      for (const file of files.slice(0, Math.max(room, 0))) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setPhotos((p) => [...p, data]);
        else setErr(data.error || "업로드 실패");
      }
    } finally {
      // 실패해도 반드시 푼다 — 안 그러면 한 번 실패한 사장님은 버튼이 영영 잠긴다.
      setUploading(false);
      e.target.value = "";
    }
  }

  // 만들기 — 길이·화질·모델은 서버가 박는다(두 방식의 조건을 같게 두려고).
  // 여기서 고르는 것은 자료·사진·사이즈뿐이다.
  async function create() {
    setBusy("create"); setErr("");
    const res = await fetch("/api/film", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        material: { text, photos },
        settings: { aspect_ratio: aspect },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "만들지 못했어요"); setBusy(""); return; }
    setProject(data);
    // 주소에 id 를 실어 둔다 — 새로고침·뒤로가기가 살고, [다른 방식으로 굽기]가 이 id 를 쓴다.
    router.replace(`/film/${mode}?id=${data.id}`);
    setBusy("");
  }

  // 시나리오 — 무료(LLM 만 쓴다)이고 **두 방식이 공유한다**. 그래서 라우트가 방식을 안 본다.
  async function makeScenario() {
    setBusy("scenario"); setErr("");
    const res = await fetch(`/api/film/${id}/scenario`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(data.error || "시나리오를 만들지 못했어요"); setBusy(""); return; }
    setProject(data);
    setBusy("");
  }

  // 그림 — 방식마다 따로 만든다(장면 순서는 장면 수만큼, 참고 그림은 셋).
  // ★ 값이 나가는 자리다(장당 ≈$0.08). 잠금은 아래 locked 하나가 지킨다.
  async function makeImages() {
    setBusy("images"); setErr("");
    const res = await fetch(`/api/film/${id}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "그림을 만들지 못했어요");
    // 성공이든 실패든 문서를 다시 읽는다 — 실패도 films[mode].error 에 남아 있다.
    await reload();
    setBusy("");
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
    await reload();
    setBusy("");
  }

  // ★ 훅을 다 부른 뒤에 갈린다 — 조건부 return 을 훅 위에 두면 방식이 바뀔 때 훅 수가 달라진다.
  if (!isFilmMode(mode)) {
    return (
      <>
        <h1 className="pgtitle">한 번에 굽는 영상</h1>
        {/* ★ 조용히 한쪽으로 떨어뜨리지 않는다. 모르는 방식으로 값을 치르면 그 회차는
            실험으로 못 쓰는데, 값은 이미 나간 뒤다(lib/film/mode.js 의 filmMode 와 같은 규율). */}
        <p className="pgsub warn">모르는 방식이에요 — 아래에서 골라 주세요.</p>
        <div className="step-actions">
          {FILM_MODES.map((m) => (
            <Link key={m.id} className="mini" href={`/film/${m.id}`}>{m.label}</Link>
          ))}
        </div>
      </>
    );
  }

  const here = filmMode(mode);
  const other = FILM_MODES.find((m) => m.id !== mode);
  const film = filmOf(project, mode);
  const scenario = project?.scenario;
  // 굽는 중 — 폴링이 없으니 이 값은 새로고침해야 바뀐다. 그동안 유료 버튼은 잠긴다.
  const rendering = film.status === "rendering";
  // 그리는 중 — **rendering 과 대칭이어야 한다.** busy 는 이 탭에서 누른 것만 알아서,
  // 그리는 도중에 새로고침하면 busy 가 비어 [그림 만들기]가 다시 열렸다. 서버가 409 로
  // 막으니 값은 안 새지만, "누르고 400 을 보는 것과 못 누르는 것은 다르다"는 이 화면의
  // 규칙이 하필 장당 ≈$0.08 짜리 자리에서만 깨진다.
  // ★ 문서의 status 만 본다 — 잠금 만료(10분, lib/film/doc.js 의 FILM_IMAGE_LOCK_MS)는
  //   서버가 판정한다. 화면이 시각 계산을 따로 하면 두 판정이 갈리고, 갈리는 순간
  //   화면은 열려 있는데 서버가 막거나 그 반대가 된다.
  const drawing = film.status === "drawing";
  // 잠금 하나로 모은다. 버튼마다 조건을 따로 적으면 언젠가 한 곳이 빠지고, 그 자리가
  // 이중 청구의 문이 된다(이 저장소가 실제로 겪은 모양이다).
  const locked = !!busy || uploading || rendering || drawing;

  return (
    <>
      <h1 className="pgtitle">한 번에 굽는 영상</h1>
      {/* 라벨·귀띔은 표에서 읽는다 — 화면에 복사하면 표와 갈린다 */}
      <p className="pgsub">{here.label} · {here.hint}</p>
      {err && <p className="pgsub warn">{err}</p>}
      {/* ★★ 방식별 실패를 반드시 보여준다. 지금까지 실패는 문서에만 남고 읽는 곳이 없어서,
          사장님 화면은 영원히 "만드는 중"이었다(2026-08-14 에 같은 모양을 겪었다). */}
      {film.error && <p className="pgsub warn">{film.error}</p>}

      {!id && (
        <section className="panel--wide">
          <div className="composer">
            <textarea
              className="field composer-text"
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              placeholder="무엇을 만들고 싶으세요? 제품·강조하고 싶은 점·타깃을 자유롭게 적어 주세요"
            />

            {photos.length > 0 && (
              <div className="uploads">
                {photos.map((p) => (
                  <div key={p.id} className="up photo-mark">
                    <img src={p.url} alt={p.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button
                      className="tag"
                      disabled={locked}
                      onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))}
                    >
                      ✕ {p.filename.slice(0, 6)}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 사이즈만 고른다 — 길이·화질·모델은 서버가 박는다(두 방식의 조건을 같게 둔다).
                그 값들을 여기서 열면 두 편이 다른 조건으로 구워져 비교가 무너진다. */}
            <div className="composer-tray">
              <div className="tray-row">
                <span className="tray-label">사이즈</span>
                <div className="tray-col">
                  <div className="chips">
                    {ASPECTS.map((a) => (
                      <button
                        key={a.id}
                        className={`chip${aspect === a.id ? " on" : ""}`}
                        disabled={locked}
                        onClick={() => setAspect(a.id)}
                      >
                        {a.label} · {a.id}
                      </button>
                    ))}
                  </div>
                  <div className="tray-note">{aspectFor(aspect).note}에 맞는 규격이에요</div>
                </div>
              </div>
            </div>

            <div className="composer-bar">
              <button
                className="pill"
                disabled={locked || photos.length >= MAX_PHOTOS}
                onClick={() => fileRef.current?.click()}
              >
                ＋ 사진 {photos.length > 0 && <b>{photos.length}</b>}
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onFiles} />
              <span className="spacer" />
              {/* 사진이 다 올라가기 전에는 못 누른다 — 사진 없이 나가면 참조가 빈 채로 그려진다 */}
              <button className="cta" disabled={locked || !text.trim()} onClick={create}>
                {busy === "create" ? "만드는 중…" : uploading ? "사진 올리는 중…" : "시작하기 →"} <span className="cr">무료</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {id && !project && <p className="pgsub">불러오는 중…</p>}

      {id && project && (
        <>
          <section className="panel panel--wide">
            <h2>시나리오</h2>
            {/* 시나리오는 두 방식이 **공유한다** — 여기서 다시 쓰면 옆 방식의 영상도 그 시나리오로
                구워진다. 그래야 두 편의 차이가 방식 때문이라고 말할 수 있다. */}
            {scenario?.text ? (
              <p className="script-src">{scenario.text}</p>
            ) : (
              <p className="pgsub">시나리오를 만들어 주세요 — 무료예요.</p>
            )}
            <div className="step-actions">
              <button className="mini" disabled={locked} onClick={makeScenario}>
                {busy === "scenario" ? "쓰는 중…" : scenario?.text ? "다시 쓰기 · 무료" : "시나리오 만들기 · 무료"}
              </button>
            </div>
          </section>

          <section className="panel panel--wide">
            <h2>그림</h2>
            <p className="pgsub">{here.hint}</p>
            {drawing && (
              // 굽기와 **같은 결**로 알린다. 폴링이 없어 화면이 스스로 안 바뀌는데 그 말을
              // 안 하면, 사장님은 굳은 화면을 보며 계속 누른다(그 자리가 장당 ≈$0.08 이다).
              <p className="pgsub">그림을 그리는 중이에요 — 잠시 뒤 새로고침해서 확인해 주세요.</p>
            )}
            {film.images?.length > 0 && (
              <div className="uploads">
                {film.images.map((im) => (
                  <div key={im.key} className="up photo-mark">
                    <img src={im.url} alt={im.key} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                ))}
              </div>
            )}
            <div className="step-actions">
              {/* ★ 값이 나가는 자리다(장당 ≈$0.08). 시나리오가 없으면 아예 못 누른다 —
                  서버도 막지만, 누르고 나서 400 을 보는 것과 못 누르는 것은 다르다. */}
              <button className="mini" disabled={locked || !scenario?.text} onClick={makeImages}>
                {busy === "images" || drawing ? "그리는 중…" : film.images?.length ? "그림 다시 만들기" : "그림 만들기"}
              </button>
            </div>
          </section>

          <section className="panel panel--wide">
            <h2>굽기</h2>
            {rendering && (
              // 폴링이 아직 없다 — 화면이 스스로 안 바뀐다는 것을 말로 알린다.
              // 말 안 하면 사장님은 굳은 화면을 보며 [만들기]를 다시 누른다(그것이 이중 청구다).
              <p className="pgsub">영상을 만드는 중이에요 — 잠시 뒤 새로고침해서 확인해 주세요.</p>
            )}
            {film.video?.url && (
              <div className="preview-pane done-preview">
                <div className="preview-frame">
                  <video className="preview-video" controls src={film.video.url} />
                </div>
              </div>
            )}
            <div className="step-actions">
              <div className="fwd">
                <span className="hint">
                  {rendering || drawing ? "만드는 중에는 다시 누를 수 없어요" : "이대로 만들면 크레딧이 나가요 — 되돌릴 수 없어요"}
                </span>
                {/* ★★ 굽는 중이거나 그림을 만드는 중이면 잠긴다(locked). 두 번 누르면 회차가
                    두 번 열려 값이 두 번 걷힌다(app/api/film/[id]/render/route.js 의
                    openNewAttempt 주석 참고). 그림이 없으면 굽지 않는다 — 참조 없이 나가면
                    이 경로의 뜻이 사라지는데 값은 그대로 든다. */}
                <button className="cta" disabled={locked || !film.images?.length} onClick={startRender}>
                  {busy === "render" ? "시작하는 중…" : film.video?.url ? "다시 굽기 →" : "이대로 굽기 →"}
                </button>
              </div>
            </div>
          </section>

          {/* ★★ 비교가 이 기능의 목적이다. 같은 프로젝트(=같은 시나리오)를 옆 방식으로 굽는
              길이 없으면 A/B 가 성립하지 않는다 — id 를 그대로 들고 건너간다.
              방식별 산출물은 films 에 두 벌로 남으므로 이쪽 결과가 지워지지 않는다. */}
          {other && (
            <div className="step-actions">
              <Link className="mini" href={`/film/${other.id}?id=${id}`}>
                다른 방식으로 굽기 · {other.label}
              </Link>
              <div className="fwd">
                <Link className="mini" href="/archive">보관함으로</Link>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
