"use client";

// 아직 만들지 않은 단계의 자리표시 — 로드맵 어디쯤에 있는지까지 알려준다.
import Link from "next/link";
import { useParams } from "next/navigation";

export default function SoonStep({ title, what, when }) {
  const { id } = useParams();
  return (
    <section className="panel" style={{ maxWidth: 760 }}>
      <h2>{title} <span className="badge ai">준비 중</span></h2>
      <p className="pgsub" style={{ marginTop: 6 }}>{what}</p>
      <div className="script-src">계획: {when}</div>
      <Link className="mini" href={`/create/${id}`} style={{ display: "inline-block", marginTop: 16 }}>
        진행 중인 단계로 돌아가기
      </Link>
    </section>
  );
}
