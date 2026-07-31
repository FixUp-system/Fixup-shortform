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
// BARE_PATHS(사이드바 경계)의 유일한 출처. middleware.js의 PUBLIC_PATHS(로그인 경계)와
// 다른 목록이다 — "/pending"은 로그인은 필요하지만 사이드바는 없어야 한다. 왜 둘로
// 나뉘는지, 왜 합치면 안 되는지는 lib/auth/paths.js 주석 참고.
// 이 모듈은 순수 상수만 담고 있어 next/server 같은 서버 전용 의존을 끌고 오지 않는다 —
// 클라이언트 컴포넌트(AppShell)에서 안전하게 import 할 수 있다.
import { isBarePath } from "../lib/auth/paths.js";

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
