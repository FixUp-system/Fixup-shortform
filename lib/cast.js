// 캐스팅 — 원고에 나오는 인물을 뽑고, 인물마다 레퍼런스를 정한다.
//
// 왜 컷마다 정하지 않는가: 원고는 같은 사람을 여러 이름으로 부른다("초등학생"·"꼬마"·
// "아드님"). 고정 목록에 컷마다 맞추게 하면 표현이 조금 달라져도 못 고르거나 잘못 고른다.
// 원고당 한 번 뽑고 컷은 그 목록에서만 고르면 그 간극이 없어진다.
import { promises as fs } from "fs";
import path from "path";
import { AVATARS } from "./refs";

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
