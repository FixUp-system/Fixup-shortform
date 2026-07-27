"use client";

// ⑤ 영상 — 승인된 이미지를 각 컷의 시작 프레임으로 삼아 클립 생성 (P1)
import SoonStep from "../../../../components/SoonStep";

export default function VideoStepPage() {
  return (
    <SoonStep
      title="컷을 영상으로 만듭니다"
      what="승인된 이미지가 각 컷의 시작 프레임이 되고, 목소리에서 확정된 길이만큼 움직입니다. 만들어진 클립은 자동 검수를 거치며, 마음에 안 드는 컷만 골라 다시 만들 수 있습니다."
      when="로드맵 P1 (영상 어댑터 연결 + 클립 QC)"
    />
  );
}
