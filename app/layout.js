import "./globals.css";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
import { ProjectProvider } from "../components/ProjectContext";
import { AdProjectProvider } from "../components/AdProjectContext";
import { FilmProjectProvider } from "../components/FilmProjectContext";
import { ReelProjectProvider } from "../components/ReelProjectContext";
import AppShell from "../components/AppShell";
import DialogProvider from "../components/DialogProvider";

// 라틴·숫자는 Geist가, 한글은 Pretendard가 받는다 (Geist에 한글 글리프가 없다).
// 파일은 npm 패키지 pretendard 에서 app/fonts 로 복사해 둔 것 — 빌드 재현성을 위해
// CDN 링크를 쓰지 않는다. 서체 인상이 기대와 다르면 이 파일만 되돌리면 된다.
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "400 800",
  display: "swap",
});

export const metadata = {
  title: "shortform — 숏폼 자동 생성",
  description: "대화만 하면 숏폼 영상이 만들어져요",
};

export default function RootLayout({ children }) {
  return (
    // ★ 2026-09-08 — 벌이 하나(밝은 벌)로 합쳐지면서 테마를 먼저 칠하던 <head> 인라인
    //   스크립트를 걷어냈다. 고를 것이 없으니 첫 칠 전에 정할 것도 없다.
    //   ★ `suppressHydrationWarning` 은 **남긴다.** 그 스크립트가 리액트보다 먼저 루트 요소에
    //     속성을 찍어 hydration 불일치를 냈던 것이 원래 이유였는데(2026-09-01 사장님 지적:
    //     개발에서는 오버레이가 화면을 덮고, 운영에서는 조용히 루트부터 다시 그린다),
    //     확장 프로그램도 같은 자리에 속성을 찍어 같은 증상을 낸다.
    //   ★ 범위는 **이 요소의 속성 한 겹**뿐이다 — 아래 트리의 hydration 검사는 그대로 산다.
    <html
      lang="ko"
      className={`${GeistSans.variable} ${pretendard.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* BETA 배너·사이드바는 AppShell이 화면(경로)에 따라 그린다 — 로그인/대기 화면은
            단독 화면이다(components/AppShell.jsx) */}
        {/* 팝업은 한 자리에서 그린다 — 화면마다 만들면 모양이 갈린다(components/DialogProvider.jsx) */}
        <ProjectProvider>
          {/* 광고와 단계별 만들기가 각자 공유본을 쥔다. 팝업은 그 둘 안쪽에서
              어느 화면이든 부를 수 있어야 한다(components/DialogProvider.jsx). */}
          <AdProjectProvider>
            {/* ★★ 한 번에 굽는 영상의 공유본도 **여기**다(2026-08-21). 처음에는
                app/film/[id]/layout.js 안에 두었는데, 그러면 사이드바보다 **아래**라
                사이드바가 못 읽는다 — 그래서 단계 목록을 본문에 그렸고, 사이드바용
                클래스를 본문에 써서 모양이 깨졌다. 옆의 둘과 같은 자리에 둔다. */}
            <FilmProjectProvider>
              {/* ★★ reel(컷마다 말하는 영상)의 공유본도 **여기**다(2026-08-25). 바로 위
                  film 이 치른 값과 같은 값이다 — 공급자가 app/reel/[id]/layout.js 안에
                  있으면 사이드바보다 아래라 단계 목록을 사이드바에서 그릴 수 없다. */}
              <ReelProjectProvider>
                <DialogProvider>
                  <AppShell>{children}</AppShell>
                </DialogProvider>
              </ReelProjectProvider>
            </FilmProjectProvider>
          </AdProjectProvider>
        </ProjectProvider>
      </body>
    </html>
  );
}
