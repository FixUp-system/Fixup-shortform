// 레퍼런스 바이트를 어디서 읽을지 아는 유일한 자리.
//
// 출처가 둘이다: 업로드는 Storage 로 갔고, 아바타는 assets/refs 에 커밋된 로컬 파일로
// 남는다(읽기 전용이고 저장소에 들어 있다). 그래서 ref 가 경로가 아니라 출처와 키를 든다.
//
// 못 읽으면 null 이다 — 던지지 않는다. 레퍼런스가 없어도 그림은 나와야 하고,
// 부르는 쪽이 이미 "바이트를 못 얻은 레퍼런스는 버린다"로 걸러낸다.
// (store 의 getObject 는 없으면 던진다 — 그 예외를 여기서 삼켜 "없음"으로 바꾼다)
import { promises as fs } from "fs";
import path from "path";
import { getStore } from "./store/index.js";
import { avatarsDir } from "./cast.js";

const BUCKET = "uploads";

export async function readRefBytes({ source, key }) {
  if (!key) return null;
  try {
    if (source === "avatar") return await fs.readFile(path.join(avatarsDir(), key));
    return await getStore().getObject(BUCKET, key);
  } catch {
    return null;
  }
}

// data URI 로 바꾼다 — fal 도 OpenAI 도 상대경로 URL 은 못 읽는다.
export function toDataUri(bytes, key) {
  const ext = String(key || "").split(".").pop();
  return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${bytes.toString("base64")}`;
}
