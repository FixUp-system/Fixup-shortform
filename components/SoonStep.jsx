"use client";

// 아직 만들지 않은 단계의 자리표시 — 로드맵 어디쯤에 있는지까지 알려준다.
// backKey가 있으면 하단 액션 바에 이전 단계로 가는 버튼을 둔다(영상 단계는 넘기지 않아 없음).
import BackButton from "./BackButton";

export default function SoonStep({ title, what, when, backKey }) {
  return (
    <section className="panel" style={{ maxWidth: 760 }}>
      <h2>{title} <span className="badge ai">준비 중</span></h2>
      <p className="pgsub" style={{ marginTop: 6 }}>{what}</p>
      <div className="script-src">계획: {when}</div>
      {backKey && (
        <div className="step-actions">
          <BackButton stepKey={backKey} />
        </div>
      )}
    </section>
  );
}
