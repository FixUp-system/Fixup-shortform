// 자막 — 컷 경계가 곧 자막 경계다.
// cut.seconds 는 ③목소리에서 실측된 낭독 길이라, 자막이 화면에 머무는 시간이 그 값이다.
//
// 합성이 클립을 낭독 길이로 맞추므로(짧으면 tpad 로 늘리고 길면 trim 으로 자른다)
// 자막이 뜨는 자리도 낭독 길이로 누적하면 맞는다. 예전에는 둘이 갈라져 있어
// 자막이 갈수록 앞서고 마지막 몇 초는 말하는데 자막이 없었다.
//
// ASS 를 쓰는 이유: 위치·여백을 스타일 한 줄로 정할 수 있고 ffmpeg 의 subtitles 필터가
// 폰트 파일을 그대로 받는다. drawtext 로 문장마다 필터를 쌓는 것보다 단순하다.

const round2 = (n) => Math.round(n * 100) / 100;

// 완성본에서 이 컷이 차지하는 시간 = **낭독 길이**.
//
// 예전에는 max(낭독, 클립)이었다. i2v 눈금(6·8·10…)이 올림이라 클립이 낭독보다 긴 것이
// 보통이고, 그 차이가 그대로 무음이 됐다(30초 요청에 완성본 32.8초, 정적 4.8초).
// 이제 합성이 남는 클립을 잘라내므로(lib/compose.js) 구간 길이는 낭독이다.
//
// 낭독이 없으면(목소리 실패) 클립 길이로 떨어진다 — 합성은 그래도 돌아야 한다.
export function cutSeconds(cut) {
  const spoken = Number(cut?.seconds) || 0;
  const clip = Number(cut?.video?.seconds) || 0;
  return spoken || clip;
}

export function buildCues(cuts) {
  let t = 0;
  const cues = [];
  for (const c of cuts || []) {
    // 자막이 머무는 시간은 낭독만큼이다 — 무음 구간까지 띄우면 말이 끝난 뒤에도 남는다
    const spoken = Number(c.seconds) || 0;
    const text = (c.sentence || "").trim();
    // 문장이 없어도 시간은 흐른다 — 건너뛰면 뒤 자막이 전부 밀린다
    if (text) cues.push({ start: round2(t), end: round2(t + spoken), text });
    t += cutSeconds(c);
  }
  return cues;
}

// 자막 스타일 — 글자 크기·여백은 화면에서 파생된다. 값을 두 곳에 두면 갈라지므로 여기 하나뿐이다.
// (toAss 가 쓰고, 폭 한계도 여기서 나온다.)
export function subtitleStyle({ width, height }) {
  return {
    fontSize: Math.round(height * 0.042),
    marginH: Math.round(width * 0.08),
    // 세이프존 — 틱톡·릴스의 하단 UI(버튼·캡션)에 가리지 않게 아래에서 18% 위에 둔다.
    marginV: Math.round(height * 0.18),
  };
}

// 자막 한 덩어리는 두 줄까지다. 세로 화면에서 한 줄이 한글 열한 자 남짓이라,
// 세 줄이 되면 글자가 화면 세로의 3분의 1을 먹는다(2026-07-29 실측: 컷 17개 중 16개가 두 줄 이상,
// 절반이 세 줄, 최악은 다섯 줄로 39%).
export const MAX_SUBTITLE_LINES = 2;

// 한 줄에 들어가는 폭 — 상수로 박지 않는다. 비율이 셋(9:16·1:1·16:9)이고 글자 크기·여백이
// 전부 화면에서 파생되므로, 한계도 같은 식에서 나와야 비율을 바꿨을 때 따라 움직인다.
export function lineWidthUnits({ width, height }) {
  const { fontSize, marginH } = subtitleStyle({ width, height });
  return (width - marginH * 2) / fontSize;
}

// 글자 수가 아니라 **폭**으로 센다 — "3,000원" 처럼 숫자가 섞이면 둘이 어긋난다.
// 근사지만 한쪽으로만 틀린다(실제보다 넓게 잡힌다) — 좁게 잡히면 세 줄로 넘치기 때문이다.
const WIDE = /[ᄀ-ᇿ㄰-㆏가-힯　-〿一-鿿！-｠]/;
export function textUnits(text) {
  let u = 0;
  for (const ch of text || "") {
    if (ch === " ") u += 0.3;
    else if (WIDE.test(ch)) u += 1.0;
    else u += 0.5;
  }
  return u;
}

function assTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

// 세이프존 — 틱톡·릴스의 하단 UI(버튼·캡션)에 가리지 않게 아래에서 18% 위에 둔다.
export function toAss(cues, { width, height }) {
  const { fontSize, marginH, marginV } = subtitleStyle({ width, height });

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,Bold,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Main,Pretendard,${fontSize},&H00FFFFFF,&H00000000,&H80000000,1,1,3,0,2,${marginH},${marginH},${marginV},1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
`;

  const lines = (cues || [])
    .map(
      (c) =>
        `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Main,,0,0,0,,` +
        // 진짜 줄바꿈이 남으면 그 뒤가 다른 이벤트로 읽힌다
        String(c.text).replace(/\r?\n/g, "\\N")
    )
    .join("\n");

  return header + lines + "\n";
}
