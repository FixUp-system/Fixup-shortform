// 캐스팅 — 원고에 나오는 인물을 뽑고, 인물마다 레퍼런스를 정한다.
//
// 왜 컷마다 정하지 않는가: 원고는 같은 사람을 여러 이름으로 부른다("초등학생"·"꼬마"·
// "아드님"). 고정 목록에 컷마다 맞추게 하면 표현이 조금 달라져도 못 고르거나 잘못 고른다.
// 원고당 한 번 뽑고 컷은 그 목록에서만 고르면 그 간극이 없어진다.
import { promises as fs } from "fs";
import path from "path";
import { AVATARS } from "./refs";

// "화면에 보이는 사람만" 규칙에 반례를 붙여 둔 이유: 이름 없이 "손님"으로만 불리는 사람을
// 모델이 "스치는 사람"으로 읽고 빼 버렸다(손님이 나오는 원고 3편 전부 cast 가 주인 1명뿐).
// 손님이 컷마다 다른 얼굴로 그려지면 이 기능이 막으려던 결함이 그대로 남는다.
const CAST_SYSTEM = `너는 숏폼 영상의 캐스팅을 정한다. 원고를 읽고 화면에 사람으로 나올 인물을 뽑는다.
반드시 JSON 하나만 출력: {"cast":[{"who":"이 인물이 누구인지 한 마디","avatar_id":"준비된 인물 사진 중 가장 맞는 id(없으면 생략)"}]}
규칙:
- 화면에 사람으로 보일 인물은 빠짐없이 넣는다. 손님·아이·직원처럼 이름 없이 일반명사로 불려도
  화면에 보이면 그 사람도 한 명의 인물이다. 주인공 한 명만 넣으면 틀렸다.
  ✗ "미용사가 아이 머리를 자릅니다" 인데 cast 에 미용사만 두는 것
  ✓ 미용사와 아이를 각각 한 명씩 둔다
- 화면에 안 나오는 사람은 넣지 않는다 — 전화 통화 상대, 이야기 속에서만 언급되고 화면에 안 보이는 사람.
- 원고가 같은 사람을 여러 이름으로 부르면 한 인물로 묶는다("초등학생"·"그 아이"·"아드님"은 한 명이다).
- who 는 나이대·성별이 드러나게 적는다. 그 값으로 사진을 고르기 때문이다.
  ✗ "손님" / "그 사람"
  ✓ "50대 남성 가게 주인" / "10세 전후 남자아이"
- avatar_id 는 준비된 목록에서만 고른다. 맞는 것이 없으면 적지 않는다 — 억지로 고르면 엉뚱한 얼굴이 나온다.
- 사람이 안 나오는 원고면 cast 를 빈 배열로 둔다.`;

export function buildCastMessages(project, avatars) {
  const list = (avatars || []).map((a) => `- id:${a.id} ${a.traits}`).join("\n") || "(없음)";
  const user = `[영상 주제] ${project.briefing?.topic || "(밝히지 않음)"}
[원고 전문]
${project.script?.text || ""}

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

// 컷이 고른 id 들을 실제로 쓸 레퍼런스로 푼다.
// 경로는 여기서 만들지 않는다 — fs 를 아는 자리(파이프라인)가 맡는다. 여기는 순수하다.
//
// kind 는 프롬프트 문구를 가른다: 사람이면 "같은 사람으로", 사물이면 "모양·색 그대로".
// 업로드 사진을 thing 으로 두는 이유는 지금 문구가 제품용이고, 사진이 인물이어도
// 그 인물의 캐스팅 항목(from:"photo")을 통해 들어오면 아래에서 person 으로 잡힌다.
const REF_MAX = 2;

export function resolveCutRefs(cut, project) {
  const ids = Array.isArray(cut?.ref_ids)
    ? cut.ref_ids
    : cut?.ref_photo_id ? [cut.ref_photo_id] : []; // 옛 프로젝트 폴백
  const cast = project?.cast || [];
  const photoIds = (project?.material?.photos || []).map((p) => p.id);

  const out = [];
  for (const id of ids) {
    if (photoIds.includes(id)) {
      out.push({ from: "photo", id, kind: "thing" });
      continue;
    }
    const person = cast.find((c) => c.id === id);
    if (!person?.ref) continue; // 레퍼런스가 없는 인물은 건너뛴다
    out.push({ ...person.ref, kind: "person" });
  }
  // 업로드 사진이 먼저다. 상한에 걸릴 때 사장님이 올린 것이 잘려나가면 안 된다.
  out.sort((a, b) => (a.from === "photo" ? -1 : 0) - (b.from === "photo" ? -1 : 0));
  return out.slice(0, REF_MAX);
}
