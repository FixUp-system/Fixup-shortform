// 캐스팅 — 영상에 보이는 인물을 뽑고, 인물마다 레퍼런스를 정한다.
//
// 왜 컷마다 따로 묻지 않는가: 화면 설명은 같은 사람을 여러 이름으로 부른다("초등학생"·
// "꼬마"·"아드님"). 컷마다 고정 목록에 맞추게 하면 표현이 조금 달라져도 못 고르거나
// 잘못 고른다. 영상당 한 번 뽑고 인물이 자기 컷 번호를 답하면 그 간극이 없어진다.
import { promises as fs } from "fs";
import path from "path";
import { AVATARS } from "./refs";

// 캐스팅 — 컷별 화면 설명을 읽고 거기 나오는 사람을 뽑는다.
//
// 원고에서 뽑던 것을 화면으로 옮겼다. 원고에서 뽑으면 "누가 화면에 보일지"를 상상해야 하는데,
// 실측에서 그 상상이 두 번 다 빗나갔다(2026-07-28, 가짜 모드 8편):
//   - "스치는 사람은 빼라" → 손님을 3/3 누락, 주인만 뽑았다
//   - "다시 나오는 사람만" → 손님은 뽑았으나 주인이 빠졌다. cast 가 늘 1명으로 수렴했다
// shows 에는 "주인이 손님에게 옷을 입히고" 처럼 이미 답이 적혀 있다. 상상할 것이 없다.
//
// 인물이 자기 컷 번호를 함께 답하는 것이 요점이다 — "같은 사람에게 같은 id"가 프롬프트
// 약속에서 코드 보장으로 바뀐다. 컷에 꽂는 것은 mergeCastIntoCuts 가 한다.
const CAST_SYSTEM = `너는 숏폼 영상의 캐스팅을 정한다. 컷별 화면 설명을 읽고 화면에 보이는 사람을 뽑는다.
반드시 JSON 하나만 출력: {"cast":[{"who":"이 인물이 누구인지 한 마디","avatar_id":"준비된 인물 사진 중 가장 맞는 id(없으면 생략)","cuts":[이 인물이 보이는 컷 번호들]}],"props":[{"photo_id":"올린 사진의 id","cuts":[그 사진에 찍힌 것이 보이는 컷 번호들]}]}
규칙:
- [이 영상이 따라가는 사람]이 주어져 있으면 그 사람을 반드시 cast 에 넣는다. 화면 설명이 그 사람을 다르게 불러도 같은 사람으로 묶는다.
- 화면 설명에 사람으로 적힌 사람을 빠짐없이 센다. 한 화면에 둘이 적혀 있으면 둘 다 넣는다.
  ✗ "주인이 손님에게 옷을 입히고 치수를 재는 미디엄 샷" 인데 주인만 넣는 것
  ✓ 주인과 손님을 각각 한 명씩 넣는다
- 같은 사람을 화면마다 다르게 불러도 한 인물로 묶는다. "손님"·"코트를 든 남성"·"그분"이 같은 장면 흐름이면 한 명이다.
- cuts 는 그 인물이 보이는 컷 번호를 전부 적는다. 번호는 아래 목록에 적힌 그대로다.
- 손·발만 나오는 화면도 그 사람이 보이는 것으로 센다.
- 화면 설명에 없는 사람은 넣지 않는다 — 이야기에만 나오고 화면에 안 보이는 사람, 전화 통화 상대.
- who 는 나이대·성별이 드러나게 적는다. 그 값으로 사진을 고르기 때문이다.
  ✗ "손님" / "그 사람"
  ✓ "50대 남성 가게 주인" / "10세 전후 남자아이"
- avatar_id 는 준비된 목록에서만 고른다. 맞는 것이 없으면 적지 않는다 — 억지로 고르면 엉뚱한 얼굴이 나온다.
- 사람이 보이지 않는 영상이면 cast 를 빈 배열로 둔다.
- props 는 [올린 사진 — 사물] 이 주어졌을 때만 적는다. 그 블록이 없으면 props 를 빈 배열로 둔다.
- props 의 cuts 는 그 사진에 찍힌 것이 화면에 보이는 컷 번호를 전부 적는다. 하나도 빠뜨리지 않는다 — 적지 않은 컷은 그 물건이 레퍼런스 없이 그려져 다른 물건으로 나온다.
- 화면 설명이 그것을 다른 이름으로 불러도 같은 것으로 묶는다. "앰플"·"병"·"제품"·"세럼"이 같은 물건이면 하나다.
- 손에 들고 있거나 일부만 보이는 화면도 보이는 것으로 센다.
- 어느 컷에도 안 보이면 그 사진의 cuts 를 빈 배열로 둔다.`;

