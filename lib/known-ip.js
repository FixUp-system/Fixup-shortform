// **잘 알려진 캐릭터·작품 이름** — 미리 알려 주기 위한 목록 (2026-09-28).
//
// ★★★ 왜 생겼나. 백설공주 편 `6ce304aa`(09-28)이 영상을 끝까지 만든 뒤 **출력 검사**에서
//   거절됐다(`generated_video` · "Potential copyright violation"). 그전까지 시나리오
//   프롬프트에는 저작권 규칙이 **한 줄도 없었고** 화면에도 미리 알려 주는 자리가 없었다.
//
// ★★ **막지 않는다**(사장님 결정). 캐릭터와 콜라보한 제품 광고처럼 그 이름이 꼭 필요한
//   경우가 있다 — 제품 광고에서 "밴드"·"쿠션"을 다른 말로 못 바꾸는 것과 같은 자리다.
//   그래서 이 목록이 하는 일은 **경고 한 줄**이고, 확정은 사장님이 한다.
//
// ★★★ **목록은 완전할 필요가 없다.** 완전해질 수도 없다 — 세상의 캐릭터는 끝이 없다.
//   이것은 "자주 걸리는 것만 미리 거르는" 그물이고, 뒤에 **사후 그물**이 따로 있다
//   (lib/failure.js 의 `rejected_copyright` — 거절됐을 때 무엇을 바꾸면 되는지 말해 준다).
//   그러니 여기에 이름을 더하는 것은 **값싼 개선**이지 정확성의 조건이 아니다.
//
// ★ 이 파일은 **순수하다 — import 문을 두지 마라.** 화면("use client")이 그대로 읽는다.
// ★ 검사는 **낱말 경계**를 본다. "마리오네트"가 "마리오"로 잡히면 헛경보이고, 헛경보가
//   쌓이면 사장님이 경고를 안 읽게 된다(그러면 이 장치가 통째로 죽는다).

// 이름 하나에 표기 여럿. `name` 은 사장님에게 보여 줄 말이고 `terms` 는 찾을 글자다.
export const KNOWN_IP = [
  { name: "백설공주", terms: ["백설공주", "Snow White"] },
  { name: "신데렐라", terms: ["신데렐라", "Cinderella"] },
  { name: "인어공주", terms: ["인어공주", "Little Mermaid", "Ariel"] },
  { name: "잠자는 숲속의 공주", terms: ["잠자는 숲속의", "Sleeping Beauty"] },
  { name: "미녀와 야수", terms: ["미녀와 야수", "Beauty and the Beast"] },
  { name: "알라딘", terms: ["알라딘", "Aladdin"] },
  { name: "라푼젤", terms: ["라푼젤", "Rapunzel", "Tangled"] },
  { name: "겨울왕국", terms: ["겨울왕국", "Frozen", "엘사", "Elsa"] },
  { name: "피터팬", terms: ["피터팬", "피터 팬", "Peter Pan"] },
  { name: "이상한 나라의 앨리스", terms: ["이상한 나라의 앨리스", "Alice in Wonderland"] },
  { name: "토이 스토리", terms: ["토이스토리", "토이 스토리", "Toy Story", "우디", "버즈 라이트이어"] },
  { name: "미키마우스", terms: ["미키마우스", "미키 마우스", "Mickey Mouse"] },
  { name: "곰돌이 푸", terms: ["곰돌이 푸", "Winnie the Pooh"] },
  { name: "스누피", terms: ["스누피", "Snoopy", "Peanuts"] },
  { name: "헬로키티", terms: ["헬로키티", "헬로 키티", "Hello Kitty", "산리오", "Sanrio"] },
  { name: "포켓몬", terms: ["포켓몬", "Pokemon", "Pokémon", "피카츄", "Pikachu"] },
  { name: "짱구", terms: ["짱구", "Crayon Shin-chan"] },
  { name: "도라에몽", terms: ["도라에몽", "Doraemon"] },
  { name: "뽀로로", terms: ["뽀로로", "Pororo"] },
  { name: "아기상어", terms: ["아기상어", "아기 상어", "Baby Shark"] },
  { name: "카카오프렌즈", terms: ["카카오프렌즈", "카카오 프렌즈", "라이언", "춘식이"] },
  { name: "라인프렌즈", terms: ["라인프렌즈", "라인 프렌즈", "브라운", "코니"] },
  { name: "지브리", terms: ["지브리", "Ghibli", "토토로", "Totoro"] },
  { name: "원피스", terms: ["원피스", "One Piece", "루피"] },
  { name: "나루토", terms: ["나루토", "Naruto"] },
  { name: "드래곤볼", terms: ["드래곤볼", "Dragon Ball", "손오공"] },
  { name: "슬램덩크", terms: ["슬램덩크", "Slam Dunk"] },
  { name: "마리오", terms: ["슈퍼마리오", "슈퍼 마리오", "Super Mario", "마리오"] },
  { name: "해리포터", terms: ["해리포터", "해리 포터", "Harry Potter", "호그와트", "Hogwarts"] },
  { name: "스타워즈", terms: ["스타워즈", "스타 워즈", "Star Wars", "다스베이더", "요다"] },
  { name: "마블", terms: ["마블", "Marvel", "아이언맨", "스파이더맨", "Spider-Man", "어벤져스"] },
  { name: "DC 히어로", terms: ["배트맨", "Batman", "슈퍼맨", "Superman", "원더우먼"] },
  { name: "반지의 제왕", terms: ["반지의 제왕", "Lord of the Rings", "호빗"] },
  { name: "미니언즈", terms: ["미니언", "Minions", "Despicable Me"] },
  { name: "심슨", terms: ["심슨", "Simpsons"] },
  { name: "산타", terms: ["코카콜라 산타"] },
  { name: "오징어 게임", terms: ["오징어 게임", "Squid Game"] },
  { name: "케이팝 데몬 헌터스", terms: ["케이팝 데몬 헌터스", "KPop Demon Hunters"] },
];

