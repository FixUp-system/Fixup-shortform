// 승인 대기 화면 — middleware 가 status !== "approved" 인 사용자를 여기로 보낸다.
import CreditCodeForm from "../../components/CreditCodeForm";

export default function PendingPage() {
  return (
    <>
      <h1 className="pgtitle">승인을 기다리는 중이에요</h1>
      <p className="pgsub">
        가입은 됐습니다. 운영자가 확인하면 바로 쓰실 수 있어요.
        승인된 뒤에는 <strong>이 화면을 새로고침</strong>하시면 바로 반영됩니다
        (다시 로그인하지 않아도 돼요).
      </p>
      {/* ★ 와디즈 서포터는 승인 전에도 메일로 받은 코드를 넣어 둘 수 있다(2026-09-14 A안) —
          크레딧은 바로 쌓이고, 운영자는 /admin/codes 에서 코드를 넣은 계정을 알아보고 승인한다. */}
      <p className="pgsub">와디즈에서 받은 크레딧 코드가 있으면 지금 넣어 두세요.</p>
      <CreditCodeForm pending />
    </>
  );
}
