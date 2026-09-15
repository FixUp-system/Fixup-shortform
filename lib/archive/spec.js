// 보관함 상세의 "만든 정보" — **사람이 읽는 값**으로 옮기는 자리.
//
// ★★ 왜 화면 밖으로 빼는가: 옆 파일(lib/archive/video.js)이 정확히 그 이유로 생겼다.
//   화면 안 삼항식으로 두면 **값으로 잴 방법이 없어서**, 갈래 하나만 엉뚱한 것을 내도
//   아무도 모른다(그때는 film 만 객체를 내서 재생·내려받기가 둘 다 죽었다).
//   이번에 드러난 것도 같은 종류다 — 화풍이 `vlog` 라는 **영어 id 그대로** 떴다.
//
// ★ import 는 순수 모듈 둘뿐이다(lib/styles.js · lib/photos.js — 둘 다 import 0 개).
//   이 파일은 "use client" 화면이 부르므로 사슬 끝에 `fs` 가 닿으면 안 된다.
import { STYLE_PRESETS } from "../styles.js";
import { photoRole } from "../photos.js";

// **화풍을 사람 말로.** 표는 lib/styles.js 하나다 — 화면이 라벨을 복사하면 표와 갈린다.
//
// ★ 값의 모양이 둘이다: 지금은 문자열 id, 옛 문서는 `{ preset }` — 화면이 이미 그 둘을
//   보고 있었으므로 여기서도 둘 다 읽는다.
// ★★ **모르는 id 는 그대로 돌려준다.** 표에 없다고 "실사"로 떨어뜨리면 화면이 그 문서에
//   없는 값을 말하게 된다 — 이 화면의 규칙은 "없는 값은 줄째 안 그린다"이지 "지어낸다"가
//   아니다. 그리고 원문을 그대로 두면 표가 낡았다는 사실이 화면에 드러난다.
export function styleLabelOf(doc) {
  const raw = doc?.settings?.style;
  const id = typeof raw === "string" ? raw : typeof raw?.preset === "string" ? raw.preset : "";
  if (!id) return null;
  return STYLE_PRESETS.find((s) => s.id === id)?.label || id;
}

// **붙인 레퍼런스가 무엇인가.** 그전에는 "3장"이라고만 적었다 — 장수로는 무엇을 붙였는지
// 알 수 없다(사장님 지시: "사용자가 첨부한 레퍼런스는 어떤건지").
//
// ★ 종류는 **사장님이 누른 라벨**이 먼저다(lib/photos.js 의 PHOTO_ROLES). 라벨이 없는
//   옛 사진은 **사진 판정**(vision.person)이 인물을 알려 준다. 둘 다 없으면 그냥 "사진"이다.
// ★ 주소가 없는 항목은 버린다 — 그리면 깨진 그림 자리만 남는다.
export function archiveRefs(doc) {
  const photos = Array.isArray(doc?.material?.photos) ? doc.material.photos : [];
  return photos
    .filter((p) => typeof p?.url === "string" && p.url)
    .map((p) => ({
      id: p.id,
      url: p.url,
      label: photoRole(p.role)?.label || (p.vision?.person === true ? "인물" : "사진"),
    }));
}

// ── 보관함 목록 정리(2026-09-15 사장님 결정) ─────────────────────────────────
//
// ★★★ 카드에 붙어 있던 넷(「영상」 태그 · 날짜 · 종류 배지 · 상태 배지)을 **성격대로 흩었다.**
//   · 종류(원클릭·단계별) — 안 바뀌는 분류라 **위 필터**로 좁힌다(카드마다 읽을 것이 아니다)
//   · 날짜 — **위 좁히기 줄의 시작일·종료일**로 찾는다(한때 묶음 제목이었다가 필터로 바꿨다)
//   · 상태 — **안 끝난 카드에만** 썸네일 태그 하나. 완성본은 영상 자체가 보인다
//   · 「영상」 태그 — "완성"과 같은 말이라 걷었다

// 종류 필터. `step` 은 **ad·film 이 아닌 전부**다 — reel 과 종류 없는 옛 문서가 여기 든다
// (카드·상세가 쓰던 갈래와 같다: ad·film 이 아니면 단계별이다).
// ★ 이름은 사이드바·상세와 같은 말이다 — 자리마다 다르게 부르면 같은 것이 달라 보인다.
// ★★ 「한 번에」(film)는 **칸을 안 둔다**(2026-09-15 사장님 지시: "한번에는 제거해줘").
//   그 영상은 [전체]에서만 보이고 [단계별]에는 섞이지 않는다 — 단계별로 만든 것이 아니기 때문이다.
export const ARCHIVE_KINDS = [
  { id: "all", label: "전체" },
  { id: "ad", label: "원클릭" },
  { id: "step", label: "단계별" },
];

