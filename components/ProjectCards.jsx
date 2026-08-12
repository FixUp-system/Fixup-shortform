"use client";

import { useRef } from "react";
import Link from "next/link";

// 홈과 보관함이 같은 카드를 쓴다. 마크업을 두 벌로 두면 한쪽만 고쳐지는 날이 온다.

// 단계 이름의 한국어 라벨. lib/steps.js 의 STEPS 와 같은 뜻이지만 여기서는
// 카드에 짧게 찍을 한 단어만 필요해서 별도 표를 둔다.
export const STATUS_LABEL = {
  draft: "자료",
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
  draft: "자료",
  scenario: "시나리오",
  rendering: "만드는 중",
  done: "완성",
};

// 카드 썸네일 — 완성본이 있으면 영상을, 없으면 첫 컷 그림을 보여준다.
//
// 영상은 마우스를 올렸을 때만 재생한다. 카드가 열 개여도 한 번에 하나만 움직이므로
// 목록이 어수선해지지 않고, 재생 전에는 첫 프레임만 받는다(preload="metadata").
// muted 는 필수다 — 소리 있는 자동재생은 브라우저가 막고, 목록에서 소리가 나면 놀란다.
function Thumb({ video, image, alt }) {
  const ref = useRef(null);

  // 마우스를 떼면 처음으로 되감는다. 안 되감으면 다음에 올렸을 때 중간부터 시작해
  // "첫 프레임"이라는 약속이 깨진다.
  const stop = () => {
    const el = ref.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
  };

  if (video) {
    return (
      <video
        ref={ref}
        className="thumb-media"
        src={video}
        muted
        playsInline
        preload="metadata"
        onMouseEnter={() => ref.current?.play().catch(() => {})}
        onMouseLeave={stop}
      />
    );
  }
  if (image) return <img className="thumb-media" src={image} alt={alt} loading="lazy" />;
  // 아직 그림도 영상도 없는 프로젝트 — 빈 칸에 무엇을 기다리는지 적는다.
  return <span className="thumb-empty">아직 그림이 없어요</span>;
}

// limit 을 주면 그만큼만 그린다(홈은 최근 몇 개, 보관함은 전부).
//
// ★ 두 세계가 한 목록에 섞인다. listProjects 요약의 kind 로 가른다 — 없으면(옛 문서)
// null 이고, 이때는 기존 동작을 한 톨도 바꾸지 않는다(아래 분기의 else 쪽이 옛 코드 그대로다).
export default function ProjectCards({ projects, limit }) {
  const shown = limit ? projects.slice(0, limit) : projects;
  return (
    <ul className="project-grid">
      {shown.map((p) => {
        const isAd = p.kind === "ad";
        const href = isAd ? `/ads/${p.id}` : `/create/${p.id}`;
        const label = isAd ? (AD_STATUS_LABEL[p.status] || p.status) : (STATUS_LABEL[p.status] || p.status);
        return (
          <li key={p.id}>
            <Link href={href} className="project-card">
              <span className="project-thumb">
                <Thumb video={p.video_url} image={p.image_url} alt={p.title || "만든 영상"} />
                {p.video_url && <span className="thumb-tag">영상</span>}
              </span>
              <span className="project-meta">
                <span className="title">{p.title || "제목 없음"}</span>
                {/* 종류 표시 — 광고 문서에만 붙는다. 옛 문서는 이 배지가 아예 없다(기존 모양 그대로). */}
                {isAd && <span className="badge ai">광고</span>}
                <span className="badge ai">{label}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