// 이름 **뒤에 붙는 조사**의 첫 글자들 — "겨울왕국과", "백설공주를", "포켓몬이".
//
// ★★ 한글에는 단어 경계(\b)가 없다. 뒤 글자가 한글이면 무조건 딴 낱말로 치면
//   "겨울왕국과"가 안 잡히고, 아무 한글이나 받아 주면 "마리오네트"가 "마리오"로 잡힌다
//   (헛경보가 쌓이면 사장님이 경고를 안 읽게 되고, 그러면 이 장치가 통째로 죽는다).
//   그래서 **조사의 첫 글자만** 열어 둔다 — 닫힌 목록이라 새 헛경보가 안 샌다.
const PARTICLE_HEADS = new Set("은는이가을를과와의에도만로랑처보같부까요".split(""));

// 낱말 경계 — 앞은 글자가 아니어야 하고, 뒤는 글자가 아니거나 조사여야 한다.
function boundedAt(text, term, at) {
  const before = text[at - 1] || "";
  const after = text[at + term.length] || "";
  const word = /[0-9A-Za-z가-힣]/;
  if (word.test(before)) return false;
  if (!after || !word.test(after)) return true;
  return PARTICLE_HEADS.has(after);
}

// 이 글에 든 잘 알려진 이름들. 같은 이름은 한 번만, 목록 차례대로.
export function findKnownIp(text) {
  const s = typeof text === "string" ? text : "";
  if (!s) return [];
  const low = s.toLowerCase();
  const out = [];
  for (const entry of KNOWN_IP) {
    const hit = entry.terms.some((t) => {
      const needle = t.toLowerCase();
      let at = low.indexOf(needle);
      while (at >= 0) {
        if (boundedAt(s, t, at)) return true;
        at = low.indexOf(needle, at + 1);
      }
      return false;
    });
    if (hit) out.push(entry.name);
  }
  return out;
}

// 화면에 띄울 한 줄. **막는 말이 아니다** — "거절될 수 있어요" 까지다.
// ★ 무엇을 바꾸면 되는지까지 말한다: 이야기는 그대로, 겉모습만.
export function ipWarning(names) {
  const list = (Array.isArray(names) ? names : []).filter(Boolean);
  if (!list.length) return "";
  const named = list.map((n) => `"${n}"`).join(" · ");
  return `${named} 처럼 잘 알려진 캐릭터·작품은 만들어진 영상이 원작과 비슷해 보이면 거절될 수 있어요 — 이야기는 그대로 두고 옷 색과 머리 모양만 원작과 다르게 적어 주시면 대부분 통과해요.`;
}

// 시나리오를 쓰는 LLM 에게 주는 규칙 — **세 흐름(단계별·원클릭·film)이 이 한 줄을 함께 쓴다.**
//
// ★★★ "이름을 쓰지 마라"가 **아니다.** 이름을 지우고 원작을 정확히 묘사하면(검은 단발 +
//   파란 상의 + 노란 치마) 결과물이 여전히 걸린다 — 출력 검사가 보는 것은 이름이 아니라
//   **만들어진 그림**이다. 그래서 요구하는 것은 **겉모습을 새로 짓는 것**이다.
// ★ 이야기·분위기는 그대로 써도 된다 — 줄거리는 누구의 것도 아니고 검사도 그것을 안 본다.
export const IP_SCENARIO_RULE =
  "★★ 잘 알려진 작품·캐릭터(동화·애니메이션·영화·게임)를 다룰 때는 **이야기와 분위기는 그대로 가져오되 "
  + "인물의 겉모습은 새로 짓는다** — 원작의 색 조합·머리 모양·상징 소품을 그대로 쓰지 말고 최소 두 가지를 "
  + "다르게 정한다. 인물은 이름이 아니라 생김새로 적는다(예: \"백설공주\" → \"땋은 갈색 머리에 초록 드레스를 "
  + "입은 젊은 여성\"). 그대로 쓰면 만들어진 영상이 저작권 검사에서 거절된다.";
