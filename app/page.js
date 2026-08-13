import { redirect } from "next/navigation";

// 루트는 **단계별 흐름의 첫 화면**으로 보낸다.
//
// 여기는 원래 "빠른 생성"(자료 한 번 적으면 ①~⑥ 을 검토 없이 관통하는 모드)이었다.
// 2026-08-13 에 화면에서 내렸다 — 만드는 길이 둘이면 사장님이 무엇을 하러 온 화면인지
// 흐려지고, 두 길의 화면·문구를 계속 나란히 손봐야 한다.
//
// ★ 뒷단은 **그대로 살아 있다**: components/QuickCreate.jsx · lib/auto.js ·
//   POST /api/projects/[id]/auto. 되살릴 때 커밋을 뒤지지 않아도 되게 남겨 뒀다.
//   (지금은 아무 화면도 QuickCreate 를 그리지 않는다.)
export default function Home() {
  redirect("/create");
}
