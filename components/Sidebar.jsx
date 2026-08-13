"use client";

// 사이드바는 "무엇을 만들까"만 담는다. 내 계정에 관한 것(크레딧·로그아웃)은 2026-08-07 에
// 상단 계정 바(components/UserMenu.jsx)로 옮겼다 — 두 곳에 두면 한쪽이 조용히 낡는다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { useProject } from "./ProjectContext";
// 광고 프로젝트 공유본 — /ads/[id] 화면이 채운다. 여기서는 읽기만 한다(자체 fetch 없음).
import { useAdProject } from "./AdProjectContext";
import { useMe } from "./MeContext";
import { STEPS, currentStepKey, isReachable, stepHref } from "../lib/steps";
import { AD_STEPS, adStepIndex, isAdStepReachable } from "../lib/ad/steps";

// 진행 중인 프로젝트의 현재 단계 주소 — 없으면 새 프로젝트 화면.
// 사이드바 '영상 만들기' 링크가 이걸 써서, 작업 중에 눌러도 프로젝트를 잃지 않는다.
function makeHref(project) {
  if (!project?.id) return "/create";
  const step = STEPS.find((s) => s.key === currentStepKey(project));
  return stepHref(step, project.id);
}

// 광고 영상용 — 기존과 같은 생각이지만 단계가 페이지가 아니라 status 라 훨씬 단순하다.
// 진행 중인 광고가 있으면(이 세션에서 한 번이라도 /ads/[id]를 열어 컨텍스트가 채워졌으면)
// 그 광고로, 없으면 새로 시작 화면으로 — makeHref(project)와 같은 규칙이다.
function makeAdHref(adProject) {
  return adProject?.id ? `/ads/${adProject.id}` : "/ads/new";
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

// 광고 4단계 — 기존 StepList와 결정적으로 다르다: 단계마다 다른 페이지가 없다.
// `/ads/[id]` 한 페이지가 status에 따라 넷으로 변하고, 진행은 전부 자동이다(사람이 누를
// 곳은 ②시나리오 확인뿐). 그래서 이 목록은 이동(<Link>)이 아니라 표시(<span>)다 — 눌러도
// 아무 데도 안 간다. status → 지금 자리는 lib/ad/steps.js의 adStepIndex가 판정한다.
function AdStepList({ adProject }) {
  const idx = adStepIndex(adProject?.status);
  const id = adProject?.id;
  return (
    <div className="side-steps">
      {AD_STEPS.map((s, i) => {
        const active = i === idx;
        const passed = i < idx;
        // ★ 지나온 단계는 **눌러서 다시 본다**(2026-08-13). 주소에 남기므로 뒤로가기와
        // 새로고침이 산다. 아직 안 온 단계는 그대로 잠금 — 없는 것을 열 수 없다.
        const canGo = id && isAdStepReachable(s.key, adProject?.status);
        const cls = `side-step${active ? " on" : ""}${passed ? " passed" : ""}${!active && !passed ? " locked" : ""}`;
        const inner = (
          <>
            <i>{passed ? <><Icon name="check" size={12} /><span className="sr-only">완료</span></> : s.no}</i>{s.label}
            {/* '확인' — 사람이 실제로 멈춰 기다리는 유일한 자리(②시나리오)에만, 그리고
                지금 그 자리일 때만 붙인다. 지난 단계까지 붙이면 "아직 기다리는 중"이라는
                거짓 신호가 된다. */}
            {s.waits && active && <em>확인</em>}
          </>
        );
        return canGo ? (
          <Link key={s.key} href={`/ads/${id}?step=${s.key}`} className={cls} aria-current={active ? "step" : undefined}>
            {inner}
          </Link>
        ) : (
          <span key={s.key} className={cls} aria-disabled="true">{inner}</span>
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
  // 광고 영상 — inCreate와 같은 결. 컨텍스트는 읽기만 한다(components/AdProjectContext).
  const { project: adProject } = useAdProject();
  const inAds = pathname.startsWith("/ads");
  const makeVideoAdHref = makeAdHref(adProject);
  return (
    <aside className="side">
      <div className="logo">
        <i><Icon name="play" size={16} /></i>shortform
      </div>
      <Link href={makeVideoHref} className={`side-item${inCreate ? " on" : ""}`}>
        <span className="ic"><Icon name="sparkle" /></span>영상 만들기 (단계별)
      </Link>
      {inCreate && <StepList pathname={pathname} />}
      {inCreate && project?.id && (
        <Link href="/create" className="side-new">+ 새로 만들기</Link>
      )}
      <Link href={makeVideoAdHref} className={`side-item${inAds ? " on" : ""}`}>
        <span className="ic"><Icon name="ad" /></span>광고 영상
      </Link>
      {inAds && <AdStepList adProject={adProject} />}
      {inAds && adProject?.id && (
        <Link href="/ads/new" className="side-new">+ 새 광고 만들기</Link>
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
      {/* 크레딧 상자가 없어도 목록을 위로 붙여 둔다 */}
      <div className="side-grow" />
    </aside>
  );
}
