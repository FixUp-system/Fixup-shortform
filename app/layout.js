import "./globals.css";
import Sidebar from "../components/Sidebar";

export const metadata = {
  title: "shotform — 숏폼 자동 생성",
  description: "대화만 하면 숏폼 영상이 만들어져요",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <div className="belt">
          <b>BETA</b> 빠른 생성 실험 버전 — 대화로 정보를 모아 최신 비디오 모델에 전달합니다
        </div>
        <div className="shell">
          <Sidebar />
          <main className="work">{children}</main>
        </div>
      </body>
    </html>
  );
}
