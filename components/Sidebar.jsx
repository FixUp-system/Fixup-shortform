"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProject } from "./ProjectContext";
import { STEPS, currentStepKey, isReachable, stepHref } from "../lib/steps";

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
              <em>{s.soon ? "준비 중" : "잠김"}</em>
            </span>
          );
        }
        return (
          <Link key={s.key} href={href} className={cls}>
            <i>{s.no}</i>{s.label}
            {s.soon ? <em>준비 중</em> : passed ? <em className="ok">✓</em> : active ? <em className="now">진행 중</em> : null}
          </Link>
        );
      })}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="side">
      <div className="logo">
        <i>▶</i>shotform
      </div>
      <Link href="/" className={`side-item${pathname === "/" ? " on" : ""}`}>
        <span className="ic">🏠</span>홈 — 빠른 생성
      </Link>
      <Link href="/create" className={`side-item${pathname.startsWith("/create") ? " on" : ""}`}>
        <span className="ic">✨</span>영상 만들기 (단계별)
      </Link>
      {pathname.startsWith("/create") && <StepList pathname={pathname} />}
      <button className="side-item soon" disabled>
        <span className="ic">📁</span>보관함
        <span className="soon-tag">준비 중</span>
      </button>
      <button className="side-item soon" disabled>
        <span className="ic">🎬</span>템플릿
        <span className="soon-tag">준비 중</span>
      </button>
      <Link
        href="/costs"
        className={`side-item${pathname === "/costs" ? " on" : ""}`}
      >
        <span className="ic">💰</span>비용 기록
      </Link>
      <button className="side-item soon" disabled>
        <span className="ic">⚙️</span>설정
        <span className="soon-tag">준비 중</span>
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
