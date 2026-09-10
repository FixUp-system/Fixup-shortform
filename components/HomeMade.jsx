// 첫 화면의 **덮개와 결과물 벽** — 굽힌 표지에서 그린다 (2026-09-10 개편).
//
// ★★★ **클라이언트 부품이 아니다.** 2026-09-10 에 서버로 내렸다(사장님 지시: "파일 자체를
//   올린다던가 하는 방식으로 해결할 수 없을까?"). 그전에는 이랬다:
//     화면이 뜬다 → JS 가 붙는다 → `/api/projects` (0.85~1.5초) → **그제야** 표지 25장 출발
//     → 그중 스무 장이 404(장당 3.34초) → 브라우저가 404 를 맞고 나서야 그 칸을 지운다
//   라이브 실측으로 첫 방문 **7.5초**였고, 09-09 에 엣지가 쥐게 고쳐도 **첫 방문은 그대로**였다.
//   지금은 사슬이 통째로 없다 — 목록도 표지도 **굽는 시점**에 정해진다.
//     API 표지  19KB  → 첫 1.2~2.7초 · 캐시 0.18초
//     정적 파일 607KB → 첫 0.65초    · 캐시 **0.076초**  ← 큰 파일이 더 빠르다
//
// ★★ 그리고 **죽은 칸이 원리적으로 없다.** 굽는 스크립트가 실제로 200 으로 받아지는 것만
//   남긴다(scripts/showcase-refresh.mjs). 그래서 onError 도 lost Set 도 필요 없어졌다.
//   ⚠️ 2026-09-10 **저녁 정정**: 표지를 올린 사진뿐 아니라 **영상 첫 장면**에서도 뽑게
//     고쳐 다섯 → **열여섯 장**이 됐다(사진 7 + 영상 9). 그래도 천장은 낮다 — 우리 저장소
//     영상 41편 중 37편이 옛 Supabase 에 갇혀 404 다. 더 채우려면 그 프로젝트를 되살려야 한다.
//
// ★★ 여기서 영상 태그를 쓰지 마라. 2026-09-07 에 이 서비스가 죽었다 — 목록이 그 태그를
//   물어서 **화면을 여는 것만으로** 전송량 할당량이 탔고 로그인까지 함께 죽었다.
//   정적으로 바뀌었다고 물어도 되는 것이 아니다 — 오히려 엣지에서 그대로 빠져나간다.
//   ⚠️ 그래서 이 파일에는 그 태그를 **여는 꺾쇠까지 붙여 적지 않는다** — 주석에도다.
//
// ★★ 카드에 **글을 안 단다.** 저장된 이름이 영어 지문 원문인 편이 섞여 있다(09-09 실측).
//   ⚠️ 그 낱말을 주석에도 영어로 적지 마라 — 판이 날 것으로 센다.
//
// ★ **비율을 안 정한다.** 타일 높이는 그림이 정한다. 숏폼은 9:16 이 많고 메인에 걸 것은
//   16:9 라 섞이는데, 한 비율로 못 박으면 그림이 잘리거나 늘어난다.
//   ★ 대신 **크기를 적어 준다**(w·h). 굽는 시점에 실제 파일에서 쟀으므로 브라우저가 자리를
//     미리 잡는다 — 표지가 하나씩 뜰 때 아래가 밀리지 않는다.
import Link from "next/link";
import { SHOWCASE } from "../lib/showcase.js";

// 맨 앞이 덮개로 올라가고 나머지가 벽이 된다.
const COVER = SHOWCASE[0] || null;
const WALL = SHOWCASE.slice(1);

