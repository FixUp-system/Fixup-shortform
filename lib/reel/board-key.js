// 스토리보드 보드의 **내용 지문**. 컷이 그대로면 같은 값, 하나라도 바뀌면 다른 값이다.
//
// ★★★ 왜 필요한가(2026-09-03 사장님 지적: "매번 불러오는 데 시간이 걸린다").
//   보드는 저장하지 않고 `/api/reel/[id]/board` 가 요청마다 그린다 — 컷을 고치면 다음에
//   열 때 최신이라는 성질을 얻는 대신, **화면을 다시 열 때마다 다시 그린다.** 캐시가
//   60초뿐이라 그 시간이 지나면 또 그렸다.
//   주소에 이 값을 실으면 **컷이 안 바뀐 동안에는 같은 주소**라 브라우저 캐시가 그대로
//   맞고, 컷을 고치면 주소가 달라져 **자동으로** 새로 그린다. 그래서 캐시를 길게 잡아도
//   낡은 그림이 남지 않는다(무효화를 손으로 안 한다 — 손으로 하면 반드시 빠뜨린다).
//
// ★ 서버와 화면이 **같은 함수**를 쓴다 — 두 벌이면 한쪽이 낡아 캐시가 영영 안 맞거나
//   영영 새로 그린다. 그래서 이 파일은 순수 함수만 둔다(화면이 import 한다 — fs 금지).
// ★ 무엇을 넣는가: 보드에 **그려지는 것**만이다(그림·문장·지문·초). 여기 없는 값이
//   보드에 나타나면 그 값도 넣어야 한다 — 안 넣으면 바뀌어도 캐시가 안 깨진다.

const FIELDS = ["idx", "shows", "action", "camera", "sentence", "seconds"];

// djb2 — 짧고 충돌이 드물다. 보안용이 아니라 **캐시 키**라 이 정도면 된다.
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function boardKey(cuts, extra = "") {
  const list = Array.isArray(cuts) ? cuts : [];
  const body = list
    .map((c) => FIELDS.map((f) => String(c?.[f] ?? "")).join("") + "" + String(c?.image?.url ?? ""))
    .join("");
  return hash(body + "" + String(extra || ""));
}

export default boardKey;
