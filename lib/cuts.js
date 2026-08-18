import { secondsForText } from "./script.js";
import { clipProfileForProject, minSecondsFor, maxSecondsFor, projectSpeaks } from "./clip-limits.js";
import { activeStyle, refHintFor, refFraming } from "./styles.js";
import { isSpeed, speedFor } from "./speeds.js";
import { MOTION_AXES, axesOf } from "./motion.js";
import { MIN_UNIT_CHARS, noSpace, clauseBoundaries, closeSentence } from "./clauses.js";

// 절 경계 판정은 lib/clauses.js 에 있다(import 없는 leaf 모듈 — 그 파일 머리말 참고).
// 여기서 다시 내보내는 이유: 컷 분할(splitClauses)이 이 값을 쓰고, 기존에
// lib/cuts.js 에서 clauseBoundaries 를 import 하던 자리(테스트·측정 스크립트)가 있다.
export { clauseBoundaries };

// 컷 분할과 화면 설계 — 두 패스다.
//  1패스(분할): LLM은 컷 경계(문장 번호)만 고르고, 텍스트는 코드가 원고에서 잘라낸다.
//               모델이 문장을 다시 쓰게 두면 사장님이 승인한 원고가 이미지 단계에서 조용히 달라진다.
//  2패스(화면): 컷마다 무엇을 보여줄지 설계한다. 화면 근거는 나레이션 문장이 아니라 이 'shows'다.
// 모든 컷 화면은 AI가 새로 그린다. 업로드 사진은 화면에 직접 넣지 않고 참조(ref)로만 쓴다.

