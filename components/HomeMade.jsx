"use client";

// 첫 화면의 **덮개와 결과물 벽** — 만든 것을 비율 그대로 늘어놓는다 (2026-09-09 밤 개편).
//
// ★★ 여기서 영상 태그를 쓰지 마라. 2026-09-07 에 이 서비스가 죽었다 — 보관함 목록이
//   그 태그를 물고 있어서 **화면을 여는 것만으로** 전송량 할당량이 탔고, Supabase 가
//   프로젝트를 402 로 막아 로그인까지 함께 죽었다. 여기는 표지 그림만 그리고, 영상은
//   눌러서 상세에서 본다. 덮개는 **화면을 가득 채우므로** 더더욱 그렇다 — 손님이 오는
//   화면이라 한 자리라도 물면 방문 수만큼 나간다.
//   ⚠️ 그래서 이 파일에는 그 태그를 **여는 꺾쇠까지 붙여 적지 않는다** — 주석에도다.
//   tests/home-sections-ui.test.js 가 소스를 날 것 그대로 훑기 때문이고, 그것이 의도다.
//
// ★★★ **덮개는 목록이 비어도 그린다.** 옛 코드는 완성본이 없으면 부품 전체가 null 이었다.
//   그때는 벽만 들어 있었으니 맞았지만, 지금은 덮개 안에 **브랜드와 로그인 문**이 얹혀
//   있다 — 그대로 두면 목록이 빈 순간 껍데기가 통째로 증발한다. 감추는 것은 **벽**이다.
//
// ★★ 껍데기(nav)는 **서버가 만들어 건넨다.** 신원(로그인 여부)은 요청 헤더에 있고 이
//   부품은 클라이언트라 그것을 모른다. 그래서 app/home/page.js 가 만들어 prop 으로 준다.
//
// ★★ 카드에 **글을 안 단다.** 2026-09-09 프로덕션 실측: 완성본 여섯 편 중 셋의 이름이
//   영어 지문 원문이었다(저장된 이름 칸에 사장님이 적은 소재가 그대로 들어간다).
//   손님이 이 화면을 보므로 그 글자가 서비스의 얼굴이 된다.
//   ⚠️ 그 낱말을 주석에도 영어로 적지 마라 — 판이 날 것으로 센다.
//
// ★★ **비율을 안 정한다.** 타일 높이는 그림이 정한다(`img { width:100%; height:auto }`).
//   숏폼은 9:16 이 많고 메인에 걸 것은 16:9 라 비율이 섞이는데, 여기서 한 비율로 못 박으면
//   그림이 잘리거나 늘어난다. 다단(column)으로 흘려 두면 어떤 비율이 와도 제 모양으로 선다.
//   ★ 목록 API 는 화면 비율을 안 실어 준다 — 그림 자체가 비율이므로 물어볼 필요가 없다.
//   ★ 단 **덮개만은 예외**다. 화면 상단을 가득 채우는 자리라 높이를 CSS 가 정하고 그림은
//     잘라 맞춘다(object-fit). 거기 걸릴 것은 새로 만들 16:9 한 편이다.
//
// ★ 그림이 **안 열리는 칸은 스스로 빠진다.** 2026-09-09 실측: 표지 주소가 있는 25편 중
//   실제로 열리는 것은 다섯뿐이다(09-07 파일 미이관). 덮개도 같은 그물을 탄다 —
//   덮개 그림이 죽으면 그 편이 빠지고 **다음 편이 덮개로 올라온다.**
import { useEffect, useState } from "react";
import Link from "next/link";
import { thumbUrl } from "../lib/thumb-url";

// 벽에 거는 최대 개수. 잘리는 선 아래는 어차피 안 보이지만, 열 균형을 위해 넉넉히 건다.
const MAX = 24;

export default function HomeMade({ nav = null }) {
  const [pool, setPool] = useState([]);
  // 그림을 못 받은 편. Set 을 **새로 만들어** 넣는다 — 제자리에서 고치면 리렌더가 안 온다.
  const [lost, setLost] = useState(() => new Set());

  useEffect(() => {
    let alive = true;
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) => {
        if (!alive) return;
        setPool((d.projects || []).filter((p) => p.video_url && p.image_url).slice(0, MAX));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const made = pool.filter((p) => !lost.has(p.id));
  const cover = made[0] || null;

  return (
    <>
      {/* ★★ 덮개 — 화면 상단을 **가득** 채운다(사장님 2026-09-09 밤). 새로 만들 16:9 한
          편이 들어갈 자리이고, 지금은 가장 최근 완성본의 표지를 건다.
          ★ 껍데기가 이 안에 얹힌다 — 그래서 목록이 비어도 이 덩어리는 늘 그린다. */}
      <div className="stage-cover">
        {cover && (
          <img
            className="stage-cover-img"
            src={thumbUrl(cover.image_url)}
            alt=""
            onError={() => setLost((was) => new Set(was).add(cover.id))}
          />
        )}
        {nav}
        {cover && (
          <Link href={`/archive/${cover.id}`} className="stage-cover-play" aria-label="최근 만든 영상 보기">
            <span className="stage-bigplay" aria-hidden="true">
              <svg width="20" height="24" viewBox="0 0 20 24" fill="currentColor"><path d="M0 0l20 12L0 24z" /></svg>
            </span>
          </Link>
        )}
      </div>

      {made.length > 0 && (
        <div className="stage-band">
          <div className="stage-bar">
            <span>만든 것</span>
            <span><b>{made.length}</b> 편</span>
          </div>

          {/* ★★ 벽을 **한 선에서 자른다.** 자유 배치는 열마다 바닥이 들쭉날쭉한데, 잘라 버리면
              그 아래가 곧은 한 줄이 된다 — 어질러 보이지 않으면서 "더 있다"도 전해진다. */}
          <div className="stage-cut">
            <div className="stage-wall">
              {made.map((p) => (
                <Link key={p.id} href={`/archive/${p.id}`} className="stage-tile">
                  <img
                    src={thumbUrl(p.image_url)}
                    alt="만든 영상"
                    loading="lazy"
                    onError={() => setLost((was) => new Set(was).add(p.id))}
                  />
                  <span className="stage-play" aria-hidden="true">
                    <svg width="9" height="11" viewBox="0 0 9 11" fill="currentColor"><path d="M0 0l9 5.5L0 11z" /></svg>
                  </span>
                </Link>
              ))}
            </div>
            {/* 2026-08-27 사장님 지시("기본으로 보관함 바로 확인")를 첫 화면이 바뀌어도 잇는 문. */}
            <Link href="/archive" className="stage-more">
              더 보러가기
              <svg width="13" height="9" viewBox="0 0 13 9" fill="none" aria-hidden="true">
                <path d="M1 4.5h10M7.5 1l3.5 3.5L7.5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