// 주소·요청에서 온 값을 필터로 읽는다. 모르는 값은 **전체**다 — 400 으로 막으면 옛 주소가
// 오류 화면이 되고, 엉뚱한 종류로 좁히면 영상이 없어진 것처럼 보인다.
export function archiveKindOf(raw) {
  return ARCHIVE_KINDS.some((k) => k.id === raw) ? raw : "all";
}

// 주소의 날짜 칸 값 — "YYYY-MM-DD" 모양만 받는다. 아니면 빈 칸(조건 없음)이다.
// ★ 모양만 본다 — 실제 경계(자정·끝 날짜 포함)는 lib/costs-filter.js 의 dayBounds 가 만든다(한 벌).
export function archiveDateOf(raw) {
  const s = String(raw ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// 완성본 액자의 비율 `{ width, height }` — 보관함 상세가 쓴다(2026-09-15 사장님 지적: 영상 아래에 여백이 생긴다).
// ★★★ 액자는 **프로젝트가 고른 비율**(aspect)로 서는데, 실제 파일은 그 비율과 **몇 픽셀 어긋날 수 있다**
//   (실측: 9:16 액자 293×520 안에 영상 291×508 — 아래 11px 가 액자 바탕색 띠로 보였다).
//   영상은 자르지 않는다(contain — 잘린 그림은 "깨졌다"로 읽힌다) — 대신 **액자를 파일에 맞춘다.**
// ★ 파일 크기는 불러온 뒤에야 안다(loadedmetadata). 그 전에는 고른 비율로 서 있다가 몇 픽셀만 맞춰진다 —
//   처음부터 파일을 기다리면 그동안 자리가 비어 카드 높이가 뛴다.
// ★ 값이 이상하면(0·NaN) 고른 비율 그대로다.
export function previewRatio(aspect, media) {
  const w = Number(media?.width);
  const h = Number(media?.height);
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return { width: w, height: h };
  return { width: aspect.width, height: aspect.height };
}

// 날짜 칸 하나를 바꿨을 때의 새 범위 `{ from, to }` — which 는 "from" | "to".
// ★★★ 2026-09-15 사장님 지적 — "1월을 골랐는데 9월 영상이 나온다. 없으면 없다고 나와야 한다."
//   시작일만 고르면 "그날부터 **지금까지**"라 9월 영상이 전부 걸렸다(크레딧 내역의 뜻이 그렇다).
//   보관함에서 날짜 하나를 고르는 것은 **그날을 보겠다**는 뜻이다 — 그래서 비어 있는 반대쪽을 같은 날로 채운다.
// ★★ 거꾸로 된 범위(시작 > 종료)도 반대쪽을 같은 날로 맞춘다 — 그대로 두면 조건이 조용히 0편이 되거나,
//   키보드로 연도를 한 자리씩 칠 때(0002 → 0020 → 0202 → 2026) 중간값이 범위를 뒤집는다.
// ★ 칸을 비우면(지우기) 반대쪽은 **그대로 둔다** — 한쪽만 풀고 싶은 경우가 있다.
export function pickDateRange(range, which, value) {
  const v = archiveDateOf(value);
  let from = archiveDateOf(range?.from);
  let to = archiveDateOf(range?.to);
  if (which === "from") {
    from = v;
    if (v && (!to || to < v)) to = v;
  } else {
    to = v;
    if (v && (!from || from > v)) from = v;
  }
  return { from, to };
}

// 보관함 주소 — 범위 · 종류 · 날짜를 **한 자리에서** 싣는다.
// ★ 탭·필터·날짜를 바꾸는 함수가 저마다 주소를 조립하면, 하나를 바꿀 때 다른 조건이 떨어진다
//   (탭을 바꿨더니 날짜가 풀리는 식). 기본값(내 영상 · 전체 · 빈 날짜)은 안 싣는다 — 주소만 길어진다.
export function archiveHref({ scope, kind, from, to } = {}) {
  const q = new URLSearchParams();
  if (scope === "all") q.set("scope", "all");
  if (kind && archiveKindOf(kind) !== "all") q.set("kind", kind);
  if (archiveDateOf(from)) q.set("from", from);
  if (archiveDateOf(to)) q.set("to", to);
  const s = q.toString();
  return s ? `/archive?${s}` : "/archive";
}

// 썸네일 위 상태 태그 — **안 끝난 카드만** 말한다. 끝났으면 null(태그를 안 그린다).
// ★ 끝남은 완성본 주소(video_url)로 본다 — 목록이 종류마다 다른 자리에서 이미 골라 준 값이다.
//   라벨이 "완성"인데 주소가 없는 옛 문서도 끝난 것으로 둔다(없는 진행을 지어내지 않는다).
// ★ 라벨이 이미 진행을 말하면(「진행 중」·「만드는 중」) 앞말을 또 붙이지 않는다.
export function cardStatusTag(p, label) {
  if (p?.video_url || label === "완성") return null;
  if (!label || label === "진행 중" || label === "만드는 중") return label || "진행 중";
  return `진행 중 · ${label}`;
}
