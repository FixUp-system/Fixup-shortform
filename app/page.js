"use client";

import QuickCreate from "../components/QuickCreate";

// 홈은 **빠른 생성**이다 — 사이드바에서 홈을 누르면 대화창이 바로 뜬다.
// 단계별 만들기는 사이드바의 '영상 만들기', 만든 것은 '보관함'이 맡는다.
// 한 화면이 진입로 세 개를 이고 있으면 무엇을 하러 온 화면인지 흐려진다.
export default function Home() {
  return (
    <>
      <h1 className="pgtitle">
        빠른 생성 <small className="badge warn">실험</small>
      </h1>
      <p className="pgsub">
        대화로 필요한 정보만 모아서 비디오 모델에 바로 전달해요. 결과는 5~10초
        단일 클립이에요.
      </p>
      <QuickCreate />
    </>
  );
}
