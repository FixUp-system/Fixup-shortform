"use client";

// 프로젝트 로드·단계 가드를 한 곳에서 — 각 단계 화면은 화면만 그린다.
// (app/create/[id]/layout.js 와 같은 구조다. 저쪽에서 배운 것이 여기서도 통해야 한다.)
//
// ★ 프로젝트는 film 전용 문(`/api/film/${id}`)으로 읽는다 — 실제 fetch 는
//   components/FilmProjectContext.jsx 의 reload 한 곳뿐이다(두 벌이면 갈린다).
//   단계별 흐름이 쓰는 문은 종류가 있는 문서를 404 로 막으므로 이 흐름에서 쓰면 안 된다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { FilmProjectProvider, useFilmProject } from "../../../components/FilmProjectContext";
import {
  FILM_STEPS, filmStepHref, filmStepFromPathname, currentFilmStepKey, isFilmStepReachable,
} from "../../../lib/film/steps";
import { FILM_MODES, isFilmMode } from "../../../lib/film/mode";

function Inner({ children }) {
  const { id } = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { project, reload } = useFilmProject();
  const [err, setErr] = useState("");

  // 주소에서 방식을 읽는다 — 방식별 단계는 `/film/<id>/<mode>/<seg>` 네 칸이다.
  // 공유 단계에는 방식이 없으므로 첫 방식으로 떨어진다(스테퍼의 링크를 만들 때만 쓴다).
  const parts = (pathname || "").split("/").filter(Boolean);
  const fromPath = parts.length === 4 ? parts[2] : null;
  // ★★ 주소에 방식이 있는데 **표에 없는 값**이면 조용히 떨어뜨리지 않는다(2026-08-20).
  //   떨어뜨리면 사장님은 자기가 무엇을 보고 있는지 모른 채 그 방식으로 그림을 그리고
  //   굽는다 — 값이 나간 뒤에야 다른 방식이었다는 것이 드러난다. lib/film/mode.js 의
  //   filmMode 가 던지는 이유가 정확히 이것이고, 옛 한 화면도 같은 자리를 갈라 두었다.
  // ★ 방식이 **아예 없는** 것(공유 단계)은 정상이다 — 그때만 첫 방식으로 떨어진다.
  const unknownMode = fromPath !== null && !isFilmMode(fromPath);
  const mode = isFilmMode(fromPath) ? fromPath : FILM_MODES[0].id;

  useEffect(() => {
    reload(id).catch((e) => setErr(e.message));
  }, [id, reload]);

  const step = filmStepFromPathname(pathname);
  useEffect(() => {
    if (!project || project.id !== id) return;
    if (step && isFilmStepReachable(step.key, project, mode)) return;
    const target = FILM_STEPS.find((s) => s.key === currentFilmStepKey(project, mode));
    router.replace(filmStepHref(target, id, mode));
  }, [project, id, step, mode, router]);

  // 못 찾은 이유는 대개 둘이다 — 지워졌거나 남의 것이거나. 어느 쪽이든 할 수 있는 일이
  // 같으니 나갈 길을 함께 준다. 문구만 덩그러니 두면 "여기서 뭘 해야 하지"로 막힌다.
  if (err) {
    return (
      <>
        <h1 className="pgtitle">{err}</h1>
        <p className="pgsub">주소가 잘못됐거나 다른 계정의 영상일 수 있어요.</p>
        <Link href="/archive" className="cta">보관함으로</Link>
      </>
    );
  }
  // ★ 모르는 방식 — 문구만 덩그러니 두지 않고 **나갈 길을 함께 준다**. 라벨은 표에서
  //   읽는다(화면에 복사하면 표와 갈린다). 프로젝트를 아직 못 읽었어도 보여 준다 —
  //   주소가 이미 틀렸으므로 기다릴 이유가 없다.
  if (unknownMode) {
    const step = filmStepFromPathname(pathname);
    return (
      <>
        <h1 className="pgtitle">한 번에 굽는 영상</h1>
        <p className="pgsub warn">모르는 방식이에요 — 아래에서 골라 주세요.</p>
        <div className="step-actions">
          {FILM_MODES.map((m) => (
            <Link key={m.id} className="mini" href={filmStepHref(step || FILM_STEPS[2], id, m.id)}>
              {m.label}
            </Link>
          ))}
        </div>
      </>
    );
  }
  if (!project || project.id !== id) return <p className="pgsub">불러오는 중…</p>;

  return (
    <>
      <h1 className="pgtitle">한 번에 굽는 영상</h1>
      {/* ★ 스테퍼의 클래스는 이 저장소가 **실제로 쓰는** 것을 그대로 쓴다 —
          components/Sidebar.jsx 의 side-steps/side-step(on·passed·locked)이다.
          계획서가 적어 둔 stepper/stepper-item 은 코드에도 app/globals.css 에도 없다. */}
      <nav className="side-steps">
        {FILM_STEPS.map((s) => {
          const open = isFilmStepReachable(s.key, project, mode);
          const on = step?.key === s.key;
          const passed = !on && open && s.key !== currentFilmStepKey(project, mode);
          const cls = `side-step${on ? " on" : ""}${passed ? " passed" : ""}`;
          return open ? (
            <Link
              key={s.key}
              href={filmStepHref(s, id, mode)}
              className={cls}
              aria-current={on ? "step" : undefined}
            >
              <i>{s.no}</i>{s.label}
            </Link>
          ) : (
            <span key={s.key} className={`${cls} locked`} aria-disabled="true">
              <i>{s.no}</i>{s.label}
            </span>
          );
        })}
      </nav>
      {children}
    </>
  );
}

export default function FilmLayout({ children }) {
  return (
    <FilmProjectProvider>
      <Inner>{children}</Inner>
    </FilmProjectProvider>
  );
}
