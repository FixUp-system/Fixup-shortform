"use client";

// 프로젝트 로드·단계 가드를 한 곳에서 — 각 단계 화면은 화면만 그린다.
// (app/film/[id]/layout.js 와 같은 구조다.)
//
// ★ 프로젝트는 reel 전용 문(`/api/reel/${id}`)으로 읽는다 — 이 문은 Task 12 도중에야
//   생겼다(app/api/reel/[id]/route.js 머리말 참고). 단계별 흐름이 쓰는 문
//   (`/api/projects/[id]`)은 종류가 있는 문서를 404 로 막으므로 이 흐름에서 쓰면 안 된다.
//
// ★ 공급자를 화면들 사이에서 공유하는 컨텍스트가 film 처럼 `components/` 안의 별도 파일이
//   아니라 **이 파일 안**에 있다. film 은 사이드바(FilmStepList)도 같은 프로젝트를 읽어야
//   해서 공급자를 루트 레이아웃까지 끌어올렸다 — reel 에는 그런 요구가 없고(사이드바
//   목록도 없다), 그래서 컨텍스트를 여기 가둔다. 화면들은 `useReelProject` 를 상대경로로
//   `../layout` 에서 그대로 부른다.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  REEL_STEPS, reelStepHref, isReelStepReachable, currentReelStepKey, reelStepFromPathname,
} from "../../../lib/reel/steps";

const Ctx = createContext(null);

export function useReelProject() {
  const v = useContext(Ctx);
  if (!v) throw new Error("ReelProjectProvider 안에서만 쓸 수 있어요");
  return v;
}

function ReelProjectProvider({ children }) {
  const [project, setProject] = useState(null);

  // ★ 실패를 삼키지 않는다. 조용히 실패하면 화면은 옛 상태를 든 채 유료 버튼을 다시 연다
  //   (components/FilmProjectContext.jsx 와 같은 이유).
  const reload = useCallback(async (id) => {
    const res = await fetch(`/api/reel/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "지금 상태를 확인하지 못했어요 — 새로고침해 주세요");
    setProject(data);
    return data;
  }, []);

  return <Ctx.Provider value={{ project, setProject, reload }}>{children}</Ctx.Provider>;
}

// ★★ 2026-08-21 Task 12 리뷰 A4 — 단계 가드 판정(`isReelStepReachable`·
//   `currentReelStepKey`·`reelStepFromPathname`)은 여기 없다. 처음엔 이 레이아웃이
//   유일한 소비자일 줄 알았는데, 보관함 상세(app/archive/[id]/page.js)가 "이어서
//   작업하기" 링크를 만들려고 같은 판정을 또 필요로 했다 — 그래서 `lib/reel/steps.js`
//   (film 이 `currentFilmStepKey` 를 두는 자리와 같다)로 옮겼다. 여기서는 import 해서
//   쓴다.

function Inner({ children }) {
  const { id } = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { project, reload } = useReelProject();
  const [err, setErr] = useState("");

  useEffect(() => {
    reload(id).catch((e) => setErr(e.message));
  }, [id, reload]);

  const step = reelStepFromPathname(pathname);
  useEffect(() => {
    if (!project || project.id !== id) return;
    if (step && isReelStepReachable(step.key, project)) return;
    const target = REEL_STEPS.find((s) => s.key === currentReelStepKey(project));
    router.replace(reelStepHref(target, id));
  }, [project, id, step, router]);

  // 못 찾은 이유는 대개 둘이다 — 지워졌거나 남의 것이거나(이 문은 소유자 범위다).
  // 어느 쪽이든 할 수 있는 일이 같으니 나갈 길을 함께 준다.
  if (err) {
    return (
      <>
        <h1 className="pgtitle">{err}</h1>
        <p className="pgsub">주소가 잘못됐거나 다른 계정의 영상일 수 있어요.</p>
        <Link href="/archive" className="cta">보관함으로</Link>
      </>
    );
  }
  if (!project || project.id !== id) return <p className="pgsub">불러오는 중…</p>;

  const here = reelStepFromPathname(pathname);
  return (
    <>
      <h1 className="pgtitle">컷마다 말하는 영상</h1>
      {/* ★ 사이드바에는 이 흐름의 진입 링크만 있고 단계 목록은 없다(2026-08-21 리뷰 A1로
          진입 링크는 생겼다 — components/Sidebar.jsx). film 의 FilmStepList 처럼 목록을
          거기 그리려면 이 컨텍스트를 루트 레이아웃까지 끌어올려야 하는데, 그것은 이
          진입 링크 하나 때문에 치를 값이 아니다(위 컨텍스트 주석 참고) — 그래서 스테퍼는
          여기서 그린다. 클래스는 film 이 쓰는 side-steps 를 그대로 빌린다(전역 CSS 라
          상위 컨테이너에 안 갇혀 있다, app/globals.css 확인). */}
      <div className="side-steps">
        {REEL_STEPS.map((s) => {
          const open = isReelStepReachable(s.key, project);
          const active = here?.key === s.key;
          const currentKey = currentReelStepKey(project);
          const passed = !active && open && s.key !== currentKey;
          const cls = `side-step${active ? " on" : ""}${passed ? " passed" : ""}`;
          return open ? (
            <Link key={s.key} href={reelStepHref(s, id)} className={cls} aria-current={active ? "step" : undefined}>
              <i>{s.no}</i>{s.label}
            </Link>
          ) : (
            <span key={s.key} className={`${cls} locked`} aria-disabled="true">
              <i>{s.no}</i>{s.label}
            </span>
          );
        })}
      </div>
      {children}
    </>
  );
}

export default function ReelLayout({ children }) {
  return (
    <ReelProjectProvider>
      <Inner>{children}</Inner>
    </ReelProjectProvider>
  );
}
