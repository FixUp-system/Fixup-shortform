"use client";
// 걸음 띠 — 단계 여섯이 **화면 위에 한 줄로** 서고, 지금 단계 내용은 그 아래에 온다.
//
// ★★★ 2026-09-14 밤 — 여기는 원래 **누적 작업대**였다(끝난 단계가 접혀 쌓이고 지금
//   단계만 펼쳐지는 모양). 사장님 지적으로 걷었다: 펼친 줄이 곧 주소라 ③처럼 긴 단계를
//   열면 ④⑤⑥ 줄이 그 내용 **아래로 밀려나**, 다음 단계로 가려면 지금 단계를 끝까지
//   스크롤해야 했다. 길잡이가 내용에 파묻히는 구조다.
//   ★ 접기 단추로 풀지 않은 이유: 펼침은 **주소**라, 접은 상태는 "주소는 ③인데 화면엔
//     ③이 없다"가 된다 — 같은 사실을 URL 과 화면 상태 두 곳이 말하게 된다.
//     띠는 그 상태를 아예 안 만든다(늘 지금 단계 하나를 그린다).
//
// ★★ 단계 목록·도달 판정은 lib/reel/steps.js 하나를 본다. 여기서 이름을 손으로 적으면
//   가드가 닫는 문과 화면이 여는 문이 갈린다(2026-08-13 에 겪은 결함과 같은 모양).
// ★ 머리줄의 한 줄 요약은 **문서에서 파생**한다 — 새 저장 값을 만들지 않는다.
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

  // ★★★ 2026-09-14 밤 — 여기서 **자료 글 앞머리(40자)를 걷었다**(사장님 지시).
  //   쌓기 시절에는 줄이 화면 폭을 다 써서 그 40자가 그대로 보였다. 띠로 옮기면서 자리가
  //   1/4 로 줄어(폭 상한 11ch) 1,583자짜리 콘티가 「아래는 이미 하…」로 잘렸다 —
  //   **아무것도 말하지 않는 줄**이다.
  //   ★ 나머지 다섯은 전부 수다(장면 N개 · 컷 M/N). ①만 글 조각이라 어법도 혼자 달랐다.
  //   ★ 자료 글은 ①을 눌러 들어가면 통째로 보인다 — 띠는 길잡이지 내용을 보여 주는
  //     자리가 아니다. 되살리려면 **자리부터 만들고** 되살려라.
  if (key === "material") {
    const photos = project?.material?.photos?.length || 0;
    return photos ? `사진 ${photos}장` : "";
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

// 알약의 **이름 조각** — 번호와 라벨. 띠와 미리보기가 **나눠 쓴다.**
// ★ 두 출구가 각자 그리면 모양이 두 벌이 되고, 언젠가 한쪽만 고쳐진다.
// ★ 요약(rs-sum)은 여기 없다 — 미리보기에는 셀 것이 없고(아직 영상이 없다),
//   띠에서만 조건이 붙기 때문이다. 조건을 여기로 들이면 미리보기가 그 조건을
//   알아야 해서 "아직 시작 안 했다"가 다시 판정으로 새어 든다.
function Pill({ step }) {
  return (
    <>
      <span className="rs-no">{step.no}</span>
      <span className="rs-lab">{step.label}</span>
    </>
  );
}

// 미리보기 — **아직 영상이 없는 화면**(`/reel/new`)이 쓰는 출구.
//
// ★★★ 2026-09-15 — `/reel/new` 는 `app/reel/[id]/layout.js` 의 **형제**라 띠가 애초에
//   안 붙는다. 2026-09-14 에 사이드바의 단계 목록을 걷으면서 그 화면의 단계가 통째로
//   사라졌고(사장님이 프로덕션에서 발견), `/ads/new` 는 여전히 ①~④를 보여 줘 대비가
//   선명했다. 사이드바로 되돌리지 않는다(Ruling 20) — 단계는 띠가 말한다.
//
// ★★★ **"아직 시작 안 했다"를 판정으로 유도하지 않는다.** 앞 세션이 브라우저로 재서
//   적어 둔 함정 셋이 전부 그 유도에서 나왔다:
//   ⓐ `isReelStepReachable("scenario", null)` 이 **true** 라 ②가 안 잠긴다
//   ⓑ `reelStepHref(step, undefined)` 가 `/reel/undefined/…` 라는 깨진 링크를 그린다
//   ⓒ `reelStepFromPathname("/reel/new")` 가 undefined 로 떨어져 `currentReelStepKey(null)`
//      이 **"scenario"** 를 주므로 ①이 아니라 **②**가 도드라진다
//   그래서 이 출구는 그 셋을 **하나도 부르지 않는다.** 첫 줄이 지금이고 나머지는 잠김 —
//   그것이 이 화면의 사실이지 계산할 것이 아니다.
export function ReelStepPreview() {
  return (
    <div className="rs-strip">
      {REEL_STEPS.map((step, i) => (
        <span key={step.key} className={`rs-step${i === 0 ? " is-now" : " is-todo"}`}>
          <Pill step={step} />
        </span>
      ))}
    </div>
  );
}

// 걸음 띠 — **격자 밖·위**에 선다(2026-09-15 사장님 지시).
//
// ★★★ 그전에는 이 부품이 `children` 까지 받아 본문 칸(.rw-work) 안에서 띠+본문을 함께
//   그렸다. 그러면 설정 패널만 띠보다 **위에서** 시작해 두 카드의 상단이 안 맞는다.
//   이제 띠는 격자 위에 서고, 설정 패널과 본문이 **둘 다 격자 첫 줄**이 되어 저절로 맞는다.
// ★★ 격자의 **한 줄**로 떼어 내는 방법은 쓸 수 없다 — 띠는 sticky 라 자기보다 큰 상자가
//   있어야 움직인다. 제 높이만 한 줄에 갇히면 붙는 성질이 그 자리에서 죽는다.
//   격자 밖에 두면 상자가 본문 전체라 그대로 붙는다.
export function ReelStepStrip() {
  const pathname = usePathname();
  const { project } = useReelProject();
  // 아직 못 읽었으면 틀을 그리지 않는다 — 빈 줄 여섯이 먼저 서면 사장님은 자기
  // 영상이 처음으로 되돌아간 줄 안다.
  if (!project) return null;

  // 주소가 먼저다 — 사장님이 실제로 보고 있는 화면이 그것이다. 주소로 못 알아본
  // 자리에서만 문서가 말하는 지금 단계로 떨어진다.
  const here = reelStepFromPathname(pathname)?.key || currentReelStepKey(project);

  return (
    <div className="rs-strip">
        {REEL_STEPS.map((step) => {
          const now = step.key === here;
          const reachable = isReelStepReachable(step.key, project);
          const head = (
            <>
              <Pill step={step} />
              {/* ★★ 요약은 **갈 수 있는 단계**에만 붙인다. 아직 못 여는 줄에 「컷 0/3」이
                  서면 "아직 못 연다"가 "0개 만들었다"로 읽혀, 진행이 멎은 것처럼 보인다.
                  ★ 지금 단계에도 안 붙인다 — 그 단계 화면이 바로 아래에서 같은 것을
                    훨씬 자세히 말하고 있어, 띠에서 또 세면 같은 말이 두 번이다. */}
              {!now && reachable && <span className="rs-sum">{stepSummary(step.key, project)}</span>}
            </>
          );
          // 지금 줄과 못 가는 줄은 서로 다른 사실이라 표식을 따로 붙인다 — 주소가 아직
          // 못 여는 단계를 가리키는 순간 둘이 같이 설 수 있다(가드가 되돌리기 전 한 프레임).
          const cls = `rs-step${now ? " is-now" : ""}${reachable ? "" : " is-todo"}`;
          return reachable ? (
            // 갈 수 있는 단계만 링크다 — 못 가는 줄에 링크를 달면 눌러 들어간 뒤
            // 레이아웃 가드가 조용히 되돌려, 사장님 눈에는 아무 일도 안 난 것처럼 보인다.
            <Link
              className={cls}
              key={step.key}
              href={reelStepHref(step, project.id)}
              aria-current={now ? "step" : undefined}
            >
              {head}
            </Link>
          ) : (
            <span className={cls} key={step.key}>{head}</span>
          );
        })}
    </div>
  );
}
