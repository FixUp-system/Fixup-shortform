"use client";

import Link from "next/link";
import QuickCreate from "../components/QuickCreate";

// 홈은 **만드는 자리**다. 지금까지 만든 것은 보관함(/archive)이 맡는다 —
// 한 화면이 목록과 생성을 둘 다 이고 있으면 무엇을 하러 온 화면인지 흐려진다.
export default function Home() {
  return (
    <>
      <div className="home-header">
        <h1 className="pgtitle">새 영상 만들기</h1>
        <Link href="/archive" className="cta ghost">
          보관함 →
        </Link>
      </div>

      <section className="home-start">
        <h2 className="eyebrow">단계별로 만들기</h2>
        <p className="pgsub">
          자료를 넣으면 대본·목소리·그림·영상을 단계마다 확인하며 완성본까지 만들어요.
        </p>
        <Link href="/create" className="cta">
          + 시작하기
        </Link>
      </section>

      <section className="home-quick">
        <h2 className="eyebrow">
          빠른 생성 <small className="badge warn">실험</small>
        </h2>
        <p className="pgsub">
          대화로 필요한 정보만 모아서 비디오 모델에 바로 전달해요. 결과는 5~10초
          단일 클립이에요.
        </p>
        <QuickCreate />
      </section>
    </>
  );
}
