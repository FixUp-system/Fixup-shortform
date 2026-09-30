// 인물 참조 — 판을 그릴 때와 H3 에 **인물 얼굴 이미지를 계속 싣는다**.
//
// ★★ 사장님(2026-09-30): "보드를 생성할 때 인물 레퍼런스가 계속 전달이 되어야 할 것 같아. 그래야
//   일관성이 유지될 것 같은데". 그전에는 판이 글 묘사만 보고 그려서 구간 2·3 판의 남자가 구간 1 보다
//   어려졌다. 영상은 닻이 되돌렸지만, 판부터 어긋나면 되돌릴 거리가 커진다.
// ★ 이미지는 **구간 1 영상에서 자른다**(--cast-at) — 우리 파이프라인이 만든 가상 인물이다.
//   run.json 에 적어 두고 모든 구간이 같은 것을 쓴다(구간마다 새로 고르면 기준이 흔들린다).
// ★ 순수 함수다(fs 없음) — 자르는 일은 ffmpeg.js 의 castFrameArgs 가 한다.
//
// 형식: "A=1@8.5;B=1@4.5:300,230,468,760" — 인물=구간@초[:x,y,w,h]
export function parseCastAt(value, { keys = [], segments = 0 } = {}) {
  if (value == null || value === "") return { ok: true, cast: [] };
  const cast = [];
  for (const part of String(value).split(";").map((x) => x.trim()).filter(Boolean)) {
    const m = /^([^=]+)=(\d+)@([^:]+)(?::(.+))?$/.exec(part);
    if (!m) return { ok: false, reason: `--cast-at 형식이 아니에요: "${part}" (예: A=1@8.5 · B=1@4.5:300,230,468,760)` };
    const key = m[1].trim();
    if (!keys.includes(key)) return { ok: false, reason: `--cast-at 의 "${key}" 는 인물 목록에 없어요(${keys.join(", ")})` };
    const seg = Number(m[2]);
    if (!(seg >= 1 && seg <= segments)) return { ok: false, reason: `--cast-at ${key} 의 구간 ${seg} 은 없어요(1~${segments})` };
    const at = Number(m[3]);
    if (!Number.isFinite(at) || at < 0) return { ok: false, reason: `--cast-at ${key} 의 초 "${m[3]}" 가 이상해요` };
    let crop = null;
    if (m[4]) {
      const n = m[4].split(",").map((x) => Number(x.trim()));
      if (n.length !== 4 || n.some((v) => !Number.isInteger(v) || v < 0) || n[2] === 0 || n[3] === 0) {
        return { ok: false, reason: `--cast-at ${key} 의 칸 "${m[4]}" 은 x,y,w,h 정수 넷이어야 해요` };
      }
      crop = { x: n[0], y: n[1], w: n[2], h: n[3] };
    }
    cast.push({ key, seg, at, crop });
  }
  return { ok: true, cast };
}

// 판 지문 뒤에 붙는 인물 참조 문장 — 첨부 번호가 누구인지 짚는다(단계별 판 지문의 규약:
//   "어느 첨부가 무엇인지 번호로 짚는다", lib/reel/panels.js 2026-09-22).
// ★ 장면(배경·자세·옷)은 칸 설명이 정한다 — 참조에서 베끼면 모든 칸이 그 한 장면처럼 된다.
// ★ 인물 설명(who)은 싣지 않는다 — "a woman … waiting alone at the bus stop" 처럼 **구간 1 장면**이 섞여
//   있어서 몽타주 구간의 판을 헷갈리게 한다. 누구인지는 이미지가 보여 준다.
export function sheetCastLines(cast, { startAt = 1 } = {}) {
  if (!cast.length) return "";
  const lines = cast.map((c, i) =>
    `Attached reference image ${startAt + i} shows ${c.key}: draw ${c.key} with exactly this face, hairstyle and build in every panel where ${c.key} appears.`);
  return [
    ...lines,
    "These character references are for identity only — do not copy the background, pose or clothing from them; each panel's scene and wardrobe follow the panel descriptions.",
  ].join("\n");
}
