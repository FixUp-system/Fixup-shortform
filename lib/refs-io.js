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

// 프로젝트에 심으려는 사진 키가 전부 이 사용자 것인지 잰다.
//
// ★ 리뷰 I2 — PATCH /api/projects/[id] 가 material 을 통째로 머지해서, B 가 자기 프로젝트에
// `photos: [{url: "/api/uploads/<A의키>.jpg"}]` 를 심을 수 있었다. 키는 pipeline.js 가
// `p.url?.split("/").pop()` 로 그대로 뽑아 VLM 판정에 쓰고, 그 결과가 doc 에 저장돼 화면에
// 샌다 — /api/uploads/[name] 이 막아 둔 문이 여기서는 반쯤 열려 있었다.
//
// 주인 기록이 없는 키(null — 백필 전 옛 업로드)도 거부한다. 열어 두면 이 구멍이 그대로
// 남는다(findUploadOwner 가 null 을 주면 "모른다"이지 "괜찮다"가 아니다).
export async function ownedPhotoKeys(photos, ownerId) {
  for (const p of photos || []) {
    const key = p?.url?.split("/").pop();
    if (!key) continue;
    const owner = await getStore().findUploadOwner(key);
    if (owner !== ownerId) return false;
  }
  return true;
}

// data URI 로 바꾼다 — fal 도 OpenAI 도 상대경로 URL 은 못 읽는다.
export function toDataUri(bytes, key) {
  const ext = String(key || "").split(".").pop();
  return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${bytes.toString("base64")}`;
}

// ── fal 이 읽을 수 있는 주소로 바꾼다 (2026-08-25) ──────────────────────────
//
// ★★ 스토리보드에서 잘라낸 칸은 **우리 바이트**라 비공개 버킷에 있다
//   (lib/reel/storyboard.js 의 saveStoryboardCells). `/api/uploads/<이름>` 은 로그인 뒤에
//   있으므로 fal 은 그 주소를 못 읽는다 — 바이트를 실어 보낸다. 레퍼런스가 쓰던 규약
//   그대로다(위 toDataUri, lib/i2v.js 의 image_urls).
// ★ 바깥 주소(fal CDN 에 있는 컷별 그림)는 **그대로 둔다** — 내려받았다 다시 올릴 이유가 없다.
// ★ 못 읽으면 **던진다**. readRefBytes 는 모든 실패를 null 로 뭉개는데, 여기서 그것을 그냥
//   흘려보내면 fal 이 못 읽는 주소로 클립값(컷당 $0.54~)이 그대로 나간다.
const UPLOAD_PREFIX = "/api/uploads/";

export async function toFalImageUrl(url) {
  if (typeof url !== "string" || !url.startsWith(UPLOAD_PREFIX)) return url;
  const key = url.slice(UPLOAD_PREFIX.length);
  const bytes = await readRefBytes({ source: "upload", key });
  if (!bytes) throw new Error("그림을 읽지 못했어요 — 다시 그려 주세요");
  return toDataUri(bytes, key);
}
