"use client";

// 여러 줄 입력칸이 **글 길이만큼 자라게** 한다 — 칸 안에서 스크롤하지 않는다.
//
// ★★★ **부르는 자리는 이 훅을 직접 쓰지 않는다 — `components/AutoTextarea.jsx` 를 쓴다.**
//   훅만 있던 때에는 열세 자리 중 셋만 걸려 있었고, 같은 증상을 하루에 두 번 고치고도
//   두 번 다 남은 자리를 놓쳤다(2026-09-03). 훅은 이제 그 컴포넌트 하나가 부른다.
//
// (처음 이 훅이 생긴 사연) 그전에는 같은 다섯 줄이 두 화면에 복사돼
//   있었고(`app/create` · `app/ads/new`), **단계별(`app/reel/new`)에는 아예 없었다.**
//   그 빠진 자리가 사장님이 짚은 증상의 뿌리다: 공용 규칙이 `textarea.field` 에
//   `overflow-y: hidden` 을 걸어 두었는데(자라는 것을 전제한 설정이다) 자라지 않으니,
//   132px 를 넘긴 글이 **스크롤바도 없이 잘렸다.** 방향키로는 움직이는데 얼마나 더
//   있는지 알 수 없고, 그래서 드래그가 어디까지 잡혔는지도 알 수 없었다.
//
// ★ `height = "auto"` 를 먼저 넣는 이유: scrollHeight 는 **현재 높이보다 작아지지 않는다**.
//   지우지 않으면 글을 지워도 칸이 안 줄어든다.
// ★ 값이 바뀔 때마다 다시 잰다 — 붙여넣기·지우기·초기 로드 전부 이 한 자리를 지난다.
import { useEffect } from "react";

export function useAutoGrow(ref, value) {
  useEffect(() => {
    const el = ref?.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

export default useAutoGrow;
