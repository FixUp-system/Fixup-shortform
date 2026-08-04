"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadProjects } from "../../lib/projects-client";

// 단계 이름의 한국어 라벨. lib/steps.js 의 STEPS 와 같은 뜻이지만 여기서는
// 목록에 짧게 찍을 한 단어만 필요해서 별도 표를 둔다.
const STATUS_LABEL = {
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

export default function Archive() {
  const [projects, setProjects] = useState(null); // null = 불러오는 중
  const [err, setErr] = useState("");

  useEffect(() => {
    loadProjects().then(({ projects, err }) => {
      setProjects(projects);
      setErr(err);
    });
  }, []);

  return (
    <>
      <div className="home-header">
        <h1 className="pgtitle">보관함</h1>
        <Link href="/create" className="cta">
          + 새 영상 만들기
        </Link>
      </div>
      <p className="pgsub">지금까지 만든 영상이 여기 모입니다. 눌러서 이어서 작업할 수 있어요.</p>

      {projects === null && <p className="pgsub">불러오는 중…</p>}
      {err && <p className="pgsub warn">{err}</p>}
      {projects?.length === 0 && !err && (
        <p className="pgsub">아직 만든 영상이 없어요. 새로 만들어 보세요.</p>
      )}
      {projects && projects.length > 0 && (
        <ul className="project-grid">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/create/${p.id}`} className="project-card">
                <span className="project-thumb">
                  <Thumb video={p.video_url} image={p.image_url} alt={p.title || "만든 영상"} />
                  {p.video_url && <span className="thumb-tag">영상</span>}
                </span>
                <span className="project-meta">
                  <span className="title">{p.title || "제목 없음"}</span>
                  <span className="badge ai">{STATUS_LABEL[p.status] || p.status}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