// 원고를 문장으로 나눈다 — 줄바꿈과 종결부호가 경계다.
// 컷 경계는 이 배열의 번호로만 이야기하므로, 나누는 규칙이 곧 컷의 최소 단위다.
export function splitSentences(text) {
  return (text || "")
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

// 컷 경계 후보. 컷은 여기서 나온 조각의 번호로만 이야기한다.
//
// 왜 문장만으로는 모자란가: 원고 한 문장이 12초인 경우가 있고(실측), 그 안에 성분·사용
// 순서·후기가 다 들어 있었다. 화면 설계가 그것을 한 장면으로 만들려다 동시에 일어날 수 없는
// 동작 둘을 요구했고, 이미지에 **손이 셋** 나왔다.
//
// 8초를 넘는 문장만 나눈다. 이 8초는 **콘텐츠 상한**이다 — 이미지 한 장에 담기는 정보량이지
// 모델 사정이 아니다. 모델을 바꿔도 이 값은 안 바뀐다.
// (모델 상한은 눈금의 최대값이고 lib/clip-limits.js 에 있다. 둘을 섞지 않는다.)
//
// 나눠도 원문은 그대로다: 공백이 있는 자리에서만 자르고 다시 " " 로 이으면 같은 글이 된다.
// **컷을 이어붙이면 원고와 글자 그대로 같다** 는 보장이 이렇게 유지된다.
//
// export 하는 이유: 파이프라인이 "8초를 넘는 컷이 있는가"를 판정할 때 같은 값을 쓴다.
export const CONTENT_MAX_SECONDS = 8;

// 연결어미는 **닫힌 목록**이다. 한국어 연결어미를 다 담으려 하지 않는다 —
// 못 담은 어미는 그 문장이 안 나뉠 뿐이고, 그때는 지금 동작(문장 통째)으로 떨어진다.
// 늘리는 것은 나중에 한 줄이면 된다.
function splitClauses(sentence) {
  const at = clauseBoundaries(sentence);
  const tokens = [...(sentence || "").matchAll(/\S+/g)];
  if (tokens.length === 0) return [sentence];

  const parts = [];
  let start = tokens[0].index;
  for (const pos of at) {
    // 경계 앞 한 글자는 공백 정확히 한 칸이다(clauseBoundaries 가 sep === " " 만 후보로 삼는다).
    // 그 한 칸을 빼고 자른다 — 컷 조각은 join(" ") 으로 원문을 복원하는 계약이라
    // 조각이 구분 공백을 품으면 그 자리에서 공백이 두 칸이 된다.
    // (자막은 계약이 반대다 — join("") 으로 복원하므로 공백을 품은 채 slice 한다.)
    parts.push(sentence.slice(start, pos - 1));
    start = pos;
  }
  // 마지막 조각 — 마지막 토큰 끝이 아니라 문장 끝까지 slice 한다(뒤에 남은 문장부호 등을 지키기 위해)
  const tail = sentence.slice(start);
  if (tail) {
    if (parts.length && noSpace(tail) < MIN_UNIT_CHARS) parts[parts.length - 1] += ` ${tail}`;
    else parts.push(tail);
  }
  return parts.length ? parts : [sentence];
}

export function splitUnits(text) {
  const out = [];
  for (const s of splitSentences(text)) {
    if (secondsForText(s) <= CONTENT_MAX_SECONDS) out.push(s);
    else out.push(...splitClauses(s));
  }
  return out;
}

// 받은 경계를 되돌린다 — 8초를 넘으면서 두 조각 이상인 컷은 조각 하나씩으로 푼다.
//
// 왜 컷이 아니라 경계를 다시 쓰는가: 이 결과를 validateCutRanges 에 다시 통과시키면
// 문장·초·idx 를 그 함수가 전부 다시 뽑아 준다. 재조립 코드를 두 벌 두지 않아도 되고,
// 빈틈·겹침·전량 사용 검사를 공짜로 한 번 더 받는다.
//
// 왜 강제로 푸는가: 판정만 하고 되묻는 방식은 실패했다 — 모델이 같은 답을 다시 냈고
// 코드가 받았다(2026-07-29 실측, 8초 초과 5건 중 4건이 "짧은 조각을 합친 것"이었다).
//
// 조각 하나로 이뤄진 컷은 8초를 넘어도 두고, 8초 이하 묶음도 그대로 둔다 —
// 합치기가 없어지는 것이 아니라 기본에서 예외로 내려오는 것이다.
export function explodeLongRanges(ranges, units) {
  if (!Array.isArray(ranges) || !Array.isArray(units)) return [];
  const out = [];
  let expected = 1;
  for (const r of ranges) {
    // ★★ 무음 컷은 그대로 흘려보낸다(2026-08-14). **expected 를 올리지 않는다** —
    //   조각을 안 먹기 때문이다(validateCutRanges 와 같은 규칙이다. 둘은 같은 배열을 받는다).
    //
    //   이것이 없으면 모델이 무음 컷을 하나만 내도 아래 정수 검사에서 빈 배열로 떨어지고,
    //   부르는 쪽(lib/pipeline.js)이 console.warn 한 줄 남기고 **분해 안 된 경계를 쓴다.**
    //   8초 강제 분해가 조용히 꺼진다 — 되묻기가 실패해서(모델이 같은 답을 다시 냈다)
    //   만든 보장인데, 새 기능을 쓰는 바로 그때 열린다.
    if (r?.silent === true) { out.push({ silent: true }); continue; }
    // 망가진 경계는 여기서 고치지 않는다 — 빈 배열로 떨어뜨리고 부르는 쪽이 폴백을 쓴다
    if (!Number.isInteger(r?.from) || !Number.isInteger(r?.to)) return [];
    if (r.from !== expected || r.to < r.from || r.to > units.length) return [];
    const seconds = secondsForText(units.slice(r.from - 1, r.to).join(" "));
    if (seconds > CONTENT_MAX_SECONDS && r.to > r.from) {
      for (let i = r.from; i <= r.to; i++) out.push({ from: i, to: i });
    } else {
      out.push({ from: r.from, to: r.to });
    }
    expected = r.to + 1;
  }
  // 원고를 끝까지 다 쓰지 않은 경계는 받지 않는다 — validateCutRanges 와 같은 규칙이다
  if (expected !== units.length + 1) return [];
  return out;
}

// 고른 초를 컷에 배분한다 — **여백이 여기서 생긴다.**
//
// 지금까지 컷 초는 낭독 시간이었다(그래서 영상 길이 = 원고 길이였고, 원고가 63자면
// 15초를 골라도 11초가 나왔다). 이제 고른 초가 주문값이고, 말하는 시간은 **바닥**이다.
//
// 규칙 셋이 순서대로다:
//  1) 바닥 = max(말하는 시간, 모델 하한) — 자르면 문장 끝이 사라진다
//  2) 남는 초를 컷마다 한 초씩 돌아가며 얹는다 — 균등이 아니라 라운드로빈이라
//     나머지가 어디로 갈지가 결정적이다(같은 입력이면 늘 같은 결과)
//  3) 모델 상한에 닿은 컷은 건너뛴다. 전부 상한이면 거기서 멈춘다 —
//     합이 고른 초에 못 미쳐도 상한을 넘기지 않는다(넘기면 fal 이 거절한다)
//
// ★ 반환은 초 배열이고 컷을 고치지 않는다 — 부르는 쪽이 문서에 반영한다.
//
// ⚠️ 리뷰 지적(2026-08-14): 이 배분은 **연속 구간**(min~max, 정수 아무 값)을 전제한다.
// 눈금이 열거형인 프로필(steps — LTX [6,8,10,...,20], 모르는 모델의 기본값도 이거다)에서는
// 라운드로빈이 1초씩 얹으므로 7·9초처럼 눈금 밖 값이 나올 수 있다. fitDurationFor 가 주문
// 시점에 위 눈금으로 올려 주므로 에러는 안 나지만, 컷마다 최대 +1초가 실제로 더 나가
// 합이 고른 초를 넘을 수 있다. 지금 고르는 모델은 Seedance·Kling(둘 다 연속 구간)뿐이라
// 실제로는 안 밟힌다 — 밟히게 되면 라운드로빈이 아니라 steps 배열을 걸어가는 방식으로
// 고쳐야 한다(여기서는 고치지 않는다).
export function allocateCutSeconds(cuts, targetSeconds, profile) {
  const list = Array.isArray(cuts) ? cuts : [];
  if (!list.length) return [];
  const min = minSecondsFor(profile);
  const max = maxSecondsFor(profile);
  const out = list.map((c) => {
    const spoken = Math.ceil(Number(c?.spoken_seconds) || 0);
    return Math.min(max, Math.max(min, spoken));
  });
  const target = Math.round(Number(targetSeconds) || 0);
  let left = target - out.reduce((a, b) => a + b, 0);
  // 남으면 얹는다. 모자라면 아무것도 하지 않는다 — 바닥 아래로는 깎지 않는다.
  let guard = 0;
  while (left > 0 && guard++ < 10000) {
    const before = left;
    for (let i = 0; i < out.length && left > 0; i++) {
      if (out[i] < max) { out[i] += 1; left -= 1; }
    }
    if (left === before) break; // 전부 상한 — 더 얹을 자리가 없다
  }
  return out;
}

// 배분된 초가 CONTENT_MAX_SECONDS 를 넘는 컷이 남지 않도록 **무음 컷을 채운다.**
//
// ★ 왜 필요한가(2026-08-14 재측정): 밀도 계수로 원고가 짧아지자 컷 분할이 컷 하나만 만들고
//   배분이 거기에 15초를 다 줬다 — **정지 이미지 한 장이 화면에 15초 머문다.**
//   CONTENT_MAX_SECONDS 는 "이미지 한 장이 화면에 머무는 시간"인데, 그 판정이 낭독 초만 보고
//   배분된 초를 안 봐서 이 구멍이 열려 있었다.
//
// ★ 모델이 지문을 따르든 말든 여기서 보장한다 — 이 저장소의 규율대로 창작은 모델,
//   **지켜져야 하는 것은 코드**다.
//
// ★ 하한이 천장이다. 컷 n 개를 만들려면 n × min ≤ target 이어야 한다(Seedance min 4 →
//   15초에 최대 3개). 그래서 8초 상한을 못 지키는 경우가 남을 수 있다 — 그때는 지킬 수
//   있는 데까지만 쪼갠다. 하한을 깨면 fal 이 거절한다.
//
// 무음 컷은 **말하는 컷 사이와 끝**에 넣는다. 맨 앞은 두지 않는다 — 첫 화면이 말 없이
// 시작하면 스크롤을 멈추게 할 문장이 늦게 나온다(대본 규칙이 첫 문장에 가장 센 것을 둔다).
//
// ★ 끝에 몰아붙이지 않는다(2026-08-14 리뷰). 채운 컷을 전부 뒤에 이어 붙이면 영상이
//   **언제나 침묵으로 끝난다** — 말이 앞쪽에서 끝나고 남은 몇 초가 말 없는 화면이 된다.
//   짧은 원고가 바로 이 함수가 존재하는 이유라, 그것은 가끔이 아니라 매번이다.
//   그래서 말하는 컷 뒤에 하나씩 **돌아가며** 끼운다(라운드로빈).
//   (말하는 컷이 하나뿐이면 뒤에 붙는 수밖에 없다 — 맨 앞은 여전히 두지 않는다.)
export function fillSilentCuts(cuts, targetSeconds, profile) {
  const list = Array.isArray(cuts) ? cuts : [];
  if (!list.length) return [];
  const min = minSecondsFor(profile);
  const target = Math.round(Number(targetSeconds) || 0);
  const maxCuts = Math.max(1, Math.floor(target / min));
  const silent = () => ({ idx: 0, sentence: "", silent: true, spoken_seconds: 0, seconds: 0, source: "code", regen_count: 0 });

  // 끼울 자리 — 말하는 컷의 뒤다. 모델이 제안한 무음 컷은 그 자리를 그대로 지킨다.
  const spoken = list.map((_, i) => i).filter((i) => !list[i]?.silent);
  const spots = spoken.length ? spoken : list.map((_, i) => i);
  // 채운 컷 n 개를 라운드로빈으로 나눠 끼운 배열. 배분이 순서에 따라 달라지므로
  // (남는 초를 앞에서부터 얹는다) 재 볼 때도 **실제로 나갈 순서**로 재야 한다.
  const build = (n) => {
    const after = new Map();
    for (let k = 0; k < n; k++) {
      const at = spots[k % spots.length];
      after.set(at, (after.get(at) || 0) + 1);
    }
    const arr = [];
    list.forEach((c, i) => {
      arr.push(c);
      for (let j = 0; j < (after.get(i) || 0); j++) arr.push(silent());
    });
    return arr;
  };

  // ★ 바닥이 8초를 넘는 컷은 **어떻게 쪼개도 안 내려온다**(낭독 10초짜리 한 문장은 늘 10초다).
  //   그런 컷을 이유로 채우면 8초는 그대로인 채 값만 나간다 — 이미지 한 장 $0.08 에
  //   총 초가 고른 초를 넘어 클립까지 더 산다. 그래서 **내려올 수 있는 컷**만 재고,
  //   그중 가장 긴 것이 실제로 짧아질 때만 하나 넣는다.
  const floorOf = (c) => Math.max(min, Math.ceil(Number(c?.spoken_seconds) || 0));
  const measure = (arr) => {
    const secs = allocateCutSeconds(arr, target, profile);
    return {
      total: secs.reduce((a, b) => a + b, 0),
      // 내려올 수 있는 컷 중 가장 긴 것
      worst: secs.reduce((m, s, i) => (floorOf(arr[i]) <= CONTENT_MAX_SECONDS ? Math.max(m, s) : m), 0),
    };
  };

  // ★★ 컷을 더 넣는 이유가 **둘**이다(2026-08-14 재리뷰가 찾았다).
  //  ① 길이 약속 — 배분된 합이 고른 초에 못 미친다. 사장님이 값을 치른 바로 그 값이다.
  //     이것을 안 보던 동안 30·45·60초가 전부 15초짜리로 나갔다: 컷 하나가 모델 상한(15)에
  //     걸려 멈추는데, 그 컷은 "가장 긴 컷"이라 ②로는 더 넣을 이유가 안 생겼다.
  //     컷을 더 넣어야 상한 15초짜리 클립이 여러 개가 되어 합이 60초에 닿는다.
  //  ② 콘텐츠 약속 — 내려올 수 있는 컷 중 가장 긴 것이 8초를 넘는다(이미지 한 장이 오래 머문다).
  // 둘 중 하나라도 어긋나 있고, **어긋난 그것이 실제로 나아질 때만** 하나 넣는다.
  // (나아지지 않는 넣기는 이미지 $0.08 과 클립 초만 쓰고 보장을 하나도 못 산다.)
  let n = 0;
  let cur = build(0);
  let guard = 0;
  while (cur.length < maxCuts && guard++ < 64) {
    const now = measure(cur);
    const shortOfTarget = now.total < target;
    const overContent = now.worst > CONTENT_MAX_SECONDS;
    if (!shortOfTarget && !overContent) break;
    const next = build(n + 1);
    const after = measure(next);
    const helpsLength = shortOfTarget && after.total > now.total;
    // ★ 콘텐츠 쪽은 **제자리걸음을 허용한다.** 배분이 남는 초를 앞에서부터 얹으므로(라운드로빈)
    //   가장 긴 컷이 모델 상한에 붙어 한두 걸음 안 움직이는 구간이 있다.
    //
    //   실측(2026-08-14, 완화를 `<` 로 바꿔 전 조합을 돌려 비교했다): **Seedance 60초 ·
    //   말하는 컷 하나 낭독 8초.** 컷 4개에서 [15,15,15,15] 이고, 5개로 늘려도 배분이
    //   [15,12,11,11,11] 이라 가장 긴 컷이 **그대로 15**다(cut0 이 상한에 붙어 있다).
    //   거기서 멈추면 정지 이미지 한 장이 15초 머문 채 나간다 — 완화가 있으면 14개까지
    //   걸어가 [8,4,4,…] 로 내려온다. 이 완화가 결과를 바꾸는 조합이 51개였다.
    //
    //   바닥이 8초를 넘는 컷은 이미 판정에서 뺐으므로, 남은 컷은 컷 수를 늘리면 **반드시**
    //   자기 바닥(≤8초)까지 내려온다(하한 × maxCuts ≈ 고른 초). 제자리걸음은 길목이지 막다른
    //   길이 아니다. 대신 나빠지면 멈추고, 아래의 초과 검사가 걸음 수의 천장이 된다.
    const helpsContent = overContent && after.worst <= now.worst;
    // ★★ 나아지더라도 **고른 초를 넘겨서 사지는 않는다**(최종 리뷰, 2026-08-14).
    //   바닥이 섞이면 컷을 늘릴수록 바닥 합이 커진다 — 말하는 컷 5개(바닥 8초)에 45초면
    //   컷 7개에서 바닥 합이 48초가 되어 3초를 우리가 문다(클립은 초당 과금이고 이미지도
    //   한 장 더 산다). maxCuts(=target/min)는 바닥이 전부 min 일 때만 맞는 천장이라
    //   이것을 못 막는다. now.total 을 함께 보는 이유: 이미 넘어 있는 상태에서 더 넘기지만
    //   않으면 되고, 거기서 막으면 앞선 걸음까지 되돌리게 된다.
    if (after.total > Math.max(target, now.total)) break;
    if (!helpsLength && !helpsContent) break; // 더 넣어도 나아지지 않는다
    n += 1;
    cur = next;
  }
  // idx 를 다시 매긴다 — 캐스팅(cast[].cuts)과 화면 설계가 컷 번호로 짝을 짓는다
  return cur.map((c, i) => ({ ...c, idx: i }));
}

// 나누는 것은 시나리오다. 모델이 만들 수 있는 길이는 **목표가 아니라 알려 주는 사실**로 넣는다.
//
// 상한이 둘이라 섞지 않는다:
//  - 콘텐츠 상한(8초) — 이미지 한 장에 담기는 정보량. 모델과 무관하다.
//    실측에서 12초 컷의 화면 설계가 동시에 불가능한 동작 둘을 요구해 손이 셋 나왔다.
//  - 모델 상한(눈금의 최대값) — 넘으면 클립 뒷부분이 움직이지 않는다.
//
// 숫자를 하드코딩하지 않는다. 모델이 바뀌면 눈금 표만 바뀌고 이 문장은 따라 바뀐다.
function splitSystem(project) {
  // **이 프로젝트가 쓰는 모델**의 하한·상한이다. 눈금 종류(열거/범위)와 무관하게 읽는다.
  // project 를 안 넘기면 레거시(Kling)로 떨어진다 — generateClip 과 같은 규칙이다.
  const profile = clipProfileForProject(project);
  const lo = minSecondsFor(profile);
  const hi = maxSecondsFor(profile);
  return `너는 숏폼 영상 편집자다. 완성된 나레이션 원고를 컷으로 나눈다.
번호가 매겨진 조각 목록을 받는다. 각 컷이 어느 조각부터 어느 조각까지인지만 고른다.
반드시 JSON 하나만 출력: {"cuts":[{"from":시작 조각 번호,"to":끝 조각 번호}]}
규칙:
- 조각을 고쳐 쓰지 않는다. 너는 경계만 고른다 — 문장은 이미 사장님이 승인했다.
- 컷은 1번 조각에서 시작해 마지막 조각에서 끝난다. 빈틈도 겹침도 없다(앞 컷의 to 다음이 뒤 컷의 from이다).
- 한 컷은 화면 하나다. 화면이 바뀔 자리에서 끊는다 — 말하는 대상이 바뀌거나, 시간·장소가 옮겨가거나, 근거에서 결과로 넘어가는 자리.
- 한 컷에 동시에 일어날 수 없는 동작 둘을 담지 않는다. 정지 화면 하나로 그려지므로, "덜어서 바른다" 처럼 순서가 있는 동작이 한 컷에 들어가면 그림이 무너진다.
- 한국어 낭독은 초당 5.5자 남짓이다. 한 컷이 8초(공백 빼고 44자)를 넘지 않게 한다 — 이미지 한 장이 그보다 오래 머물면 눈이 지친다.
- 이 영상 모델은 ${lo}~${hi}초 클립을 만든다. ${hi}초를 넘는 컷은 뒷부분이 움직이지 않고, ${lo}초보다 짧은 컷은 남는 시간이 생긴다.
- 장면이 바뀌는 자리를 먼저 잡고, 그 안에서 위를 고려한다. 억지로 길이를 맞추려고 장면을 붙이거나 끊지 않는다.
- **말 없는 장면을 넣을 수 있다.** 원고의 문장을 쓰지 않고 화면만 보여주는 컷이다.
  넣으려면 그 항목에 from·to 대신 {"silent": true} 를 적는다. 여는 자리와 닫는 자리에 어울린다.
  넣지 않아도 된다 — 화면이 한 장면에 너무 오래 머물면 코드가 알아서 채운다.`;
}

export function buildSplitMessages(units, project) {
  const numbered = units.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return {
    system: splitSystem(project),
    messages: [{ role: "user", content: `[원고 — 조각 ${units.length}개]\n${numbered}` }],
  };
}

// 지문에서 **움직임 축에 딸린 자리**는 전부 이 셋이 만든다 — 출력 형식·규칙·예시·개수까지.
// 축 목록을 인자로 받는 이유는 하나다: 테스트가 축을 실제로 빼 보고 "그 축의 흔적이 지문에서
// 전부 사라지는가"를 **실행해서** 확인할 수 있어야 한다. 되돌아오는 자리가 목록 한 줄이라는
// 것이 이 설계의 안전장치인데, 지문에 축 id·개수를 손으로 적어 두면 그 안전장치가 거짓이 된다
// (축을 빼도 지문은 계속 그 축을 예시로 보여 주고, 모델은 없는 필드를 답한다).
export function motionFields(axes) {
  return axes.map((a) => `"${a.id}":"${a.label} 움직임 한 줄 — 없으면 빈 문자열"`).join(",");
}

export function motionRules(axes) {
  const n = axes.length;
  const bad = axes.filter((a) => a.bad).map((a) => `  ✗ ${a.id}: "${a.bad}"(한 축에 여럿)`);
  return `- **움직임은 축마다 따로 적는다.** 아래 ${n}개 축 중 **이 컷에 해당하는 것만** 적고, 없는 축은 빈
  문자열로 둔다. ${n}개를 다 채우려고 없는 움직임을 지어내지 않는다.
${axes.map((a) => `  · ${a.id}(${a.label}) — ${a.hint}`).join("\n")}
  각 축은 **몇 초 안에 끝나는 작은 변화 하나**로 적는다. 한 축에 둘을 넣지 않는다.
${bad.join("\n")}
${axes.map((a) => `  ✓ ${a.id}: "${a.example}"`).join("\n")}
  얼굴 표정·말하는 입·손가락을 세밀하게 쓰는 동작은 적지 않는다 — 지금 기술로는 뭉개진다.`;
}

// speed 항목도 축 개수를 말한다("세 축 전체에 걸린다"). 그 수가 손으로 박혀 있으면 축을 뺐을 때
// 지문이 거짓말을 한다. 마지막 줄은 축 이름을 부르지 않는다 — 어느 축이 빠져도 참인 문장이다.
export function speedRule(axes) {
  return `- **speed 는 그 컷의 움직임이 얼마나 빠르고 센지다.** 다섯 중 하나를 골라 그 낱말 그대로 적는다:
  static(거의 안 움직인다) · slow(천천히) · realtime(실제 속도) · fast(폭발적으로) ·
  extreme_slowmo(극단적 슬로모션 — 절정 한 컷에만).
  위 움직임 축 ${axes.length}개 전체에 걸리는 값이라 컷 하나에 하나만 고른다. 축마다 따로 주지 않는다 —
  한 축이 빠르면 그 컷은 빠른 컷이다.`;
}

// 언어 정책(2026-08-17): **모델이 읽는 값만 영어다.** shows·tone·environment·transition·움직임
// 축은 그림·영상 모델에 그대로 실리므로 영어로 받고, 규칙 서술은 한국어로 둔다(우리가 유지보수
// 하는 글이다). 지시문보다 **예시 값**이 출력 언어를 훨씬 강하게 정하므로 ✓·✗ 예시를 함께
// 영어로 옮겼다 — 지시만 바꾸고 한국어 예시를 두면 둘이 싸우고 모델은 예시를 따른다.
//
// ★ **한국어 섬은 걷었다**(2026-08-17). 샷 크기 낱말만 한국어로 남겨 두던 자리다 —
//    lib/shots.js 의 shotSizeOf 가 shows 에서 그 낱말을 찾아 클로즈업 쏠림을 판정하는데
//    (shotBalance → 화면 설계 재시도), 목록이 한국어 전용이라 예시까지 영어로 바꾸면 판정이
//    조용히 죽었다. 이제 그 목록이 **영어 낱말을 함께 본다**(SHOT_SIZES) — 섬의 근거가
//    사라졌으므로 예시·지시를 영어로 옮겼다. 낱말은 목록과 같아야 한다(tests/shots.test.js 가
//    SHOT_SIZES 에서 끌어와 지문과 대조한다).
//
// ★ 판정기 셋도 함께 영어를 보게 넓혔다(같은 날, 아래) — stillOnly(CAMERA_WORDS·STILL_FORMS)와
//    usableTone·usableTransition(CAMERA_MOTION·CUT_REFERENCE). 그 전에는 한국어 전용 정규식이라
//    영어 값에 아예 안 걸려서, "shows 에는 카메라 움직임을 적지 않는다"가 **말로만** 막는
//    상태였다. 넓힌 것은 패턴을 **더한 것뿐**이라 한국어 값의 판정·각인은 무변경이다.
//
// 강조도 함께 걷었다 — 이 글은 gpt-4o 를 상대로 쓰였고, 지금 모델(claude-opus-5)은 지시를
// 훨씬 문자 그대로 따라서 `★`·`**반드시**` 가 과하게 작동한다. 걷은 것은 표시뿐이고
// 규칙·요구사항·예시의 내용은 그대로다.
const SHOWS_SYSTEM = `너는 숏폼 영상의 촬영을 설계한다. 컷마다 화면에 무엇이 보일지, 그것이 어떻게 움직일지 적는다.
반드시 JSON 하나만 출력: {"tone":"이 영상의 색과 질감 한 줄","environment":"이 영상의 무대 — 장소·시간대·조명 한 줄","shots":[{"shows":"화면에 보이는 것(정지 화면)",${motionFields(MOTION_AXES)},"speed":"static|slow|realtime|fast|extreme_slowmo 중 하나","transition":"이 컷이 시작하는 구도 — 첫 컷에는 넣지 않는다"}]}
shots는 컷과 같은 개수·같은 순서다.
규칙:
- **shows·tone·environment·transition·움직임 축은 영어로 적는다.** 이 값들은 그림·영상 모델에
  그대로 실린다. 아래 ✓·✗ 예시가 그 형태다. 컷 문장·주제·사장님이 적은 바람은 한국어로
  들어오지만, 이 칸에 옮겨 적을 때는 영어로 쓴다.
- **tone 은 영상 하나의 색과 질감이다 — 하나만 정한다.** 컬러 그레이딩·명암·필름 질감을
  한 문장으로 적는다. 전 컷이 이 하나를 공유하므로 특정 컷에만 맞는 말을 쓰지 않는다.
  · **장소·시간대·조명은 environment 가 맡는다** — tone 에서 되풀이하지 않는다.
    무대는 "어디에서 언제 찍었는가"이고 tone 은 "그 화면을 어떻게 현상했는가"다.
  · **카메라가 어떻게 움직이는지는 적지 않는다.** tone 은 그림 지시로 전 컷에 똑같이 실리는
    값이라, 카메라 움직임이 한 낱말이라도 섞이면 그 톤은 통째로 버려진다.
  ✓ "dark background with only the product color saturated, cinematic ad film grain"
  ✓ "faded film grain with a green cast, low-contrast documentary texture"
  ✗ "gym, hard spotlights"(그건 environment 다)
  ✗ "the color cools as the camera moves closer"(카메라 움직임이다)
- **environment 는 이 영상 전체의 무대다 — 하나만 정한다.** 장소·시간대·조명을 한 줄로 적는다.
  시간대는 golden hour·midday·dusk·dawn·night 중에서 고르고, 날씨·공기(안개·이슬비·햇빛에
  떠다니는 먼지)도 여기서 정한다.
  ✓ "indoor basketball court, night, hard spotlights and deep shadows in a dark gym"
  ✓ "inside a clothing repair shop in a Seongsu-dong alley, golden hour, dust drifting in the light from the window"
  · **컷마다 장소·시간대를 새로 만들지 않는다.** 이 무대가 전 컷의 배경이 된다.
    실측에서 무대를 안 정했더니 5컷이 5개의 다른 장소로 나왔다 — 야외 아스팔트 코트(노을),
    야외 스트리트코트(한낮), 실내 체육관(나무 마루), 야외 코트(자주빛 노을), 거리(간판).
    같은 영상으로 보이지 않는다.
  · shows 에는 **그 무대 안에서 무엇이 보이는지**만 적는다. 장소를 다시 쓰지 않는다.
  · 무대가 바뀌는 영상이면(코트에서 거리로) 그 컷의 shot 에만 environment 를 따로 적는다.
    바뀌는 자리는 서사에 근거가 있어야 한다 — 이야기가 그리로 옮겨갈 때만이다.
- shows는 카메라가 잡는 것을 눈에 보이게 적는다 — 피사체·행동·샷 크기·앵글. 추상어로 쓰지 않는다.
  샷 크기는 extreme close-up·close-up·medium shot·full shot·wide shot(establishing shot) 중에서
  골라 **그 말 그대로** 적고(코드가 이 낱말을 읽는다), 앵글은 eye level·low angle·high angle·
  bird's-eye·over-the-shoulder·POV 중에서 골라 그 말 그대로 적는다.
  **시간대·날씨는 shows 에 적지 않는다** — 그것은 environment 가 정한다. 컷마다 적으면 한낮에서
  황혼으로, 실내에서 야외로 흘러간다(실측에서 그렇게 흘렀다). shows 에 적을 수 있는 것은 그 무대
  안에서의 **빛의 방향과 공기**뿐이다 — 역광, 측광, 빛줄기 속 먼지, 바닥에 닿는 반사.
  없는 것으로 쓰지 않는다. 빼고 싶은 것을 말하는 대신 원하는 상태를 그대로 서술한다.
  ✗ "a scene that feels heartfelt" / "an atmospheric cut" / "a shop with no customers"
  ✓ "a 7am kitchen, close-up of hands dropping whole strawberries into a blender, first light through the window"
  ✓ "an empty pre-dawn shop, full shot, chairs stacked on the tables"
- shows는 그 컷 문장을 그림으로 옮긴 삽화가 아니다. 말이 하지 않는 것을 화면이 맡는다 —
  말이 "한 번에 한 명만 받습니다"이면 화면은 작업대에 놓인 의자 하나를 비춘다.
  화면이 말을 그대로 되풀이하면 그 컷의 정보량은 절반이 된다.
- 거울·유리창처럼 비치는 면에 사람이 함께 보이는 화면은 적지 않는다 — 지금 기술로는 비친 상과 실제가 어긋난다(등지고 선 사람이 정면으로 비치거나 거울 속 목이 돌아간다).
  치수를 재거나 옷을 입어 보는 장면이면 거울 대신 인물과 손을 잡는다.
- 화면 안에서 읽히는 글자·숫자가 보이는 장면은 적지 않는다 — 가격표·간판·메뉴판·문서·화면 속 글자.
  지금 기술로는 글자가 무늬로 그려져 틀린 값이 나온다(실측: VT PDRN → VT PORN, 39,000 → 79,000).
  가격·이름처럼 정확해야 하는 것은 자막이 맡는다.
  ✗ "close-up of a table with the ampoule bottle next to a price tag"
  ✓ "close-up of a single ampoule bottle on a table, morning sunlight"
- 첫 컷은 스크롤을 멈추는 한 방이다. 거리 전경·간판·외관 같은 설정 샷으로 열지 않는다.
- 컷들은 한 편의 영상이다. 같은 피사체를 이어 그리되 같은 그림을 반복하지 않는다 — 샷 크기와 각도를 바꿔 간다.
- **shows 에는 카메라 움직임을 적지 않는다.** shows 로 만드는 것은 클립의 첫 프레임이 될 정지
  화면이라, 움직임을 섞으면 그림이 흐려진다. 움직임은 움직임 축에 따로 적는다.
${motionRules(MOTION_AXES)}
${speedRule(MOTION_AXES)}
- **전 컷을 같은 속도로 두지 않는다.** 빠른 컷이 하나라도 있어야 느린 컷이 산다 — 대비가 없으면
  전체가 늘어진다. static·slow 만으로 채우는 것도 대비가 아니다(눈에는 같은 속도다).
  extreme_slowmo 를 쓸 때는 **그 앞 컷을 fast 나 realtime 으로** 둔다. 앞이 느리면 절정이 죽는다.
- **transition 은 이 컷이 시작하는 구도다.** 앞 컷 끝과 이어 보이게 하는 값이라 **첫 컷에는
  넣지 않는다**(앞이 없다).
  **앞 컷을 가리키는 말을 쓰지 않는다.** 이 값으로 그림을 그리는 쪽은 앞 컷을 볼 수 없다 —
  가리키는 말은 그림 지시가 아니라 소음이 되고, 그런 전환은 통째로 버려진다.
  이어짐을 **구도로 번역해** 그 자체로 읽히게 적는다: 무엇이 어느 크기·어느 눈높이로 화면에
  들어와 있는지를 쓴다.
  · 카메라가 어떻게 움직이는지도 적지 않는다. 여기 적는 것은 **시작 순간의 구도** 하나이고,
    움직임은 움직임 축이 맡는다.
  ✗ "continues from the previous cut" / "same angle as the cut just before" / "picks up with the camera already moved in"
  ✓ "close-up of the feet on asphalt, at the same eye level"
  ✓ "medium shot with the bottle in hand cropped at the left edge, background blurred"
- **[연출 바람]이 주어져 있으면 그것을 우선한다.** 샷 크기·앵글·조명·속도감·질감을 거기 적힌 대로 쓴다.
  무난한 화면으로 뭉개지 말고 적힌 순간을 그대로 잡는다 — "점프하는 모습"이 아니라 적힌 대로
  "점프 정점의 역광 실루엣, 아웃솔이 카메라를 향한".
  연출 바람에 속도가 적혀 있으면 컷마다 다르게 가져간다. 전 컷을 같은 속도로 두지 않는다 —
  빠른 컷이 있어야 느린 컷이 산다.
- **단, 위에 적은 금지는 연출 바람보다 위다.** 연출 바람이 화면 속 글자(가격표·간판·문서)나
  거울에 비친 사람을 요구하더라도 **따르지 않는다.** 지금 기술로 못 그리는 것이고, 값을 치르며
  확인한 것이다. 그럴 때는 같은 뜻을 그릴 수 있는 화면으로 바꿔 적는다.
- [이 영상이 따라가는 것]이 주어져 있으면 컷들이 그것을 중심으로 이어지게 쓴다. 사람이면 그 사람을, 물건이면 그 물건을, 정보면 그 정보를 눈에 보이게 만든다.
  사람이 보이는 컷에는 그 컷에 함께 보이는 사람도 빠짐없이 적는다 — 적지 않은 사람은 뒤 단계가 알 수 없어 컷마다 다른 얼굴로 나온다.
- **광고의 샷 리듬을 지킨다. 대부분은 넓은 샷이고, 제품 클로즈업은 아껴 쓴다.**
  우리가 본 어떤 광고도 처음부터 끝까지 제품에 붙어 있지 않다. 제품은 **사람이 쓰는 장면 안에**
  들어 있다 — 농구화면 선수가 코트에서 뛰는 장면, 사람들이 길에서 신고 다니는 장면, 길거리 농구
  장면에 신발이 함께 담긴다. 제품이 화면을 독차지하는 컷은 **여는 한 방과 닫는 한 방** 정도다.
  · 클로즈업 계열(extreme close-up·close-up)이 **절반을 넘지 않게 한다.** 넘으면 카탈로그가 된다.
  · 가운데 컷들은 medium shot·full shot·wide shot 으로 **사람이 무엇을 하는지** 보이게 잡는다.
  · 부위(발목·아웃솔·미드솔)를 말하는 문장이라도 화면을 그 부위 클로즈업으로만 채우지 않는다 —
    동작을 하는 사람을 넓게 잡고 그 안에 그 부위가 보이게 쓴다.
  실측에서 초점이 "신발"이었더니 5컷 중 3컷이 클로즈업이고 사람이 무엇을 하는지 보이는 넓은 샷은
  하나뿐이었다 — 기능은 설명됐지만 광고가 되지 않았다.
  [연출 바람]에 누가 무엇을 하는지가 적혀 있으면 그것을 화면의 피사체로 삼는다.
- 초점이 물건인데 사람이 보이는 컷이면, 사람과 물건을 한 화면에 담는다. 시선이나 손이 그 물건을 향하게 쓴다.
  ✗ "close-up of a smiling woman in her late 20s" — 초점이 물건인데 물건이 화면에 없다
  ✓ "medium shot of a woman in her late 20s holding the ampoule bottle and looking at it, smiling"
- [올린 사진]은 무엇을 찍을 수 있는지 알려 주는 목록이다. 그 사진에 있는 물건·공간을 화면에 넣어도 좋다. 어느 사진을 쓸지는 적지 않는다 — 뒤 단계가 정한다.
- 자료에 없는 사실을 화면으로 지어내지 않는다.`;

// ★ opts 는 시나리오가 정한 것을 싣는 자리다(2026-08-16). **없으면 지금까지와 글자 그대로
//   같은 지문이어야 한다** — 이 함수는 측정 스크립트와 옛 호출부가 함께 쓴다.
export function buildShowsMessages(project, cuts, opts = {}) {
  const photos = (project.material?.photos || []).map((p) => `- id:${p.id} ${p.filename}`).join("\n") || "(없음)";
  // 장면이 하는 일(beat)을 대사 옆에 함께 적는다 — 대사만 주면 화면이 대사의 삽화가 된다.
  // 시나리오가 없던 시절에는 줄 자체가 없었으므로, beats 가 없으면 예전 줄 그대로 남는다.
  const beats = Array.isArray(opts.beats) ? opts.beats : null;
  // 무음 컷도 자기 자리를 갖는다 — 목록이 밀리면 shots 와 컷의 짝이 어긋난다
  const list = cuts.map((c, i) => {
    const what = c.silent ? "(말 없는 장면)" : c.sentence;
    const beat = beats && beats[i] ? ` — ${beats[i]}` : "";
    return `${i + 1}. ${what}${beat}`;
  }).join("\n");
  // 초점 — 이 영상이 무엇을 따라가는지. 없으면 블록째 빼서 지금 동작 그대로 둔다.
  // 이것이 없을 때 화면이 어떤 편은 사물로, 어떤 편은 인물로 쏠렸다(2026-07-28~29 관측).
  //
  // ★ 이제 초점은 **시나리오가 답한다**(브리핑이 답하던 자리다). 시나리오를 거치지 않은
  //   옛 프로젝트는 브리핑으로 떨어진다 — 그때 값이 있는 자리가 거기뿐이다.
  //   ⚠️ 갖춰진 것(mode·subject 둘 다)만 고른다 — 반쪽짜리 시나리오 초점이 truthy 라는
  //   이유로 앞자리를 차지하면, 멀쩡한 브리핑 초점이 가려져 블록째 사라진다.
  const sf = project.scenario?.focus;
  const f = sf?.mode && sf?.subject ? sf : project.briefing?.focus;
  const focusBlock = f?.mode && f?.subject ? `\n[이 영상이 따라가는 것]\n${f.mode} — ${f.subject}\n` : "";
  // 전달 방식(angle) — 이 영상을 어떻게 이야기하는가. 이것이 없으면 컷마다 딴 이야기가 된다.
  // 없으면 블록째 뺀다 — 옛 호출부의 지문이 한 글자도 안 달라져야 한다.
  const angle = typeof opts.angle === "string" ? opts.angle.trim() : "";
  const angleBlock = angle ? `\n[이 영상을 어떻게 전달하는가]\n${angle}\n` : "";
  // 사장님이 "어떻게 보이게 하고 싶다"고 적은 것. 브리핑이 자료에서 뽑아 둔다(lib/briefing.js).
  //
  // 이것이 없던 동안 사장님이 쓴 연출이 화면 설계에 **한 글자도 도달하지 않았다** — 자료 원문은
  // 대본에만 전달됐고 거기서 낭독으로 변했다("공중에 뜬 실루엣은 극단적 슬로모션으로 강조됩니다",
  // 2026-07-30 실제 생성물). 그래서 화면은 전부 무난하고 움직임은 전부 "천천히"였다.
  //
  // 없으면 블록째 뺀다 — 연출을 안 적는 사장님이 더 많고, 그때는 지금까지처럼 알아서 정한다.
  const dir = typeof project.briefing?.direction === "string" ? project.briefing.direction.trim() : "";
  const directionBlock = dir ? `\n[연출 바람 — 사장님이 이렇게 보이길 원한다]\n${dir}\n` : "";
  // 주제도 시나리오가 먼저다 — 브리핑만 보면 새 프로젝트가 늘 "(밝히지 않음)"이다
  const user = `[영상 주제] ${project.scenario?.topic || project.briefing?.topic || "(밝히지 않음)"}
[원고 전문]
${project.script?.text || ""}

[컷 ${cuts.length}개 — 이 순서대로 shots를 만든다]
${list}
${focusBlock}${angleBlock}${directionBlock}
[올린 사진]
${photos}`;
  return { system: SHOWS_SYSTEM, messages: [{ role: "user", content: user }] };
}

// shows 에서 정지 그림에 못 담을 절을 뺀다 — 이미지 프롬프트를 만들 때만 쓴다.
//
// SHOWS_SYSTEM 에 "shows 에는 카메라 움직임을 적지 않는다"가 굵게 적혀 있는데도 지켜지지
// 않아 "자전거 바퀴가 천천히 회전한다"가 그림 지시로 갔다(2026-07-28 관통). 정지 이미지
// 모델은 회전을 그릴 방법이 없어 회전을 **암시하는** 그림을 만든다 — 페달에서 뗀 발,
// 굴러가는 자세. 그 그림이 클립의 첫 프레임이 되어 "페달을 안 밟는데 굴러가는" 결함이 굳는다.
// 이 저장소가 반복해 겪은 패턴이다 — 지켜져야 하는 것은 프롬프트가 아니라 코드가 쥔다.
//
// **저장된 shows 는 건드리지 않는다.** 사장님이 대본 화면에서 보고 고치는 값이라,
// 화면에 보이는 것과 그림 지시가 어긋나면 고칠 근거를 잃는다. 여기서 걸러 쓰기만 한다.
//
// 판정선은 감이 아니라 실측에서 뽑았다 — 화면 설계를 자료 6편 × 3회 돌려 절 122개를 모으고
// (scripts/measure/shows-motion-leak.mjs) 눈으로 라벨해 규칙을 맞췄다. 결과 4/4·오검출 0.
// 절 122개 중 76%가 명사·관형형으로 끝나(구도 서술) 판정 대상조차 아니었고, 오염은 3.3%였다.
const STILL_FORMS = [
  /\s있다$/,      // 보조용언 '있다' 구성 — "놓여 있다"(상태) · "입고 있다"(착용). 둘 다 정지다
  /보인다$/,       // 존재
  /하다$/,        // 양태 — "딸기 조각이 가득하다"
  /(햇빛|햇살|빛|조명|먼지).*(비친다|비춘다|들어온다|떠다닌다)$/, // 빛이 주어인 조명 서술
];
// 유지 형태라도 속도 부사가 붙으면 움직임이다 — "손이 키보드를 빠르게 치고 있다".
// '부드럽게'는 넣지 않는다. 속도가 아니라 태(態)라서, 정당한 "조명이 부드럽게 비친다"까지 지운다.
const SPEED_ADVERBS = /(천천히|서서히|빠르게|점점|조금씩)/;

// 카메라 움직임 낱말 — **절을 버리지 않고 이 낱말만 지운다.**
//
// 왜 낱말만인가: "로우 앵글 트래킹"에서 '로우 앵글'은 정당한 구도 서술이다. 절째로 버리면
// 앵글을 잃고, 두면 카메라 이동이 그림 지시로 간다.
//
// ★ 실측(2026-07-30): shows 가 "로우 앵글 트래킹, 크로스오버로 방향을 트는 선수의 발"이었고
// 위 필터가 이 절을 통과시켰다 — `~다/요`로 끝나지 않아 "구도 서술"로 봤고 카메라 낱말은
// 검사하지 않았다. 정지 이미지 모델은 이동을 그릴 방법이 없어 이동을 **암시**하는 그림을
// 만든다. 그 컷에서 **다리가 셋** 나왔다(VLM 은 "오류 없음"으로 통과시켰다).
// 예전에 "자전거 바퀴가 회전한다"가 페달에서 뗀 발을 만든 것과 같은 패턴의 재발이다.
//
// ★ 영어 낱말을 함께 본다(2026-08-17 언어 정책). shows 가 영어로 나오는 순간 이 필터는
//   조용히 눈이 멀어 **카메라 절이 통째로** 그림 지시로 갔다 — 위 '다리가 셋'과 같은 자리다.
//   영어 낱말은 지어낸 것이 아니라 **지문이 요구하는 어휘**에서 뽑았다: 움직임 축 camera 의
//   hint(다가간다·물러난다·따라간다·올려본다)와 example("slowly pulls back")·bad("orbits
//   around, pulls back, then pushes in again"), 그리고 tone·transition 의 ✗ 예시
//   ("the color cools as the camera moves closer" · "picks up with the camera already moved in").
//   한국어 낱말은 지우지 않는다 — 더하기만 한다(저장된 옛 shows 의 판정 무변경).
//
// ⚠️ 영어에서는 **방향어를 요구하는 낱말이 한국어보다 많다.** pan·truck·crane 은 영어에서
//    프라이팬·트럭·두루미/기중기라는 흔한 일반명사라, 한국어처럼 낱말만으로 지우면 정당한
//    피사체가 화면에서 사라진다(한국어 팬·트럭·크레인은 그 자리에서 거의 카메라 뜻이다).
//
// ★★ 방향어 절은 **주어가 카메라일 때만** 카메라 지시다(2026-08-17 리뷰 실측으로 좁혔다).
//    그 전에는 주어를 안 봐서 피사체가 방향으로 움직이는 정상값이 카메라 지시로 판정됐다:
//    "shadows track across the floor" · "light pans across the wall" · "the model pulls back
//    her hair". 이것이 아래 CAMERA_MOTION 에서는 **값 통째 폐기**라 전 컷의 톤 레이어가 0 이
//    됐고, 같은 형태인 "the dog runs across the yard" 는 run 이 목록 밖이라 통과해서
//    **판정이 일관되지도 않았다.**
//
//    주어가 카메라인지 어떻게 아는가: 우리 지문은 카메라 지시를 **주어 없이** 적는다
//    (움직임 축 camera 의 example "slowly pulls back" · bad "orbits around, pulls back, then
//    pushes in again" · ✗ 예시 "starting already zoomed in"). 즉 방향어 동사 바로 앞에
//    올 수 있는 것은 **아무것도 없거나**(값·절의 시작), 구두점, 접속어, 또는 -ly 부사다.
//    **명사가 앞에 오면 그 주어는 카메라가 아니다.** 주어가 카메라인 경우는 아래 `camera`
//    가지가 따로 맡는다("the camera pushes in" · "the camera already moved in").
//    -ly 로 부사를 알아보는 것은 지문이 요구하는 속도 부사(slowly·gradually·quickly·
//    rapidly·steadily)와 already 를 한 번에 덮기 때문이다. 대가는 -ly 로 끝나는 명사
//    ("a family pulls back")를 카메라로 오독하는 것이고, 그 값은 톤·shows 에 거의 안 온다.
//    (`already` 는 -ly 로 끝나지 않으므로 손으로 적는다 — 지문의 ✗ 예시가 그 낱말을 쓴다.)
//
// ★★ D2(2026-08-17 눈 확인) — 인정하는 앞자리에 **형용사가 없었다.** 그래서 사람이 톤 칸에
//    쓰기 더 쉬운 쪽이 통과했다: "slowly zooms in"(부사)은 버리는데 "slow zoom in" ·
//    "gentle push in" · "a slow dolly in" 은 통과해 **카메라 이동이 이미지 프롬프트의 색·질감
//    지시절로 실렸다** — usableTone 이 막으려고 존재하는 바로 그 일이다.
//    형용사 앞에는 관사가 올 수 있다("soft grade with a slow dolly in")므로 관사를 함께 먹는다.
//
//    ⚠️ 형용사는 **닫힌 목록**이다. `\w+` 로 열면 명사 주어가 형용사로 오독돼
//    "shadows track across the floor" 같은 정상 톤이 통째로 버려진다(그것이 D3 로 이미 한 번
//    무너진 자리다). 낱말의 원천: 한국어 SPEED_ADVERBS(천천히·서서히·빠르게·점점·조금씩)의
//    영어 형용사형(slow·gradual·quick·rapid·steady — EN_SPEED_ADVERBS 와 짝이다),
//    이 저장소의 속도 값 `fast`(SHOWS_SYSTEM 의 speed 목록), 그리고 눈 확인에서 실제로 본
//    `gentle`. smooth·subtle·slight 는 **안 넣었다** — 실제로 본 적이 없고, 지어낸 낱말을
//    넣으면 "the slight tilt down of her head" 처럼 피사체 서술을 카메라로 오독한다.
const EN_MOVE_ADJ = String.raw`(?:slow|gradual|quick|rapid|steady|fast|gentle)`;
const EN_CAMERA_SUBJECT = String.raw`(?:^|[,;:.—]\s*|\bcamera\s+(?:\w+ly\s+)?|\b(?:and|then|as|but|or|now|just|already)\s+|\b\w+ly\s+|(?:\b(?:a|an|the)\s+)?\b${EN_MOVE_ADJ}\s+)`;
// ⚠️ `es` 가 있어야 한다 — 없던 동안 `pushes in`·`crosses over` 를 못 잡아 카메라 이동이
//    그대로 그림 지시로 실렸다(2026-08-17 실측: "…as the camera pushes in").
const EN_DIRECTIONAL_MOVE = String.raw`(?:zoom|pan|tilt|push|pull|truck|dolly|crane|track)(?:es|s|ed|ing)?\s+(?:in|out|up|down|back|away|closer|around|across|left|right|over)\b`;
const CAMERA_WORDS = new RegExp(
  // ⚠️ 방향어 가지가 **낱말 가지보다 앞이다.** 뒤에 두면 "the camera cranes up" 에서
  //    `camera` 만 먼저 먹혀 `cranes up` 이 주어를 잃고 살아남는다(실측으로 밟았다).
  String.raw`(트래킹|오빗|팬(?![가-힣])|줌\s?(인|아웃)?|달리\s?(인|아웃)?|트럭|크레인|핸드헬드|틸트\s?(업|다운)?|카메라가?|${EN_CAMERA_SUBJECT}${EN_DIRECTIONAL_MOVE}|\b(?:tracking|orbit(?:s|ing)?|dolly|dollying|handheld|steadicam|camera|panning|zooming|tilting|craning)\b|\bcrane\s+shot\b)`,
  "gi",
);

// ★ 카메라를 **향한다**는 것은 움직임이 아니라 방향이다(D4, 2026-08-18 눈 확인).
//
// 실측: `… with its rear three-quarter facing camera` 가 `… facing,` 으로 나갔다. `camera` 가
// `facing` 의 목적어였는데 낱말만 지워 목적어를 앗아간 것이다. brokenByRemoval 은 지운 자리
// 앞뒤의 **기능어**만 보므로(`facing` 은 기능어가 아니다) 이 부류를 못 잡는다.
//
// 절을 통째로 버리는 쪽은 답이 아니다 — 그러면 `the sedan stopped again` 같은 멀쩡한 구도
// 서술까지 함께 잃는다. 정지 화면에서 "카메라를 향한다"는 것은 **보는 이를 향한다**는 뜻이니
// 그 말로 바꾼다. 그러면 CAMERA_WORDS 가 지울 `camera` 가 애초에 남지 않는다.
//
// ⚠️ **닫힌 목록이고, 정적 방향어만 넣는다.** `drives toward the camera` 처럼 움직임 동사
//    뒤의 전치사구까지 살려 주면 이 함수가 막으려던 것이 그대로 통과한다. 그래서 방향을
//    가리키는 분사·동사(facing·looking·angled…)를 **직접** 나열한다(전치사 단독은 안 받는다).
// ⚠️ `into` 는 `the viewer` 와 붙지 않는다("looking into the viewer") — `at` 으로 바꿔 준다.
const EN_CAMERA_ORIENT =
  /\b(facing|faces|looking|looks|staring|stares|gazing|gazes|angled|pointed|oriented|turned)(\s+(?:at|into|toward|towards))?\s+(?:the\s+)?camera\b/gi;
const towardViewer = (_m, verb, prep) => {
  const p = (prep || "").trim().toLowerCase();
  const keep = p === "into" ? "at" : p;
  return keep ? `${verb} ${keep} the viewer` : `${verb} the viewer`;
};

// 카메라 낱말을 지운 뒤 관사·전치사만 남으면 그 절도 카메라 서술뿐이었다 —
// "the camera" 에서 camera 를 지우면 "the" 가 남는다(한국어에는 없는 자리다).
const EN_LEFTOVER_ONLY = /^(?:the|a|an|its|of|and|with|in|on|slowly|gradually|quickly|already)(?:[\s,]+(?:the|a|an|its|of|and|with|in|on|slowly|gradually|quickly|already))*$/i;

// 영어 절의 속도 부사 — 한국어 SPEED_ADVERBS 와 같은 자리다. 축 예시가 "slowly pulls back"
// 이므로, shows 에 속도 부사가 붙었다는 것은 움직임 축의 값이 흘러들어왔다는 신호다.
const EN_SPEED_ADVERBS = /\b(slowly|gradually|quickly|rapidly|steadily|little by little)\b/i;

// 영어 움직임 서술 — **닫힌 목록**이다. 원천은 움직임 축의 예시·hint("lifts the cup toward
// the mouth" · "people pass by outside the window" · "slowly pulls back")와, 이 저장소가
// 한국어에서 실측으로 잡아 둔 누출 부류(회전한다·채워진다·지나간다·깜빡인다)의 영어 대응이다.
//
// **원형·3인칭 단수형만 본다.** -ing/-ed 는 영어의 관형형이라 정지 화면의 구도 서술이다
// ("hands dropping strawberries" · "chairs stacked on the tables") — 한국어에서 절의 끝이
// 명사·관형형이면 건드리지 않는 것과 같은 판단이다.
//
// ★★ D1(2026-08-17 눈 확인) — **목록이 두 벌이라 빠졌다.** 아래 STILL_FORMS_EN 의 첫 규칙
//    (빛·김·먼지가 주어인 조명 서술)이 자기 동사 목록을 **따로** 손으로 들고 있었고, 거기에
//    `rise` 가 없었다(`falls`·`drifts` 는 있었다). 여기 EN_MOTION 에는 있다. 그래서
//    "steam rises from the lid" — 이 저장소 픽스처가 카페인 만큼 가장 흔한 정지 화면 서술 —
//    이 움직임으로 판정돼 **통째로 버려졌다.** shows 가 비면 imagePromptBody 의 폴백이
//    `cut.sentence` 라, **영어 프롬프트 한복판에 한국어 낭독 문장이 그림 지시로 들어가고**
//    그 컷 그림을 컷당 $0.08 에 샀다(실측: `Scene: 아침마다 커피가 식어서 버리는 게 아까웠어요..`).
//
//    그래서 **목록을 하나로 합쳤다.** 움직임 동사는 이 배열 한 벌만 있고, 정지 서술 규칙이
//    같은 배열을 읽는다 — 이제 여기에 동사를 더하면 대기 서술의 면제가 **함께** 늘어나므로
//    "움직임 목록에는 있는데 정지 목록에는 없는 동사"가 구조적으로 생기지 않는다.
//    ⚠️ 한국어 목록과는 합칠 수 없다 — 어간+어미라 낱말이 1:1 로 대응하지 않고(비친다·비춘다·
//    들어온다·떠다닌다 넷이 comes/falls/drifts/floats… 를 덮는다), 무엇보다 **한국어 판정이
//    한 글자도 달라지면 안 된다**(각인 toneKey → 이미 값을 치른 그림·클립이 낡는다).
//    대신 부류를 짝지어 주석에 적어 둔다 — 다음에 한쪽만 늘어나는 것을 알아보게.
const EN_MOTION_VERBS = [
  "push", "pull", "move", "track", "follow", "orbit", "circle", "rotate", "spin", "turn",
  "walk", "run", "ride", "pass", "lift", "rise", "fall", "drift", "float", "pour", "fill",
  "flicker", "blink", "sway", "shake", "swing", "approach", "retreat", "enter", "exit",
  "cross", "come", "go",
];
const EN_MOTION = new RegExp(String.raw`\b(?:${EN_MOTION_VERBS.join("|")})(?:es|s)?\b`, "i");

// 대기(빛·김·먼지)만이 주어가 되는 동사 — 움직임 목록에는 없다. 사람·물건이 주어면 애초에
// EN_MOTION 에 안 걸려 그대로 통과하므로 여기 있어도 판정을 넓히지 않는다.
// `settle`·`swirl` 은 눈 확인이 함께 짚은 낱말이다("dust settles" · "steam swirls").
const EN_AIR_ONLY_VERBS = ["stream", "spill", "hit", "catch", "land", "settle", "swirl"];

// 대기 서술의 주어 — 한국어 STILL_FORMS 의 `(햇빛|햇살|빛|조명|먼지)` 와 같은 자리다.
// 한국어에 있는데 영어에 없던 것을 채웠다(D1 과 같은 부류의 누락이다): 조명 → lighting,
// 그리고 지문이 shows 에 허용한 것들 — "빛줄기 속 먼지" → beam·ray, "바닥에 닿는 반사" →
// reflection, environment 규칙의 안개 → mist·fog, 움직임 축 ambient 의 "김·먼지·물결" → ripple.
const EN_AIR_NOUNS = String.raw`(?:sun)?(?:light|lights|lighting|sunlight|sunbeam|glow|shadow|shadows|dust|steam|haze|mist|fog|reflection|reflections|beam|beams|ray|rays|ripple|ripples)`;

// 영어 정지 서술 — 한국어 STILL_FORMS 와 같은 자리다. 움직임 낱말이 들어 있어도 정지 그림인
// 형태를 살린다. 목록은 한국어 것을 하나씩 옮긴 것이다:
//  · 빛이 주어인 조명 서술("햇빛에 먼지가 떠다닌다" → "dust drifts in the light")
//  · 보조용언 '있다' 구성(놓여 있다·입고 있다 → is/are placed·is wearing)
//  · 존재·양태(보인다·가득하다 → there is/are · is visible · sits/stands/hangs)
const STILL_FORMS_EN = [
  new RegExp(
    String.raw`\b${EN_AIR_NOUNS}\b[^.]*\b(?:${[...EN_MOTION_VERBS, ...EN_AIR_ONLY_VERBS].join("|")})(?:es|s)?\b`,
    "i",
  ),
  /\b(?:is|are)\s+\w+(?:ed|ing)\b/i,
  /\b(?:sits?|stands?|rests?|hangs?|lies?|leans?|is|are)\b[^.]*\b(?:on|in|against|over|under|beside|behind|across|visible)\b/i,
  /\bthere\s+(?:is|are)\b/i,
];

// 영어 기능어 — 관사·전치사·접속사처럼 **혼자서는 아무것도 가리키지 못하는** 낱말이다.
// 지운 카메라 낱말이 이끌던 자리가 비면 이것들만 덩그러니 남는다.
const EN_FUNCTION_WORD = /^(?:the|a|an|its|his|her|their|of|and|as|with|in|on|at|to|from|by|for|over|under|around|across|along|through|into|toward|towards|up|down|out|back|off|near|behind|beside|between|that|which|while|when)$/i;

// ★ D2(2026-08-17 실측) — 낱말만 지우면 **비문**이 유료 프롬프트로 간다:
//   "the camera orbits around the players" → "the around the players"
//   "the camera cranes up over the rooftops" → "the over the rooftops"
//   "tracking the runner along the fence" → "the runner along the fence"
//   한국어는 이 자리에서 자가교정된다 — `카메라가` 를 지워도 `~다` 종결이 남아 정지형 검사에
//   떨어져 절이 통째로 빠진다. 영어는 EN_MOTION 이 **이미 지워진 동사**를 못 보므로 무력하다.
//
// 둘을 가르는 규칙은 "낱말을 지우고 **문장이 성립하는가**"다. 성립하는 잔여물은 살려야 한다 —
//   "low-angle tracking" → "low-angle"(정당한 구도 서술) · "handheld close-up of the hands"
// 성립 여부를 **지운 자리**에서 본다. 지운 낱말은 둘 중 하나였다:
//   · 뒤를 이끄는 **동사** — 지우면 그 목적어·전치사구가 머리를 잃는다.
//     → 지운 자리 바로 뒤가 기능어면 깨졌다("tracking |the runner …" · "camera orbits
//       |around the players").
//   · 앞에 붙는 **꼬리** — 지워도 앞이 그대로 남는다("low-angle |").
//     → 단, 지운 자리 앞이 기능어면 그것도 머리를 잃은 것이다
//       ("클로즈업 of the shoe as the |" ← 혼합 절 D1).
// 한국어 전용 절은 이 검사를 받지 않는다(형태론이 다르고, 판정 무변경이 계약이다).
// 지운 자리를 표시하려고 마커 문자를 넣지 않는다 — 소스에 제어문자가 박히고 값에 그 문자가
// 섞이면 판정이 조용히 달라진다. 대신 지운 **구간의 위치**를 그대로 보고, 그 앞뒤 낱말을 읽는다.
function brokenByRemoval(clause) {
  const spans = [];
  for (const m of clause.matchAll(CAMERA_WORDS)) {
    const last = spans[spans.length - 1];
    // 붙어 있는 구간은 하나로 본다 — "the camera orbits around …" 는 두 낱말이 이어 지워진다
    if (last && /^[\s,]*$/.test(clause.slice(last[1], m.index))) last[1] = m.index + m[0].length;
    else spans.push([m.index, m.index + m[0].length]);
  }
  const words = (t) => t.split(/[^A-Za-z가-힣'’-]+/).filter(Boolean);
  for (const [from, to] of spans) {
    const after = words(clause.slice(to))[0];
    if (after) {
      if (EN_FUNCTION_WORD.test(after)) return true;
      continue;
    }
    // 지운 자리 뒤에 아무것도 없다(절 끝에서 지웠다) — 앞이 기능어면 그것도 머리를 잃었다
    const before = words(clause.slice(0, from)).pop();
    if (before && EN_FUNCTION_WORD.test(before)) return true;
  }
  return false;
}

// ★ D3(2026-08-17 눈 확인) — 앞 절이 버려지면 뒤 분사구가 **주어를 잃는다**:
//   "a woman passes the counter, holding a paper cup" → `Scene: holding a paper cup.`
//   누가 들고 있는지가 없는 조각이 유료 프롬프트로 나갔다. `brokenByRemoval` 은 **카메라
//   낱말을 지운 자리**만 보므로, keptByEnglish 가 절 하나를 통째로 버려서 생긴 주어 없음은
//   아무도 안 봤다(d6afa43 "주어 없는 과다 필터" 와 인접하지만 같은 경로가 아니다).
//
// 분사구는 앞의 주절에 붙어야 뜻이 서는 말이다. 그래서 **앞에 살아남은 절이 하나도 없을 때만**
// 버린다 — 앞 절이 살아 있으면 그것이 주어를 준다("close-up of the lid, steam curling up").
// 값의 첫 절은 건드리지 않는다(모델이 분사구로 열 수 있고, 그때는 버릴 앞 절이 애초에 없다).
//
// 분사구인지 어떻게 아는가: 첫 낱말이 -ing/-ed 이고 **바로 뒤에 목적어·전치사구가 온다**
// (기능어로 시작한다). 이 조건이 -ing 로 끝나는 명사를 갈라 준다 — "lighting rigs overhead"
// 는 뒤가 명사라 안 걸린다. `during` 은 전치사라 손으로 뺀다(그것만 뒤에 관사가 온다).
const EN_DANGLING_PARTICIPLE = new RegExp(
  String.raw`^(?!during\b)\w+(?:ing|ed)\s+(?:the|a|an|his|her|its|their|to|toward|towards|into|onto|over|across|through|at|on|in|from|with|against|down|up|out|back|around|along|by|for)\b`,
  "i",
);

// 한국어 절의 판정 — 옛 코드의 분기를 글자 그대로 옮긴 것이다(한국어 무변경 계약).
function keptByKorean(cleaned) {
  // 명사·관형형으로 끝나면 구도 서술이다. 절 안의 동사를 훑으면 안 된다 —
  // "자전거를 타고 지나가며 손을 흔드는 풀 샷"은 '지나가며'가 있어도 정지 화면이다
  if (!/(다|요)$/.test(cleaned)) return true;
  if (SPEED_ADVERBS.test(cleaned)) return false;
  return STILL_FORMS.some((re) => re.test(cleaned));
}

// 영어 절의 판정 — 옛 코드의 분기를 그대로 옮긴 것이다.
function keptByEnglish(cleaned) {
  if (EN_LEFTOVER_ONLY.test(cleaned)) return false;
  // 움직임 낱말이 없으면 구도 서술이다(영어 shows 의 대부분이 명사구다)
  if (!EN_MOTION.test(cleaned) && !EN_SPEED_ADVERBS.test(cleaned)) return true;
  // 속도 부사는 정지형보다 **앞선다** — 한국어와 같은 순서다("there is slowly rising steam")
  if (EN_SPEED_ADVERBS.test(cleaned)) return false;
  return STILL_FORMS_EN.some((re) => re.test(cleaned));
}

export function stillOnly(shows) {
  // 영어 절 경계는 마침표다 — 쉼표만 보면 "…the shoe. the camera pushes in" 이 한 절이 된다.
  // **뒤에 라틴 문자가 올 때만** 나눈다: 한국어 전용 값에는 이 자리가 없어 판정이 무변경이다.
  const clauses = String(shows || "")
    .split(/,\s*|\.\s+(?=[A-Za-z])/)
    .map((c) => c.trim())
    .filter(Boolean);
  const kept = [];
  for (const [at, raw] of clauses.entries()) {
    // ★ 방향으로 쓴 카메라를 먼저 "보는 이"로 바꾼다 — 지우기보다 **앞이다.** 뒤에 두면
    //   CAMERA_WORDS 가 이미 목적어를 앗아간 뒤라 되돌릴 것이 없다(D4 주석 참고).
    //   brokenByRemoval 도 이 값을 봐야 한다 — 원문을 넘기면 없는 결함을 보고 절을 버린다.
    const c = raw.replace(EN_CAMERA_ORIENT, towardViewer);
    // 카메라 낱말을 지운다 — 지우고 남는 것이 없으면 그 절은 카메라 서술뿐이었다
    const cleaned = c.replace(CAMERA_WORDS, "").replace(/\s{2,}/g, " ").trim();
    if (!cleaned) continue;
    const hasKo = /[가-힣]/.test(cleaned);
    const hasEn = /[A-Za-z]/.test(cleaned);
    // ★ 혼합 절을 어떻게 가르는가(D1, 2026-08-17): 예전에는 한글이 **한 글자**라도 섞이면
    //   그 절이 한국어 규칙으로만 갔고, 한국어 정지형 검사(`~다/요`)에 안 걸려 **무조건**
    //   살아남았다 — 그래서 "클로즈업 of the shoe as the camera pushes in" 의 카메라 이동이
    //   그림 지시로 실렸다. 이제는 **글자가 있는 쪽의 검사를 다 받는다**: 한국어가 있으면
    //   한국어 규칙, 라틴 문자가 있으면 영어 규칙 + 위 비문 검사. 둘 다 살려야 살아남는다.
    //   한국어 전용 절(hasEn === false)은 옛 분기와 글자 그대로 같은 길을 간다.
    if (hasEn && brokenByRemoval(c)) continue;
    if (hasKo && !keptByKorean(cleaned)) continue;
    if (hasEn && !keptByEnglish(cleaned)) continue;
    // 앞 절이 전부 버려진 뒤 남은 분사구는 주어를 잃었다(D3) — 한국어 전용 절은 이 검사를
    // 받지 않는다(형태론이 다르고, 판정 무변경이 계약이다).
    if (hasEn && at > 0 && kept.length === 0 && EN_DANGLING_PARTICIPLE.test(cleaned)) continue;
    kept.push(cleaned);
  }
  return kept.join(", ");
}

// 앞 컷을 가리키는 말. 이미지 모델은 앞 컷을 모르므로 이런 값이 그대로 들어가면
// 그림 지시가 아니라 소음이 된다 — stillOnly 를 만든 것과 같은 결함이다.
//
// '방금' 은 넣지 않는다 — "방금 구운 빵"·"방금 내린 커피"처럼 앞 컷과 무관한
// 신선함 서술이 훨씬 흔하다(이 저장소의 픽스처 자체가 카페다).
//
// ★ 영어도 함께 본다(2026-08-17). 낱말은 지문의 ✗ 예시에서 그대로 뽑았다 —
//   "continues from the previous cut" · "same angle as the cut just before" ·
//   "picks up with the camera already moved in"(이쪽은 아래 CAMERA_MOTION 이 잡는다).
//   ⚠️ `same` 만으로는 안 된다 — 지문의 ✓ 예시가 "at the same eye level"이다. 그래서
//   뒤에 컷·샷·장면을 요구하거나, "just before"·"as above" 처럼 그 자체로 참조인 말만 본다.
const CUT_REFERENCE = /((앞|이전)의?\s?(컷|장면)|직전|같은\s?컷|바로\s?전|이어받아|위와\s?같은|\b(?:previous|preceding|earlier|last|prior)\s+(?:cut|shot|scene|frame|take|image)\b|\bjust\s+before\b|\bsame\s+(?:cut|shot|scene|frame|take)\b|\bcontinu(?:es?|ing)\s+from\b|\bcarry(?:ing|ies)?\s+over\b|\bpick(?:s|ing)?\s+up\s+(?:from|where)\b|\bsame\s+as\s+above\b|\bas\s+(?:the\s+)?(?:previous|preceding)\b)/i;

// 움직임이 명확한 카메라 지시만. **판정 전용**이라 CAMERA_WORDS 와 따로 둔다 —
// 그것은 stillOnly 가 낱말만 지우려고(.replace) 만든 삭제용 패턴이라 오검출 대가가
// "낱말 하나"지만, 여기서는 "값 통째"다. tone 은 영상 전체에 복사되는 값이라
// 낱말 하나에 톤 레이어 전체가 0 이 된다.
//
// 그래서 좁혔다:
//   · 방향어를 **필수**로 — "생기를 더해 줌"·"달리 보이는 진한 대비"가 걸리면 안 된다
//   · '핸드헬드'·'트럭' 제외 — "핸드헬드 다큐 질감"은 카메라 이동이 아니라 질감 서술이다
//
// ★ 2026-08-13 최종 리뷰 실측으로 셋을 더 좁혔다. 셋 다 **정상값이 통째로 버려지고 있었다**:
//   · `카메라가` 는 조사만으로는 부족했다 — "필름 카메라가 만든 거친 입자감"이 걸렸다.
//     **뒤에 움직임 동사를 요구**한다(다가·물러·도는/돌·따라·움직·이동·올라·내려·밀·당기).
//     "카메라가 도는"은 '돌다'가 '도는'으로 활용되므로 두 형태를 다 적는다.
//   · `팬(?![가-힣])` 은 "팬 서비스 같은 화사한 톤"을 걸렀다 — **방향어를 요구**한다(업·다운·인·아웃).
//   · `달리\s?(인|아웃)` 은 "달리 인상적인 대비"·"달리 인식되는 색"을 걸렀다 —
//     공백을 필수로 하고 뒤에 한글이 이어지지 않을 때만(`(?![가-힣])`) 카메라 지시로 본다.
// 지금 고치는 이유: 이 패턴이 곧 각인(toneKey)의 일부라, 굳은 `image.tone_of` 가 생긴 뒤에
// 고치면 그 프로젝트 전 컷이 낡음으로 뒤집혀 재구매가 제시된다(30초 한 편 ~$9).
// g 플래그를 붙이지 않는다 — lastIndex 가 남지 않아 함정 자체가 없다.
//
// ★ 영어를 함께 본다(2026-08-17 언어 정책). tone·transition 이 영어로 나오는 순간 이 판정은
//   조용히 눈이 멀었다 — "the camera pushes in as the color cools" 가 **그대로 통과해** 카메라
//   움직임이 톤으로 전 컷에 실렸다(실측). 낱말은 지어낸 것이 아니라 지문이 요구하는 어휘다:
//   움직임 축 camera 의 example("slowly pulls back")·bad("orbits around, pulls back, then
//   pushes in again")와 ✗ 예시("the color cools as the camera moves closer" ·
//   "picks up with the camera already moved in").
//
// ★★ **지금 넓히는 것이 공짜다.** 이 패턴은 각인(toneKey)의 일부라, 굳은 image.tone_of 가
//    생긴 뒤에 고치면 그 프로젝트 전 컷이 낡음으로 뒤집혀 재구매가 제시된다(30초 한 편 ~$9).
//    지금은 **영어 톤이 저장된 프로젝트가 하나도 없다** — 이 브랜치는 미배포이고 라이브로 한
//    번도 안 돌렸다. 그리고 한국어 패턴은 **한 글자도 건드리지 않았다**(더하기만 했다) —
//    한국어 값의 판정·각인은 무변경이므로 이미 굳은 산출물도 그대로다. 다음 사람이 겁내지
//    않게 적어 둔다: 창이 닫히는 것은 이 브랜치로 **한 번이라도 영어 톤을 생성한 뒤**다.
//
// 영어에서도 한국어와 같은 규율로 좁혔다 — **방향어·움직임 동사를 필수**로 한다:
//   · `camera` 는 뒤에 움직임 동사를 요구한다("film camera grain" 이 걸리면 안 된다).
//     사이에 부사가 끼는 것을 허용한다("the camera already moved in").
//   · `pan`·`crane`·`truck` 은 프라이팬·기중기·트럭이라는 일반명사라 방향어(또는 shot)를
//     요구한다. `handheld` 는 한국어와 같이 제외한다 — 이동이 아니라 질감 서술이다.
//
// ★★ D3(2026-08-17 리뷰 실측) — 방향어를 요구한 것만으로는 부족했다. **주어를 안 봤다.**
//    피사체가 방향으로 움직이는 정상 톤이 통째로 버려져 전 컷의 색·질감 레이어가 0 이 됐다:
//    "shadows track across the floor" · "light pans across the wall" ·
//    "the model pulls back her hair". 이제 방향어 절은 위 `EN_CAMERA_SUBJECT` 를 통과할 때만,
//    즉 **주어 자리가 비어 있을 때만** 카메라 지시로 본다(우리 지문이 카메라 지시를 주어 없이
//    적는다). 주어가 명시적으로 카메라인 경우는 아래 `camera` 가지가 그대로 맡는다.
//    ⚠️ 방향어를 요구한 대책 자체는 그대로다 — "a crane by the harbor"·"a pan of eggs"·
//    "a delivery truck parked outside"·"film camera grain" 은 계속 통과한다.
const CAMERA_MOTION = new RegExp(
  String.raw`(트래킹|오빗|크레인|줌\s?(인|아웃)|달리\s(인|아웃)(?![가-힣])|틸트\s?(업|다운)|팬\s?(업|다운|인|아웃)|카메라가\s?(다가|물러|도는|돌|따라|움직|이동|올라|내려|밀|당기)|\b(?:tracking|orbits?|orbiting|dollying|craning|panning|zooming|tilting)\b|${EN_CAMERA_SUBJECT}${EN_DIRECTIONAL_MOVE}|\bcrane\s+shot\b|\bcamera\s+(?:\w+\s+){0,2}?(?:mov(?:es?|ed|ing)|push(?:es|ed|ing)?|pull(?:s|ed|ing)?|track(?:s|ed|ing)?|follow(?:s|ed|ing)?|orbit(?:s|ed|ing)?|circl(?:es|ed|ing)|ris(?:es|ing)|rose|dolli(?:es|ed)|pans?|tilts?|zooms?|drift(?:s|ing)?|clos(?:es|ing)\s+in))`,
  "i",
);

// 문지기가 값을 버렸다는 흔적. 버려진 값은 지금까지 아무 데도 안 남았다 —
// 위 오검출 셋도 리뷰어가 손으로 돌려 보고서야 드러났다.
// (이 저장소 지침: "측정 없이 품질을 주장하지 않는다".)
//
// 호출마다 남긴다. 톤은 전 컷에 복사되므로 컷 수만큼 줄이 나오는데, 그 반복 자체가
// "이 영상은 톤 레이어가 통째로 0이다"라는 신호다.
// **값이 애초에 없을 때는 남기지 않는다** — 그건 정상이다(첫 컷에 전환이 없는 것처럼).
function warnDropped(what, value, why) {
  console.warn(`[${what} 필터] ${why} — 통째로 버린다: "${value}"`);
}

// 톤에서 쓸 수 있는 것만 — 카메라 움직임이 섞이면 통째로 버린다.
//
// stillOnly 를 쓰지 않는 이유: 그것은 절을 나눠 정지형 종결만 남기는데, 톤은
// "채도를 올린 시네마틱 질감"처럼 명사·관형형으로 끝나 통째로 날아간다.
// 막으려는 것은 움직임 종결이 아니라 카메라 지시 하나다.
export function usableTone(tone) {
  const t = typeof tone === "string" ? tone.trim() : "";
  if (!t) return "";
  if (CAMERA_MOTION.test(t)) {
    warnDropped("톤", t, "카메라 움직임 어휘가 섞였다");
    return "";
  }
  return t;
}

// 이 영상의 음악 — **영상 하나에 하나**이고 시나리오가 정한다(2026-08-18).
//
// ★ 판독을 한 자리에 두는 이유는 promptNoteOf·spokenOf 와 같다: **프롬프트와 각인이 같은
//   함수를 봐야 한다**(lib/steps.js clipKey 가 이것을 부른다). 두 벌로 재면 프롬프트가 같은데
//   각인만 갈려 거짓 낡음이 유료 [다시 만들기]를 연다.
// ★ 컷이 아니라 **프로젝트에서 판다** — 음악은 컷마다 다를 수 있는 값이 아니다. 컷에 저장해
//   두면 저장값과 비교값이 같은 출처가 되어 음악을 바꿔도 영영 안 낡는다(clipKey 의 spokenOf
//   주석과 같은 함정이다).
// ★ 끝 부호를 여기서 닫지 않는다 — 부르는 쪽이 톤과 같은 문형으로 붙인다(`…: ${music}.`).
//   톤과 대우를 맞춘다: 둘 다 "전 컷에 똑같이 실리는 한 줄"이다.
export function musicOf(project) {
  const m = project?.scenario?.music;
  return typeof m === "string" ? m.trim() : "";
}

// 전환에서 쓸 수 있는 것만 — 참조어**나** 카메라 움직임이 있으면 통째로 버린다.
// transition 은 "이 컷이 시작하는 구도"라 카메라 어휘가 들어오기 딱 좋은 자리다
// ("줌 인 상태에서 시작하는 …"). 문지기 둘 중 하나가 열려 있으면 게이트의 뜻이 반이 된다.
// 전환 하나가 빠지는 것이 그림이 틀리는 것보다 싸다.
export function usableTransition(transition) {
  const t = typeof transition === "string" ? transition.trim() : "";
  if (!t) return "";
  // 어느 문지기에 걸렸는지까지 남긴다 — 둘은 고칠 자리가 다르다(지문의 전환 규칙 vs 카메라 규칙)
  if (CUT_REFERENCE.test(t)) {
    warnDropped("전환", t, "앞 컷을 가리키는 말이 있다");
    return "";
  }
  if (CAMERA_MOTION.test(t)) {
    warnDropped("전환", t, "카메라 움직임 어휘가 섞였다");
    return "";
  }
  return t;
}

// 절의 **재료**를 고르는 자리. 문구는 부르는 쪽이 쓴다.
//
// ★ 왜 재료만 나누는가: 버그가 사는 곳은 "어느 인물이 이 컷인가"·"무엇이 제품인가" 같은
//   선택이지 문장 부호가 아니다. 문구까지 공유하면 이미지와 영상이 같은 말을 해야 하는데,
//   둘은 보는 대상이 다르다(정지 화면 vs 이어지는 클립).

// 화면비 낱말. 기본값(아무 것도 안 걸리면)은 지금까지의 삼항식과 같다 — horizontal 16:9.
export function orientOf(project) {
  const ar = project.settings.aspect_ratio;
  return ar === "9:16" ? "vertical 9:16" : ar === "1:1" ? "square 1:1" : "horizontal 16:9";
}

// 무대 원문 — cut.environment 를 다듬은 것. 없으면 빈 문자열이라 절을 늘리지 않는다.
export function stageOf(cut) {
  return typeof cut?.environment === "string" && cut.environment.trim() ? cut.environment.trim() : "";
}

// 이 컷에 배정된 인물의 "who: look" 목록. look 이 없는 인물은 세지 않는다.
export function castLooksOf(cut, project) {
  return (project.cast || [])
    .filter((c) => Array.isArray(c?.cuts) && c.cuts.includes(cut.idx) && typeof c?.look === "string" && c.look.trim())
    .map((c) => `${c.who || "인물"}: ${c.look.trim()}`);
}

// 제품 앵커와 외형. 앵커는 **제품**이어야 한다 — topic 은 "이 영상이 무엇에 대한 것인지"라,
// 자료가 기획서면 기획 문구가 된다(실측: "신발을 주인공으로 한 감각적인 광고 영상"이 앵커로
// 들어갔다). 초점이 물건이면 그 대상이 제품이다. 사람·정보 초점의 subject 는 제품이 아니라서
// 쓰지 않는다 — 인물을 "이 제품"이라 부르면 틀린 지시가 된다.
//
// ★ 초점·주제는 이제 시나리오가 답한다(2026-08-16). 옛 프로젝트는 브리핑에만 있으므로
//   **뒤로 떨어진다** — 그 순서가 곧 안전장치다. 이미 값을 치른 그림·클립의 각인
//   (imageContextKey·clipKey)이 그대로 유지되고, 새 프로젝트에는 애초에 각인이 없다.
//   안 옮기면 브리핑 추출이 없는 새 흐름에서 **이미지·클립 두 프롬프트 모두 제품 정체를 잃는다**
//   — 컷마다 딴 물건이 나오던 그 결함이다.
export function subjectOf(project) {
  const focus = project.scenario?.focus || project.briefing?.focus;
  const topic = project.scenario?.topic || project.briefing?.topic || "";
  const focusThing = focus?.mode === "물건" ? focus.subject : "";
  const anchor = focusThing || topic;
  const look = focusThing && typeof focus?.look === "string" ? focus.look.trim() : "";
  return { anchor, look };
}

// ★★ 이 컷의 **화면 기준** — 무엇을 보고 그림을 그렸는가. **그림(프롬프트)과 심사(VLM)가
//    이 판정 하나를 함께 쓴다**(2026-08-17).
//
// 왜 함수로 모았나: 같은 조회식이 두 벌이었다 — `imagePromptBody` 가 폴백 사슬을 들고,
// `lib/vlm.js` 가 자기 사본(`scene?.shows || cut.sentence`)을 들었다. 폴백에서 낭독 문장을
// 걷은 날(같은 날 앞선 고침) 두 벌이 서로 다른 값을 내기 시작했다:
//
//   그린 기준 "a cold brew bottle"  ≠  심사 기준 "아침마다 커피가 식어서…"
//
// VLM 지문이 `검수 기준: 장면 설명과 일치` 이므로 **기준이 다르면 물릴 근거가 생기고**,
// 물리면 `lib/pipeline.js` 의 `round 2` 가 이미지를 **한 장 더 산다(컷당 +$0.08)**.
// 그 돈은 크레딧으로 청구되지 않고 `cost_records` 에만 쌓여 사장님에게 안 보인다.
// 실측(저장된 컷 46개): 두 기준이 **13컷에서 갈려 있었다**(28%) — 폴백 컷 2개뿐 아니라
// `stillOnly` 가 움직임 절을 걷어낸 컷 전부가 갈렸다(그림은 걸러진 글, 심사는 원본 shows).
//
// **심사는 그림이 실제로 그려진 글을 본다** — 그것이 이 함수가 내는 값이다.
//
// ★ 덮어쓴 컷(`cut.image_prompt`)은 **그 글이 그림의 전부**다(본문을 통째로 대체한다 —
//   promptBodyOf). 그러니 심사 기준도 그 글이어야 한다. 판정 규칙은 promptBodyOf 와 같은
//   `promptOverride` 한 함수를 쓴다 — 두 벌로 재면 지금 막은 갈림이 그 자리에 다시 난다.
//
// ★ **빈 값을 돌려줄 수 있다.** 그럴 때 프롬프트에는 `Scene:` 절이 아예 없으므로(아래
//   imagePromptBody) 심사도 대조할 장면 설명이 없는 것이 맞다 — `lib/vlm.js` 가 그때
//   장면 설명 줄과 '장면 설명과 일치' 기준을 **함께 뺀다**. 빈 문자열로 심사하면 VLM 이
//   무엇과 대조할지 모른 채 판정을 내고, 그 판정이 유료 재시도를 부른다.
//   (남은 기준 — 손가락·글자 깨짐·반사·그림자 — 은 장면 설명 없이도 잴 수 있어 검수를
//    통째로 건너뛰지는 않는다.)
export function sceneBasisOf(cut, project) {
  const override = promptOverride(cut?.image_prompt);
  if (override) return override;
  return sceneFallback(cut, project);
}

// 화면 근거는 컷의 '보여줌'이다. 나레이션 문장은 귀로 듣는 것이지 그릴 대상이 아니다.
// 폴백 두 겹: 화면 패스가 실패한 컷 → 구성 시절 프로젝트의 장면 → 그마저 없으면 주제 앵커.
// 움직임 절을 걸러낸 뒤에 폴백을 판정한다 — shows 가 통째로 움직임이면 그릴 것이 없다
//
// ★★ **폴백에 낭독 문장(`cut.sentence`)을 쓰지 않는다**(2026-08-17). 이유가 둘인데
//   차례가 있다.
//   ① 첫째 이유는 처음부터 있었다 — 바로 위 문장이 그 말을 한다: "나레이션 문장은 귀로
//      듣는 것이지 그릴 대상이 아니다." SHOWS_SYSTEM 도 같은 규칙을 둔다(화면이 말을 그대로
//      되풀이하면 그 컷의 정보량이 절반이 된다). 정상 경로는 그 규칙을 지키는데 **폴백만
//      그 규칙 밖에** 있었다.
//   ② 둘째 이유는 언어다 — 프롬프트는 이제 영어인데(2026-08-17 언어 정책) 문장은 한국어다.
//      실측으로 `Scene: 아침마다 커피가 식어서 버리는 게 아까웠어요..` 가 찍혔고 그 그림을
//      컷당 $0.08 에 샀다. 언어가 같아졌더라도 ①만으로 이미 안 될 값이다.
//
//   대신 쓰는 것은 **주제 앵커**다 — 원래 무음 컷 전용 버팀목이었던 값을 말하는 컷까지
//   넓혔다(2026-08-14 리뷰가 무음 컷에 준 그 값이다: 어느 컷에도 맞고, 제품 앵커와 같은
//   대상을 가리켜 다른 컷들과 한 편으로 보인다). 무음 컷의 값은 한 글자도 안 바뀐다 —
//   옛 프로젝트에는 scenario 가 없어 briefing 으로 떨어지고, 그 결과가 예전과 같다.
//   시나리오를 브리핑보다 앞에 두는 것은 subjectOf 와 같은 차례다(2026-08-16 이후 초점·
//   주제의 원천이 시나리오이고, 그 값이 영어다).
//
//   ⚠️ **앵커까지 비면 `Scene:` 절을 아예 넣지 않는다.** 빈 `Scene: .` 은 주어 없는 그림
//   한 장($0.08)에 그 위 클립까지 부르는 값이라, 절을 지우는 쪽이 낫다 — 무대·인물·제품
//   절은 그대로 남아 그릴 것이 남는다. 셋 다 비는 프로젝트는 애초에 시나리오도 브리핑도
//   없는 것이라 ④이미지에 닿지 않는다.
//
//   ★ 그 고침은 **폴백 경로만** 건드렸다. `stillOnly(cut.shows)` 가 값을 내는 컷의
//     프롬프트는 한 글자도 안 바뀐다(이미 값을 치른 그림이 낡지 않는다).
function sceneFallback(cut, project) {
  const legacyScene = Number.isInteger(cut?.scene_idx) ? project?.synopsis?.scenes?.[cut.scene_idx] : null;
  // ⚠️ **알려진 어긋남 — 일부러 그대로 둔다**(2026-08-17 리뷰 D2).
  //   이 폴백은 `focus.mode` 를 안 보고 `focus.subject` 를 쓰는데, 각인이 부르는 subjectOf 는
  //   `mode === "물건"` 일 때만 focus 를 본다(사람을 "이 제품"이라 부르면 틀린 지시가 되어서다).
  //   그래서 사람·정보 초점 프로젝트에서 shows 가 없는 컷은 **프롬프트에는 focus.subject 가
  //   실리는데 각인은 그것을 안 센다** — 초점을 고쳐도 그림이 낡지 않는다.
  //
  //   맞추는 길이 둘인데 둘 다 지금은 안 된다:
  //   ① 각인이 focus.subject 를 세게 하면 **살아 있는 그림이 통째로 낡아** 유료 재구매가 뜬다
  //      (컷당 $0.08). 어긋남의 방향이 "덜 알림"이라 거짓 유료 버튼은 안 열리는데, 이 고침은
  //      진짜로 열린다 — 고쳐서 더 비싸지는 쪽이다.
  //   ② 폴백을 subjectOf 규칙으로 좁히면(물건이 아니면 topic) 사람 초점 컷의 그릴 것이
  //      "30대 남성 사장" 에서 기획 문구로 내려앉는다. 이 절의 값은 **그릴 대상**이라
  //      사람 서술이 오히려 그리기 쉽다 — 품질이 나빠지는 쪽이다.
  //
  //   실측(저장된 프로젝트 45개·컷 46개): 이 폴백을 타는 컷 2개, 그 둘 다 물건 초점이라
  //   **지금 어긋나 있는 컷은 0개**다. 사람·정보 초점 프로젝트는 7개 있어 경로 자체는 살아
  //   있지만(그 프로젝트에서 화면 패스가 실패하면 닿는다) 아직 아무 그림에도 닿지 않았다.
  const anchorFocus = project?.scenario?.focus || project?.briefing?.focus;
  const anchorFallback =
    (typeof anchorFocus?.subject === "string" ? anchorFocus.subject.trim() : "") ||
    (typeof project?.scenario?.topic === "string" ? project.scenario.topic.trim() : "") ||
    (typeof project?.briefing?.topic === "string" ? project.briefing.topic.trim() : "");
  return stillOnly(cut?.shows) || stillOnly(legacyScene?.shows) || anchorFallback;
}

// 프롬프트는 두 조각이다.
//
// **본문(창작부)** — 이 컷이 무엇을 보여 주는가. 사장님이 통째로 갈아 끼울 수 있다.
// **꼬리(계약부)** — 코드가 언제나 본문 뒤에 붙인다. 사장님이 무엇을 쓰든 지워지지 않는다.
//
// ★ 이 자리는 새로 만든 규칙이 아니다. 아래 주석("위치가 방어다")이 이미 같은 말을 하고,
//   Style note 와 edit_instruction 이 이미 그렇게 산다. 여기서 하는 일은 그 경계에
//   **이름을 주는 것**뿐이다 — 갈라 놓아야 사장님이 본문만 갈아 끼울 수 있다.
//
// ⚠️ 가르면서 문구가 한 글자라도 달라지면 앞으로 만들 그림이 조용히 달라진다.
//    tests/prompt-override.test.js 가 프롬프트 전문을 손으로 적어 그것을 못 박는다.
//
// ⚠️ 둘 다 **export 하지 않는다.** 호출부가 늘면 판정이 두 벌이 되고, 그러면 각인
//    (imageContextKey)이 보는 값과 실제로 보내는 값이 갈릴 자리가 생긴다.
//    바깥이 부르는 것은 **조립된 프롬프트**(buildImagePrompt)와 **판정**(promptBodyOf·
//    sceneBasisOf) 뿐이다 — 조립 자체를 부르는 자리는 이 파일 안에만 있다.
function imagePromptBody(cut, project) {
  const orient = orientOf(project);
  const shows = sceneFallback(cut, project);
  // 주제 앵커 — 컷이 제품을 직접 안 담아도(가격·위치 컷 등) 전 컷이 같은 대상을 그리게 한다.
  // 앵커는 **제품**이어야 한다. topic 은 "이 영상이 무엇에 대한 것인지"라, 자료가 기획서면
  // 기획 문구가 된다 — 실측에서 "신발을 주인공으로 한 감각적인 광고 영상"이 앵커로 들어갔고
  // "이 제품을 전 컷에서 일관되게 유지하라"는 지시가 그 자리에서 무의미해졌다.
  //
  // 초점이 물건이면 그 대상이 제품이다(브리핑이 "그 물건을 적는다"로 뽑는다). 사람·정보 초점의
  // subject 는 제품이 아니라서 쓰지 않는다 — 인물을 "이 제품"이라 부르면 틀린 지시가 된다.
  //
  // ⚠️ 이것은 **일관성** 지시다. "제품만 크게 보여라"가 아니다 — 무엇이 화면에 보일지는
  //    shows 가 정한다(SHOWS_SYSTEM).
  // 제품 외형 — 앵커 낱말만으로는 배색만 맞고 디자인은 모델이 만든다.
  // 실측에서 "검정+빨강 하이톱 농구화"만 주었더니 아식스풍 줄무늬가 나왔다.
  // 인물의 look 과 같은 방식이다. 사람 초점의 subject 는 제품이 아니라서 쓰지 않는다.
  const { anchor, look: thingLook } = subjectOf(project);
  const subject = anchor
    ? ` The video's subject is: ${anchor}. Keep this exact product/subject consistent in every scene.` +
      (thingLook ? ` Its appearance, identical in every scene: ${thingLook}.` : "")
    : "";
  // 화풍은 사장님이 고른 프리셋에서 온다(lib/styles.js). 고르지 않았으면 실사다 —
  // 그때 이 문장은 화풍을 도입하기 전과 글자 그대로 같다(tests/cuts.test.js 가 못 박는다).
  //
  // 화풍을 shows 에 섞지 않는 이유: shows 는 사장님이 화면에서 보고 고치는 값이다.
  // 화풍이 그 안에 스며들면 화풍을 바꿀 때마다 화면 설계를 다시 해야 하고 손으로 고친 것이
  // 날아간다. stillOnly 가 움직임을 걸러내는 것과 같은 결이다 — 그림 지시는 여기서 합성한다.
  const style = activeStyle(project);
  // 보정 한 줄. 위치가 방어다 — 마감과 글자 금지는 **항상 코드가 이 뒤에** 붙이므로
  // 사장님이 무엇을 쓰든 우리 지시가 지워지지 않는다.
  const note = project.settings?.style?.note;
  const noteClause = typeof note === "string" && note.trim() ? ` Style note: ${note.trim()}.` : "";
  // 무대 — 전 컷이 같은 장소·시간대·조명을 쓰게 한다. Scene 뒤에 둔다:
  // 가짜 모드가 `/Scene:\s*(.+?)\.\s/` 로 장면을 역파싱하므로 그 문형을 건드리지 않는다.
  // 없으면 절을 늘리지 않는다 — 옛 컷의 그림이 달라지면 다시 사게 된다.
  // 장면 절 — 그릴 것이 하나도 없으면(shows·옛 장면·앵커 전부 빔) 절을 넣지 않는다.
  // 값이 있는 컷의 문형은 예전과 글자 그대로 같다(`composition.` + ` Scene: ….`).
  const scene = shows ? ` Scene: ${shows}.` : "";
  const stageText = stageOf(cut);
  const stage = stageText ? ` Setting (same in every scene of this video): ${stageText}.` : "";
  // 이 컷에 나오는 인물의 외형. **레퍼런스 첨부와 무관하게** 실린다.
  //
  // 왜 따로 필요한가: 실측에서 캐스팅이 "20대 남성 농구 선수"를 만들었는데 맞는 아바타가 없어
  // 첨부가 비었고, 컷마다 다른 사람이 그려졌다(한 컷은 여성 캐릭터였다). 사진이 없을 때
  // 일관성을 만들 수 있는 유일한 수단이 외형 서술이다 — 그것이 첨부 여부에 매달려 있으면 안 된다.
  const here = castLooksOf(cut, project);
  const castClause = here.length
    ? ` Characters in this frame (keep them identical across every scene) — ${here.join(" / ")}.`
    : "";
  // ★ 판형(orient)이 본문에 있는 것은 지금 문형이 그래서다. 사장님이 본문을 갈아 끼우면
  //   판형이 사라지므로, 덮어쓰기 경로에서는 판형을 꼬리로 다시 붙여야 한다.
  //   여기서 미리 옮기면 지금 프롬프트가 바뀐다 — 옮기는 것은 덮어쓰기를 붙일 때다.
  return `${style.medium} for a short-form video, ${orient} composition.${scene}${stage}${castClause}${subject}${noteClause}`;
}

// 꼬리(계약부) — 마감·글자 금지·레퍼런스 결속·톤·전환·수정지시.
// 본문이 무엇이 되든 코드가 이 뒤를 붙인다. 앞머리 공백이 곧 본문과의 이음매다.
function imagePromptTail(cut, project, refs = []) {
  const style = activeStyle(project);
  // ★★ 글자 금지의 **범위**가 첨부 유무로 갈린다(2026-08-18 사장님 지적).
  //   이 말은 원래 **AI 가 지어내는 엉터리 글자**를 막으려고 넣었다(정확한 글자는 자막이
  //   ffmpeg 로 태운다). 그런데 첨부에 인쇄된 글자가 있으면 그것까지 지우라는 말로 읽힌다 —
  //   증상이 정확히 그 모양이었다: `KONKUK UNIV.` → `KU`, 슬리퍼 옆면 `FASHION` → `SPORT`.
  //   첨부가 있으면 **거기 있는 글자는 지키고, 없던 글자는 만들지 마라**로 좁힌다.
  //   첨부가 없으면 지킬 글자가 없으니 예전 문장 글자 그대로다.
  // ⚠️ 비실사 화풍에서는 `exactly`·`as photographed` 를 쓰지 않는다 — 그 낱말이 들어가면
  //   모델이 사진을 복사하려 들어 **반쯤 사진인 그림**이 나온다(tests/cuts.test.js 가 못 박는
  //   계약이다. 이번에 실제로 한 번 깼다).
  let p = !refs.length
    ? ` ${style.finish}, no text or letters in the image.`
    : style.realistic
      ? ` ${style.finish}, no new text or letters beyond what appears in the attached reference photos —`
        + ` reproduce any printed lettering, logos and markings on the referenced items exactly as photographed,`
        + ` and do not add invented text anywhere else in the image.`
      : ` ${style.finish}, no text or letters except the lettering and logos that appear on the referenced items —`
        + ` keep those readable and true to the reference when you redraw them,`
        + ` and do not add invented text anywhere else in the image.`;
  // 레퍼런스 문구는 종류에 따라 갈린다.
  // 지금까지는 사람에게도 "제품의 모양·색·포장을 첨부와 똑같이"라고 붙이고 있었다 —
  // 사람에게는 틀린 지시다.
  //
  // **첨부를 번호로 세어 배역에 묶는다.** 익명으로 두 장을 보냈더니 모델이 배역을 뒤바꿨다
  // (2026-07-29 실측: 캐스팅은 50대를 손님으로 정했는데 그림에서는 50대가 치수를 재고
  //  30대가 코트를 입었다. 한 컷에서는 30대 아바타가 아예 무시되고 낯선 여성이 나왔다).
  // 번호는 image_urls 에 실리는 순서와 같아야 한다 — 부르는 쪽이 이 refs 를 그대로 싣는다.
  const people = refs.filter((r) => r.kind === "person");
  // ★ 첨부가 둘 이상이면 **전부** 번호로 부른다(2026-08-18 실측). 예전에는 인물만 세고
  //   물건은 걸러 냈다 — 그래서 목록이 `[2] …` 로 시작했다. "in order" 라고 선언해 놓고
  //   첫 장을 빠뜨리니, [1]이 무엇인지 모델은 끝내 듣지 못한다. 실제로 제품 사진 + 인물
  //   두 장이 간 컷에서 그 컷만 전혀 다른 제품이 그려졌다(같은 두 장이 간 다른 컷은
  //   밑창 무늬를 요구해 사진을 볼 수밖에 없어서 맞았다 — 운에 맡겨져 있었다).
  //   물건을 부르는 이름은 프로젝트가 이미 아는 것(subjectOf 의 anchor)을 쓴다.
  const { anchor } = subjectOf(project);
  const things = refs.filter((r) => r.kind === "thing");
  // ★★ 물건이 **여러 장이면 장마다 다른 이름**을 준다(2026-08-18 저녁 실측).
  //   아침에 물건에도 번호를 붙이면서 이름으로 프로젝트 앵커를 썼는데, 앵커는 영상 한 편에
  //   하나뿐이라 네 장이 전부 같은 말을 얻었다("[1] a set of four keyrings, [2] a set of
  //   four keyrings, …"). 같은 이름이 넷이면 모델은 **같은 것을 여러 각도에서 찍은 사진**
  //   으로 읽는다 — 실제로 키링2 와 키링3 이 한 개로 합쳐졌다. 게다가 그 앵커가 "네 개짜리
  //   **세트**"라, 한 장이 세트 전체라고 말하는 셈이었다(그래서 한 장짜리 컷에서도 그
  //   물건의 세부가 안 옮겨졌다).
  //   ★ 한 장뿐일 때는 앵커가 맞다 — 그 장이 곧 이 영상의 피사체다.
  const manyThings = things.length > 1;
  // ★ 이 영상의 피사체가 **여러 개체의 집합**인가. 사장님이 물건 사진을 여러 장 올렸으면
  //   그렇다 — 그때는 한 장짜리 컷의 첨부도 "세트"가 아니라 **그중 하나**다.
  //   실측: 앵커가 "a set of **four** small character keyrings" 인데 그 컷 첨부는 한 개였고,
  //   그 물건만의 세부(고리에 달린 고무밴드)가 그림에 안 옮겨졌다. 한 장을 세트 전체라고
  //   부르면 모델은 그 사진을 "세트의 대표 이미지"로 읽는다.
  const setSubject = (project?.material?.photos || []).length > 1;
  const label = (r) => {
    if (r.kind === "person") return r.who || "the person";
    if (manyThings) return `product item ${things.indexOf(r) + 1}`;
    if (setSubject) return "the specific item shown in this photo";
    return anchor || "the product/subject";
  };
  const numbered = refs.length > 1;
  if (numbered) {
    p += ` Attached reference images, in order: ${refs.map((r, i) => `[${i + 1}] ${label(r)}`).join(", ")}.`;
  }
  if (people.length) {
    if (numbered) {
      p += " Draw each of these people as the person in their own numbered image — do not swap them between roles.";
    }
    p += ` ${refHintFor(style, "person", numbered ? refs.indexOf(people[0]) + 1 : null)}`;
    // 인물이 정해진 컷에는 그 밖의 사람을 넣지 못하게 막는다.
    // 2026-07-29 실측: shows 가 "손님이 들어오는" 뿐인 컷에 재봉틀 앞 중년 여성이 덤으로
    // 그려졌고, 그 사람은 레퍼런스가 없어 다음 컷에서 다른 얼굴이 됐다. 초점을 선언해도
    // 줄지 않아 그림 지시에서 직접 막는다.
    //
    // 인물 레퍼런스가 있는 컷에만 붙이는 이유: 거리 풍경처럼 행인이 있어야 자연스러운
    // 화면까지 사람을 지우면 그림이 어색해진다.
    p += " Only the described people appear in this frame — no other people, including in the background.";
  }
  if (things.length) {
    if (manyThings) {
      // ★ 번호를 갈라 놓는 것만으로는 못 막는다 — **서로 다른 물건**이라고 말해야 한다.
      //   그리고 결속을 한 장에 걸면(예전 문형) 나머지 장은 무엇을 위한 것인지 프롬프트가
      //   끝내 말하지 않는다. 각 물건을 **자기 사진에** 건다.
      const nums = things.map((t) => `[${refs.indexOf(t) + 1}]`).join(", ");
      p += ` Attached images ${nums} are different individual items, not one item photographed`
        + ` several times — draw each as its own distinct object and do not merge or blend their designs.`;
      p += ` Match each item's appearance (shape, colors, markings, attachments) to its own attached image exactly.`;
    } else {
      p += ` ${refHintFor(style, "thing", numbered ? refs.indexOf(things[0]) + 1 : null)}`;
    }
  }
  // 구도 금지는 컷마다 한 번이다 — 인물·물건 힌트가 각자 달고 있던 시절에는 둘 다 있는
  // 컷에서 같은 문장이 두 번 실렸다.
  if (refs.length) p += ` ${refFraming()}`;
  // ★★ **사진이 이긴다.** 프롬프트 위쪽에는 시나리오가 지어낸 외형 서술이 함께 실린다
  //   (`Its appearance, identical in every scene: …`). 그 말은 첨부가 **없는** 컷에서
  //   일관성의 유일한 근거라 지울 수 없는데, 첨부가 있는 컷에서는 **두 번째 원천**이 되어
  //   모델을 사진에서 멀어지게 한다(실측: 흰·초록·파랑 물건을 두고 서술은 "파스텔·크림"
  //   이라 적혀 있었고, 그림이 그쪽으로 밀렸다). 그래서 지우는 대신 **차례를 정한다**.
  //   ★ 지우지 않는 이유는 자리 때문이기도 하다 — 그 줄은 **본문**에 있고 본문은 refs 를
  //     모른다. 화면이 같은 함수로 본문을 다시 계산해 그 길이만큼 꼬리를 떼므로, 본문이
  //     첨부 유무로 갈리면 화면과 서버가 어긋나고 그 상태의 [저장]이 틀린 본문을 굳힌다.
  //   ★ 그리고 `exactly` 만으로는 **무엇이 금지인지** 안 말한다 — 다시 디자인하기·단순화·
  //     부속 빼먹기가 전부 "exactly 하려고 했다"의 결과로 나온다. 못 박아 둔다.
  if (refs.length) {
    // 앞부분(차례를 정하는 말)은 화풍과 무관하다 — 어느 화풍에서든 사진이 근거다.
    p += ` Where any written description above disagrees with the attached photos, the photos take precedence.`;
    p += style.realistic
      ? ` Treat the referenced items as fixed, existing products: reproduce each one as photographed, keeping its`
        + ` exact shape, proportions, colors, surface finish, printed graphics and its hardware (rings, clasps,`
        + ` straps, tags). Do not redesign, restyle, simplify, recolor, or invent details for them.`
      // 비실사에서도 **바꾸지 말라**는 뜻은 같다. 다만 옮겨 오는 것은 픽셀이 아니라 디자인이다.
      : ` Treat the referenced items as fixed, existing products: keep each one's design, proportions, colors,`
        + ` markings and hardware (rings, clasps, straps, tags) faithful to its own photo, then redraw it in this`
        + ` style. Do not redesign, restyle, simplify, recolor, or invent details for them.`;
  }
  // 톤 — 영상 전체가 같은 색·질감으로 보이게. 컷마다 그림을 따로 만들기 때문에
  // 이 문자열이 전 컷에 똑같이 들어가는 것이 곧 일관성이다.
  // 없으면 절을 늘리지 않는다 — 옛 컷의 프롬프트가 글자 하나라도 달라지면 그림이 낡아
  // 사장님에게 재구매가 제시된다(stage·noteClause 와 같은 규칙이다).
  const tone = usableTone(cut.tone);
  if (tone) p += ` Overall look and color treatment, keep identical across all cuts: ${tone}.`;
  // 전환 — 이 컷이 시작하는 구도. 앞 컷 끝과 이어 보이게 한다(매치컷).
  const trans = usableTransition(cut.transition);
  if (trans) p += ` Compose the opening framing as: ${trans}.`;
  // 사용자가 구체적으로 지시한 수정 — 가장 강하게 반영한다
  if (cut.edit_instruction) {
    p += ` Important correction requested by the user, apply it strictly: ${cut.edit_instruction}.`;
  }
  return p;
}

// 사장님이 적은 덮어쓰기 값. **공백뿐인 값은 덮어쓰기가 아니다** — 코드가 만든 본문으로
// 돌아간다. 그것이 "원래대로" 버튼의 구현이다(별도 필드를 두지 않는다 — 두면 "비었다"와
// "원래대로"가 두 벌이 되고, 어느 쪽이 이기는지가 읽는 자리마다 갈린다).
//
// 문자열이 아닌 값은 아예 보지 않는다 — 옛 문서나 잘못된 저장이 본문을 "undefined" 로
// 갈아 끼우면 그 컷은 주어 없는 그림을 $0.08 에 산다.
//
// 판정을 여기 한 자리에 두는 이유는 이미지·영상이 같은 규칙을 써야 해서다. 두 벌이면
// 한쪽만 공백을 인정해 같은 칸을 비웠는데 그림만 원래대로 돌아온다.
//
// ★ 이음매에 마침표를 채운다 — **축 이음매(clipPromptBody)와 같은 문제이고 같은 해법**이다.
//   거기 적힌 그대로다: 그냥 " " 로 이으면 마침표 없는 값이 뒤 문장과 한 문장으로 붙어 버리고,
//   마침표가 있는 값에 또 붙이면 ".." 가 된다. 코드가 만든 본문은 이 문제가 없다
//   (`${base}.${pace}` · `… composition.` 이 스스로 문장을 닫는다) — **덮어쓰기 경로에만
//   생기는 결함**이라 여기서 닫는다.
//   실측: "the shoe explodes in slow motion The attached image is the first frame — …"
//   두 지시가 한 문장으로 읽힌다.
//   부호를 채우는 것은 사장님이 쓴 **내용**을 고치는 것이 아니다. 반대로 안 채우면 뜻이 망가진다.
//   전각 부호까지 보는 이유: 사장님은 한국어로 쓰고, 한글 입력에서 "。！？" 가 섞여 나온다.
//
// ★ **export 하는 이유는 spokenOf 와 같다**(그 함수의 주석을 읽어라) — 프롬프트와 각인
//   (lib/steps.js 의 imageContextKey·clipKey)이 **같은 판정을 봐야 한다.** 판정을 두 벌로
//   두면 저장할 때와 잴 때가 갈린다: 각인이 `trim()` 값을 쓰던 동안 `"a red shoe"` 와
//   `"a red shoe."` 는 **프롬프트가 완전히 같은데 각인만 달랐다** — 마침표 하나가 거짓
//   낡음을 만들어 유료 [다시 만들기]를 열었다(그림 컷당 $0.08, Seedance 30초 한 편 ~$9).
//   조립 내부 함수(imagePromptBody·clipPromptBody…)를 안 여는 것과 어긋나지 않는다.
//   그것들은 **조립**이라 호출부가 늘면 문형이 갈리고, 이것은 **판정**이라 공유해야 한다.
// ★ 끝 부호 규칙 자체는 lib/clauses.js 의 closeSentence 다 — 프로젝트 공통 지시
//   (이 파일 아래의 promptNoteOf)가 **같은 규칙**을 쓰기 때문이다. 두 군데 적으면 한쪽만
//   고쳐지는 날 같은 값이 프롬프트마다 다르게 닫힌다.
export function promptOverride(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return closeSentence(text);
}

// 프로젝트 공통 지시 — 사장님이 밖에서 써 온 프롬프트를 그대로 넣는 자리이고 **전 컷**에 실린다.
//
// ★ 자리가 **본문 뒤, 꼬리 앞**이다. 본문 안이 아닌 이유가 이 기능의 약속 그 자체다:
//   컷별 덮어쓰기(cut.image_prompt · cut.clip_prompt)는 본문을 **통째로** 대체하므로,
//   공통 지시를 본문에 넣으면 덮어쓴 그 컷만 조용히 공통 지시를 잃는다. 화면에 적는 말이
//   "모든 이미지에 함께 보낼 지시"인데 컷 하나에서 거짓말이 된다.
//   반대편 경계도 그대로다 — 코드의 계약(글자 금지·첫 프레임 유지)은 늘 사장님 입력 뒤에 남는다.
//
// ★ 판독은 promptNoteOf 한 자리다(바로 아래, promptOverride 옆) — 각인(lib/steps.js)이
//   **같은 함수**를 부른다. 두 벌로 재면 프롬프트가 같은데 각인만 갈려 거짓 낡음이 유료
//   버튼을 연다. (게이트 normalizePromptNote 는 lib/styles.js 에 있지만 판독은 여기다 —
//   그 파일은 import 0 계약이라 끝 부호 규칙을 끌 수 없다. 그 함수의 주석에 근거가 있다.)
// ★ 값이 없으면 절을 늘리지 않는다 — 이 저장소가 네 번 겪은 함정이다(style_of·해상도·
//   tone_of·자막 위치). 형식을 무조건 바꾸면 이미 값을 치른 산출물이 통째로 낡는다.
// 프롬프트·각인이 **함께** 읽는 판독. 게이트(normalizePromptNote)와 다른 함수인 이유:
// 게이트는 저장 전에 한 번 도는 검사이고, 이것은 읽을 때마다 도는 판정이다.
//
// ⚠️ **정규화는 여기 안에서만 한다.** 프롬프트와 각인이 같은 값을 읽어야 한다 —
//    한쪽에만 정규화가 들어가면 프롬프트는 같은데 각인만 갈려 **거짓 낡음**이 유료
//    [다시 만들기]를 연다(그림 컷당 $0.08, Seedance 30초 한 편 ~$9). 판독 함수 안에
//    넣으면 양쪽이 **같은 정규화된 값**을 보므로 판정이 갈릴 자리가 없다 — 컷별
//    덮어쓰기(lib/cuts.js promptOverride)가 이미 그렇게 푼 문제고, 끝 부호 규칙은
//    아예 **같은 함수**(closeSentence)를 쓴다.
//
// ★ 끝 부호를 여기서 닫는 이유: 안 닫으면 사장님 지시가 뒤 문장과 한 문장으로 붙어 읽히고
//   (부르는 쪽이 마침표를 대신 붙이면) 이미 마침표로 끝난 값이 ".." 가 된다. 실측으로
//   "shot on 35mm film.." · "Use warm light!." 가 나가고 있었다.
export function promptNoteOf(project, key) {
  const raw = project?.settings?.[key];
  return closeSentence(typeof raw === "string" ? raw.trim() : "");
}

// ★ 마침표를 여기서 붙이지 않는다 — promptNoteOf 가 이미 닫아서 준다(closeSentence).
//   여기서 또 붙이면 마침표로 끝난 지시가 ".." 가 되고 "!"로 끝난 지시가 "!." 가 된다
//   (실측으로 그렇게 나가고 있었다). 정규화는 판독 한 자리에만 둔다 — 조립이 따로 다듬으면
//   각인이 보는 값과 갈린다.
function promptNoteClause(project, key) {
  const note = promptNoteOf(project, key);
  return note ? ` ${note}` : "";
}

// 이 컷의 프롬프트 **본문**은 무엇인가 — `덮어쓰기 || 코드가 만든 본문`을 정하는 한 자리다.
//
// ★ 왜 함수로 모았나: 같은 판정이 buildImagePrompt·buildClipPrompt 에 각각 인라인으로
//   있었고, 거기에 **화면**이 세 번째 사본을 만들 참이었다(④이미지가 텍스트칸에 본문을
//   앉힌다). 세 벌이면 사장님이 화면에서 읽는 본문과 실제로 나가는 본문이 갈린다 —
//   이 저장소가 각인·판독에서 이미 두 번 밟은 함정이다.
//
// ★ **export 하는 것은 판정뿐이다.** 조립 내부 함수(imagePromptBody·imagePromptTail·
//   clipPromptBody)는 계속 감춘 채로 둔다 — promptOverride 와 같은 성질이다(그 함수의
//   주석에 근거가 있다: 조립은 호출부가 늘면 문형이 갈리고, 판정은 공유해야 한다).
//
// ★ 불변: **전체 프롬프트는 언제나 이 본문으로 시작한다.** 화면이 그 성질에 기대
//   `full.slice(body.length)` 로 꼬리를 떼어 "이 뒤는 코드가 붙여요"로 보여 준다.
//   tests/prompt-override.test.js 가 이미지 + 영상 세 갈래 전부에서 못 박는다.
//
// ⚠️ 모르는 갈래는 던진다. 조용히 이미지 본문을 내면 영상 프롬프트에 판형 절이 실려
//    (클립에는 애초에 없는 절이다) 그 컷만 다른 컷과 모양이 갈린다.
export function promptBodyOf(kind, cut, project) {
  if (kind === "image") {
    // ★ 판형을 덮어쓰기 경로에서 다시 붙인다 — 본문 문형에 있던 값이라
    //   (`${orient} composition`) 본문을 갈아 끼우면 사라진다. 판형이 틀리면 합성이 깨진다.
    //   **덮어쓰기가 없는 경로에서는 옮기지 않는다** — 옮기는 순간 지금까지 만든 그림의
    //   프롬프트가 달라져 살아 있는 산출물이 통째로 낡는다(컷당 $0.08 을 다시 산다).
    const override = promptOverride(cut?.image_prompt);
    return override
      ? `${override} ${orientOf(project)} composition.`
      : imagePromptBody(cut, project);
  }
  if (kind === "clip") {
    // ★ 판형은 **붙이지 않는다.** 클립 프롬프트에는 애초에 판형 절이 없다(lib/i2v.js 가
    //   aspect_ratio 를 prompt 와 나란히 별도 요청 필드로 보낸다 — clipContextClause 주석).
    return promptOverride(cut?.clip_prompt) || clipPromptBody(cut);
  }
  throw new Error(`모르는 프롬프트 갈래: ${kind}`);
}

export function buildImagePrompt(cut, project, refs = []) {
  // 본문을 통째로 갈아 끼운 경우에도 꼬리는 코드가 그대로 붙인다 — 사장님이 "글자를 크게
  // 넣어라"라고 써도 `no text or letters` 는 그 뒤에 남는다(판정은 promptBodyOf).
  const body = promptBodyOf("image", cut, project);
  // 공통 지시는 덮어쓰기 여부와 무관하게 늘 여기 실린다(promptNoteClause 주석 참고).
  return body + promptNoteClause(project, "image_note") + imagePromptTail(cut, project, refs);
}

// 클립 프롬프트 — i2v 에 "이 그림이 어떻게 움직이는가"를 준다.
//
// 이 자리는 오래 비어 있었다. shows 는 정지 화면 설계라 움직임을 일부러 뺐고(위 규칙),
// i2v 는 이미지와 길이만 보냈다. 그래서 컷이 어떻게 움직일지를 아무도 정하지 않고
// 모델 재량에 맡겨져 있었다 — 숏폼에서 움직임은 컷 정보량의 절반이다.
//
// motion 이 없으면(화면 패스 실패·옛 프로젝트) 눈에 띄지 않는 기본값으로 간다.
// 여기서 과한 움직임을 지어내면 그림이 무너지므로, 폴백은 조용한 쪽이다.
// 이 컷에서 누가 무엇을 말하는가 — **한 자리에서만 판정한다.**
//
// 클립 프롬프트(buildClipPrompt)와 각인(clipKey)이 같은 값을 봐야 한다. 판정을 두 벌로
// 두면 저장할 때와 잴 때가 갈려 각인이 영원히 불일치가 되고, [영상 만들기]를 누를 때마다
// 살아 있는 클립을 전부 다시 산다(Seedance 30초 한 편이 회당 ~$9다).
//
// ⚠️ 이 값을 컷에 **저장하면 안 된다.** 저장값과 비교값이 같은 출처가 되어 대사·목소리를
//    바꿔도 영영 안 낡는다 — 각인의 목적이 반대 방향으로 죽는다. 언제나 지금 값에서 판다.
//
// 이 컷에 보이는 인물 중 첫 번째가 말한다. 둘 이상이 보여도 대사는 하나다 —
// 누가 말하는지는 원고가 정하지 않으므로 화면에 보이는 순서를 따른다.
// 판정은 여기 하나다. 프롬프트는 이 값을 문장으로 풀어 쓰고(buildClipPrompt),
// 각인은 같은 값을 한 줄로 굳힌다(spokenOf) — 각인을 되쪼개 읽지 않는다(대사에 "|" 가
// 섞이면 갈리므로).
//
// ★ 화면 밖 목소리(narration)에는 **갈래가 따로 있다**(2026-08-17). 컷이 그렇게 표시돼
//   있으면 캐스팅에서 사람을 찾지 않는다 — 정의상 화면에 없다. 대신 시나리오가 정한
//   내레이터 목소리(scenario.narrator_voice)를 싣는다.
//
//   ⚠️ **목소리는 컷마다 부르는 fal 호출에 실리는 유일한 통로다.** 컷 1과 컷 3이 각각 다른
//      호출이라, 설명이 없으면 모델이 컷마다 다른 사람을 고른다 — 이어 붙이면 내레이터가
//      중간에 바뀐다. 화면 속 인물은 cast[].voice 한 줄이 이미 그 자리를 맡고 있다.
//      값이 비어 있으면(옛 프로젝트) 절만 안 붙는다 — 대사는 그대로 실린다.
function speechFor(cut, project) {
  const line = typeof cut?.sentence === "string" ? cut.sentence.trim() : "";
  if (!projectSpeaks(project) || !line) return null;
  if (cut?.narration === true) {
    const voice = typeof project?.scenario?.narrator_voice === "string"
      ? project.scenario.narrator_voice.trim() : "";
    // who 는 비운다 — 화면에 보이는 사람이 아니다. 프롬프트도 이 갈래에서는 who 를 안 쓴다.
    return { line, voice, who: "", narration: true };
  }
  const s = (project?.cast || []).find((c) => Array.isArray(c?.cuts) && c.cuts.includes(cut?.idx));
  return s ? { line, voice: s.voice || "", who: s.who || "" } : null;
}

export function spokenOf(cut, project) {
  const s = speechFor(cut, project);
  if (!s) return null;
  const base = `${s.line}|${s.voice}|${s.who}`;
  // ★ 프롬프트가 갈리면 각인도 갈려야 한다 — 같은 대사라도 화면 속 대사와 내레이션은
  //   서로 다른 문장을 모델에게 준다. who 가 비는 것만으로 갈린다고 믿지 않는다:
  //   who 없는 캐스팅 인물이 같은 목소리를 들면 두 각인이 같아진다. 표시를 붙여 못 박는다.
  return s.narration ? `${base}|narration` : base;
}

// ★ 말하는 모델(Seedance)에서는 **대사와 목소리도 여기서 정한다.** 대사는 원문 그대로
// 싣는다 — 실측에서 모델이 준 문장을 그대로 말했다(2026-08-12). 목소리는 캐스팅이 정한
// 한 줄을 전 컷에 똑같이 실어 컷 사이에서 목소리가 흔들리지 않게 한다(cast[].voice).
//
// 클립 프롬프트에 실을 맥락 — 무대·인물·제품·톤.
//
// 이미지 프롬프트(buildImagePrompt)는 이 재료를 이미 받는다. 클립은 이미지 한 장과 길이만
// 받고 있었다 — 무대도 인물도 제품도 없이, 지문 한 줄과 첫 프레임 유지 지시뿐이었다(파일
// 머리의 fal 원장 실측이 그 증거다). i2v 모델이 그 정지 화면을 어떻게 움직일지 스스로
// 지어내는 동안, 그 화면이 어디이고 누구이고 무엇인지는 아무도 말해 주지 않았다.
//
// **project 가 없으면 절을 안 붙인다** — project 없이 부르는 자리(예전 호출·단위 테스트)는
// 지금까지와 글자 그대로 같아야 한다. project 가 있어도 값이 없는 낱낱의 절은 스스로 빈다
// (stageOf·castLooksOf·subjectOf·usableTone 이 이미 그렇게 되어 있다) — 옛 컷이 값을
// 안 채웠으면 그 컷의 프롬프트는 늘지 않는다. 화면비는 여기서 다루지 않는다(아래 참고) —
// 그래서 이 함수의 절은 전부 "값이 없으면 안 붙는다"를 지킨다.
//
// 순서: 무대 → 인물 → 제품 → 톤. buildImagePrompt 의 절 순서를 그대로 따른다 —
// 두 프롬프트가 같은 컷을 말하므로 재료 순서가 갈리면 읽는 사람(과 모델)이 다른 이야기로
// 느낀다.
function clipContextClause(cut, project) {
  if (!project) return "";
  const parts = [];

  const stageText = stageOf(cut);
  if (stageText) parts.push(`Setting: ${stageText}.`);

  const here = castLooksOf(cut, project);
  if (here.length) parts.push(`Characters in this frame: ${here.join(" / ")}.`);

  const { anchor, look } = subjectOf(project);
  if (anchor) {
    parts.push(`The subject is: ${anchor}.${look ? ` Its appearance: ${look}.` : ""}`);
  }

  const tone = usableTone(cut?.tone);
  if (tone) parts.push(`Color treatment, keep identical across all cuts: ${tone}.`);

  // ★ 음악 — **영상 하나에 하나**이고 전 컷에 같은 글자로 실린다(2026-08-18 사장님 요청).
  //
  // 지금 배경음은 모델이 컷마다 따로 만든다. 그래서 대사 없는 컷은 아예 조용하고, 음악이
  // 나오는 컷끼리도 서로 다른 곡이었다. 첫 컷의 음악만 떼어 다음 컷에 넘기는 길은 닫혀 있다 —
  // 모델이 주는 소리는 목소리와 음악이 **한 트랙에 섞여** 나오고, 오디오를 입력으로 받는
  // 자리도 없다. 그래서 방향을 뒤집는다: 같은 지시를 전 컷에 실어 **한 성격으로 모은다**.
  // 톤(색 처리)이 바로 위에서 같은 방식으로 전 컷 일관성을 만든다 — 그 옆이 이 절의 제자리다.
  //
  // ⚠️ **값이 있을 때만 붙인다.** 형식을 무조건 바꾸면 음악 칸이 없는 옛 프로젝트의 프롬프트가
  //    달라져 **이미 값을 치른 클립이 통째로 낡는다**(컷당 $0.674). style_of·해상도·tone_of 에서
  //    세 번 같은 규칙을 썼다. 각인(lib/steps.js clipKey)도 같은 규칙을 쓴다.
  // ★ 판독을 musicOf 한 자리에 둔다 — 프롬프트와 각인이 **같은 함수**를 봐야 한다.
  //   두 벌로 재면 프롬프트가 같은데 각인만 갈려 유료 [다시 만들기]가 열린다.
  const music = musicOf(project);
  if (music) parts.push(`Background music, identical across all cuts: ${music}.`);

  // ★ 화면비는 여기서 문장으로 되풀이하지 않는다(2026-08-14, 리뷰). lib/i2v.js 가
  // aspect_ratio 를 prompt 와 나란히 별도 요청 필드로 이미 보낸다 — 모델이 API 로 이미
  // 받는 값을 문장으로 또 말하는 것은 다른 절들과 성격이 다르다: 무대·인물·제품·톤은
  // 이 API 어디에도 없어 문장이 유일한 통로지만, 화면비는 이미 통로가 있다.
  // buildImagePrompt 는 다르다 — nano-banana-2/edit 은 텍스트로 구도를 구성하므로
  // 문장이 화면비를 배우는 유일한 길이다. 같은 값이라도 모델 계약이 다르면 자리가 다르다.
  // (그리고 orientOf 는 project 만 있으면 늘 값이 있어, 다른 절과 달리 "값이 없으면 안
  // 붙는다"는 규칙을 못 지킨다 — 값이 없는 옛 컷도 이 절만은 늘 붙어 프롬프트가 길어졌다.)

  return parts.length ? ` ${parts.join(" ")}` : "";
}

// 영상 프롬프트의 **본문(창작부)** — 이 컷이 어떻게 움직이는가. 움직임 + 속도, 그뿐이다.
// 그 뒤는 전부 꼬리(계약부)이고, 사장님이 본문을 무엇으로 갈아 끼우든 코드가 뒤에 붙인다.
// 이미지 쪽 imagePromptBody/imagePromptTail 과 같은 경계다.
//
// ★ 대사·목소리·립싱크 지시는 **꼬리**다. 사장님이 영상 프롬프트에서 대사를 고칠 수
//   있으면 들리는 말과 화면의 자막이 갈린다 — 같은 문자열을 ffmpeg 가 태운다
//   (lib/subtitles.js). 대사를 고치는 자리는 ②시나리오의 대사 칸이다.
//
// ⚠️ export 하지 않는다 — **조립**을 부르는 자리는 이 파일 안에만 있다. 호출부가 늘면
//    판정이 두 벌이 되고, 각인(lib/steps.js clipKey)이 보는 값과 실제로 보내는 값이
//    갈릴 자리가 생긴다.
//    바깥이 쓰는 것은 조립된 프롬프트(buildClipPrompt)와 **판정**(promptBodyOf)이다 —
//    ⑤영상 화면이 텍스트칸에 본문을 앉히려고 promptBodyOf 를 부른다(의도된 것이고, 그
//    함수의 주석에 근거가 있다: 조립은 감추고 판정만 공유한다).
function clipPromptBody(cut) {
  const motion = typeof cut?.motion === "string" ? cut.motion.trim() : "";
  // 움직임 — 축이 있으면 축이, 없으면 옛 motion 이, 그것도 없으면 폴백이 말한다.
  //
  // ★ 폴백이 마지막인 이유: 축이 셋이라 "움직일 것이 마땅치 않다"가 성립하기 어렵다.
  //   피사체가 안 움직여도 카메라나 배경은 움직인다. 폴백은 세 축과 motion 이 전부 빈
  //   컷에만 남는다 — 옛 프로젝트와 화면 설계가 통째로 실패한 경우다.
  //
  // ⚠️ 이음새: 축 텍스트는 사장님/모델이 쓴 한국어 문장이라 마침표가 있을 수도 없을 수도
  //   있다. 그냥 " " 로 이으면 마침표 없는 축들이 한 문장으로 붙어 버리고, 마침표가 있는
  //   축은 아래 템플릿이 붙이는 마침표와 겹쳐 ".." 가 된다. 그래서 ". " 로 잇는다 —
  //   마지막 하나는 템플릿의 `.` 가 닫는다.
  //
  // ★ 끝 마침표를 **여기서 걷지 않는다.** `axesOf` 가 이미 정규화한 텍스트를 준다
  //   (lib/motion.js 의 normalizeAxisText). 여기서 한 번 더 걷으면 정규화가 두 벌이 되고,
  //   각인(lib/steps.js clipKey)은 그중 한 벌만 보게 되어 "마침표만 고쳤는데 클립이 낡는"
  //   거짓 낡음이 돌아온다. 이 자리에 남는 것은 **조립**(잇는 방식)뿐이다.
  //   (마침표만 적힌 축처럼 정규화하면 아무것도 안 남는 값은 axesOf 가 이미 빼 준다 —
  //   그래야 프롬프트가 "." 하나로 시작하는 일이 없다.)
  const axisText = axesOf(cut).map((a) => a.text).join(". ");
  const base = axisText || motion || "거의 정지 상태, 아주 느린 카메라 이동";
  // 속도는 영어로 덧붙인다 — motion 은 한국어 원문 그대로 가지만 속도는 모델이 반응하는 관용구가 있다.
  // 속도가 없는 옛 컷에는 아무것도 붙이지 않는다: 문구가 달라지면 클립을 다시 사게 된다.
  const pace = isSpeed(cut?.speed) ? ` ${speedFor(cut.speed).clip}.` : "";
  // 마침표는 여기서 닫는다 — 축 이음새(". ")의 마지막 하나가 이 `.` 다.
  return `${base}.${pace}`;
}

// ★ 말하지 않는 모델에서는 한 글자도 바뀌지 않는다. 프롬프트가 각인(clipKey)에 들어가므로,
// 문구가 달라지면 이미 값을 치른 클립이 통째로 낡아 다시 사게 된다.
export function buildClipPrompt(cut, project) {
  // 이미지와 같은 규칙이다 — 본문만 갈리고 꼬리는 코드가 붙인다. 판정은 promptBodyOf
  // 한 자리다(판형을 안 붙이는 이유도 거기 적혀 있다).
  //
  // ★ 대사·목소리·립싱크 지시는 아래 꼬리에 그대로 남는다 — 사장님이 여기서 대사를
  //   지울 수 있으면 들리는 말과 ffmpeg 가 태우는 자막이 갈린다(lib/subtitles.js).
  const body = promptBodyOf("clip", cut, project);

  // 말하는지·누가 말하는지는 speechFor 한 자리가 정한다(각인이 같은 판정을 본다)
  const spoken = speechFor(cut, project);
  // 무대·인물·제품·톤 — 말하는 경로와 안 말하는 경로 둘 다 같은 절을 받는다.
  // 맨 뒤(첫 프레임 유지·금지문)보다 앞에 둔다 — 코드가 마지막에 붙이는 지시가 사장님
  // 입력(대사·edit_instruction 류)보다 뒤에 남아야 하는 것과 같은 이유로, 여기서는
  // 순서가 반대로 지켜져야 한다: 맥락은 지시보다 앞, 지시는 늘 맨 끝.
  const context = clipContextClause(cut, project);
  // 프로젝트 공통 지시 — 맥락과 꼬리 사이다. 덮어쓴 컷에도 남는다(promptNoteClause 주석).
  // 갈래가 셋이라(내레이션·화면 안 대사·무음) 세 자리에 모두 넣는다 — 갈래마다 이어 붙이는
  // 문자열이 따로라 하나만 넣으면 나머지 둘에서 조용히 빠진다.
  const note = promptNoteClause(project, "clip_note");

  if (spoken) {
    const { line } = spoken;
    const voice = spoken.voice ? ` Voice: ${spoken.voice}.` : "";
    // 대사는 한국어 원문 그대로다 — 번역하거나 다듬으면 자막(ffmpeg 가 태우는 원고)과 갈린다.
    // ★ 화면 밖 목소리 갈래 — 입모양을 요구하지 않는다. 화면에 말할 사람이 없는데 립싱크를
    //   시키면 모델이 없는 사람을 만들어 넣거나 사물의 입을 움직인다(2026-08-17).
    if (spoken.narration) {
      return `${body} A narrator speaks in voiceover, off-screen — no one in frame speaks or moves their lips.${voice} Says exactly, in Korean: "${line}".${context}${note} The attached image is the first frame — continue naturally from it. Keep the subject and style unchanged. No text or letters.`;
    }
    const who = spoken.who || "인물";
    return `${body} ${who} speaks to the camera with natural lip sync.${voice} Says exactly, in Korean: "${line}".${context}${note} The attached image is the first frame — continue naturally from it. Keep the subject and style unchanged. No text or letters.`;
  }

  return `${body}${context}${note} The attached image is the first frame — continue naturally from it. Keep the subject and style unchanged. No text or letters. No talking faces or lip sync.`;
}

// 시나리오가 "화면 밖 목소리"라고 적었는가.
//
// ★ 판정은 여기 하나다. 화자 칸은 사장님이 직접 고치는 자유 서술이라("내레이션 (여성)"),
//   읽는 자리마다 따로 재면 컷을 만들 때와 클립을 만들 때의 판단이 갈린다.
// ★ 공백을 걷고 부분 일치로 본다 — 지문은 "내레이션"만 요구하지만 사장님은 덧붙여 쓴다.
//   흔한 표기 흔들림(나레이션·내레이터)까지 같은 것으로 본다.
export function isNarrationSpeaker(speaker) {
  const s = String(speaker || "").replace(/\s+/g, "");
  if (!s) return false;
  return ["내레이션", "나레이션", "내레이터", "나레이터"].some((w) => s.includes(w));
}

// 시나리오의 shot 하나가 컷 하나다. 옮기는 것은 **코드**가 한다 — LLM 이 두 번 답하면
// 사장님이 화면에서 본 대사와 실제로 만들어지는 대사가 갈릴 수 있다.
//
// ★ beat·speaker 는 컷에 저장하지 않는다. 둘은 화면 설계·캐스팅이 읽는 **입력**이고,
//   컷에 얹으면 각인(lib/steps.js clipKey)이 부풀어 beat 만 고쳐도 값을 치른 클립이 낡는다.
//
// ★ 다만 **화면 밖 목소리인가**는 컷에 남긴다(`narration: true`). 시나리오가 이미 내린
//   결정인데 코드가 그것을 못 읽으면, 말하는 모델의 판정(projectSpeaks)이 "캐스팅이 그 컷에
//   사람을 붙였는가"로 대신 추론된다 — 캐스팅이 지문을 지키면 프로젝트 전체가 조용히 TTS 로
//   떨어지고, 안 지키면 화면 밖 대사를 인물이 립싱크한다. 어느 쪽이 나올지는 매번 다르다
//   (2026-08-16 최종 리뷰 Critical 1). 결정은 시나리오가 하고 코드가 읽는다.
//   ★ 2026-08-17: 이 표시가 여는 것은 이제 TTS 가 아니라 **내레이션 갈래**다(speechFor) —
//     클립이 화면 밖 목소리로 그 대사를 읽는다. 표시가 필요한 이유는 그대로다.
// ★ 화자 문자열이 아니라 **불리언**을 남기는 이유 셋:
//   ① 코드가 필요로 하는 결정은 "화면 밖인가" 하나뿐이고, 문자열을 남기면 읽는 자리마다
//      다시 분류해야 한다(판정이 두 벌이 된다).
//   ② **참일 때만 붙는다** — 옛 컷과 화면 안 대사 컷의 모양이 글자 그대로 그대로다.
//      컷 모양은 각인으로 흘러가므로 필드가 늘 붙으면 산 산출물이 통째로 낡는다.
//   ③ 바로 위 `silent: true` 가 이미 같은 모양이다(있을 때만 붙는 표시).
//
// ★ spoken_seconds 는 대사 있는 컷만 채운다. 이 값이 자막이 머무는 시간이라
//   (lib/subtitles.js), 무음 컷에 값을 주면 없는 자막이 시간을 먹는다.
export function shotsToCuts(scenario) {
  const shots = Array.isArray(scenario?.shots) ? scenario.shots : [];
  return shots.map((s, i) => {
    const sentence = typeof s?.line === "string" ? s.line.trim() : "";
    const seconds = Math.round(Number(s?.seconds) || 0);
    // 대사가 없는 장면의 화자는 보지 않는다 — 말하지 않는 컷에 "화면 밖"을 표시할 것이 없다
    // (validateScenario 도 빈 대사의 화자를 비운다).
    const narration = Boolean(sentence) && isNarrationSpeaker(s?.speaker);
    return {
      idx: i,
      sentence,
      seconds,
      spoken_seconds: sentence ? seconds : 0,
      ...(sentence ? {} : { silent: true }),
      ...(narration ? { narration: true } : {}),
      source: "scenario",
      regen_count: 0,
    };
  });
}
