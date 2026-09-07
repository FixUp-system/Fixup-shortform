"use client";

import { useState } from "react";
// ★ 순수 모듈이라 화면이 읽어도 된다 — 실제로 줄이는 lib/thumbs.js(sharp)는 서버 전용이다.
//   여기서 그쪽을 import 하면 클라이언트 번들에 sharp 가 실려 빌드가 깨진다.
import { thumbUrl } from "../lib/thumb-url.js";
import Link from "next/link";
import { useDialog } from "./DialogProvider";
import { FILM_MODES, filmMode } from "../lib/film/mode";

// 홈과 보관함이 같은 카드를 쓴다. 마크업을 두 벌로 두면 한쪽만 고쳐지는 날이 온다.

// 단계 이름의 한국어 라벨. lib/steps.js 의 STEPS 와 같은 뜻이지만 여기서는
// 카드에 짧게 찍을 한 단어만 필요해서 별도 표를 둔다.
export const STATUS_LABEL = {
  draft: "입력",
  briefing: "확인",
  script: "대본",
  cuts: "그림",
  voice: "목소리",
  video: "영상",
  done: "완성",
};

// 광고 경로(kind:"ad")의 상태 라벨 — 별도 표를 둔다. 광고 문서도 status 값으로
// "draft"·"done"을 쓰지만(lib/ad/pipeline.js) 뜻이 기존 6단계와 다르다("draft"는
// 시나리오 전, "done"은 굽기 완료뿐) — 표를 섞으면 카드가 엉뚱한 단어를 보여준다.
const AD_STATUS_LABEL = {
  draft: "입력",
  scenario: "시나리오",
  rendering: "만드는 중",
  done: "완성",
};

// 한 번에 굽는 영상(kind:"film")의 상태 라벨 — 또 별도 표다. 이 경로의 문서는 최상단
// status 로 "draft"·"scenario" 만 쓰고(굽기 상태는 방식마다 films[mode].status 에 두 벌로
// 있다), 카드는 방식을 모른다 — 그러니 여기서 "완성"을 말할 수 없다. 광고 표를 돌려쓰면
// 카드가 있지도 않은 단계를 말한다.
const FILM_STATUS_LABEL = {
  draft: "입력",
  scenario: "시나리오",
};