// lead — 이 영상이 따라가는 사람. **갈래가 '사람'일 때만 넘어온다**(lib/pipeline.js).
// 물건·정보 영상에서는 이 자리가 비어 있어야 한다. 칸이 있으면 모델이 채우기 때문에,
// 억지 주인공을 막는 것은 문구가 아니라 "아예 안 넘기는 것"이다.
//
// props — 사물 사진 [{id, what}]. 인물 사진(vision.person)은 여기 오지 않는다(resolveCastRefs 가 쓴다).
// 같은 이유로 비어 있으면 블록째 넣지 않는다.
export function buildCastMessages(cuts, avatars, lead = "", props = []) {
  const list = (avatars || []).map((a) => `- id:${a.id} ${a.traits}`).join("\n") || "(없음)";
  // 화면이 없는 컷은 문장으로 대신한다 — 화면 설계가 실패해도 캐스팅은 돌아야 한다
  const shots = (cuts || [])
    .map((c, i) => `${i + 1}. ${c.shows || c.sentence || ""}`)
    .join("\n");
  const who = String(lead || "").trim();
  const leadBlock = who ? `\n[이 영상이 따라가는 사람]\n${who}\n` : "";
  const things = (props || []).filter((p) => p?.id);
  const propBlock = things.length
    ? `\n[올린 사진 — 사물]\n${things.map((p) => `- id:${p.id} ${p.what || "(무엇인지 모름)"}`).join("\n")}\n`
    : "";
  const user = `[컷별 화면 — 번호가 곧 컷 번호다]
${shots}
${leadBlock}${propBlock}
[준비된 인물 사진]
${list}`;
  return { system: CAST_SYSTEM, messages: [{ role: "user", content: user }] };
}

export function avatarsDir() {
  return process.env.SHOTFORM_AVATARS_DIR || path.join(process.cwd(), "assets", "refs");
}

// 파일이 실제로 있는 아바타만. 없는 레퍼런스를 가리키는 지시는 그림을 망친다.
export async function availableAvatars(dir = avatarsDir()) {
  const out = [];
  for (const a of AVATARS) {
    try {
      await fs.access(path.join(dir, a.file));
      out.push(a);
    } catch {
      // 파일이 없으면 그 항목은 없는 것으로 둔다 — 폴더가 비어도 정상 동작한다
    }
  }
  return out;
}

export function avatarFile(avatarId, dir = avatarsDir()) {
  const a = AVATARS.find((x) => x.id === avatarId);
  return a ? path.join(dir, a.file) : null;
}

// 인물마다 레퍼런스를 정한다. **사진이 먼저다** — 사장님이 실제로 올린 얼굴이
// 아바타보다 중요하고, 그것이 아바타로 바뀌면 사장님 얼굴이 남의 얼굴이 된다.
//
// 사진이 어느 인물인지는 VLM 판정(photo.vision.person)으로만 가른다. 판정이 없는 사진은
// 인물에 붙이지 않는다 — 모르는 것을 얼굴로 쓰지 않는다.
export function resolveCastRefs(cast, photos, availableAvatarIds = []) {
  const people = (photos || []).filter((p) => p.vision?.person);
  const taken = new Set();
  return (cast || []).map((c) => {
    // 아직 안 쓴 인물 사진이 있으면 그것을 쓴다.
    // 사진 여러 장을 인물 여러 명에 정교하게 맞추지는 않는다 — 그 판정을 믿을 근거가
    // 아직 없고, 틀리면 얼굴이 뒤바뀐다. 2단계 출연 블록에서 사장님이 고른다.
    const photo = people.find((p) => !taken.has(p.id));
    if (photo) {
      taken.add(photo.id);
      return { ...c, ref: { from: "photo", id: photo.id } };
    }
    if (c.avatar_id && availableAvatarIds.includes(c.avatar_id)) {
      return { ...c, ref: { from: "avatar", id: c.avatar_id } };
    }
    return { ...c }; // 붙일 것이 없다 — 이 인물은 레퍼런스 없이 간다(지금 동작)
  });
}

// 인물을 컷에 꽂는다 — 캐스팅이 답한 컷 번호를 그대로 쓴다.
//
// 이 함수가 있어서 "같은 사람에게 같은 id"가 코드 보장이 된다. 예전에는 화면 설계가 컷마다
// 같은 id 를 적어 주기를 바라야 했고, 그 약속이 깨지면 인물 일관성이 조용히 사라졌다.
export function mergeCastIntoCuts(cuts, cast) {
  const byCut = new Map();
  for (const person of cast || []) {
    for (const idx of person.cuts || []) {
      if (!byCut.has(idx)) byCut.set(idx, []);
      const list = byCut.get(idx);
      if (!list.includes(person.id)) list.push(person.id); // 같은 인물을 두 번 꽂지 않는다
    }
  }
  return (cuts || []).map((c, i) => {
    const people = byCut.get(i);
    if (!people?.length) return c;
    // 사진 id 를 앞에 둔다 — 사장님이 올린 것이 먼저다
    return { ...c, ref_ids: [...(c.ref_ids || []), ...people] };
  });
}