export default function HomeMade({ nav = null }) {
  return (
    <>
      {/* ★★ 덮개 — 화면 상단을 **가득** 채운다(사장님 2026-09-09). 새로 만들 16:9 한 편이
          들어갈 자리이고, 지금은 굽힌 표지의 맨 앞을 건다.
          ★ 껍데기가 이 안에 얹힌다 — 그래서 표지가 하나도 없어도 이 덩어리는 늘 그린다. */}
      <div className="stage-cover">
        {COVER && (
          <img
            className="stage-cover-img"
            src={`/showcase/${COVER.file}`}
            alt=""
            width={COVER.w}
            height={COVER.h}
            fetchPriority="high"
          />
        )}
        {nav}
        {/* ★★ 2026-09-10 — 덮개의 **재생 링크를 걷었다**(사장님 지시: "히어로 페이지에 있는
            영상을 클릭해도 영상 제작 페이지로 넘어가는데 그냥 아무 동작 없는 걸로").
            그전에는 덮개 전체(inset:0)가 그 편의 상세로 가는 링크였다 — 첫 화면을 보려고
            누른 손님이 엉뚱한 데로 갔다.
            ★ 재생 표시도 함께 걷는다. 아무 일도 안 하는 재생 버튼은 없는 것보다 나쁘다 —
              누를 수 있다고 약속해 놓고 안 지키는 셈이다.
            ★ 영상을 보러 가는 길은 아래 벽과 [더 보러가기]가 그대로 맡는다. */}
        {/* ★★ 아래에 더 있다고 말하는 표시(2026-09-10). 히어로가 화면을 꽉 채우면서
            영상 벽이 통째로 화면 밖으로 밀렸다 — 이것이 없으면 손님은 첫 화면이 전부인
            줄 알고 나간다. 벽이 없으면 그릴 이유도 없으므로 장수를 보고 그린다. */}
        {WALL.length > 0 && (
          <a href="#made" className="stage-down" aria-label="만든 영상 보러 내려가기">
            <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
              <path d="M1 1l7 7 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        )}
      </div>

      {/* ★ 아래 `id="made"` 는 히어로의 내려가는 표시가 가리키는 자리다(`href="#made"`).
          ⚠️ 이 주석을 `WALL.length > 0 && (` **안으로** 넣지 마라 — 조건과 여는 태그가
             붙어 있는지를 재는 판이 있다(tests/home-sections-ui.test.js). */}
      {WALL.length > 0 && (
        <div className="stage-band" id="made">
          {/* ★ 절 이름 줄("만든 것 · N 편")은 **걷었다**(2026-09-10 사장님 지시).
              그림이 이미 "만든 것"이라고 말한다 — 그 위에 글자를 얹으면 설명이 결과보다
              앞선다. 랜딩에서 글을 덜어내는 이 회차의 방향과 같다(머리글도 같은 이유로 뺐다). */}

          {/* ★★ 벽을 **한 선에서 자른다.** 비율이 제각각이라 열마다 바닥이 들쭉날쭉한데,
              잘라 버리면 그 아래가 곧은 한 줄이 된다. 지금처럼 장수가 적으면 잘릴 것이
              없어 그냥 제 높이로 선다 — 자르는 자리는 장수가 늘면 저절로 일한다. */}
          <div className="stage-cut">
            <div className="stage-wall">
              {WALL.map((t) => (
                <Link key={t.file} href={`/archive/${t.id}`} className="stage-tile">
                  <img
                    src={`/showcase/${t.file}`}
                    alt="만든 영상"
                    width={t.w}
                    height={t.h}
                    loading="lazy"
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
          {/* ★★ 맨 위로 (2026-09-10 사장님 지시). **자바스크립트를 안 쓴다** — 이 화면은
              서버가 통째로 그려 내려주는 자리라(첫 방문 7.5초 → 1.6초), 스크롤을 감지하려고
              "use client" 를 들이면 그 최적화가 깨진다. 자리는 CSS 의 sticky 가 잡는다:
              벽 안에서만 떠 있어 히어로에서는 안 보인다(app/globals.css 의 .stage-top). */}
          <a href="#top" className="stage-top" aria-label="맨 위로">
            <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
              <path d="M1 9l7-7 7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      )}
    </>
  );
}
