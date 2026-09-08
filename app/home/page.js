"use client";

// 홈 — **결과물로 여는 첫 화면**(2026-09-08 사장님 확정).
//
// ★ 그전에는 "만드는 방식을 고르는" 도해 두 장이 첫 화면이었다(2026-08-28). 만들어 본 적
//   없는 사람에게 방식을 먼저 고르라고 물으면 고를 근거가 없다 — 그래서 **만든 것**을
//   먼저 보이고, 도구는 그 아래에 격자로 둔다.
//
// ★★ 목록은 **영상을 물지 않는다.** 2026-09-07 에 이 서비스가 죽었다 — 보관함 목록이
//   영상 태그를 물고 있어서 **화면을 여는 것만으로** 전송량 할당량이 탔고, Supabase 가
//   프로젝트를 402 로 막아 로그인까지 함께 죽었다. 여기서는 표지 그림(thumbUrl)만
//   그린다. 영상은 카드를 눌러 상세에서 본다(components/ProjectCards.jsx 와 같은 규율).
//
//   ⚠️ 그래서 이 파일에는 그 태그를 **여는 꺾쇠까지 붙여 적지 않는다** — 주석에도다.
//   tests/home-sections-ui.test.js 가 소스를 날 것 그대로 훑기 때문이고, 그것이 의도다:
//   주석 한 줄도 그 태그가 돌아오는 길목이라(테마 분기를 세는 판과 같은 규율) 아예
//   안 적는 편이 낫다. 여기서 빨개졌다면 판이 낡은 것이 아니라 네가 적은 것이다.
//
// ★ 전시층(.display)은 **여기서만** 쓴다. 작업 화면이 같이 굵어지면 화면 전체가 소리를
//   질러 사장님이 지금 눌러야 할 것을 못 고른다(tests/design-system.test.js).
//
// ★ 사이드바는 AppShell 이 이미 그린다(여기서 안 그린다).
// ★ 화면 제목(metadata)은 못 단다 — "use client" 라 Next 가 그 export 를 막는다.
//   app/layout.js 의 제목으로 떨어진다.

import { useEffect, useState } from "react";
import Link from "next/link";
import { thumbUrl } from "../../lib/thumb-url";

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

const STEPS = [
  { n: "01", name: "소재", sub: "적어 둔 글과 사진이 재료가 됩니다." },
  { n: "02", name: "시나리오", sub: "사람이 확정합니다. 여기서 멈춰 고칠 수 있습니다." },
  { n: "03", name: "굽기", sub: "확정한 글자가 그대로 영상에 들어갑니다." },
  { n: "04", name: "보관함", sub: "완성본이 쌓이고, 다음 작업의 재료가 됩니다." },
];

export default function HomePage() {
  const [made, setMade] = useState([]);

  // ★ 목록만 부른다. **영상은 안 문다** — 카드가 영상 태그를 물면 화면을 여는 것만으로
  //   전송량이 탄다(2026-09-07 사고). 표지 그림(thumbUrl)만 그린다.
  // ★ 표지 그림이 없는 프로젝트는 아예 안 싣는다(ProjectCards 머리말의 실측:
  //   46편 중 25편이 그렇다 — 광고·필름은 cuts[0].image 가 없다) —
  //   이 자리는 "만든 것을 보여 주는 띠"라 빈 칸이 섞이면 고장으로 보인다.
  useEffect(() => {
    let alive = true;
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) => { if (alive) setMade((d.projects || []).filter((p) => p.video_url && p.image_url).slice(0, 4)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <section className="panel panel--wide home">
      <p className="eyebrow">무엇을 만들까요</p>
      <h1 className="display">한 편이 끝까지<br /><em>이어집니다</em></h1>
      <p className="lede">소재를 적으면 시나리오·목소리·그림·영상이 한 줄기로 이어집니다.</p>

      {made.length > 0 && (
        <div className="home-band">
          <p className="eyebrow">만든 것</p>
          <h2>최근 완성본</h2>
          <div className="home-reel">
            {made.map((p) => (
              <Link key={p.id} href={`/archive/${p.id}`} className="home-reel-item">
                <img src={thumbUrl(p.image_url)} alt={p.title || "만든 영상"} loading="lazy" />
                <span>{p.title || "제목 없음"}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

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

      <div className="home-steps">
        {STEPS.map((s) => (
          <div key={s.n} className="home-step">
            <span className="home-n">{s.n}</span>
            <h3>{s.name}</h3>
            <p>{s.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
