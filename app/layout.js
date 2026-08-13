import "./globals.css";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
import { ProjectProvider } from "../components/ProjectContext";
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
  title: "shotform — 숏폼 자동 생성",
  description: "대화만 하면 숏폼 영상이 만들어져요",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={`${GeistSans.variable} ${pretendard.variable}`}>
      <body>
        {/* BETA 배너·사이드바는 AppShell이 화면(경로)에 따라 그린다 — 로그인/대기 화면은
            단독 화면이다(components/AppShell.jsx) */}
        {/* 팝업은 한 자리에서 그린다 — 화면마다 만들면 모양이 갈린다(components/DialogProvider.jsx) */}
        <ProjectProvider>
          <DialogProvider>
            <AppShell>{children}</AppShell>
          </DialogProvider>
        </ProjectProvider>
      </body>
    </html>
  );
}
