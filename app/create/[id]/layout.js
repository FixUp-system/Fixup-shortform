"use client";

// 프로젝트 로드·단계 가드를 한 곳에서 — 각 단계 페이지는 화면만 그린다.
import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useProject } from "../../../components/ProjectContext";
import { STEPS, currentStepKey, isReachable, stepFromPathname, stepHref } from "../../../lib/steps";

export default function ProjectLayout({ children }) {
  const { id } = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const { project, load } = useProject();
  const [err, setErr] = useState("");

  useEffect(() => {
    load(id).catch((e) => setErr(e.message));
  }, [id, load]);

  // 아직 열리지 않은 단계로 직접 들어오면 지금 있어야 할 단계로 돌려보낸다.
  // 준비 중 단계는 자리표시 화면을 그대로 보여준다 — 영문 모를 되돌림보다 설명이 낫다.
  const step = stepFromPathname(pathname);
  useEffect(() => {
    if (!project || project.id !== id) return;
    if (step && (step.soon || isReachable(step.key, project))) return;
    const target = STEPS.find((s) => s.key === currentStepKey(project));
    router.replace(stepHref(target, id));
  }, [project, id, step, router]);

  if (err) return <p className="pgsub">{err}</p>;
  if (!project || project.id !== id) return <p className="pgsub">불러오는 중…</p>;

  return (
    <>
      <h1 className="pgtitle">영상 만들기 (단계별)</h1>
      {children}
    </>
  );
}
