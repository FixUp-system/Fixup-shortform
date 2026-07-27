"use client";

// ④ 목소리 — 대본을 읽어 컷별 실제 길이를 확정하는 단계 (P0)
import SoonStep from "../../../../components/SoonStep";

export default function VoiceStepPage() {
  return (
    <SoonStep
      title="목소리를 입힙니다"
      what="승인된 대본을 읽어 내레이션을 만들고, 컷마다 실제로 몇 초가 걸리는지 확정합니다. 지금 대본 화면에 보이는 '약 N초'는 글자 수로 어림잡은 값이고, 여기서 나온 길이가 진짜입니다 — 영상 클립 길이도 이 값을 따릅니다."
      when="로드맵 P0 (TTS 어댑터 + 컷별 타임스탬프)"
      backKey="voice"
    />
  );
}
