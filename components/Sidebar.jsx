"use client";

// 사이드바는 "무엇을 만들까"만 담는다. 내 계정에 관한 것(크레딧·로그아웃)은 2026-08-07 에
// 상단 계정 바(components/UserMenu.jsx)로 옮겼다 — 두 곳에 두면 한쪽이 조용히 낡는다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { useProject } from "./ProjectContext";
import { useMe } from "./MeContext";
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
  // 운영자 여부만 서버에서 읽는다. GET /api/me 가 `isAdmin` 하나로 답한다(원문 role 이
  // 아니다). 직접 부르지 않고 공유본에서 받는다 — 예전에는 상단바와 여기가 같은 요청을
  // 각각 한 번씩, 한 화면에서 두 번 보냈다(components/MeContext.jsx).
  //
  // ★ 못 읽으면 숨기는 쪽으로 떨어진다(fail-closed) — 아직 못 읽었으면 me 가 null 이고,
  // 실패해도 null 로 남아 `!!me?.isAdmin` 은 false 다. 비용 기록은 전사 원장이라 남의
  // 지출이 담긴다. "모르겠으면 보여주기"는 여기서 새는 쪽이다. 링크를 숨겨도 운영자는
  // 주소로 들어갈 수 있고, 진짜 경계는 middleware 의 역할 게이트다.
  const { me } = useMe();
  const isAdmin = !!me?.isAdmin;
  const inCreate = pathname.startsWith("/create");
  // 진행 중인 프로젝트가 있으면 그 프로젝트로, 없으면 새로 시작 화면으로.
  const makeVideoHref = makeHref(project);
  return (
    <aside className="side">
      <div className="logo">
        <i><Icon name="play" size={16} /></i>shotform
      </div>
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
      {/* ★ 운영자 전용 두 자리. 못 읽으면 숨기는 쪽으로 떨어진다(fail-closed) —
          링크를 숨겨도 운영자는 주소로 들어갈 수 있고, 진짜 경계는 middleware 의 역할
          게이트다. 사용자 관리로 가는 길이 아예 없어서 주소를 외워야 했다(2026-08-13). */}
      {isAdmin && (
        <Link
          href="/admin"
          className={`side-item${pathname === "/admin" ? " on" : ""}`}
        >
          <span className="ic"><Icon name="user" /></span>사용자 관리
        </Link>
      )}
      {isAdmin && (
        <Link
          href="/costs"
          className={`side-item${pathname === "/costs" ? " on" : ""}`}
        >
          <span className="ic"><Icon name="clock" /></span>비용 기록
        </Link>
      )}
      <button className="side-item soon" disabled>
        <span className="ic"><Icon name="gear" /></span>설정
        <span className="soon-tag">준비 중</span>
      </button>
      {/* 크레딧 상자가 없어도 목록을 위로 붙여 둔다 */}
      <div className="side-grow" />
    </aside>
  );
}
