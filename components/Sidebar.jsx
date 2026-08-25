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
import { STEPS, stepsFor, currentStepKey, isReachable, stepHref } from "../lib/steps";
import { AD_STEPS, adStepIndex, isAdStepReachable } from "../lib/ad/steps";
// 한 번에 굽는 영상 — 방식 표. 라벨은 여기서만 읽는다(두 벌이면 갈린다).
import { PICKABLE_FILM_MODES, isFilmMode } from "../lib/film/mode";
// 단계 표·주소·열림 판정 — 화면이 손으로 적으면 표와 갈린다.
import {
  FILM_STEPS, filmStepHref, filmStepFromPathname, currentFilmStepKey, isFilmStepReachable,
} from "../lib/film/steps";
// 공유본은 루트(app/layout.js)에서 온다 — 여기서 자기 fetch 를 만들지 않는다.
import { useFilmProject } from "./FilmProjectContext";
// reel — 표·주소·열림 판정은 lib/reel/steps.js 하나가 쥔다(레이아웃 가드와 같은 표다).
import {
  REEL_STEPS, reelStepHref, reelStepFromPathname, currentReelStepKey, isReelStepReachable,
} from "../lib/reel/steps";
// reel 공유본도 루트에서 온다(components/ReelProjectContext) — film 과 같은 자리다.
import { useReelProject } from "./ReelProjectContext";
// 이어서 할 자리를 정하는 순수 함수 — 판정은 lib/reel/steps.js 가 한다.
import { makeReelHref } from "../lib/reel/resume";

