"use client";

import { useEffect, useRef, useState } from "react";

const GREETING =
  "안녕하세요! 어떤 영상을 만들까요? 한 줄로 편하게 알려주세요.";
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

export default function Home() {
  const [messages, setMessages] = useState([
    { role: "ai", text: GREETING, hint: '예: "신메뉴 딸기라떼 홍보 영상 만들어줘"' },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false); // 대화 응답 또는 영상 생성 중
  const [genParams, setGenParams] = useState(null); // 마지막 generate 파라미터 (다시 생성용)
  const chatRef = useRef(null);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function push(msg) {
    setMessages((prev) => [...prev, msg]);
  }

  async function generateVideo(params, history) {
    push({ role: "ai", text: "영상을 만드는 중이에요… 보통 1~3분 걸려요.", spinner: true });
    try {
      const submitRes = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const submit = await submitRes.json();
      if (!submitRes.ok || !submit.request_id) {
        throw new Error(submit.error || "영상 생성 요청 실패");
      }

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const stRes = await fetch(
          `/api/video/status?id=${encodeURIComponent(submit.request_id)}`
        );
        const st = await stRes.json();
        if (st.status === "done" && st.video_url) {
          setMessages((prev) => [
            ...prev.filter((m) => !m.spinner),
            {
              role: "ai",
              text: "완성! 재생해 보세요.",
              video: st.video_url,
              aspect: params.aspect_ratio,
            },
          ]);
          return;
        }
        if (st.status === "error") {
          throw new Error(st.error || "생성 실패");
        }
        // queued / running → 계속 폴링
      }
      throw new Error("시간이 너무 오래 걸려서 중단했어요");
    } catch (e) {
      setMessages((prev) => [
        ...prev.filter((m) => !m.spinner),
        {
          role: "ai",
          text: `영상 생성에 실패했어요 — ${e.message}`,
          retry: true,
        },
      ]);
    }
  }

  async function send(text) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    setBusy(true);

    const history = [...messages, { role: "me", text: trimmed }];
    push({ role: "me", text: trimmed });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history
            .filter((m) => !m.spinner && !m.video)
            .map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "대화 실패");

      if (data.action === "ask") {
        push({ role: "ai", text: data.message, quickReplies: data.quick_replies });
      } else if (data.action === "generate") {
        const params = {
          prompt: data.prompt,
          duration: data.duration,
          aspect_ratio: data.aspect_ratio,
        };
        setGenParams(params);
        push({
          role: "ai",
          text: `정리했어요 — ${data.summary || "요청하신 내용"}\n(${data.duration}초 · ${data.aspect_ratio})\n아래 버튼을 누르면 영상 생성을 시작해요. 바꾸고 싶은 게 있으면 그냥 이어서 말씀해 주세요.`,
          confirm: true,
          params,
        });
      } else {
        throw new Error("알 수 없는 응답");
      }
    } catch (e) {
      push({ role: "ai", text: `문제가 생겼어요 — ${e.message}`, retry: false });
    } finally {
      setBusy(false);
    }
  }

  async function confirmGenerate(idx) {
    if (busy) return;
    const msg = messages[idx];
    if (!msg?.params) return;
    setBusy(true);
    // 이 제안의 확인 버튼 제거 (중복 클릭 방지)
    setMessages((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, confirm: false } : m))
    );
    await generateVideo(msg.params, messages);
    setBusy(false);
  }

  async function regenerate() {
    if (!genParams || busy) return;
    setBusy(true);
    push({ role: "me", text: "다시 생성해줘" });
    await generateVideo(genParams, messages);
    setBusy(false);
  }

  return (
    <>
      <h1 className="pgtitle">
        홈 — 빠른 생성{" "}
        <span className="badge warn" style={{ verticalAlign: "3px" }}>
          실험
        </span>
      </h1>
      <p className="pgsub">
        대화로 필요한 정보만 모아서 비디오 모델에 바로 전달해요. 결과는 5~10초
        단일 클립이에요.
      </p>

      <div className="chat-wrap">
        <div className="chat-card">
          <div className="chat" ref={chatRef}>
            {messages.map((m, i) => (
              <div key={i}>
                <div className={`msg ${m.role}`}>
                  {m.role === "ai" && <span className="who">▶</span>}
                  <div className="bub">
                    {m.spinner ? (
                      <span className="gen-bub">
                        <span className="spin" />
                        {m.text}
                      </span>
                    ) : (
                      m.text
                    )}
                    {m.hint && <small>{m.hint}</small>}
                    {m.video && (
                      <>
                        <video
                          className={`vid-result${m.aspect === "16:9" ? " wide" : ""}`}
                          src={m.video}
                          controls
                          playsInline
                          loop
                        />
                        <div className="res-ops">
                          <button className="mini" onClick={regenerate} disabled={busy}>
                            다시 생성
                          </button>
                          <a className="mini" href={m.video} target="_blank" rel="noreferrer"
                            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                            원본 열기
                          </a>
                        </div>
                      </>
                    )}
                    {m.params && (
                      <details open={!!m.confirm}>
                        <summary>모델에 전달할 프롬프트 {m.confirm ? "(수정 가능)" : "보기"}</summary>
                        {m.confirm ? (
                          <textarea
                            className="prompt-edit"
                            defaultValue={m.params.prompt}
                            onChange={(e) => {
                              const v = e.target.value;
                              setMessages((prev) =>
                                prev.map((mm, ii) =>
                                  ii === i
                                    ? { ...mm, params: { ...mm.params, prompt: v } }
                                    : mm
                                )
                              );
                              setGenParams((p) => (p ? { ...p, prompt: v } : p));
                            }}
                          />
                        ) : (
                          <div className="prompt-full">{m.params.prompt}</div>
                        )}
                      </details>
                    )}
                    {m.confirm && (
                      <div className="res-ops">
                        <button
                          className="mini confirm-btn"
                          onClick={() => confirmGenerate(i)}
                          disabled={busy}
                        >
                          🎬 영상 만들기
                        </button>
                      </div>
                    )}
                    {m.retry && (
                      <div className="res-ops">
                        <button className="mini" onClick={regenerate} disabled={busy || !genParams}>
                          다시 시도
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {m.quickReplies && m.quickReplies.length > 0 && i === messages.length - 1 && (
                  <div className="quick">
                    {m.quickReplies.map((q) => (
                      <button key={q} onClick={() => send(q)} disabled={busy}>
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="chat-input">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="만들고 싶은 영상을 알려주세요…"
              disabled={busy}
              aria-label="메시지 입력"
            />
            <button onClick={() => send(input)} disabled={busy || !input.trim()}>
              {busy ? "진행 중…" : "보내기"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
