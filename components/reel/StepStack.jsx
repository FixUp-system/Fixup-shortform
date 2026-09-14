"use client";
// 작업대 — 끝난 단계는 **접혀서 쌓이고** 지금 단계만 펼쳐진다.
//
// ★★ 단계 목록·도달 판정은 lib/reel/steps.js 하나를 본다. 여기서 이름을 손으로 적으면
//   가드가 닫는 문과 화면이 여는 문이 갈린다(2026-08-13 에 겪은 결함과 같은 모양).
//   그래서 이 파일에는 단계 이름도, "시나리오가 있으면 그림이 열린다" 같은 조건도 없다.
// ★ 접힌 머리줄의 한 줄 요약은 **문서에서 파생**한다 — 새 저장 값을 만들지 않는다.
//   저장하면 그 값이 문서와 갈리는 날이 오고, 갈린 쪽은 아무도 못 고친다.
// ★★★ 값·크레딧은 여기서 한 글자도 말하지 않는다(사장님 규칙). 이 틀은 ①~⑥ 어느
//   단계에서나 서 있어서, 여기서 값을 말하면 "돈이 나가는 자리는 ⑤ 하나"라는 신호가
//   통째로 흐려진다 — 그래서 lib/pricing.js 를 import 하지도 않는다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useReelProject } from "../ReelProjectContext";
import {
  REEL_STEPS, isReelStepReachable, currentReelStepKey, reelStepHref, reelStepFromPathname,
} from "../../lib/reel/steps.js";

// 한 줄 요약 — **읽기만 한다.** 문서를 고치지도, 없는 말을 지어내지도 않는다.
//
// ★ 빈 줄을 돌려주는 것은 실패가 아니라 정상이다 — 아직 아무것도 없는 단계에 요약을
//   지어내면 사장님이 없는 것을 있다고 읽는다.
// ★ 모르는 열쇠도 빈 줄이다(던지지 않는다) — 요약 한 줄 때문에 화면이 죽으면 안 된다.
// ★ 세는 단위는 **컷**이다. 머리줄에는 단계 이름이 이미 서 있으니 요약까지 그 이름을
//   되풀이하면 같은 말이 두 번이다 — 요약은 "그 단계가 컷을 몇 개까지 채웠나"만 말한다.
export function stepSummary(key, project) {
  const cuts = Array.isArray(project?.cuts) ? project.cuts : [];
  const filled = (has) => `컷 ${cuts.filter(has).length}/${cuts.length}`;

  if (key === "material") {
    // 사장님이 쓴 글이 이 단계의 주인공이다 — 앞머리만 보여 주고 나머지는 눌러서 본다.
    const text = String(project?.material?.text || "").trim().slice(0, 40);
    const photos = project?.material?.photos?.length || 0;
    return [text, photos ? `사진 ${photos}장` : ""].filter(Boolean).join(" · ");
  }
  // 장면 수는 **컷에서 센다** — 시나리오 글을 여기서 다시 쪼개면 코드가 자른 결과와
  // 갈린다(컷을 만드는 것은 시나리오 라우트다).
  if (key === "scenario") return cuts.length ? `장면 ${cuts.length}개` : "";
  if (key === "images") return cuts.length ? filled((c) => !!c?.image?.url) : "";
  if (key === "prompts") return cuts.length ? filled((c) => !!String(c?.clip_prompt || "").trim()) : "";
  if (key === "video") return cuts.length ? filled((c) => !!c?.video?.url) : "";
  // ⑥완성은 마지막 줄이라 뒤에 이어질 것이 없다 — 완성본은 그 화면이 통째로 보여 준다.
  return "";
}

export default function StepStack({ children }) {
  const pathname = usePathname();
  const { project } = useReelProject();
  // 아직 못 읽었으면 틀을 그리지 않는다 — 빈 머리줄 여섯이 먼저 서면 사장님은 자기
  // 영상이 처음으로 되돌아간 줄 안다.
  if (!project) return children;

  // 주소가 먼저다 — 사장님이 실제로 보고 있는 화면이 그것이다. 주소로 못 알아본
  // 자리에서만 문서가 말하는 지금 단계로 떨어진다.
  const here = reelStepFromPathname(pathname)?.key || currentReelStepKey(project);

  return (
    <div className="rs-stack">
      {REEL_STEPS.map((step) => {
        const open = step.key === here;
        const reachable = isReelStepReachable(step.key, project);
        const head = (
          <>
            <span className="rs-no">{step.no}</span>
            <span className="rs-lab">{step.label}</span>
            {!open && <span className="rs-sum">{stepSummary(step.key, project)}</span>}
          </>
        );
        return (
          <section
            className={`rs-card${open ? " is-open" : ""}${reachable ? "" : " is-todo"}`}
            key={step.key}
            aria-current={open ? "step" : undefined}
          >
            {open ? (
              <>
                <div className="rs-hd">{head}</div>
                {children}
              </>
            ) : reachable ? (
              // 갈 수 있는 단계만 링크다 — 못 가는 줄에 링크를 달면 눌러 들어간 뒤
              // 레이아웃 가드가 조용히 되돌려, 사장님 눈에는 아무 일도 안 난 것처럼 보인다.
              <Link className="rs-hd" href={reelStepHref(step, project.id)}>{head}</Link>
            ) : (
              <div className="rs-hd">{head}</div>
            )}
          </section>
        );
      })}
    </div>
  );
}
