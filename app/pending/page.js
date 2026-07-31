// 승인 대기 화면 — middleware 가 status !== "approved" 인 사용자를 여기로 보낸다.
export default function PendingPage() {
  return (
    <>
      <h1 className="pgtitle">승인을 기다리는 중이에요</h1>
      <p className="pgsub">
        가입은 됐습니다. 운영자가 확인하면 바로 쓰실 수 있어요.
        승인된 뒤에는 <strong>이 화면을 새로고침</strong>하시면 바로 반영됩니다
        (다시 로그인하지 않아도 돼요).
      </p>
    </>
  );
}
