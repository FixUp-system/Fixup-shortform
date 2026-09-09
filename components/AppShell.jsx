"use client";

// 화면 뼈대 — 로그인 전/승인 대기 화면에는 BETA 배너·사이드바(잠긴 단계 스테퍼)를 씌우지
// 않는다. 기능 결함은 아니었다(자동 fetch도 없고, 링크를 눌러도 middleware가 되돌린다)
// 지만 로그인 화면치고 어색했다 — 아직 들어오지도 않은 사람에게 "잠긴 앱"부터 보여준 셈.
//
// 라우트 그룹((auth)/(app))으로 나누는 대신 pathname으로 가른 이유: 그러려면
// app/page.js 와 app/create·app/costs 아래를 통째로 옮겨야 하고(상대 import 깊이가
// ⚠️ 이 파일의 줄 주석에 **별표를 슬래시 뒤에 붙이지 마라**(경로 와일드카드도 안 된다).
//    화면을 소스 문자열로 재는 테스트들이 주석을 지울 때 그 두 글자를 블록 주석의 여는
//    기호로 읽는다. 예전에 이 자리에 경로 와일드카드가 적혀 있었고, 아래 JSX 에 주석을
//    하나 더한 순간 닫는 기호가 생겨 그 사이 20여 줄이 통째로 지워진 것처럼 보였다 —
//    세 테스트가 한꺼번에 빨개졌다(2026-08-18). 파일은 멀쩡했고 재는 쪽이 속은 것이다.
// 전부 하나씩 밀린다), 그만큼 손댈 파일과 회귀 위험이 커진다. 여기서는 화면 뼈대 하나만
// 조건부로 그리면 된다 — URL도, middleware의 PUBLIC_PATHS도 그대로다.
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import UserMenu from "./UserMenu";
// BARE_PATHS(사이드바 경계)의 유일한 출처. middleware.js의 PUBLIC_PATHS(로그인 경계)와
// 다른 목록이다 — "/pending"은 로그인은 필요하지만 사이드바는 없어야 한다. 왜 둘로
// 나뉘는지, 왜 합치면 안 되는지는 lib/auth/paths.js 주석 참고.
// 이 모듈은 순수 상수만 담고 있어 next/server 같은 서버 전용 의존을 끌고 오지 않는다 —
// 클라이언트 컴포넌트(AppShell)에서 안전하게 import 할 수 있다.
import { isBarePath, isLandingPath } from "../lib/auth/paths.js";
// 내 정보 공유본 — 상단바·사이드바·마이페이지가 GET /api/me 를 한 번만 읽어 나눠 쓴다.
// ★ bare 갈래에는 두지 않는다: /login·/pending 에서 그 요청은 401(승인 대기자는 403)이다.
import { MeProvider } from "./MeContext";

export default function AppShell({ children }) {
  const pathname = usePathname();

  if (isBarePath(pathname)) {
    // work--bare — 사이드바가 없으니 기둥(1160)을 화면 가운데로 옮긴다. 새 수식자라
    // 사이드바가 있는 화면(.work 만 쓰는 쪽)에는 새지 않는다.
    return <main className="work work--bare">{children}</main>;
  }

  // 랜딩 — 틀을 걷고 화면을 통째로 내준다(2026-09-09 저녁 사장님 지시: 히어로를 화면
  // 상단에 가득 채우고 브랜드·로그인을 그 위에 얹는다). 사이드바와 띠가 그리던 것은
  // 랜딩이 **자기 껍데기로** 다시 그린다 — 브랜드는 .stage-brand, 신원은 같은 UserMenu.
  // ★ MeProvider 는 남긴다. 그 UserMenu 가 손님(로그인 문)과 들어온 사람(메뉴)을 다
  //   그리기 때문이다. bare 갈래와 다른 점이 이것이다 — 거기는 UserMenu 자체가 없다.
  // ★ work--flush 는 기둥(1160)과 여백을 걷는 수식자다. .work 만 쓰는 화면에는 안 샌다.
  if (isLandingPath(pathname)) {
    return (
      <MeProvider>
        <main className="work work--flush">{children}</main>
      </MeProvider>
    );
  }

  return (
    <MeProvider>
      <div className="belt">
        <span className="belt-side" />
        <span className="belt-mid">
          <b>BETA</b> 시험 서비스 — 대본부터 완성까지 자동으로 만듭니다
        </span>
        <span className="belt-side belt-right">
          <UserMenu />
        </span>
      </div>
      <div className="shell">
        <Sidebar />
        <main className="work">{children}</main>
      </div>
    </MeProvider>
  );
}
