import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { USER_HEADER } from "../lib/auth/headers.js";

// 루트는 **지금 쓰는 흐름의 첫 화면**으로 보낸다.
//
// ★★ 2026-08-25 — 사이드바에서 단계별·수정을 걸렀는데(SIDEBAR_FLOWS)
//   여기가 그대로 /create 를 가리켜, 주소창에 아무것도 안 치고 들어오면
//   **걸러낸 흐름이 첫 화면으로** 떴다. 숨김 판정은 사이드바 하나가 아니라
//   **들어오는 문 전부**가 같은 곳을 봐야 한다.
//
// 여기는 원래 "빠른 생성"(자료 한 번 적으면 ①~⑥ 을 검토 없이 관통하는 모드)이었다.
// 2026-08-13 에 화면에서 내렸다 — 만드는 길이 둘이면 사장님이 무엇을 하러 온 화면인지
// 흐려지고, 두 길의 화면·문구를 계속 나란히 손봐야 한다.
//
// ★ 뒷단은 **그대로 살아 있다**: components/QuickCreate.jsx · lib/auto.js ·
//   POST /api/projects/[id]/auto. 되살릴 때 커밋을 뒤지지 않아도 되게 남겨 뒀다.
//   (지금은 아무 화면도 QuickCreate 를 그리지 않는다.)
// ★★ 2026-08-27 — **들어오는 문이 갈린다**(사장님 지시: "기본으로 보관함 바로 확인하고
//   상세 기능들을 사용하려면 로그인 및 회원가입 해야 볼 수 있는 걸로").
//   · 로그인했으면 → 만들기 첫 화면(하던 일로 바로 간다)
//   · 아니면 → 보관함(결과물부터 보여 준다. 만드는 문은 로그인이 지킨다)
//
// ★ 신원은 middleware 가 요청 헤더에 넣어 준 값을 읽기만 한다 — 여기서 세션을 다시 확인하면
//   그 판정이 두 벌이 된다(lib/auth/require-user.js 와 같은 규율).
// ★ 손님이 이 자리에 닿으려면 `/` 가 손님 목록에 있어야 한다(lib/auth/guest.js).
//   스위치가 꺼져 있으면 middleware 가 그 앞에서 /login 으로 보내므로 예전과 같다.
export default async function Home() {
  const id = (await headers()).get(USER_HEADER);
  redirect(id ? "/reel/new" : "/archive");
}
