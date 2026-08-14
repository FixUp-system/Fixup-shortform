"use client";

// 프로젝트 로드·단계 가드를 한 곳에서 — 각 단계 페이지는 화면만 그린다.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useProject } from "../../../components/ProjectContext";
import { stepsFor, currentStepKey, isReachable, stepFromPathname, stepHref } from "../../../lib/steps";

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

  // 못 찾은 이유는 대개 둘이다 — 지워졌거나, 남의 것이거나(소유자 검사는 404 로 답한다).
  // 어느 쪽이든 사장님이 할 수 있는 일은 같으니 나갈 길을 함께 준다. 문구만 덩그러니
  // 두면 "여기서 뭘 해야 하지"로 막힌다.
  if (err) {
    return (
      <>
        <h1 className="pgtitle">{err}</h1>
        <p className="pgsub">주소가 잘못됐거나 다른 계정의 영상일 수 있어요.</p>
        <Link href="/archive" className="cta">보관함으로</Link>
      </>
    );
  }
  if (!project || project.id !== id) return <p className="pgsub">불러오는 중…</p>;

  return (
    <>
      <h1 className="pgtitle">영상 만들기 (단계별)</h1>
      {children}
    </>
  );
}
