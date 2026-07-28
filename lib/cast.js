// 캐스팅 — 원고에 나오는 인물을 뽑고, 인물마다 레퍼런스를 정한다.
//
// 왜 컷마다 정하지 않는가: 원고는 같은 사람을 여러 이름으로 부른다("초등학생"·"꼬마"·
// "아드님"). 고정 목록에 컷마다 맞추게 하면 표현이 조금 달라져도 못 고르거나 잘못 고른다.
// 원고당 한 번 뽑고 컷은 그 목록에서만 고르면 그 간극이 없어진다.
import { promises as fs } from "fs";
import path from "path";
import { AVATARS } from "./refs";

const CAST_SYSTEM = `너는 숏폼 영상의 캐스팅을 정한다. 원고를 읽고 화면에 사람으로 나올 인물을 뽑는다.
반드시 JSON 하나만 출력: {"cast":[{"who":"이 인물이 누구인지 한 마디","avatar_id":"준비된 인물 사진 중 가장 맞는 id(없으면 생략)"}]}
규칙:
- 화면에 사람으로 보일 인물만 넣는다. 원고가 이름만 스치는 사람(전화 통화 상대 등)은 넣지 않는다.
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
