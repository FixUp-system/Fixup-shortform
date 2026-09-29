// **올리기 전에 브라우저에서 사진을 줄인다** (2026-09-29).
//
// ★★★ 왜 생겼나. 사장님 신고 "업로드 실패". 실측: 업로드 374건 중 **4MB 를 넘은 것이 0건**
//   이었다(가장 큰 것 3.38MB). Vercel 이 함수로 들어오는 **요청 본문을 4.5MB 에서 막기**
//   때문이고, 그때 돌아오는 응답에는 우리 오류 문구가 없어서 화면은 기본 문구만 띄웠다
//   ("업로드 실패"). 요즘 휴대폰 사진이 4~8MB 라 **어떤 것은 올라가고 어떤 것은 말없이
//   실패**했다. app/api/uploads/route.js 의 `MAX_BYTES = 10MB` 는 **닿지도 못하는 값**이다.
//
// ★ 고치는 방향은 "작게 줄여 오세요"가 아니라 **우리가 줄여서 보내기**다. 참조용 사진이고
//   굽기 화질이 720p·1080p 라 긴 변 2,000px 이면 남는다.
// ★★ 판정(무엇을 얼마나)은 **순수 함수**로 둔다 — 캔버스 없는 곳에서도 재야 테스트가 된다.
//   실제로 줄이는 일(shrinkForUpload)만 브라우저 것이고, 캔버스가 없으면 **원본을 그대로
//   돌려준다**(막지 않는다 — 줄이기는 도움이지 관문이 아니다).
// ★ 이 파일은 화면이 읽는다 — **import 문을 두지 마라.**

// 긴 변 상한. 굽기 화질보다 넉넉하다(1080p 굽기도 1920px 이다).
export const UPLOAD_MAX_SIDE = 2000;

// 한 장의 크기 상한. **플랫폼(4.5MB)보다 작아야** 우리 코드에 닿는다 — 여유를 둔다.
export const UPLOAD_MAX_BYTES = 3.5 * 1024 * 1024;

// 줄인 뒤 내보낼 치수 — 비율을 지키고, **작은 사진은 안 키운다**(키우면 글자가 뭉개진다).
export function targetSizeFor(width, height, maxSide = UPLOAD_MAX_SIDE) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const long = Math.max(w, h);
  if (!long || long <= maxSide) return { width: Math.round(w), height: Math.round(h) };
  const k = maxSide / long;
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

// 내보낼 형식.
// ★★ PNG 는 **PNG 로 둔다** — 로고가 투명 배경인 경우가 많고, JPEG 로 바꾸면 그 자리가
//   검게 칠해진다(캔버스의 기본값이다). 로고가 깨지는 것은 이 저장소가 계속 쫓던 문제다.
// ★ 서버가 받는 것은 jpg/png/webp 셋이다(app/api/uploads/route.js) — 모르는 형식은 JPEG 로
//   내보낸다. 그대로 보내면 400 이다.
export function outputTypeFor(type) {
  const t = String(type || "").toLowerCase();
  if (t === "image/png" || t === "image/webp" || t === "image/jpeg") return t;
  return "image/jpeg";
}

// 손댈 필요가 있나. **크기나 치수 중 하나라도 넘으면** 줄인다.
// ★ 둘 다 작으면 그대로 둔다 — 다시 굽는 것은 화질만 잃는 일이다.
export function needsShrink(file, width, height, { maxSide = UPLOAD_MAX_SIDE, maxBytes = UPLOAD_MAX_BYTES } = {}) {
  if (Number(file?.size) > maxBytes) return true;
  return Math.max(Number(width) || 0, Number(height) || 0) > maxSide;
}

// JPEG/WebP 로 내보낼 때의 화질. 참조용이라 0.9 면 눈으로 차이를 못 느낀다.
const QUALITY = 0.9;

// **브라우저에서 줄인다.** 캔버스가 없거나 어디선가 실패하면 **원본을 그대로 돌려준다** —
// 줄이기는 도움이지 관문이 아니다(여기서 막으면 올릴 수 있던 사진도 못 올린다).
export async function shrinkForUpload(file, opts = {}) {
  try {
    if (!file || typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
    const bitmap = await createImageBitmap(file);
    const { width, height } = targetSizeFor(bitmap.width, bitmap.height, opts.maxSide || UPLOAD_MAX_SIDE);
    if (!needsShrink(file, bitmap.width, bitmap.height, opts)) {
      bitmap.close?.();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const type = outputTypeFor(file.type);
    const blob = await new Promise((res) => canvas.toBlob(res, type, QUALITY));
    if (!blob) return file;
    // ★ 줄였는데 더 커졌으면(작은 PNG 를 다시 그린 경우) 원본이 낫다.
    if (blob.size >= file.size) return file;
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const name = String(file.name || "photo").replace(/\.[^.]+$/, "") + "." + ext;
    return new File([blob], name, { type });
  } catch {
    return file;
  }
}
