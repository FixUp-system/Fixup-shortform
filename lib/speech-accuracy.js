// 보낸 문장(모델에게 읽으라고 시킨 글)과 들은 문장(받아쓰기)을 대조해 **발음 정확도**를 잰다.
//
// ★ **순수 함수다 — import 문을 두지 마라.** 화면("use client")도 이 파일을 읽는다.
//   사슬 끝에 fs 가 닿으면 빌드가 깨진다(CLAUDE.md 의 "값이 사는 곳" — 이 저장소가 세 번 겪었다).
//
// ★★★ 왜 글자 단위인가 — 2026-09-16 실측(표본 2편).
//   낱말 단위로 대조하면 **표기 차이**(`V라인`↔"브이라인", `3분`↔"삼분")와 **띄어쓰기
//   분절**(`당겨`+`주는`↔"당겨주는")이 오독처럼 세어져 70% 로 보였다. 숫자·영문을 한글
//   읽는 꼴로 바꾸고 공백·문장부호를 지운 뒤 글자 단위로 재면 같은 두 편이 **93% · 100%**
//   였다. 남은 어긋남이 진짜 오독이다: `밴드`→"벤트", `쿠션이`→"쿠션아", `갸름한`→"갸늘한".
//   → 그래서 ① 읽는 꼴로 바꾸고 ② 공백·문장부호를 지우고 ③ 글자 LCS 로 잰다.
//
// ★ 이 파일은 **재기만 한다.** 자막 글자는 여기 결과로 바꾸지 않는다 — "whisper 는 언제
//   말했나만 답하고 무엇을 말했나는 시나리오가 답한다"는 규율이 lib/speech-timing.js
//   상단에 있다. 발음 정확도는 **기록과 표시**용이다.

// 한자수(사이노) 낱자 — 읽는 꼴로 옮길 때 쓴다.
const SINO_DIGITS = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];

// 라틴 낱자의 한글 음 — `V라인`→"브이라인" 같은 표기 차이를 흡수한다.
const LATIN_SOUND = {
  a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지", h: "에이치",
  i: "아이", j: "제이", k: "케이", l: "엘", m: "엠", n: "엔", o: "오", p: "피",
  q: "큐", r: "알", s: "에스", t: "티", u: "유", v: "브이", w: "더블유",
  x: "엑스", y: "와이", z: "지",
};

// 흔한 단위 — **숫자 뒤에 붙었을 때만** 옮긴다. 그래야 낱말 속 g·l 을 단위로 오해하지 않는다
// ("green" 의 g 는 단위가 아니다). 긴 것부터 본다(kg 를 g 로 깎아 먹지 않게).
const UNITS = [
  ["kg", "킬로그램"],
  ["mg", "밀리그램"],
  ["ml", "밀리리터"],
  ["cm", "센티미터"],
  ["mm", "밀리미터"],
  ["g", "그램"],
  ["l", "리터"],
  ["%", "퍼센트"],
];

// 0~99 를 한자수 읽기로. 100 이상은 낱자 나열로 흘린다 — 정확도를 재는 용도라 자릿수
// 읽기(천·백)까지 갈 값어치가 없고, 양쪽 모두 같은 꼴로 바뀌므로 대조에는 공평하다.
function sinoNumber(digits) {
  const n = Number(digits);
  if (!Number.isFinite(n) || digits.length > 2) {
    return digits.split("").map((d) => SINO_DIGITS[Number(d)] || d).join("");
  }
  if (n < 10) return SINO_DIGITS[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${tens > 1 ? SINO_DIGITS[tens] : ""}십${ones ? SINO_DIGITS[ones] : ""}`;
}

// 읽는 꼴로 바꾼다 — 숫자·라틴 낱자·단위를 한글 소리로.
export function readingForm(text) {
  let s = typeof text === "string" ? text : "";
  if (!s) return "";

  // ① 숫자 + (공백) + 단위 — 단위를 먼저 먹고 숫자를 읽는다.
  const unitAlt = UNITS.map(([u]) => u).join("|");
  s = s.replace(new RegExp(`(\\d+)\\s*(${unitAlt})`, "gi"), (m, num, unit) => {
    const hit = UNITS.find(([u]) => u.toLowerCase() === String(unit).toLowerCase());
    return sinoNumber(num) + (hit ? hit[1] : unit);
  });

  // ② 남은 숫자.
  s = s.replace(/\d+/g, (m) => sinoNumber(m));

  // ③ 남은 `%` — 숫자 없이 홀로 서 있어도 소리는 "퍼센트"다.
  s = s.replace(/%/g, "퍼센트");

  // ④ 남은 라틴 낱자 — 낱자마다 음으로. `V라인`→"브이라인".
  s = s.replace(/[A-Za-z]/g, (c) => LATIN_SOUND[c.toLowerCase()] || c);

  return s;
}

// 공백·문장부호·기호를 모두 지운다 — lib/reel/doc.js 의 speechMismatch 와 같은 자다.
function bare(text) {
  return readingForm(text).replace(/[\s\p{P}\p{S}]/gu, "");
}

// 글자 단위 LCS 의 되짚기 표. 값은 길이(최대 수천)라 Uint16 으로 충분하다.
function lcsTable(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = new Uint16Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const here = i * (m + 1) + j;
      dp[here] = a[i] === b[j]
        ? dp[(i + 1) * (m + 1) + (j + 1)] + 1
        : Math.max(dp[(i + 1) * (m + 1) + j], dp[here + 1]);
    }
  }
  return dp;
}

// 어긋난 덩어리를 최대 이만큼만 담는다 — 문서(project.reel.speech)가 커지면 안 된다.
const MAX_SPANS = 10;

// 보낸 문장과 들은 문장의 발음 정확도.
//   { ratio, chars, spans: [{ said, heard, at }] }
//   · ratio = 맞은 글자 / 보낸 글자 (0~1)
//   · chars = 보낸 글자 수(읽는 꼴·공백 제거 후)
//   · spans = 어긋난 자리를 **붙어 있는 덩어리로 묶은 것**. at 은 보낸 문자열(읽는 꼴·공백
//     제거 후)에서의 글자 위치다 — said/heard 도 같은 자로 잰 글자라야 자리가 맞는다.
export function speechAccuracy(said, heardText) {
  const a = bare(said);
  const b = bare(heardText);
  if (!a.length) return { ratio: 1, chars: 0, spans: [] };
  if (!b.length) return { ratio: 0, chars: a.length, spans: [] };

  const dp = lcsTable(a, b);
  const m = b.length;

  const spans = [];
  let matched = 0;
  let i = 0;
  let j = 0;
  let run = null; // 지금 모으고 있는 어긋난 덩어리

  const closeRun = () => {
    if (run) spans.push(run);
    run = null;
  };
  const openRun = () => {
    if (!run) run = { said: "", heard: "", at: i };
    return run;
  };

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      closeRun();
      matched++;
      i++;
      j++;
    } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + (j + 1)]) {
      openRun().said += a[i];
      i++;
    } else {
      openRun().heard += b[j];
      j++;
    }
  }
  while (i < a.length) { openRun().said += a[i]; i++; }
  while (j < b.length) { openRun().heard += b[j]; j++; }
  closeRun();

  return {
    ratio: matched / a.length,
    chars: a.length,
    spans: spans.slice(0, MAX_SPANS),
  };
}
