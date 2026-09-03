"use client";

// 글 길이만큼 **자라는** 여러 줄 입력칸.
//
// ★ 왜 컴포넌트인가. 공용 CSS 가 `textarea.field` 에 `overflow-y: hidden` 을 걸어 둔다
//   (globals.css — 안에서 스크롤하면 앞 문장이 안 보이므로 아래로 미는 쪽을 골랐다).
//   그것은 **자라는 것을 전제한** 설정이라, 자라는 배선이 빠진 칸은 스크롤바도 없이
//   글이 잘린다. 잘린 줄은 화면에 아예 없어서 드래그로 전체를 잡아도 보이는 데까지만
//   잡힌 것처럼 읽힌다 — 사장님이 2026-09-03 에 두 번 짚은 증상이다.
//
// ★★★ 훅(useAutoGrow)만 있던 때에는 열세 자리 중 **셋**에만 걸려 있었다. 같은 증상을
//   하루에 두 번 고치고도 두 번 다 남은 자리를 놓쳤다. **부르는 자리가 잊을 수 없게**
//   만드는 것이 이 컴포넌트의 전부다. 판이 지킨다 — tests/autogrow-field.test.js 는
//   `field` 를 단 raw `<textarea>` 를 보면 빨간불이 된다.
//
// ★ 처음 높이는 `rows`(또는 CSS `min-height`)가 정한다. 높이를 `auto` 로 되돌린 뒤 재므로
//   `scrollHeight` 는 **빈 칸에서도 그 바닥 아래로 안 내려간다** — rows 를 지우지 마라.
// ★ ref 를 받지 않는다 — 지금은 어느 부르는 자리도 이 칸의 DOM 을 따로 만지지 않는다.
//   필요해지면 forwardRef 로 열되, 자라는 일은 그때도 여기 남는다.
import { useRef } from "react";
import { useAutoGrow } from "./useAutoGrow";

export function AutoTextarea({ value, ...rest }) {
  const ref = useRef(null);
  useAutoGrow(ref, value);
  return <textarea ref={ref} value={value} {...rest} />;
}

export default AutoTextarea;
