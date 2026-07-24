"use client";

// ⑥ 완성 — 자막·병합·믹싱·인코딩을 거친 최종본 (P1)
import SoonStep from "../../../../components/SoonStep";

export default function DoneStepPage() {
  return (
    <SoonStep
      title="완성본을 내려받습니다"
      what="컷을 이어 붙이고 내레이션과 배경음을 섞고, 목소리 타이밍에 맞춰 자막을 얹습니다. 자막은 틱톡·릴스 UI에 가리지 않는 위치에 놓이고, 9:16으로 인코딩해 바로 올릴 수 있는 파일이 나옵니다."
      when="로드맵 P1 (ffmpeg 병합 · 자막 세이프존 · 라우드니스 정규화)"
    />
  );
}
