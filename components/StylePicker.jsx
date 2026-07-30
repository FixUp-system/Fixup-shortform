"use client";

// 영상 컨셉 고르기 — 칩과 보정 한 줄.
//
// 두 자리에서 쓴다: 자료를 넣는 화면(/create, 프로젝트가 없어 로컬 state)과
// ①자료 화면(프로젝트가 있어 PATCH). 그래서 이 컴포넌트는 저장을 모른다 —
// 값과 콜백만 받는다. 저장 방식이 다르다고 칩을 두 벌 그리면 한쪽만 고치는 날이 오고,
// 그때 사장님이 보는 컨셉 목록이 화면마다 달라진다.
//
// bare=true 는 입력 박스의 서랍 안에서 쓰는 모양이다 — 박스가 이미 라벨을 이고 있어
// 제목을 또 붙이면 같은 말이 두 번 나온다. 목록·설명·보정은 그대로 공유한다.
import { STYLE_PRESETS, STYLE_NOTE_MAX, styleFor } from "../lib/styles";

export default function StylePicker({
  preset, note, onPreset, onNote, onNoteCommit, disabled, warn, bare,
}) {
  const current = styleFor(preset);
  return (
    <>
      {!bare && <div className="eyebrow">영상 컨셉 <small>이 그림으로 영상이 만들어져요</small></div>}
      <div className="chips">
        {STYLE_PRESETS.map((s) => (
          <button key={s.id} className={`chip${current.id === s.id ? " on" : ""}`}
            disabled={disabled} onClick={() => onPreset(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className={bare ? "tray-note" : "script-src"}>{current.desc}</div>
      {warn && <div className={bare ? "tray-note" : "script-src warn"}>{warn}</div>}
      {bare ? (
        <textarea className="tray-input" maxLength={STYLE_NOTE_MAX}
          placeholder='더 바라는 결이 있으면 한 줄 (예: "따뜻한 파스텔톤")'
          value={note} disabled={disabled}
          onChange={(e) => onNote(e.target.value)} onBlur={onNoteCommit} />
      ) : (
        <div className="fix-row">
          <textarea className="sent-input fix-input" maxLength={STYLE_NOTE_MAX}
            placeholder='컨셉 보정 (예: "따뜻한 파스텔톤", "80년대 애니 느낌")'
            value={note} disabled={disabled}
            onChange={(e) => onNote(e.target.value)} onBlur={onNoteCommit} />
        </div>
      )}
    </>
  );
}
