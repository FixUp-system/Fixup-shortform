"use client";

// 사이드바는 "무엇을 만들까"만 담는다. 내 계정에 관한 것(크레딧·로그아웃)은 2026-08-07 에
// 상단 계정 바(components/UserMenu.jsx)로 옮겼다 — 두 곳에 두면 한쪽이 조용히 낡는다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { useProject } from "./ProjectContext";
import { STEPS, currentStepKey, isReachable, stepHref } from "../lib/steps";

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
            <span key={s.key} className={`${cls} locked`} aria-disabled="true">
              <i>{s.no}</i>{s.label}
              {s.soon ? <em>준비 중</em> : null}
            </span>
          );
        }
        return (
          <Link key={s.key} href={href} className={cls} aria-current={active ? "step" : undefined}>
            <i>{passed ? <><Icon name="check" size={12} /><span className="sr-only">완료</span></> : s.no}</i>{s.label}
            {s.soon ? <em>준비 중</em> : null}
          </Link>
        );
      })}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
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
      <Link
        href="/archive"
        className={`side-item${pathname === "/archive" ? " on" : ""}`}
      >
        <span className="ic"><Icon name="archive" /></span>보관함
      </Link>
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
      {/* 크레딧 상자가 없어도 목록을 위로 붙여 둔다 */}
      <div className="side-grow" />
    </aside>
  );
}
