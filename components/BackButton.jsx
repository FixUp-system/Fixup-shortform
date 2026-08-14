"use client";

// 이전 단계로 돌아가는 링크. 현재 단계가 첫 단계면 아무것도 그리지 않는다.
// 단계 순서·주소는 lib/steps 하나만 본다.
//
// 라벨은 어느 단계로 가든 "이전"이다 — 어디로 가는지는 왼쪽 사이드바가 이미 보여준다.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useProject } from "./ProjectContext";
import { stepsFor, stepHref } from "../lib/steps";

export default function BackButton({ stepKey, className = "" }) {
  const { id } = useParams();
  // ★ stepsFor(project) — 말하는 프로젝트는 목소리 단계가 목록에 없다. STEPS를 그대로
  //   읽으면 ④이미지의 "이전"이 없는 ③목소리로 되돌아가고, 그 화면은 곧장 ④로 되튕긴다.
  const { project } = useProject();
  const steps = stepsFor(project);
  const i = steps.findIndex((s) => s.key === stepKey);
  if (i <= 0) return null; // 첫 단계(자료)는 이전이 없다
  const prev = steps[i - 1];
  const href = stepHref(prev, id);
  if (!href) return null;
  return (
    <Link href={href} className={`back-link ${className}`.trim()}>← 이전</Link>
  );
}
