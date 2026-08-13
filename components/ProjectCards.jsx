"use client";

import { useRef, useState } from "react";
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
// onDeleted 를 주면 카드마다 지우는 자리가 생긴다 — 보관함만 준다. 홈(빠른 생성)은
// "최근 몇 개"를 보여 주는 자리라, 거기서 지우면 목록이 조용히 다른 카드로 채워진다.
// selecting 을 주면 카드가 **고르는 자리**가 된다 — 눌러도 프로젝트로 안 들어간다.
// 보관함의 [수정] 이 그 상태를 쥐고, 여기는 시키는 대로 그린다.
export default function ProjectCards({ projects, limit, onDeleted, selecting, selected, onToggleSelect }) {
  const shown = limit ? projects.slice(0, limit) : projects;
  const [busyId, setBusyId] = useState(null);

  // ★ 카드 전체가 <Link> 다 — 막지 않으면 지우기를 눌러도 프로젝트로 들어가 버린다.
  // ★ 되돌릴 수 없으므로 한 번 묻는다. 카드가 격자로 촘촘해 오조작이 쉽다.
  async function remove(e, p) {
    e.preventDefault();
    e.stopPropagation();
    if (busyId) return;
    const name = p.title ? `"${p.title}"` : "이 영상";
    if (!confirm(`${name} 을 지울까요?

만든 영상과 그림이 함께 지워지고 되돌릴 수 없어요. 쓴 크레딧은 돌아오지 않아요.`)) return;
    setBusyId(p.id);
    const res = await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error || "지우지 못했어요");
      return;
    }
    onDeleted?.(p.id);
  }

  return (
    <ul className="project-grid">
      {shown.map((p) => (
        <li key={p.id}>
          {/* ★ 카드 전체가 <Link> 라, 고르는 동안에는 그 이동을 막아야 한다.
              막지 않으면 두 번째 카드를 고르려는 순간 프로젝트로 들어가 버린다. */}
          <Link
            href={`/create/${p.id}`}
            className={`project-card${selecting ? " picking" : ""}${selected?.has(p.id) ? " picked" : ""}`}
            onClick={selecting ? (e) => { e.preventDefault(); onToggleSelect?.(p.id); } : undefined}
          >
            <span className="project-thumb">
              <Thumb video={p.video_url} image={p.image_url} alt={p.title || "만든 영상"} />
              {p.video_url && <span className="thumb-tag">영상</span>}
            </span>
            <span className="project-meta">
              <span className="title">{p.title || "제목 없음"}</span>
              <span className="badge ai">{STATUS_LABEL[p.status] || p.status}</span>
              {selecting && (
                <span className="card-pick" aria-hidden="true">{selected?.has(p.id) ? "✓" : ""}</span>
              )}
              {/* 고르는 동안에는 낱개 지우기를 감춘다 — 두 가지 지우는 길이 한 화면에 있으면
                  어느 것이 지금 도는 길인지 흐려진다 */}
              {onDeleted && !selecting && (
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
      ))}
    </ul>
  );
}
