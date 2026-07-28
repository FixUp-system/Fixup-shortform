// 아바타 풀 — 사장님이 사진을 주지 않았을 때 인물 레퍼런스로 쓴다.
//
// lib/voices.js 와 같은 이유로 여기 따로 둔다: 화면(클라이언트)이 import 할 수 있어야 하고,
// fs 를 끌고 오는 모듈에 두면 번들에 fs 가 들어가 빌드가 깨진다. 목록은 순수 데이터다.
//
// 파일은 assets/refs/ 에 둔다(사장님이 직접 넣는다). 파일이 없는 항목은 조용히 빠진다 —
// lib/cast.js 의 availableAvatars 가 걸러낸다.
//
// traits 는 캐스팅 패스에게 주는 설명이다. 코드가 이것으로 문자열 매칭을 하지 않는다 —
// "10세 전후 아이"와 "초등학생"을 코드로 맞추려면 낱말 목록이 필요하고, 그 목록은
// 표현이 조금 달라지면 못 고른다. 고르는 것은 원고를 읽은 LLM 이 한다.
//
// 나중에 아바타 생성 기능이 이 풀을 채운다. 3장이든 30장이든 코드는 같다.
export const AVATARS = [
  { id: "av-child", file: "child.jpg", kind: "person", label: "아이",   traits: "10세 전후 아이" },
  { id: "av-owner", file: "owner.jpg", kind: "person", label: "사장님", traits: "40~60대 남성" },
  { id: "av-adult", file: "adult.jpg", kind: "person", label: "손님",   traits: "20~40대 성인" },
];
