"use client";

// 빠른 생성 — 대화 몇 번으로 완성 영상(낭독·자막 포함)을 만든다.
// 대화가 자료·길이·비율·화풍·목소리를 모으면, 백엔드가 단계별 파이프라인을
// 검토 게이트 없이 자동 관통한다(POST /api/projects → POST /api/projects/[id]/auto).
// 진행은 GET /api/projects/[id] 폴링으로 본다 — auto.stage 가 진실의 원천이다.
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { STYLE_PRESETS } from "../lib/styles";
import { STEPS, stepHref, currentStepKey } from "../lib/steps";

const GREETING = "안녕하세요! 어떤 영상을 만들까요? 한 줄로 편하게 알려주세요.";
const POLL_INTERVAL_MS = 5000;
// 전체 파이프라인(대본→목소리→그림→클립→합성)이라 t2v 시절 3분으로는 모자라다.
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

const STAGE_LABELS = {
  briefing: "자료를 정리하는 중",
  script: "대본을 쓰는 중",
  cuts: "장면을 나누는 중",
  voice: "목소리를 만드는 중",
  images: "그림을 그리는 중",
  clips: "영상을 만드는 중",
  render: "완성본을 합치는 중",
};

const styleLabel = (id) => STYLE_PRESETS.find((s) => s.id === id)?.label || id;

export default function QuickCreate() {
  const [messages, setMessages] = useState([
    { role: "ai", text: GREETING, hint: '예: "신메뉴 딸기라떼 홍보 영상 만들어줘"' },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function push(msg) {
    setMessages((prev) => [...prev, msg]);
  }

  // 실패 프로젝트는 단계별 화면에서 이어 만든다 — 경로는 steps.js 가 진실의 원천
  const continueHref = (project) =>
    stepHref(STEPS.find((s) => s.key === currentStepKey(project)) || STEPS[0], project.id);

  async function startAuto(params) {
    push({ role: "ai", text: "영상을 만들기 시작했어요.", spinner: true, stage: "briefing" });
    try {
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material: { text: params.material_text, photos: [] },
          settings: {
            target_seconds: params.target_seconds,
            aspect_ratio: params.aspect_ratio,
            style: { preset: params.style },
          },
        }),
      });
      const project = await createRes.json();
      if (!createRes.ok || !project.id) throw new Error(project.error || "프로젝트 생성 실패");

      const autoRes = await fetch(`/api/projects/${project.id}/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_label: params.voice_label }),
      });
      const auto = await autoRes.json();
      if (!autoRes.ok) throw new Error(auto.error || "자동 생성 시작 실패");

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const stRes = await fetch(`/api/projects/${project.id}`);
        if (!stRes.ok) continue; // 일시적 실패는 다음 바퀴에
        const p = await stRes.json();
        const stage = p.auto?.stage || "briefing";
        setMessages((prev) =>
          prev.map((m) => (m.spinner ? { ...m, stage, text: `${STAGE_LABELS[stage] || "만드는 중"}…` } : m))
        );
        if (p.auto?.state === "done" && p.render?.url) {
          setMessages((prev) => [
            ...prev.filter((m) => !m.spinner),
            {
              role: "ai",
              text: "완성! 재생해 보세요. 보관함에도 저장돼 있어요.",
              video: p.render.url,
              aspect: params.aspect_ratio,
              archive: true,
            },
          ]);
          return;
        }
        if (p.auto?.state === "failed") {
          setMessages((prev) => [
            ...prev.filter((m) => !m.spinner),
            {
              role: "ai",
              text: `여기까지 만들다 멈췄어요 — ${p.auto.error || "이유를 몰라요"}\n만든 데까지는 남아 있어요. 이어서 직접 만들 수 있어요.`,
              continueTo: continueHref(p),
            },
          ]);
          return;
        }
      }
      throw new Error("시간이 너무 오래 걸려서 화면 갱신을 멈췄어요. 보관함에서 확인해 주세요.");
    } catch (e) {
      setMessages((prev) => [
        ...prev.filter((m) => !m.spinner),
        { role: "ai", text: `문제가 생겼어요 — ${e.message}` },
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
        push({
          role: "ai",
          text:
            `정리했어요 — ${data.summary || "요청하신 내용"}\n` +
            `(${data.target_seconds}초 · ${data.aspect_ratio} · ${styleLabel(data.style)} · ${data.voice_label})\n` +
            `아래 버튼을 누르면 완성까지 자동으로 만들어요. 바꾸고 싶은 게 있으면 그냥 이어서 말씀해 주세요.`,
          confirm: true,
          params: data,
        });
      } else {
        throw new Error("알 수 없는 응답");
      }
    } catch (e) {
      push({ role: "ai", text: `문제가 생겼어요 — ${e.message}` });
    } finally {
      setBusy(false);
    }
  }

  async function confirmGenerate(idx) {
    if (busy) return;
    const msg = messages[idx];
    if (!msg?.params) return;
    setBusy(true);
    setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, confirm: false } : m)));
    await startAuto(msg.params);
    setBusy(false);
  }

  return (
    <div className="chat-wrap">
      <div className="chat-card">
        <div className="chat" ref={chatRef}>
          {messages.map((m, i) => (
            <div key={i}>
              <div className={`msg ${m.role}`}>
                {m.role === "ai" && <span className="who"><Icon name="play" size={14} /></span>}
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
                        <a className="mini" href="/archive"
                          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                          보관함에서 보기
                        </a>
                      </div>
                    </>
                  )}
                  {m.params && m.confirm && (
                    <details open>
                      <summary>영상에 담길 자료 (수정 가능)</summary>
                      <textarea
                        className="prompt-edit"
                        defaultValue={m.params.material_text}
                        onChange={(e) => {
                          const v = e.target.value;
                          setMessages((prev) =>
                            prev.map((mm, ii) =>
                              ii === i ? { ...mm, params: { ...mm.params, material_text: v } } : mm
                            )
                          );
                        }}
                      />
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
                  {m.continueTo && (
                    <div className="res-ops">
                      <a className="mini" href={m.continueTo}
                        style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                        이어서 직접 만들기
                      </a>
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
  );
}