// 카드 썸네일 — **그림만 그린다. 영상은 누른 다음에 본다.** (2026-09-07 사장님 지시)
//
// ★★ 왜 이렇게까지 하나. 전송(egress) 할당량이 터져 Supabase 가 프로덕션을 402 로 막았고
//   로그인까지 함께 죽었다. 되짚어 보니 목록이 영상을 물고 있었다:
//     · 처음에는 `preload="metadata"` 라 **보관함을 여는 것만으로** 카드 수만큼 요청이 나갔다
//     · 그다음엔 마우스를 올리면 재생했다 — **스치기만 해도** 바이트가 나간다
//   실측으로 보관함 46편 중 **37편이 우리 스토리지**를 지난다(7편만 fal CDN 직접).
//   그래서 목록에서는 영상을 **한 번도 안 문다.** 보려면 카드를 눌러 상세로 간다.
//
// ★ 그림이 없는 카드가 실측 **25/46** 이다(광고·필름은 cuts[0].image 가 없다).
//   빈 칸으로 두면 고장으로 보이므로 그 자리는 말로 채운다 — 아래 참고.
//   근본 해결은 **굽는 김에 표지 그림을 함께 만드는 것**이다(별도 작업).
function Thumb({ video, image, alt }) {
  // ★ 그림이 **안 올 수 있다**(2026-09-07 실측). 새 프로젝트로 이사한 뒤 파일이 아직
  //   옛 프로젝트에 있어 업로드 사진이 전부 404 였다. 그대로 두면 브라우저가
  //   ⚠️ 이 주석에 별표를 슬래시 뒤에 쓰지 마라 — 화면 계약을 재는 판의 주석 제거기가
  //     그것을 블록 주석 시작으로 읽어 **파일 뒷부분을 통째로 삼킨다**(실제로 밟았다:
  //     안 건드린 scope·kind 판 둘이 같이 빨개졌다).
  //   **깨진 아이콘**을 그린다 — 전에는 <video> 라 검은 칸이어서 덜 흉했다.
  //   못 받으면 말로 바꿔 준다. 고장을 더 흉하게 보이게 하는 것은 우리 책임이다.
  const [broken, setBroken] = useState(false);

  // 그림이 있으면 그림 하나가 전부다. loading="lazy" 라 화면 밖 카드는 받지도 않는다.
  //
  // ★ thumbUrl 을 지난다 — 원본은 실측 평균 290KB 인데 카드는 화면에서 300~400px 다.
  //   우리 경로일 때만 작은 판을 부르고(외부 주소는 그대로), 라우트가 없으면 그때 만들어 둔다.
  if (image && !broken) {
    return (
      <img
        className="thumb-media"
        src={thumbUrl(image)}
        alt={alt}
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  // ★ 영상은 있는데 표지 그림이 없는 자리 — 실측 46편 중 **25편**이 여기로 온다.
  //   빈 칸으로 두면 고장 난 것처럼 보이므로, 없는 것과 안 보이는 것을 갈라 말해 준다.
  if (video) return <span className="thumb-empty">영상이 있어요 — 눌러서 보기</span>;
  // ★ 문구를 가른다 — "아직 안 만들었다"와 "만들었는데 못 받았다"는 다른 상태다.
  //   사장님이 그 둘을 구분해야 무엇을 할지 안다(만들기 vs 파일 복구).
  if (broken) return <span className="thumb-empty">그림을 불러오지 못했어요</span>;
  // 아직 그림도 영상도 없는 프로젝트 — 빈 칸에 무엇을 기다리는지 적는다.
  return <span className="thumb-empty">아직 그림이 없어요</span>;
}

// limit 을 주면 그만큼만 그린다(홈은 최근 몇 개, 보관함은 전부).
//
// onDeleted 를 주면 카드마다 지우는 자리가 생긴다 — 보관함만 준다. 홈은 "최근 몇 개"를
// 보여 주는 자리라, 거기서 지우면 목록이 조용히 다른 카드로 채워진다.
// selecting 을 주면 카드가 **고르는 자리**가 된다 — 눌러도 프로젝트로 안 들어간다.
//
// ★ 두 세계가 한 목록에 섞인다(단계별 영상 · 광고). listProjects 요약의 kind 로 가른다 —
// 없으면(옛 문서) null 이고, 그때는 기존 동작 그대로다.
export default function ProjectCards({ projects, limit, onDeleted, selecting, selected, onToggleSelect, scope, canDeleteAny = false }) {
  const shown = limit ? projects.slice(0, limit) : projects;
  const { confirm, alert } = useDialog();
  const [busyId, setBusyId] = useState(null);

  // ★ 카드 전체가 <Link> 다 — 막지 않으면 지우기를 눌러도 프로젝트로 들어가 버린다.
  // ★ 되돌릴 수 없으므로 한 번 묻는다. 카드가 격자로 촘촘해 오조작이 쉽다.
  async function remove(e, p) {
    e.preventDefault();
    e.stopPropagation();
    if (busyId) return;
    const name = p.title ? `"${p.title}"` : "이 영상";
    // ★★★ 2026-09-03 사장님 지시 — **남의 것을 지울 때는 다르게 묻는다.**
    //   운영자에게 [전체]가 열리면서 같은 버튼이 두 가지 일을 하게 됐다: 내 것 지우기와
    //   **남이 만든 것 지우기**. 문구가 같으면 그 둘이 손끝에서 구별되지 않는다 —
    //   격자로 촘촘한 목록에서 오조작이 쉬운 자리라(위 remove 주석) 더 위험하다.
    //   ★ 판정은 `p.mine === false` 다 — "내 것이 아님이 **확인된** 카드"에만 붙는다.
    //     목록에 mine 이 없는 옛 호출부(홈)는 undefined 라 예전 문구 그대로다.
    const others = p.mine === false;
    const ok = await confirm({
      title: others ? `남이 만든 ${name} 을 지울까요?` : `${name} 을 지울까요?`,
      body: others
        ? "이 영상은 **다른 사람이 만든 것**이에요. 만든 사람에게는 알림이 가지 않고, 지우면 되돌릴 수 없어요.\n만든 영상과 그림이 함께 지워지고, 쓴 크레딧도 돌아오지 않아요."
        : "만든 영상과 그림이 함께 지워지고 되돌릴 수 없어요.\n쓴 크레딧은 돌아오지 않아요.",
      confirmLabel: others ? "그래도 지우기" : "지우기",
    });
    if (!ok) return;
    setBusyId(p.id);
    const res = await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      await alert({
        title: "지우지 못했어요",
        body: (await res.json().catch(() => ({}))).error || "잠시 뒤 다시 시도해 주세요.",
      });
      return;
    }
    onDeleted?.(p.id);
  }

  return (
    <ul className="project-grid">
      {shown.map((p) => {
        const isAd = p.kind === "ad";
        // ★ 세 세계가 한 목록에 섞인다(단계별 영상 · 광고 · 한 번에 굽는 영상).
        //   film 을 갈라 두지 않으면 단계별 표(STATUS_LABEL)로 떨어져 "scenario" 가
        //   그대로 찍힌다 — 그 표에는 그 단계가 없다.
        const isFilm = p.kind === "film";
        // 광고는 자기 화면으로 간다. 고르는 중에는 어느 쪽이든 이동을 막는다 —
        // 막지 않으면 두 번째 카드를 고르려는 순간 그 프로젝트로 들어가 버린다.
        // ★ 보관함에서는 **보는 화면**으로 간다(2026-08-14). 예전에는 제작 화면으로
        //   직행했는데, 확인하러 들어간 자리에 유료 버튼이 있었다. 이어서 작업하는
        //   길은 그 화면 안의 [이어서 작업하기]다 — 종류에 맞는 제작 화면으로 보낸다.
        // ★ 보던 탭을 주소에 실어 보낸다(2026-08-19) — 상세의 [보관함으로]가 그 값을
        //   되돌려 받아야 [전체]에서 들어간 사람이 [내 영상]으로 떨어지지 않는다.
        //   "mine" 은 안 싣는다: 기본값이라 붙이면 주소만 길어진다.
        const href = scope === "all" ? `/archive/${p.id}?scope=all` : `/archive/${p.id}`;
        const label = isAd
          ? (AD_STATUS_LABEL[p.status] || p.status)
          : isFilm
            ? (FILM_STATUS_LABEL[p.status] || p.status)
            : (STATUS_LABEL[p.status] || p.status);
        return (
          <li key={p.id}>
            <Link
              href={href}
              className={`project-card${selecting ? " picking" : ""}${selected?.has(p.id) ? " picked" : ""}`}
              onClick={selecting ? (e) => { e.preventDefault(); onToggleSelect?.(p.id); } : undefined}
            >
              <span className="project-thumb">
                <Thumb video={p.video_url} image={p.image_url} alt={p.title || "만든 영상"} />
                {p.video_url && <span className="thumb-tag">영상</span>}
              </span>
              <span className="project-meta">
                <span className="title">{p.title || "제목 없음"}</span>
                {/* ★★★ 2026-09-03 사장님 지시 — **어느 모드로 만든 것인지 카드가 말한다.**
                    그전에는 광고(원클릭)와 film(한 번에)에만 배지가 붙고 **단계별은 아무
                    표시가 없어서**, 배지 없는 카드가 "단계별"인지 "옛 문서라 종류를 모르는
                    것"인지 구별되지 않았다. 이제 셋이 모두 자기 이름을 단다.
                    ★ 이름은 사이드바·상세와 같은 말이다(원클릭 영상 · 단계별 영상 ·
                      한 번에 굽는 영상) — 자리마다 다르게 부르면 같은 것을 다른 것으로 읽는다.
                    ★ 판정 순서가 곧 규칙이다: ad·film 이 아니면 단계별이다(상세 화면
                      app/archive/[id]/page.js 가 쓰는 것과 같은 갈래). */}
                {isAd && <span className="badge ai">원클릭</span>}
                {isFilm && <span className="badge ai">한 번에</span>}
                {!isAd && !isFilm && <span className="badge ai">단계별</span>}
                {/* ★ 어느 방식으로 구웠는지 — film 은 한 프로젝트가 두 편을 담는다.
                    이름은 표(FILM_MODES)에서 가져온다: 손으로 적으면 방식이 늘 때 빠진다.
                    아직 안 구웠으면 목록이 빈 배열을 주므로 배지가 안 붙는다. */}
                {(p.film_modes || []).map((id) => (
                  <span key={id} className="badge ai">{filmMode(id).label}</span>
                ))}
                <span className="badge ai">{label}</span>
                {selecting && (
                  <span className="card-pick" aria-hidden="true">{selected?.has(p.id) ? "✓" : ""}</span>
                )}
                {/* ★ 남이 만든 카드에는 쓰기 버튼을 아예 안 그린다(mine === false) —
                    눌러도 404 인 버튼을 그리면 "왜 안 되지"만 남는다. 목록에 mine 이 없는
                    옛 호출부(홈)는 지금 그대로다.
                    ★★ **운영자는 예외다**(2026-09-03 사장님 지시: "관리자는 전체 영상을
                    삭제할 수 있는 권한"). 서버도 같이 열렸으므로(lib/projects.js 의
                    deleteProject) 화면만 열어 404 를 만드는 상황이 아니다.
                    ⚠️ 이 값은 **화면이 정하지 않는다** — 부르는 쪽이 /api/me 의 isAdmin 을
                    보고 넘긴다. 여기서 역할을 직접 읽으면 판정이 두 벌이 된다.
                    고르는 동안에는 낱개 지우기를 감춘다 — 두 가지 지우는 길이 한 화면에
                    있으면 어느 것이 지금 도는 길인지 흐려진다 */}
                {onDeleted && !selecting && (canDeleteAny || p.mine !== false) && (
                  <button
                    className="card-del"
                    aria-label="이 영상 지우기"
                    disabled={busyId === p.id}
                    onClick={(e) => remove(e, p)}
                  >
                    {busyId === p.id ? "지우는 중…" : "지우기"}
                  </button>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
