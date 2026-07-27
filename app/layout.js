import "./globals.css";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
import Sidebar from "../components/Sidebar";
import { ProjectProvider } from "../components/ProjectContext";

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
        <div className="belt">
          <b>BETA</b> 빠른 생성 실험 버전 — 대화로 정보를 모아 최신 비디오 모델에 전달합니다
        </div>
        <ProjectProvider>
          <div className="shell">
            <Sidebar />
            <main className="work">{children}</main>
          </div>
        </ProjectProvider>
      </body>
    </html>
  );
}
