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

// 사이드바에 있던 것을 그대로 옮겼다(새로 쓰지 않는다).
async function handleLogout(router) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  await supabase.auth.signOut();
  router.push("/login");
}

export default function UserMenu() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  // 진입 때 한 번 읽는다. 실패하면 조용히 숨긴다 — 상단 띠가 오류로 시끄러워질 자리가 아니다.
  useEffect(() => {
    let alive = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setMe(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

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

  if (!me) return null;

  return (
    <div className="um" ref={box}>
      <span className="um-credit">크레딧 <b>{me.balance}</b></span>
      <button
        className="um-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="ic"><Icon name="user" size={16} /></span>
        {me.name}
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