// 방식별 아이콘. ★ 표(FILM_MODES)에 안 넣는다 — 그 표는 **실험의 축**이고 동결돼 있는데,
// 아이콘은 화면 사정이다(사이드바에서 나란히 선 항목들이 서로 달라야 한다는 것뿐이다).
// 모르는 방식이 와도 화면이 죽지 않게 폴백을 둔다.
const FILM_ICON = { order: "film", refs: "layers" };

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

  // ★ stepsFor(project) — 말하는 프로젝트에서는 목소리 단계가 목록에 없다.
  //   여기서 STEPS를 그대로 읽으면 사이드바가 여는 문(목소리)을 화면·가드가 닫는다
  //   (lib/steps.js의 stepsFor 주석 참고, 2026-08-13에 겪은 결함과 같은 모양).
  return (
    <div className="side-steps">
      {stepsFor(project).map((s) => {
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
function AdStepList({ adProject, view }) {
  // 두 축을 가른다.
  //  - idx: **실제로 어디까지 왔는가**(status). 지나옴(체크 표시)·잠금·이동 가능 판정.
  //  - viewIdx: **지금 무엇을 보고 있는가**(주소의 ?step). 불이 켜지는 자리.
  // 완성된 광고에서 ②시나리오를 다시 보면 둘이 갈린다 — 예전에는 idx 하나로 둘 다
  // 정해서, 시나리오를 보고 있는데 ④완성에 불이 켜져 있었다(2026-08-13 실측).
  const idx = adStepIndex(adProject?.status);
  const viewIdx = view ? adStepIndex(view) : idx;
  const id = adProject?.id;
  return (
    <div className="side-steps">
      {AD_STEPS.map((s, i) => {
        const active = i === viewIdx;
        // 지나옴은 진행 기준이다 — 보고 있는 자리라고 해서 "아직 안 지나온" 것이 되지 않는다.
        const passed = i < idx;
        // ★ 지나온 단계는 **눌러서 다시 본다**(2026-08-13). 주소에 남기므로 뒤로가기와
        // 새로고침이 산다. 아직 안 온 단계는 그대로 잠금 — 없는 것을 열 수 없다.
        const canGo = id && isAdStepReachable(s.key, adProject?.status);
        // ★ 잠금은 **갈 수 있는가**로 정한다(canGo 와 같은 판정). 예전에는 "활성도
        // 지나옴도 아니면 잠금"이었는데, 보는 자리(view)와 진행(status)이 갈리는 순간
        // 그 규칙이 무너진다 — 완성된 광고에서 ②시나리오를 보면 ④완성이 눌리는데도
        // 잠긴 회색으로 보였다(2026-08-13 실측). 모양과 실제 동작이 어긋나면 안 된다.
        const cls = `side-step${active ? " on" : ""}${passed ? " passed" : ""}${!canGo ? " locked" : ""}`;
        const inner = (
          <>
            <i>{passed ? <><Icon name="check" size={12} /><span className="sr-only">완료</span></> : s.no}</i>{s.label}
            {/* '확인' — 사람이 실제로 멈춰 기다리는 유일한 자리(②시나리오)에만, 그리고
                지금 그 자리일 때만 붙인다. 지난 단계까지 붙이면 "아직 기다리는 중"이라는
                거짓 신호가 된다. */}
            {s.waits && active && i === idx && <em>확인</em>}
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

// 한 번에 굽는 영상의 단계 목록 — StepList·AdStepList 와 **같은 자리·같은 모양**이다.
//
// ★★ 처음에는 app/film/[id]/layout.js 본문에 그렸는데, 사이드바용 클래스(side-steps)를
//   본문에 쓴 셈이라 모양이 깨졌다(2026-08-21 사장님 지적). 원인은 배치가 아니라 공급자
//   위치였다 — FilmProjectProvider 가 사이드바보다 아래에 있어 여기서 읽을 수가 없었다.
//   지금은 app/layout.js(루트)에 있어 옆의 둘과 똑같이 읽는다.
//
// ★ 주소에서 방식을 읽는다 — 방식별 단계는 `/film/<id>/<mode>/<seg>` 네 칸이다.
//   공유 단계(입력·시나리오)에는 방식이 없으므로 그때는 고를 수 있는 첫 방식으로 떨어진다
//   (링크를 만들 때만 쓴다 — 그 단계들은 어느 방식이든 같은 화면이다).
function FilmStepList({ pathname }) {
  const { project } = useFilmProject();
  const parts = (pathname || "").split("/").filter(Boolean);
  const id = parts[1];
  const fromPath = parts.length === 4 ? parts[2] : null;
  const mode = isFilmMode(fromPath) ? fromPath : PICKABLE_FILM_MODES[0].id;
  // 프로젝트를 아직 못 읽었으면 그리지 않는다 — 빈 목록이 깜빡이는 것보다 없는 편이 낫다.
  if (!project || project.id !== id) return null;

  const here = currentFilmStepKey(project, mode);
  const step = filmStepFromPathname(pathname);
  return (
    <div className="side-steps">
      {FILM_STEPS.map((s) => {
        const open = isFilmStepReachable(s.key, project, mode);
        const active = step?.key === s.key;
        // ★ 지나옴은 **지금 단계가 아니면서 열려 있는** 것이다 — StepList 와 같은 판정.
        const passed = !active && open && s.key !== here;
        const cls = `side-step${active ? " on" : ""}${passed ? " passed" : ""}`;
        return open ? (
          <Link
            key={s.key}
            href={filmStepHref(s, id, mode)}
            className={cls}
            aria-current={active ? "step" : undefined}
          >
            <i>{passed ? <><Icon name="check" size={12} /><span className="sr-only">완료</span></> : s.no}</i>
            {s.label}
          </Link>
        ) : (
          <span key={s.key} className={`${cls} locked`} aria-disabled="true">
            <i>{s.no}</i>{s.label}
          </span>
        );
      })}
    </div>
  );
}

// reel(컷마다 말하는 영상)의 단계 목록 — 위 셋과 **같은 자리·같은 모양**이다.
//
// ★★ 2026-08-25 사장님 지시로 app/reel/[id]/layout.js 본문에서 여기로 옮겼다. film 이
//   2026-08-21 에 같은 길을 갔고 원인도 같았다 — 배치가 아니라 **공급자 위치**다.
//   ReelProjectProvider 가 레이아웃 안에 있어 사이드바가 읽을 수 없었고, 그래서 본문에
//   사이드바용 클래스(side-steps)를 써서 그렸다. 지금은 app/layout.js(루트)에 있다.
//
// ★ 판정은 새로 만들지 않는다 — 레이아웃 가드가 쓰는 lib/reel/steps.js 를 그대로 읽는다.
//   손으로 적으면 사이드바가 여는 문과 가드가 닫는 문이 갈린다.
function ReelStepList({ pathname }) {
  const { project } = useReelProject();
  const parts = (pathname || "").split("/").filter(Boolean);
  const id = parts[1];
  // 아직 못 읽었으면(또는 /reel/new 처럼 프로젝트가 없으면) 그리지 않는다 —
  // 빈 목록이 깜빡이는 것보다 없는 편이 낫다(FilmStepList 와 같은 규칙).
  if (!project || project.id !== id) return null;

  const here = currentReelStepKey(project);
  const step = reelStepFromPathname(pathname);
  return (
    <div className="side-steps">
      {REEL_STEPS.map((s) => {
        const open = isReelStepReachable(s.key, project);
        const active = step?.key === s.key;
        // ★ 지나옴은 **지금 단계가 아니면서 열려 있는** 것이다 — 옮기기 전 판정 그대로다.
        const passed = !active && open && s.key !== here;
        const cls = `side-step${active ? " on" : ""}${passed ? " passed" : ""}`;
        return open ? (
          <Link
            key={s.key}
            href={reelStepHref(s, id)}
            className={cls}
            aria-current={active ? "step" : undefined}
          >
            <i>{passed ? <><Icon name="check" size={12} /><span className="sr-only">완료</span></> : s.no}</i>
            {s.label}
          </Link>
        ) : (
          <span key={s.key} className={`${cls} locked`} aria-disabled="true">
            <i>{s.no}</i>{s.label}
          </span>
        );
      })}
    </div>
  );
}

// ★★ 사이드바에 내보낼 흐름 — **표 하나가 쉠다**(2026-08-25 사장님 결정).
//
// 숨긴 흐름을 **지우지 않는다**: 화면·라우트·테스트가 그대로 살아 있고 주소를 직접 치면
// 들어간다. 링크만 오려내면 되돌릴 때 무엇을 어디에 되돌려야 하는지가 사라진다 —
// film 의 PICKABLE_FILM_MODES 가 이미 같은 선택을 했다("표를 그대로 돌리면 다시 나온다").
//
// ⚠️ false 로 둔 흐름은 **새로 시작할 길이 사이드바에서 사라진다.** 기존 프로젝트는
//   보관함으로 열린다. Ruling 15 의 사고(reel 이 사장님에게 존재하지 않았다)와 모양은
//   같지만 방향이 반대다 — 그때는 실수였고 이것은 의도된 것이다.
const SIDEBAR_FLOWS = Object.freeze({
  create: false, // 영상 만들기 (단계별)
  ad: true,      // 광고 영상
  film: false,   // 영상 만들기 (수정)
  reel: true,    // 영상 만들기
});

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
  const { project: adProject, view: adView } = useAdProject();
  const inAds = pathname.startsWith("/ads");
  const makeVideoAdHref = makeAdHref(adProject);
  // 한 번에 굽는 영상 — 단계별 흐름(/film/<id>/…)과 옛 한 화면(/film/one/…) 둘 다 이 메뉴다.
  // ★ 새로 시작은 언제나 /film/new 다. 작업 중인 프로젝트로 되돌리는 것은 여기서 안 한다 —
  //   저쪽(makeHref)은 화면이 프로젝트를 컨텍스트로 들고 있어서 되지만, 이 흐름의 프로젝트는
  //   레이아웃 안에서만 산다(components/FilmProjectContext). 밖에서 읽으려면 컨텍스트를
  //   한 겹 더 올려야 하고, 그것은 이 메뉴 하나 때문에 치를 값이 아니다.
  const inFilm = pathname.startsWith("/film");
  const makeFilmHref = "/film/new";
  // reel(컷마다 직접 말하는 영상) — **2026-08-21 리뷰 A1 전에는 진입점이 0건이었다.**
  // 사이드바에 없으면 주소를 직접 쳐야만 열렸다(film 이 자기 읽는 문을 빠뜨렸을 때와
  // 같은 사고 — "카드는 있는데 눌러도 아무것도 안 열린다"). film 과 같은 결로 둔다:
  // ★ 새로 시작은 언제나 /reel/new 다.
  // ★★ 2026-08-25 — **단계 목록은 이제 여기 있다**(ReelStepList). 그러려고 공급자를
  //   app/layout.js(루트)까지 끌어올렸다 — film 이 먼저 치른 값이다. 옛 주석은 "진입
  //   링크 하나 때문에 치를 값이 아니다"였는데, 사장님이 목록을 사이드바로 옮기라고
  //   했으므로 값을 치렀다. 진입 링크가 여전히 /reel/new 로 고정인 것은 별개다 —
  //   "작업 중인 프로젝트로" 되돌리는 것은 지금 요구가 아니다(보관함으로 열린다).
  const inReel = pathname.startsWith("/reel");
  // ★★ **작업 중이던 자리로 되돌아간다**(2026-08-25 사장님 지적).
  //   전에는 /reel/new 고정이라 시나리오까지 만들어 놓고 눌러도 새 프로젝트 화면으로 갔다
  //   — 문서가 지워진 것은 아니지만 돌아갈 길이 사이드바에 없었다.
  //   옆의 둘(makeHref·makeAdHref)과 같은 규칙이 됐다 — 공급자가 루트로 올라와 여기서 읽는다.
  const { project: reelProject } = useReelProject();
  const reelHref = makeReelHref(reelProject);
  return (
    <aside className="side">
      <div className="logo">
        <i><Icon name="play" size={16} /></i>shortform
      </div>
      {SIDEBAR_FLOWS.create && (
        <>
          <Link href={makeVideoHref} className={`side-item${inCreate ? " on" : ""}`}>
            <span className="ic"><Icon name="sparkle" /></span>영상 만들기 (단계별)
          </Link>
          {inCreate && <StepList pathname={pathname} />}
          {inCreate && project?.id && (
            <Link href="/create" className="side-new">+ 새로 만들기</Link>
          )}
        </>
      )}
      <Link href={makeVideoAdHref} className={`side-item${inAds ? " on" : ""}`}>
        <span className="ic"><Icon name="ad" /></span>광고 영상
      </Link>
      {inAds && <AdStepList adProject={adProject} view={adView} />}
      {inAds && adProject?.id && (
        <Link href="/ads/new" className="side-new">+ 새 광고 만들기</Link>
      )}
      {/* ★★ 방식이 **하나로 좁혀졌다**(2026-08-20). 그전에는 두 방식을 나란히 두어 라벨
          자체가 실험 조건을 말하게 했는데, 재고 나서 참고 그림이 남았다. 이제 메뉴는
          하나이고 이름도 방식이 아니라 **하는 일**을 말한다.
          ★ 숨긴 방식은 PICKABLE_FILM_MODES 가 거른다 — 표를 그대로 돌리면 다시 나온다.
          ★ 주소는 lib/film/steps.js 의 표가 만든다: 화면이 손으로 적으면 세그먼트를
            바꿀 때 여기만 옛 주소로 남는다. */}
      {SIDEBAR_FLOWS.film && (
        <>
          {PICKABLE_FILM_MODES.map((m) => (
            <Link
              key={m.id}
              href={makeFilmHref}
              className={`side-item${inFilm ? " on" : ""}`}
            >
              <span className="ic"><Icon name={FILM_ICON[m.id] || "film"} /></span>영상 만들기 (수정)
            </Link>
          ))}
          {inFilm && <FilmStepList pathname={pathname} />}
        </>
      )}
      {SIDEBAR_FLOWS.reel && (
        <>
          <Link href={reelHref} className={`side-item${inReel ? " on" : ""}`}>
            <span className="ic"><Icon name="home" /></span>영상 만들기
          </Link>
          {inReel && <ReelStepList pathname={pathname} />}
        </>
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
