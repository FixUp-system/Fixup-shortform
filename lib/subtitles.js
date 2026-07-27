// 자막 — 컷 경계가 곧 자막 경계다.
// cut.seconds 는 ④목소리에서 실측된 낭독 길이라, 여기서 만든 타이밍이 소리와 맞는다.
//
// ASS 를 쓰는 이유: 위치·여백을 스타일 한 줄로 정할 수 있고 ffmpeg 의 subtitles 필터가
// 폰트 파일을 그대로 받는다. drawtext 로 문장마다 필터를 쌓는 것보다 단순하다.

const round2 = (n) => Math.round(n * 100) / 100;

export function buildCues(cuts) {
  let t = 0;
  const cues = [];
  for (const c of cuts || []) {
    const dur = Number(c.seconds) || 0;
    const text = (c.sentence || "").trim();
    // 문장이 없어도 시간은 흐른다 — 건너뛰면 뒤 자막이 전부 밀린다
    if (text) cues.push({ start: round2(t), end: round2(t + dur), text });
    t += dur;
  }
  return cues;
}

function assTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

// 세이프존 — 틱톡·릴스의 하단 UI(버튼·캡션)에 가리지 않게 아래에서 18% 위에 둔다.
export function toAss(cues, { width, height }) {
  const marginV = Math.round(height * 0.18);
  const marginH = Math.round(width * 0.08);
  const fontSize = Math.round(height * 0.042);

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
