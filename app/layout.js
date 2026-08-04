import "./globals.css";
import localFont from "next/font/local";
import { ProjectProvider } from "../components/ProjectContext";
import AppShell from "../components/AppShell";

// 서체는 Pretendard 한 벌이다 — 한글·라틴·숫자를 한 골격으로 설계한 서체라
// "3 목소리"처럼 섞여 쓰는 자리에서 숫자가 겉돌지 않는다.
// 예전에는 Geist가 라틴·숫자를 맡고 한글만 Pretendard로 폴백했는데, 그 조합이
// 한 낱말 안에서 두 서체를 섞어 이질감을 만들었다(실측 후 걷어냈다).
//
// 파일은 npm 패키지 pretendard 에서 app/fonts 로 복사해 둔 것 — 빌드 재현성을 위해
// CDN 링크를 쓰지 않는다. 서체 인상이 기대와 다르면 이 파일만 되돌리면 된다.
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "400 800",
  display: "swap",
});

export const metadata = {
  title: "shotform — 숏폼 자동 생성",
  description: "대화만 하면 숏폼 영상이 만들어져요",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>
        {/* BETA 배너·사이드바는 AppShell이 화면(경로)에 따라 그린다 — 로그인/대기 화면은
            단독 화면이다(components/AppShell.jsx) */}
        <ProjectProvider>
          <AppShell>{children}</AppShell>
        </ProjectProvider>
      </body>
    </html>
  );
}
