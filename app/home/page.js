// 홈 — **결과물로 여는 첫 화면**(2026-09-08 사장님 확정 · 2026-09-09 에 손님에게도 열었다).
//
// ★ 그전에는 "만드는 방식을 고르는" 도해 두 장이 첫 화면이었다(2026-08-28). 만들어 본 적
//   없는 사람에게 방식을 먼저 고르라고 물으면 고를 근거가 없다 — 그래서 **만든 것**을
//   먼저 보이고, 만드는 법을 짧게 적고, 도구는 그 아래에 격자로 둔다.
//
// ★★ 2026-09-09 — **손님도 같은 화면을 본다**(사장님 확정). 그전에는 로그인한 사람만
//   여기에 닿았고 손님은 보관함으로 갔다. 화면을 두 벌 만들지 않는 이유는 이 저장소가
//   여러 번 밟은 것 그대로다: 같은 것을 두 곳에 두면 한쪽이 반드시 낡는다. 그래서
//   **화면은 한 벌이고 버튼만 신원에 따라 갈린다.**
//   · 손님 → 가입의 문(/login)
//   · 이미 들어온 사람 → 만드는 문(/ads/new)
//   ⚠️ 손님이 여기에 닿으려면 `/home` 이 손님 목록(lib/auth/guest.js)에 있어야 한다.
//     스위치(SHOTFORM_PUBLIC_ARCHIVE)가 꺼져 있으면 middleware 가 그 앞에서 /login 으로
//     보내므로 예전과 같다.
//
// ★ 이 파일은 **서버 컴포넌트**다. 신원은 middleware 가 요청 헤더에 넣어 준 값을 읽기만
//   한다 — 여기서 세션을 다시 확인하면 그 판정이 두 벌이 된다(app/page.js 와 같은 규율).
//   목록을 무는 칸만 클라이언트 부품(components/HomeMade.jsx)으로 뺐다.
//
// ★★ 여기에도 영상 태그를 두지 마라(2026-09-07 전송량 사고 — 부품 쪽 머리말에 전말이 있다).
//
// ★ 전시층(.display)은 **여기서만** 쓴다. 작업 화면이 같이 굵어지면 화면 전체가 소리를
//   질러 사장님이 지금 눌러야 할 것을 못 고른다(tests/design-system.test.js).
//
// ★ 사이드바는 AppShell 이 이미 그린다(여기서 안 그린다).
import Link from "next/link";
import { headers } from "next/headers";
import { USER_HEADER } from "../../lib/auth/headers.js";
import HomeMade from "../../components/HomeMade.jsx";

// 도구는 표가 정한다 — 화면에 손으로 적으면 갈린다.
//
// ★ path 와 slug 는 다르다. slug 는 **눈에 보이는 이름표**(그 갈래의 뿌리 주소)이고,
//   path 는 **실제로 여는 문**이다. 둘이 같아야 할 것 같지만 `/ads`·`/reel` 에는 화면이
//   없다(`app/ads/new` · `app/reel/new` 만 있다) — 뿌리를 그대로 걸면 404 다.
const TOOLS = [
  { path: "/ads/new", slug: "/ads", name: "원클릭 영상",
    sub: "소재만 적으면 시나리오부터 완성본까지 한 번에 나옵니다.", how: "소재 → 시나리오 → 완성" },
  { path: "/create", slug: "/create", name: "단계별 영상",
    sub: "시나리오·목소리·그림·영상을 단계마다 확인하고 고칩니다.", how: "6단계 · 컷마다 다시 만들기" },
  { path: "/reel/new", slug: "/reel", name: "통짜 릴",
    sub: "스토리보드 한 장을 통째로 넘겨 한 편으로 굽습니다.", how: "보드 1장 → 한 편" },
];

// 만드는 법은 **세 걸음**이다(2026-09-09). 넷째 칸이던 "보관함"은 만드는 방법이 아니라
// 결과라 뺐다 — 레퍼런스로 삼은 두 곳(dropshot·deevid)도 셋이다.
const STEPS = [
  { n: "01", name: "소재", sub: "적어 둔 글과 사진이 재료가 됩니다." },
  { n: "02", name: "시나리오", sub: "사람이 확정합니다. 여기서 멈춰 고칠 수 있습니다." },
  { n: "03", name: "굽기", sub: "확정한 글자가 그대로 영상에 들어갑니다." },
];

export default async function HomePage() {
  const signedIn = Boolean((await headers()).get(USER_HEADER));

  return (
    <section className="panel panel--wide home">
      <h1 className="display">소재만 적으면<br /><em>한 편이 나옵니다</em></h1>
      <p className="lede">시나리오·목소리·그림·영상이 한 줄기로 이어집니다.</p>
      <Link className="cta" href={signedIn ? "/ads/new" : "/login"}>
        {signedIn ? "만들러 가기" : "무료로 시작하기"}
      </Link>

      <HomeMade />

      {/* ★ 절마다 이름을 단다(2026-09-09). 그전에는 이 띠가 화면 맨 아래에 조용히 깔린
          꼬리였는데, 이제 손님이 두 번째로 읽는 자리다 — 이름이 없으면 숫자 셋이
          무엇을 세는 것인지 모른 채 지나간다. 레퍼런스 둘도 이 절에 이름을 단다. */}
      <p className="eyebrow">이렇게 만듭니다</p>
      <div className="home-steps">
        {STEPS.map((s) => (
          <div key={s.n} className="home-step">
            <span className="home-n">{s.n}</span>
            <h3>{s.name}</h3>
            <p>{s.sub}</p>
          </div>
        ))}
      </div>

      <p className="eyebrow">무엇으로 만들까요</p>
      <div className="home-tools">
        {TOOLS.map((t) => (
          <Link key={t.path} href={t.path} className="home-tool">
            <span className="home-slug">{t.slug}</span>
            <h2>{t.name}</h2>
            <p>{t.sub}</p>
            <span className="home-how">{t.how}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
