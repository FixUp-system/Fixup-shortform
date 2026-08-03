"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import Icon from "./Icon";
import { useProject } from "./ProjectContext";
import { STEPS, currentStepKey, isReachable, stepHref } from "../lib/steps";

// ★ 최종 리뷰 Minor 3 — signOut 호출이 코드 전체에 0건이었다. docs/auth-setup.md 4단계가
// "로그아웃 후 다시 로그인"을 지시하는데 화면에 방법이 없었다.
async function handleLogout(router) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  await supabase.auth.signOut();
  router.push("/login");
}

// 진행 중인 프로젝트의 현재 단계 주소 — 없으면 새 프로젝트 화면.
// 사이드바 '영상 만들기' 링크가 이걸 써서, 작업 중에 눌러도 프로젝트를 잃지 않는다.
function makeHref(project) {
  if (!project?.id) return "/create";
  const step = STEPS.find((s) => s.key === currentStepKey(project));
  return stepHref(step, project.id);
}

function StepList({ pathname }) {
  const { project } = useProject();
  const id = project?.id;
  const here = currentStepKey(project);

  return (
    <div className="side-steps">
      {STEPS.map((s) => {
        const href = stepHref(s, id);
        const active = href && (href === pathname || (s.key === "material" && pathname === "/create"));
        const reachable = isReachable(s.key, project);
        const passed = !active && reachable && s.key !== here;
        const cls = `side-step${active ? " on" : ""}${passed ? " passed" : ""}`;

        if (!href || !reachable) {
          return (
            <span key={s.key} className={`${cls} locked`}>
              <i>{s.no}</i>{s.label}
              {s.soon ? <em>준비 중</em> : null}
            </span>
          );
        }
        return (
          <Link key={s.key} href={href} className={cls}>
            <i>{passed ? <Icon name="check" size={12} /> : s.no}</i>{s.label}
            {s.soon ? <em>준비 중</em> : null}
          </Link>
        );
      })}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { project } = useProject();
  const inCreate = pathname.startsWith("/create");
  // 진행 중인 프로젝트가 있으면 그 프로젝트로, 없으면 새로 시작 화면으로.
  const makeVideoHref = makeHref(project);
  return (
    <aside className="side">
      <div className="logo">
        <i><Icon name="play" size={16} /></i>shotform
      </div>
      <Link href="/" className={`side-item${pathname === "/" ? " on" : ""}`}>
        <span className="ic"><Icon name="home" /></span>홈 — 빠른 생성
      </Link>
      <Link href={makeVideoHref} className={`side-item${inCreate ? " on" : ""}`}>
        <span className="ic"><Icon name="sparkle" /></span>영상 만들기 (단계별)
      </Link>
      {inCreate && <StepList pathname={pathname} />}
      {inCreate && project?.id && (
        <Link href="/create" className="side-new">+ 새로 만들기</Link>
      )}
      <button className="side-item soon" disabled>
        <span className="ic"><Icon name="archive" /></span>보관함
        <span className="soon-tag">준비 중</span>
      </button>
      <button className="side-item soon" disabled>
        <span className="ic"><Icon name="template" /></span>템플릿
        <span className="soon-tag">준비 중</span>
      </button>
      <Link
        href="/costs"
        className={`side-item${pathname === "/costs" ? " on" : ""}`}
      >
        <span className="ic"><Icon name="clock" /></span>비용 기록
      </Link>
      <button className="side-item soon" disabled>
        <span className="ic"><Icon name="gear" /></span>설정
        <span className="soon-tag">준비 중</span>
      </button>
      <button className="side-item" onClick={() => handleLogout(router)}>
        <span className="ic"><Icon name="power" /></span>로그아웃
      </button>
      <div className="side-grow" />
      <div className="credit-box">
        실험 모드
        <b>무제한</b>
        <small>테스트 기간에는 크레딧을 차감하지 않아요 (실비용은 비용 기록에서)</small>
      </div>
    </aside>
  );
}
