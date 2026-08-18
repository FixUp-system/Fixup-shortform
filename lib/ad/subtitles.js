// 광고 장면을 **자막 장치가 아는 모양**으로 옮긴다.
//
// 광고에는 자막을 태우는 자리가 없었다(2026-08-18 이전). 화면에 보이는 글자는 전부 영상
// 모델이 그린 것이라 오타가 나도 고칠 수단이 없었다 — 사장님이 본 `KONKUK UNVV` 가 그
// 종류다. 정작 시나리오 지문은 "화면에 글자를 넣으라고 요구하지 마라, 자막은 우리가 나중에
// 붙인다"라고 적어 두고 있었는데 **붙이는 자리가 없었다.**
//
// ★ 새 자막 장치를 만들지 않는다. ⑥완성이 쓰는 것(lib/subtitles.js 의 buildCues·toAss,
//   lib/compose.js 의 burnArgs)을 그대로 쓴다 — 두 벌이 되면 폰트·줄바꿈·위치 규칙이 갈린다.
//   그 장치는 **컷 배열**을 받으므로, 광고의 장면(shots)을 그 모양으로 옮기는 것이 이 파일이다.
//
// ⚠️ 단계별과 다른 점: 저쪽은 낭독을 실제로 만들어 **실측 길이**로 자막을 맞춘다
//    (lib/subtitles.js 의 spoken_seconds). 광고는 통짜 생성이라 실측이 없어 **시나리오가
//    적은 초**로 맞춘다 — 말과 자막이 조금 어긋날 수 있고, 그것이 지금 구조의 한계다.
// videoUrl — 자막 장치는 "그려진 컷"만 태운다(`cuts.filter(c => c.video?.url)`).
// 광고는 장면마다 클립이 따로 있는 것이 아니라 **한 편이 통짜**라, 모든 장면에 그 한 편을
// 가리켜 준다. 초는 안 싣는다 — 실으면 cutSeconds 가 그 값을 화면 시간으로 삼아 장면마다
// 전체 길이를 세게 된다(lib/subtitles.js cutSeconds).
export function adSubtitleCuts(scenario, videoUrl = "ad") {
  const shots = Array.isArray(scenario?.shots) ? scenario.shots : [];
  return shots.map((s, i) => {
    const line = typeof s?.line === "string" ? s.line.trim() : "";
    return {
      idx: i,
      sentence: line,
      // 초가 빠진 옛 시나리오도 죽지 않는다 — 0 이면 그 장면에 자막이 안 흐른다
      seconds: Number(s?.seconds) || 0,
      // 대사 없는 장면은 자막이 없다. 빈 자막을 태우면 검은 띠만 깜빡인다
      silent: !line,
      video: { url: videoUrl },
    };
  });
}
