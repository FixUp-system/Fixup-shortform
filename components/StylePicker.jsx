"use client";

// 영상 컨셉 고르기 — 칩 넷과 보정 한 줄.
//
// 두 자리에서 쓴다: 자료를 넣는 화면(/create, 프로젝트가 없어 로컬 state)과
// ①자료 화면(프로젝트가 있어 PATCH). 그래서 이 컴포넌트는 저장을 모른다 —
// 값과 콜백만 받는다. 저장 방식이 다른 두 화면에 같은 칩을 두 벌 그리면
// 한쪽만 고치는 날이 오고, 그때 사장님이 보는 컨셉 목록이 화면마다 달라진다.
import { STYLE_PRESETS, STYLE_NOTE_MAX, styleFor } from "../lib/styles";

export default function StylePicker({ preset, note, onPreset, onNote, onNoteCommit, disabled, warn }) {
  const current = styleFor(preset);
  return (
    <>
      <div className="eyebrow">영상 컨셉 <small>이 그림으로 영상이 만들어져요</small></div>
      <div className="chips">
        {STYLE_PRESETS.map((s) => (
          <button key={s.id} className={`chip${current.id === s.id ? " on" : ""}`}
            disabled={disabled} onClick={() => onPreset(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="script-src">{current.desc}</div>
      {warn && <div className="script-src warn">{warn}</div>}
      <div className="fix-row">
        <textarea className="sent-input fix-input" maxLength={STYLE_NOTE_MAX}
          placeholder='컨셉 보정 (예: "따뜻한 파스텔톤", "80년대 애니 느낌")'
          value={note} disabled={disabled}
          onChange={(e) => onNote(e.target.value)}
          onBlur={onNoteCommit} />
      </div>
    </>
  );
}
