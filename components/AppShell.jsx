"use client";

// 화면 뼈대 — 로그인 전/승인 대기 화면에는 BETA 배너·사이드바(잠긴 단계 스테퍼)를 씌우지
// 않는다. 기능 결함은 아니었다(자동 fetch도 없고, 링크를 눌러도 middleware가 되돌린다)
// 지만 로그인 화면치고 어색했다 — 아직 들어오지도 않은 사람에게 "잠긴 앱"부터 보여준 셈.
//
// 라우트 그룹((auth)/(app))으로 나누는 대신 pathname으로 가른 이유: 그러려면
// app/page.js·app/create/**·app/costs/** 를 통째로 옮겨야 하고(상대 import 깊이가
// 전부 하나씩 밀린다), 그만큼 손댈 파일과 회귀 위험이 커진다. 여기서는 화면 뼈대 하나만
// 조건부로 그리면 된다 — URL도, middleware의 PUBLIC_PATHS도 그대로다.
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

// middleware.js의 isPublicPath와 같은 방식(세그먼트 경계)으로 비교한다 — "/login-debug"
// 같은 미래 경로가 접두어만 겹친다고 조용히 단독 화면 취급되면 안 된다.
const BARE_PATHS = ["/login", "/pending", "/auth/callback"];
function isBarePath(pathname) {
  return BARE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export default function AppShell({ children }) {
  const pathname = usePathname();

  if (isBarePath(pathname)) {
    return <main className="work">{children}</main>;
  }

  return (
    <>
      <div className="belt">
        <b>BETA</b> 빠른 생성 실험 버전 — 대화로 정보를 모아 최신 비디오 모델에 전달합니다
      </div>
      <div className="shell">
        <Sidebar />
        <main className="work">{children}</main>
      </div>
    </>
  );
}