// 사물을 컷에 꽂는다 — 인물과 같은 방식이다.
//
// **사진이 인물보다 앞에 온다.** resolveCutRefs 가 상한 2장을 "사물 하나 + 인물 하나"로
// 나눠 쓰는데, 뒤에 있으면 사물이 잘려 제품이 레퍼런스 없이 그려진다.
// 사장님이 올린 것이 언제나 먼저라는 원칙과도 같다.
export function mergePropsIntoCuts(cuts, props) {
  const byCut = new Map();
  for (const p of props || []) {
    for (const idx of p.cuts || []) {
      if (!byCut.has(idx)) byCut.set(idx, []);
      const list = byCut.get(idx);
      if (!list.includes(p.photo_id)) list.push(p.photo_id); // 같은 사진을 두 번 꽂지 않는다
    }
  }
  return (cuts || []).map((c, i) => {
    const photos = byCut.get(i);
    if (!photos?.length) return c;
    const already = c.ref_ids || [];
    const fresh = photos.filter((id) => !already.includes(id));
    if (!fresh.length) return c;
    return { ...c, ref_ids: [...fresh, ...already] };
  });
}

// 컷이 고른 id 들을 실제로 쓸 레퍼런스로 푼다.
// 경로는 여기서 만들지 않는다 — fs 를 아는 자리(파이프라인)가 맡는다. 여기는 순수하다.
//
// kind 는 프롬프트 문구를 가른다: 사람이면 "같은 사람으로", 사물이면 "모양·색 그대로".
// 업로드 사진을 thing 으로 두는 이유는 지금 문구가 제품용이고, 사진이 인물이어도
// 그 인물의 캐스팅 항목(from:"photo")을 통해 들어오면 아래에서 person 으로 잡힌다.
//
// 상한은 2장인데 **인물 하나 + 사물 하나**로 나눠 쓴다. 그냥 앞에서 두 장을 자르면,
// 사진 두 장이 붙은 컷에서 인물이 통째로 밀려 인물 일관성이 조용히 죽는다.
// 인물은 한 명까지만 싣는다 — 얼굴 둘을 함께 넣으면 섞여서 둘 다 아닌 얼굴이 나온다.
// 사물만 있으면 사물로 두 장까지 쓴다.
const REF_MAX = 2;

export function resolveCutRefs(cut, project) {
  const ids = Array.isArray(cut?.ref_ids)
    ? cut.ref_ids
    : cut?.ref_photo_id ? [cut.ref_photo_id] : []; // 옛 프로젝트 폴백
  const cast = project?.cast || [];
  const photoIds = (project?.material?.photos || []).map((p) => p.id);

  const things = [];
  const people = [];
  const seen = new Set();
  for (const id of ids) {
    if (photoIds.includes(id)) {
      if (seen.has(`photo:${id}`)) continue;
      seen.add(`photo:${id}`);
      things.push({ from: "photo", id, kind: "thing" });
      continue;
    }
    const person = cast.find((c) => c.id === id);
    if (!person?.ref) continue; // 레퍼런스가 없는 인물은 건너뛴다
    const key = `${person.ref.from}:${person.ref.id}`;
    if (seen.has(key)) continue; // 같은 파일을 두 번 싣지 않는다
    seen.add(key);
    // who 를 함께 들고 간다 — 첨부를 배역에 묶는 데 쓴다.
    // 익명으로 두 장을 보냈더니 모델이 배역을 뒤바꿨다(2026-07-29 실측).
    people.push({ ...person.ref, kind: "person", who: person.who });
  }

  // 사물이 먼저다 — 사장님이 올린 것이 잘려나가면 안 된다.
  // 사물이 있으면 인물 한 명만 들어간다(자리가 하나뿐이다). 사물이 없으면 인물 둘까지 간다 —
  // 한 컷에 두 사람이 나오면 둘 다 레퍼런스를 받아야 둘 다 일관된다.
  //
  // ⚠️ 얼굴 레퍼런스 두 장이 섞여 제3의 얼굴이 되는지는 아직 실측하지 않았다.
  //    2026-07-29 관통에서 확인한다. 섞이면 인물을 다시 한 명으로 줄인다.
  if (things.length && people.length) return [things[0], people[0]];
  if (things.length) return things.slice(0, REF_MAX);
  return people.slice(0, REF_MAX);
}
