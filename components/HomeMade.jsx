"use client";

// 첫 화면의 **결과물 띠** — 만든 것을 먼저 보인다 (2026-09-09).
//
// ★★ 여기서 영상 태그를 쓰지 마라. 2026-09-07 에 이 서비스가 죽었다 — 보관함 목록이
//   그 태그를 물고 있어서 **화면을 여는 것만으로** 전송량 할당량이 탔고, Supabase 가
//   프로젝트를 402 로 막아 로그인까지 함께 죽었다. 여기는 표지 그림만 그리고, 영상은
//   카드를 눌러 상세에서 본다(components/ProjectCards.jsx 와 같은 규율).
//   ⚠️ 그래서 이 파일에는 그 태그를 **여는 꺾쇠까지 붙여 적지 않는다** — 주석에도다.
//   tests/home-sections-ui.test.js 가 소스를 날 것 그대로 훑기 때문이고, 그것이 의도다.
//
// ★★ 카드에 **글을 안 단다.** 2026-09-09 프로덕션 실측: 완성본 여섯 편 중 셋의 이름이
//   "You are creating a premium advertisement image…" 라는 영어 지문 원문이었다(저장된
//   이름 칸에 사장님이 적은 소재가 그대로 들어간다). 이제 손님도 이 화면을 보므로 그
//   글자가 서비스의 얼굴이 된다. 레퍼런스(dropshot·deevid)도 예시 항목에 글을 안 단다.
//   ⚠️ 그 낱말을 주석에도 영어로 적지 마라 — 판이 날 것으로 센다.
//
// ★ 그림이 **안 열리는 칸은 스스로 빠진다.** 2026-09-09 실측: 표지 주소가 있는 25편 중
//   실제로 열리는 것은 **5편뿐**이다(09-07 파일 미이관). 주소가 있는지만 보고 실으면
//   첫 화면이 빈 칸으로 찬다. 그래서 후보를 넉넉히 받아 두고, 못 받은 칸을 빼면서
//   뒤에 있던 후보로 자리를 메운다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { thumbUrl } from "../lib/thumb-url";

// 화면에 서는 칸 수. 후보는 이보다 넉넉히 받는다 — 못 받는 그림이 섞이기 때문이다.
const SHOW = 4;
const CANDIDATES = 12;

export default function HomeMade() {
  const [pool, setPool] = useState([]);
  // 그림을 못 받은 편. Set 을 **새로 만들어** 넣는다 — 제자리에서 고치면 리렌더가 안 온다.
  const [lost, setLost] = useState(() => new Set());

  // ★ 목록만 부른다. 영상은 안 문다(위 머리말).
  useEffect(() => {
    let alive = true;
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) => {
        if (!alive) return;
        const done = (d.projects || []).filter((p) => p.video_url && p.image_url);
        setPool(done.slice(0, CANDIDATES));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const made = pool.filter((p) => !lost.has(p.id)).slice(0, SHOW);

  return (
    made.length > 0 && (
      <div className="home-band">
        <p className="eyebrow">만든 것</p>
        <h2>이 서비스로 만든 영상</h2>
        <div className="home-reel">
          {made.map((p) => (
            <Link key={p.id} href={`/archive/${p.id}`} className="home-reel-item">
              <img
                src={thumbUrl(p.image_url)}
                alt="만든 영상"
                loading="lazy"
                onError={() => setLost((was) => new Set(was).add(p.id))}
              />
            </Link>
          ))}
        </div>
        {/* 2026-08-27 사장님 지시("기본으로 보관함 바로 확인")를 첫 화면이 바뀌어도 지킨다 —
            손님이 여기서 막다른 길을 만나면 안 된다. */}
        <Link href="/archive" className="home-more">보관함에서 더 보기</Link>
      </div>
    )
  );
}
