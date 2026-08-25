"use client";

import Link from "next/link";
import { reelPrevStep, reelStepHref } from "../lib/reel/steps";

// 되돌아가는 버튼 — **그리는 곳은 여기 하나다**(2026-08-25 사장님 지시).
//
// ★ 이름은 앞 단계 이름을 빌리지 않고 늘 "이전으로"다. 화면마다 [시나리오로]·[그림으로]로
//   달라지니 같은 버튼으로 안 읽혔다 — 사장님이 "위치가 전부 다르다"고 한 자리가 여기다.
//   이름이 고정이라 받침에 따른 조사 계산(lib/josa.js 의 euroRo)도 화면에서 사라진다.
// ★ 앞 단계 판정은 표(REEL_STEPS)가 쥔다 — 화면이 손으로 적으면 단계 순서가 바뀔 때
//   그 화면만 낡는다.
// ★ 첫 단계에서는 아무것도 안 그린다 — 돌아갈 곳이 없다.
export default function ReelBack({ step, id }) {
  const prev = reelPrevStep(step);
  if (!prev) return null;
  return (
    <Link className="mini" href={reelStepHref(prev, id)}>
      ← 이전으로
    </Link>
  );
}
