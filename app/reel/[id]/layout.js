"use client";

// 프로젝트 로드·단계 가드를 한 곳에서 — 각 단계 화면은 화면만 그린다.
// (app/film/[id]/layout.js 와 같은 구조다.)
//
// ★ 프로젝트는 reel 전용 문(`/api/reel/${id}`)으로 읽는다 — 실제 fetch 는
//   components/ReelProjectContext.jsx 의 reload 한 곳뿐이다(두 벌이면 갈린다).
//   단계별 흐름이 쓰는 문(`/api/projects/[id]`)은 종류가 있는 문서를 404 로 막으므로
//   이 흐름에서 쓰면 안 된다.
//
// ★★ 2026-08-25 — 공급자가 **이 파일 안에 있었다.** 그러면 사이드바보다 아래라
//   사이드바가 이 프로젝트를 읽을 수 없고, 그래서 단계 목록(①~⑥)을 이 레이아웃 본문에
//   사이드바용 클래스(side-steps)로 그렸다. 사장님 지시로 목록을 사이드바로 옮기면서
//   공급자를 app/layout.js(루트)로 올렸다 — film 이 2026-08-21 에 똑같은 값을 치렀다.
//   화면들이 부르던 이름은 그대로 산다(아래 재수출) — `../layout` 에서 그대로 부른다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useReelProject } from "../../../components/ReelProjectContext";
import {
  REEL_STEPS, reelStepHref, isReelStepReachable, currentReelStepKey, reelStepFromPathname,
} from "../../../lib/reel/steps";

export { useReelProject };

// ★★ 2026-08-21 Task 12 리뷰 A4 — 단계 가드 판정(`isReelStepReachable`·
//   `currentReelStepKey`·`reelStepFromPathname`)은 여기 없다. 처음엔 이 레이아웃이
//   유일한 소비자일 줄 알았는데, 보관함 상세(app/archive/[id]/page.js)가 "이어서
//   작업하기" 링크를 만들려고 같은 판정을 또 필요로 했다 — 그래서 `lib/reel/steps.js`
//   (film 이 `currentFilmStepKey` 를 두는 자리와 같다)로 옮겼다. 여기서는 import 해서
//   쓴다. 이제 사이드바(ReelStepList)도 같은 표를 읽는다.

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

  return (
    <>
      {/* ★ 흐름 이름은 사이드바가 말한다 — 여기 또 쓰면 제목이 두 겹이고,
          정작 어느 단계인지는 아래 h2 가 말한다(2026-08-25). */}
      {/* ★ 단계 목록은 **사이드바**가 그린다(components/Sidebar.jsx 의 ReelStepList) —
          단계별 흐름·광고·film 과 같은 자리다. 여기서 그리면 사이드바용 클래스를 본문에
          쓰게 돼 모양이 깨진다(2026-08-25 사장님 지시로 옮겼다). */}
      {children}
    </>
  );
}

export default function ReelLayout({ children }) {
  // 공급자는 루트(app/layout.js)에 있다 — 여기서 다시 감싸면 사이드바와 화면이 서로 다른
  // 프로젝트를 보게 된다.
  return <Inner>{children}</Inner>;
}
