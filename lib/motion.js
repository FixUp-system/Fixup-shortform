// 컷의 움직임 축 — 화면(클라이언트)과 화면 설계·클립 요청(서버)이 함께 본다.
//
// import 가 없다(lib/speeds.js·shots.js·aspects.js·styles.js·voices.js·clip-limits.js 와 같은 이유).
//
// 왜 축을 나누는가: 2026-07-28(805628f)부터 movement 는 "카메라가 움직이거나 피사체가
// 움직이거나 — 둘 다 넣지 않는다"였다. 그 규칙에는 **근거가 붙어 있지 않았고**, 그 커밋의
// 검증은 "가짜 이미지 모드"(=프롬프트 문자열 확인)라 나온 영상을 본 것이 아니었다.
// 그래서 축을 열되, 무너지면 이 목록에서 한 줄을 빼면 지문·검증·프롬프트·각인·판정·화면이
// 함께 줄어들도록 원천을 하나로 뒀다.
//
// ⚠️ 유료 실측 전이다. 무너지면 여기에 실측을 적고 축을 줄인다.
//
// ★ ambient 가 진짜 빈칸이었다 — 지금까지 배경 움직임을 적을 자리가 없어서 배경은 shows 의
//   정지 서술 그대로 얼어 있거나 모델 재량이었다. 조명 변화도 여기가 받는다(lighting 축을
//   따로 만들면 조명이 environment·shows 와 함께 세 군데가 된다).
//
// ★ 지문에 실리는 **예시(example·bad)도 축의 속성이다.** 예시를 지문에 손으로 적어 두면
//   목록에서 축 한 줄을 빼도 지문은 그 축을 계속 예시로 보여 주고, 모델은 없는 필드를 답한다.
//   축에 딸린 것은 전부 여기서 나온다 — 그래야 한 줄을 빼는 것이 진짜 되돌리기가 된다.
//   `bad`(✗ 예시)는 있는 축만 갖는다.
export const MOTION_AXES = [
  {
    id: "camera",
    label: "카메라",
    hint: "카메라가 어떻게 움직이는가 — 다가간다·물러난다·따라간다·올려본다",
    example: "천천히 뒤로 물러난다",
    bad: "돌면서 뒤로 물러났다가 다시 다가간다",
  },
  {
    id: "subject",
    label: "피사체",
    hint: "화면 속 인물이나 물건이 무엇을 하는가",
    example: "컵을 들어 입으로 가져간다",
  },
  {
    id: "ambient",
    label: "배경",
    hint: "주변에서 일어나는 일 — 지나가는 사람, 흔들리는 것, 김·먼지·물결, 빛의 변화",
    example: "창밖으로 사람들이 지나간다",
  },
];

export function isMotionAxis(id) {
  return MOTION_AXES.some((a) => a.id === id);
}

export function motionAxisFor(id) {
  return MOTION_AXES.find((a) => a.id === id) || null;
}

// 이 컷이 실제로 가진 축만, 목록 순서로 돌려준다.
// 순서를 목록에 맡기는 이유: 프롬프트·각인·화면이 전부 이 함수를 쓰면 세 곳의 순서가
// 저절로 같아진다. 순서가 갈리면 각인이 흔들려 멀쩡한 클립이 낡는다.
export function axesOf(cut) {
  const out = [];
  for (const a of MOTION_AXES) {
    const text = typeof cut?.[a.id] === "string" ? cut[a.id].trim() : "";
    if (text) out.push({ id: a.id, text });
  }
  return out;
}

// 컷들이 한 축에만 매달려 있지 않은가.
//
// 왜 이 규칙 하나뿐인가: speedContrast 의 첫 규칙("전 컷이 같은 속도")과 같은 모양이라
// 구조적 근거가 있다 — 카메라만 계속 움직이는 영상과 피사체만 계속 움직이는 영상은 둘 다
// 단조롭고, 그 판정에 임계값이 필요 없다.
//
// ⚠️ Arc(시작-절정-마무리 형태)는 여기 없다. 실측 분포가 없어 임계를 감으로 정하게 된다.
//    표본이 쌓이면 그때 더한다.
//
// 축이 하나도 없는 컷은 셈에서 뺀다 — 저장된 옛 프로젝트가 재시도를 유발하면 안 된다
// (shotBalance 가 샷 크기 누락을 셈에서 빼는 것과 같은 이유).
//
// 사유는 사장님이 아니라 **모델이 읽는다** — 재시도 지시로 그대로 실린다.
export function motionVariety(cuts) {
  const list = Array.isArray(cuts) ? cuts : [];
  if (list.length < 2) return { ok: true, reason: null };
  const used = new Set();
  let counted = 0;
  for (const c of list) {
    const axes = axesOf(c);
    if (!axes.length) continue;
    counted += 1;
    for (const a of axes) used.add(a.id);
  }
  if (counted < 2) return { ok: true, reason: null };
  if (used.size < 2) {
    const only = motionAxisFor([...used][0]);
    return {
      ok: false,
      reason: `${counted}컷이 전부 ${only.label} 움직임 하나뿐이다 — 다른 축을 섞는다`,
    };
  }
  return { ok: true, reason: null };
}
