export default function Sidebar() {
  return (
    <aside className="side">
      <div className="logo">
        <i>▶</i>shotform
      </div>
      <button className="side-item on">
        <span className="ic">🏠</span>홈 — 빠른 생성
      </button>
      <button className="side-item soon" disabled>
        <span className="ic">✨</span>영상 만들기 (단계별)
        <span className="soon-tag">준비 중</span>
      </button>
      <button className="side-item soon" disabled>
        <span className="ic">📁</span>보관함
        <span className="soon-tag">준비 중</span>
      </button>
      <button className="side-item soon" disabled>
        <span className="ic">🎬</span>템플릿
        <span className="soon-tag">준비 중</span>
      </button>
      <button className="side-item soon" disabled>
        <span className="ic">⚙️</span>설정
        <span className="soon-tag">준비 중</span>
      </button>
      <div className="side-grow" />
      <div className="credit-box">
        실험 모드
        <b>무제한</b>
        <small>테스트 기간에는 크레딧을 차감하지 않아요</small>
      </div>
    </aside>
  );
}
