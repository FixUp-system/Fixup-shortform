"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QuickCreate from "../components/QuickCreate";
import { loadProjects } from "../lib/projects-client";

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

export default function Home() {
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
        <h1 className="pgtitle">내 영상</h1>
        <Link href="/create" className="cta">
          + 새 영상 만들기
        </Link>
      </div>

      {projects === null && <p className="pgsub">불러오는 중…</p>}
      {err && <p className="pgsub warn">{err}</p>}
      {projects?.length === 0 && !err && (
        <p className="pgsub">아직 만든 영상이 없어요. 새로 만들어 보세요.</p>
      )}
      {projects && projects.length > 0 && (
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/create/${p.id}`} className="project-item">
                <span className="title">{p.title || "제목 없음"}</span>
                <span className="badge ai">{STATUS_LABEL[p.status] || p.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="home-quick">
        <h2 className="eyebrow">
          빠른 생성 <small className="badge warn">실험</small>
        </h2>
        <p className="pgsub">
          대화로 필요한 정보만 모아서 비디오 모델에 바로 전달해요. 결과는 5~10초
          단일 클립이에요.
        </p>
        <QuickCreate />
      </section>
    </>
  );
}
