"use client";

// 팝업 한 자리 — 물어보기·알리기·값 받기.
//
// 왜 만들었나: 지우기 확인·크레딧 넣기·비밀번호 재설정이 브라우저 기본 대화상자
// (confirm·alert·prompt)였다. 그것은 OS 창이라 이 어두운 화면 위에 흰 시스템 창이 뜨고,
// 글꼴·색·버튼 모양이 전부 우리 것이 아니다. 무엇보다 **문구를 붙일 자리가 없다** —
// "되돌릴 수 없어요" 같은 말을 제목·본문으로 나눠 보여 줄 수가 없었다(2026-08-13).
//
// ★ 네이티브 <dialog> 위에 얹는다. ESC·포커스 가두기·배경 가림을 브라우저가 이미 한다 —
//   div 로 흉내 내면 그 셋을 손으로 만들어야 하고, 대개 하나를 빠뜨린다.
//
// ★ 약속(Promise)으로 답한다. 부르는 쪽 모양이 옛 confirm/prompt 와 같아서
//   (`if (!(await confirm(...))) return;`) 호출처가 흐트러지지 않는다.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const DialogCtx = createContext(null);

// 화면에서 쓰는 문 — const { confirm, alert, prompt } = useDialog()
export function useDialog() {
  const ctx = useContext(DialogCtx);
  if (!ctx) throw new Error("useDialog 는 DialogProvider 안에서만 쓸 수 있어요");
  return ctx;
}

export default function DialogProvider({ children }) {
  // 지금 떠 있는 것 하나. 겹쳐 띄우지 않는다 — 겹치면 무엇에 답하는 중인지 알 수 없다.
  const [req, setReq] = useState(null);
  const [value, setValue] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  // 답은 **한 번만** 보낸다. ESC 로 닫으면서 onCancel 과 onClose 가 잇달아 오는 브라우저가
  // 있어, 지키지 않으면 같은 약속을 두 번 풀려다 조용히 어긋난다.
  const answer = useCallback((result) => {
    setReq((cur) => {
      cur?.resolve(result);
      return null;
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (req && !el.open) {
      el.showModal();
      // 값을 받는 팝업은 칸에, 나머지는 주 버튼에 초점을 준다.
      requestAnimationFrame(() => {
        if (req.kind === "prompt") inputRef.current?.select();
        else el.querySelector(".dlg-go")?.focus();
      });
    }
    if (!req && el.open) el.close();
  }, [req]);

  const open = useCallback((kind, opts) => {
    const o = typeof opts === "string" ? { body: opts } : opts || {};
    setValue(o.defaultValue ?? "");
    return new Promise((resolve) => setReq({ kind, ...o, resolve }));
  }, []);

  const api = useRef({
    confirm: (opts) => open("confirm", opts),
    alert: (opts) => open("alert", opts),
    prompt: (opts) => open("prompt", opts),
  }).current;

  const onSubmit = (e) => {
    e.preventDefault();
    if (req.kind === "prompt") {
      const v = value.trim();
      // 빈 값은 "취소"가 아니라 "안 채웠다"이다 — 닫지 않고 그 자리에 둔다.
      if (!v && req.required !== false) return inputRef.current?.focus();
      return answer(v);
    }
    answer(true);
  };

  return (
    <DialogCtx.Provider value={api}>
      {children}
      <dialog
        ref={ref}
        className="dlg"
        aria-labelledby="dlg-title"
        /* ESC 는 브라우저가 준다 — 취소로 답한다 */
        onCancel={(e) => { e.preventDefault(); answer(req?.kind === "prompt" ? null : false); }}
        /* 배경(::backdrop)을 눌러 닫는다. <dialog> 자체가 배경까지 차지하므로,
           눌린 자리가 상자 밖이면 배경을 누른 것이다. */
        onClick={(e) => {
          if (e.target === ref.current) answer(req?.kind === "prompt" ? null : false);
        }}
      >
        {req && (
          <form className="dlg-box" method="dialog" onSubmit={onSubmit}>
            {req.title && <h2 className="dlg-title" id="dlg-title">{req.title}</h2>}
            {req.body && <p className="dlg-body">{req.body}</p>}
            {req.kind === "prompt" && (
              <input
                ref={inputRef}
                className="dlg-input"
                type={req.password ? "password" : "text"}
                inputMode={req.numeric ? "numeric" : undefined}
                value={value}
                placeholder={req.placeholder || ""}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
            <div className="dlg-actions">
              {req.kind !== "alert" && (
                <button
                  type="button"
                  className="mini"
                  onClick={() => answer(req.kind === "prompt" ? null : false)}
                >
                  {req.cancelLabel || "취소"}
                </button>
              )}
              <button type="submit" className="mini confirm-btn dlg-go">
                {req.confirmLabel || (req.kind === "alert" ? "확인" : "네")}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </DialogCtx.Provider>
  );
}
