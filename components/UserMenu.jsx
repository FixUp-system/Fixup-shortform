"use client";

// 상단 우측 계정 묶음 — 크레딧 잔액 + 이름 버튼 + 드롭다운(마이페이지·로그아웃).
//
// 사이드바에 흩어져 있던 "내 계정에 관한 것"을 한 자리로 모은다.
// 로그인·승인대기 화면에는 자동으로 안 나온다 — AppShell 이 isBarePath 로 갈라
// .belt 자체를 안 그린다.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import Icon from "./Icon";
// 내 정보는 직접 읽지 않는다 — AppShell 이 세운 공유본에서 받는다(components/MeContext.jsx).
// 예전에는 여기서 한 번, 사이드바에서 또 한 번 GET /api/me 를 불렀고, 마이페이지에서 이름을
// 바꿔도 이 버튼은 옛 이름을 그대로 들고 있었다(새로고침해야 반영).
import { useMe } from "./MeContext";
import { formatCredits } from "../lib/pricing";
import { CREDITS_TAB_HREF, ME_TAB_EVENT } from "../lib/me-tab";

// 사이드바에 있던 것을 그대로 옮겼다(새로 쓰지 않는다).
async function handleLogout(router) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  await supabase.auth.signOut();
  router.push("/login");
}

// ★★★ 2026-09-14 — `initialGuest` 는 **서버가 이미 아는 답**이다.
//
// 이 부품은 브라우저에서 `/api/me` 를 불러 손님인지 가른다. 그래서 그 답이 오기 전
// 첫 그림에는 늘 계정 버튼("내 계정")이 찍혔고, 손님에게는 그것이 **없는 계정을 가진 것처럼**
// 보였다가 [로그인] 으로 바뀌었다(2026-09-14 랜딩에서 실측 — 손님이 처음 닿는 화면이라
// 그 깜빡임이 그대로 보인다).
//
// 랜딩은 **서버 컴포넌트**라 요청 헤더로 신원을 이미 안다(app/home/page.js). 그 값을
// 내려 주면 첫 그림부터 맞는 버튼이 선다 — 판정을 두 벌로 만드는 것이 아니라,
// **같은 판정의 답을 먼저 아는 쪽이 알려 주는 것**이다.
//   · 답이 오기 전(`!ready`)에만 쓴다 — 온 뒤에는 `/api/me` 가 유일한 진실이다
//     (다른 탭에서 로그인·로그아웃하면 이 값이 낡는다)
//   · 안 넘기면 옛 동작 그대로다(기본 false) — 앱 틀의 상단바는 손대지 않았다
export default function UserMenu({ initialGuest = false }) {
  const router = useRouter();
  // 공유본이 진입 때 한 번 읽는다. 실패하면 여기서는 조용히 넘긴다(값이 null 로 남을 뿐) —
  // 상단 띠가 오류로 시끄러워질 자리가 아니다. 다만 **묶음을 통째로 숨기지는 않는다**
  // (아래 주석 참고). 마이페이지가 이름을 저장한 뒤 공유본을 다시 읽으면 이 버튼도 함께 바뀐다.
  const { me, guest, ready } = useMe();
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  // 바깥 클릭·Esc 로 닫는다. 열려 있을 때만 듣는다.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // ★ 로그아웃은 이제 화면에서 여기 하나뿐이다(사이드바에서 옮겨 왔다). 그래서 내 정보를
  // 못 읽었다고 묶음을 통째로 숨기면 **세션을 끊을 방법이 아무 데도 없어진다** — 라이브
  // GET /api/me 가 실제로 500 이었다(profiles.display_name 컬럼 없음). 데이터가 있어야
  // 하는 것(크레딧)만 가리고, 이름 자리는 기본 라벨로 채워 빈 버튼을 만들지 않는다.
  // ★★ 손님에게는 **[로그인] 하나**다(2026-08-27 사장님 지시: 보관함은 그냥 보고,
  //   상세 기능을 쓰려면 로그인·회원가입). 계정 메뉴(마이페이지·로그아웃)를 그리면
  //   있지도 않은 계정을 가진 것처럼 읽힌다.
  //   ★ 가입도 그 화면에 있다(app/login/page.js 의 탭) — 문을 둘로 만들지 않는다.
  if (guest || (initialGuest && !ready)) {
    return (
      <div className="um">
        <Link href="/login" className="um-btn">
          <span className="ic"><Icon name="user" size={16} /></span>
          로그인
        </Link>
      </div>
    );
  }

  return (
    <div className="um" ref={box}>
      {/* ★★ 잔액 — 로그인했으면 **늘** 보인다(2026-09-14 결정 뒤집힘, 사장님: "상단바 잔액이 없는데?").
          그 전에는 크레딧을 걷지 않는 동안(gated:false) 숨겼다(08-14 결정). 와디즈 서포터는 걷지 않는 동안에도
          받은 크레딧이 들어왔는지 봐야 한다 — 마이페이지 크레딧 절을 늘 그리기로 한 것과 같은 방향이다.
          내부 계정(차감 면제)은 잔액 뒤에 그 사실을 붙인다.
          ★ 누르면 마이페이지 [크레딧] 탭. 이미 /me 에 있으면 Next 가 다시 그리지 않아 탭이 안 바뀌므로
            신호를 함께 보낸다(lib/me-tab.js). */}
      {me && (
        <Link href={CREDITS_TAB_HREF} className="um-credit" onClick={() => window.dispatchEvent(new Event(ME_TAB_EVENT))}>
          크레딧 <b>{formatCredits(me.balance)}</b>{me.internal === true && " · 내부"}
        </Link>
      )}
      <button
        className="um-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="ic"><Icon name="user" size={16} /></span>
        {me?.name || "내 계정"}
        <span className="ic"><Icon name="caret" size={14} /></span>
      </button>
      {open && (
        <div className="um-menu" role="menu">
          <Link href="/me" className="um-item" role="menuitem" onClick={() => setOpen(false)}>
            <span className="ic"><Icon name="gear" size={16} /></span>마이페이지
          </Link>
          <button className="um-item" role="menuitem" onClick={() => handleLogout(router)}>
            <span className="ic"><Icon name="power" size={16} /></span>로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
