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

// **만든 날짜를 사람 말로.** 보관함 카드의 라벨이 쓴다(2026-09-15 사장님 결정).
//
// ★★★ 그 자리에 있던 "제목"은 제목이 아니라 **사장님이 적은 원문 앞 100자**였다.
//   비슷한 프로젝트끼리는 앞머리가 똑같이 잘려 구별에 아무 도움이 안 됐다.
//   목록은 최신순이라 날짜가 그 자리를 설명해 준다.
// ★★ 올해 것은 해를 안 적는다 — 목록이 대부분 올해라 그 네 자리가 아무것도 안 가른다.
//   대신 **해가 다르면 반드시 적는다** — 안 적으면 작년 9월이 올해 9월로 읽힌다.
// ★ 모르는 값은 **빈 줄**이다. 없는 날짜를 지어내면 사장님이 없는 것을 있다고 읽는다
//   (이 폴더의 styleLabelOf 와 같은 규칙이다).
// ★ toLocaleDateString 을 안 쓴다 — 서버와 브라우저의 로케일이 달라 첫 그림과 다시 그린
//   값이 갈리면 React 가 hydration 으로 울고, 무엇보다 모양이 보는 사람마다 달라진다.
export function madeOnLabel(ts) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}년 ${md}`;
}
