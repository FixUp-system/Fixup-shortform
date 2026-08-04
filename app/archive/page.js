"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadProjects } from "../../lib/projects-client";
import ProjectCards from "../../components/ProjectCards";

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
      {projects && projects.length > 0 && <ProjectCards projects={projects} />}
    </>
  );
}
