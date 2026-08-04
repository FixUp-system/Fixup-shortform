"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QuickCreate from "../components/QuickCreate";
import ProjectCards from "../components/ProjectCards";
import { loadProjects } from "../lib/projects-client";

// 홈에 깔 카드 수. 실측한 AI 영상 서비스 6곳(dropshot·Krea·Runway·Luma·Higgsfield·
// Magnific)의 공통 패턴은 "만드는 입구가 위, 만든 것이 그 아래"다 — 그래서 만들기 버튼을
// 헤더에 두고 그 밑을 카드로 채운다.
//
// 다만 전부 깔지는 않는다. 홈 아래에 빠른 생성이 있어서, 카드가 수십 개면 그 자리가
// 화면 밖으로 밀려난다. 전체는 보관함이 맡는다.
const HOME_LIMIT = 8;

export default function Home() {
  const [projects, setProjects] = useState(null); // null = 불러오는 중
  const [err, setErr] = useState("");

  useEffect(() => {
    loadProjects().then(({ projects, err }) => {
      setProjects(projects);
      setErr(err);
    });
  }, []);

  const hasMore = projects && projects.length > HOME_LIMIT;

  return (
    <>
      <div className="home-header">
        <h1 className="pgtitle">새 영상 만들기</h1>
        <Link href="/create" className="cta">
          + 시작하기
        </Link>
      </div>
      <p className="pgsub">
        자료를 넣으면 대본·목소리·그림·영상을 단계마다 확인하며 완성본까지 만들어요.
      </p>

      <section className="home-start">
        {projects === null && <p className="pgsub">불러오는 중…</p>}
        {err && <p className="pgsub warn">{err}</p>}
        {projects?.length === 0 && !err && (
          <p className="pgsub">아직 만든 영상이 없어요. 위 [시작하기]를 눌러 첫 영상을 만들어 보세요.</p>
        )}
        {projects && projects.length > 0 && (
          <>
            <ProjectCards projects={projects} limit={HOME_LIMIT} />
            {hasMore && (
              <Link href="/archive" className="home-more">
                보관함에서 전체 보기 ({projects.length}개) →
              </Link>
            )}
          </>
        )}
      </section>

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
