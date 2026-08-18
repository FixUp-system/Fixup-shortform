"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useDialog } from "./DialogProvider";

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
// onDeleted 를 주면 카드마다 지우는 자리가 생긴다 — 보관함만 준다. 홈은 "최근 몇 개"를
// 보여 주는 자리라, 거기서 지우면 목록이 조용히 다른 카드로 채워진다.
// selecting 을 주면 카드가 **고르는 자리**가 된다 — 눌러도 프로젝트로 안 들어간다.
//
// ★ 두 세계가 한 목록에 섞인다(단계별 영상 · 광고). listProjects 요약의 kind 로 가른다 —
// 없으면(옛 문서) null 이고, 그때는 기존 동작 그대로다.
export default function ProjectCards({ projects, limit, onDeleted, selecting, selected, onToggleSelect }) {
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
    const ok = await confirm({
      title: `${name} 을 지울까요?`,
      body: "만든 영상과 그림이 함께 지워지고 되돌릴 수 없어요.\n쓴 크레딧은 돌아오지 않아요.",
      confirmLabel: "지우기",
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
        // 광고는 자기 화면으로 간다. 고르는 중에는 어느 쪽이든 이동을 막는다 —
        // 막지 않으면 두 번째 카드를 고르려는 순간 그 프로젝트로 들어가 버린다.
        // ★ 보관함에서는 **보는 화면**으로 간다(2026-08-14). 예전에는 제작 화면으로
        //   직행했는데, 확인하러 들어간 자리에 유료 버튼이 있었다. 이어서 작업하는
        //   길은 그 화면 안의 [이어서 작업하기]다 — 종류에 맞는 제작 화면으로 보낸다.
        const href = `/archive/${p.id}`;
        const label = isAd ? (AD_STATUS_LABEL[p.status] || p.status) : (STATUS_LABEL[p.status] || p.status);
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
                {/* 종류 표시 — 광고 문서에만 붙는다. 옛 문서는 이 배지가 아예 없다 */}
                {isAd && <span className="badge ai">광고</span>}
                <span className="badge ai">{label}</span>
                {selecting && (
                  <span className="card-pick" aria-hidden="true">{selected?.has(p.id) ? "✓" : ""}</span>
                )}
                {/* ★ 남이 만든 카드에는 쓰기 버튼을 아예 안 그린다(mine === false).
                    보관함 [전체]는 읽기만 여는 자리다 — 눌러도 404 인 버튼을 그리면
                    "왜 안 되지"만 남는다. 목록에 mine 이 없는 옛 호출부(홈)는 지금 그대로다.
                    고르는 동안에는 낱개 지우기를 감춘다 — 두 가지 지우는 길이 한 화면에
                    있으면 어느 것이 지금 도는 길인지 흐려진다 */}
                {onDeleted && !selecting && p.mine !== false && (
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
