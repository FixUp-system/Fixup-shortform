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
import { REEL_STEPS, reelStepHref } from "../../../lib/reel/steps";
import { isPromptsReady } from "../../../lib/reel/doc";

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

// ── 단계 가드 ────────────────────────────────────────────────────────────
//
// ★ REEL_STEPS(lib/reel/steps.js)에는 이 판정이 없다 — Task 8 은 표(순서·주소)만 순수
//   함수로 두었다. film 은 방식이 갈려 표 옆(lib/film/steps.js)에 `isFilmStepReachable`을
//   함께 두지만, reel 은 방식이 하나뿐이고 이 레이아웃이 유일한 소비자라 여기 둔다 —
//   화면(다른 단계 페이지)은 이 함수를 다시 안 쓴다(가드는 레이아웃 하나가 전담한다).
//
// 순서 그대로 문이 열린다:
//   ①입력·②시나리오는 항상 열려 있다.
//   ③그림은 시나리오가 있어야 연다(시나리오 라우트가 컷을 만든다).
//   ④영상 프롬프트는 컷마다 그림이 있어야 연다 — /clips 가 그림 없는 컷을 거절한다
//     (lib/reel/pipeline.js 의 runReelClips 가 문 앞에서 그것부터 본다).
//   ⑤영상(컷별 굽기)은 isPromptsReady 다 — /clips 서버 판정과 같은 값(브리프의 요구).
//   ⑥완성은 클립을 하나라도 구워야 연다(합성이 구울 재료가 있어야 한다 — /render 의
//     "영상을 먼저 만들어 주세요" 400 과 같은 조건).
function isReelStepReachable(key, project) {
  const cuts = project?.cuts || [];
  if (key === "material" || key === "scenario") return true;
  if (key === "images") return !!project?.scenario?.text;
  if (key === "prompts") return cuts.length > 0 && cuts.every((c) => !!c?.image?.url);
  if (key === "video") return isPromptsReady(cuts);
  if (key === "done") return cuts.some((c) => !!c?.video?.url);
  return false;
}

// 지금 있어야 할 단계 — 위 판정이 여는 순서를 그대로 따라간다.
function currentReelStepKey(project) {
  if (!project?.scenario?.text) return "scenario";
  const cuts = project?.cuts || [];
  if (!cuts.length || !cuts.every((c) => !!c?.image?.url)) return "images";
  if (!isPromptsReady(cuts)) return "prompts";
  if (!cuts.some((c) => !!c?.video?.url)) return "video";
  return "done";
}

function reelStepFromPathname(pathname) {
  const parts = (pathname || "").split("/").filter(Boolean);
  if (parts[0] !== "reel" || parts.length !== 3) return undefined;
  const seg = parts[2];
  return REEL_STEPS.find((s) => s.seg === seg);
}

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
      {/* ★ 사이드바에는 이 흐름의 목록이 없다(components/Sidebar.jsx 는 이번 태스크의
          파일 범위 밖이다) — 그래서 스테퍼를 여기서 그린다. 클래스는 film 이 쓰는
          side-steps 를 그대로 빌린다(전역 CSS 라 상위 컨테이너에 안 갇혀 있다,
          app/globals.css 확인). */}
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
