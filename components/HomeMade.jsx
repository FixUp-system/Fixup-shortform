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
//   ⚠️ 2026-09-10 실측: 후보 22편 중 **살아 있는 것은 다섯**뿐이다(09-07 파일 미이관).
//     벽이 얇아 보이는 것은 화면 탓이 아니라 **되찾을 파일이 아직 안 왔기 때문**이다.
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
        {COVER && (
          <Link href={`/archive/${COVER.id}`} className="stage-cover-play" aria-label="최근 만든 영상 보기">
            <span className="stage-bigplay" aria-hidden="true">
              <svg width="20" height="24" viewBox="0 0 20 24" fill="currentColor"><path d="M0 0l20 12L0 24z" /></svg>
            </span>
          </Link>
        )}
      </div>

      {WALL.length > 0 && (
        <div className="stage-band">
          <div className="stage-bar">
            <span>만든 것</span>
            <span><b>{SHOWCASE.length}</b> 편</span>
          </div>

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
        </div>
      )}
    </>
  );
}
