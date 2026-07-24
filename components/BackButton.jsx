"use client";

// 이전 단계로 돌아가는 링크. 현재 단계가 첫 단계면 아무것도 그리지 않는다.
// 단계 순서·주소는 lib/steps 하나만 본다.
import Link from "next/link";
import { useParams } from "next/navigation";
import { STEPS, stepHref } from "../lib/steps";

export default function BackButton({ stepKey }) {
  const { id } = useParams();
  const i = STEPS.findIndex((s) => s.key === stepKey);
  if (i <= 0) return null; // 첫 단계(자료)는 이전이 없다
  const prev = STEPS[i - 1];
  const href = stepHref(prev, id);
  if (!href) return null;
  return (
    <Link href={href} className="back-link">← {prev.label}</Link>
  );
}
