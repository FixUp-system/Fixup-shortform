"use client";

// 크레딧 코드 — 운영자 전용(2026-09-14). /admin 아래라 middleware 역할 게이트가 덮는다.
//
// 흐름: 와디즈 발송 정보 엑셀에서 표를 복사해 붙여 넣는다 → 리워드 열을 고르고 리워드마다 크레딧을 적는다
//   → [코드 만들기] → [CSV 내려받기] 로 메일 머지. 메일은 우리가 안 보낸다.
// ★ 파일 업로드가 아니라 붙여 넣기인 이유: 한국어 엑셀 CSV 는 CP949 라 글자가 깨지고, 엑셀 파서 의존성도 없다.
// 설계: docs/superpowers/specs/2026-09-14-credit-codes-design.md
import { useEffect, useMemo, useState } from "react";
import { formatCredits } from "../../../lib/pricing";
import { displayNameOf } from "../../../lib/display-name";
import { parsePasted, toCsv, formatCode, MAX_CODE_ROWS } from "../../../lib/credit-codes";
import { useDialog } from "../../../components/DialogProvider";

// 리워드 열을 안 고르면 모든 행이 같은 크레딧이다 — 그 칸의 열쇠.
const ALL = "";

function ymd(ts) {
  const d = new Date(ts);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

// 사람이 적은 크레딧("1,000") → 양의 정수 또는 null.
function toCredits(raw) {
  const n = Number(String(raw ?? "").replace(/[,\s]/g, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

// 브라우저에서 파일로 받는다. 파일 이름에 못 쓰는 글자는 바꾼다.
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[\\/:*?"<>|]/g, "_")}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// 코드 목록 → 메일 머지용 CSV. 원래 열(meta)을 앞에, 코드·크레딧을 뒤에 둔다.
function codesCsv(codes) {
  const metaCols = [];
  for (const c of codes) for (const k of Object.keys(c.meta || {})) if (!metaCols.includes(k)) metaCols.push(k);
  const headers = [...metaCols, "코드", "크레딧"];
  return toCsv(headers, codes.map((c) => ({ ...c.meta, 코드: formatCode(c.code), 크레딧: c.amount_credits })));
}

export default function CreditCodesPage() {
  const { confirm } = useDialog();
  const [batch, setBatch] = useState("");
  const [pasted, setPasted] = useState("");
  const [rewardCol, setRewardCol] = useState(ALL);
  // ★ DB 에 남길 식별 열(발송번호 등). 와디즈 명단의 이름·연락처·배송지는 **저장하지 않는다** —
  //   서포터 정보는 리워드 발송 목적으로만 쓴다(09-14 와디즈 답변). 전체 행 CSV 는 방금 붙여 넣은
  //   원본으로 이 브라우저에서만 만든다.
  const [keepPick, setKeepPick] = useState(null);
  const [amounts, setAmounts] = useState({});
  const [made, setMade] = useState(null);     // 방금 만든 { batch, codes }
  const [codes, setCodes] = useState(null);   // 전체 목록, null = 불러오는 중
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [shown, setShown] = useState(ALL);    // 목록에서 볼 묶음

  const parsed = useMemo(() => parsePasted(pasted), [pasted]);
  // 붙여 넣은 표가 바뀌어 고른 열이 사라지면 "전부 같은 크레딧"으로 되돌린다.
  const col = parsed.headers.includes(rewardCol) ? rewardCol : ALL;
  // 안 골랐으면 "발송번호"가 든 머리글, 없으면 첫 열.
  const keepCol = parsed.headers.includes(keepPick)
    ? keepPick
    : parsed.headers.find((h) => h.includes("발송번호")) ?? parsed.headers[0] ?? ALL;
  const rewardValues = useMemo(
    () => (col === ALL ? [ALL] : [...new Set(parsed.rows.map((r) => r[col]))]),
    [parsed, col]
  );

  async function load() {
    try {
      const r = await fetch("/api/admin/codes");
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "목록을 읽지 못했어요");
      setCodes((await r.json()).codes);
    } catch (e) {
      setErr(e.message);
      setCodes([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setErr("");
    if (!batch.trim()) return setErr("묶음 이름을 적어 주세요 (예: 와디즈 1차 09-30)");
    if (parsed.rows.length === 0) return setErr("붙여 넣은 표에 행이 없어요 — 첫 줄은 머리글이에요");
    if (parsed.rows.length > MAX_CODE_ROWS) return setErr(`한 번에 ${MAX_CODE_ROWS.toLocaleString()}행까지예요`);
    const missing = rewardValues.filter((v) => toCredits(amounts[v]) === null);
    if (missing.length) {
      return setErr(col === ALL ? "크레딧을 양의 정수로 적어 주세요" : `크레딧을 안 적은 리워드: ${missing.map((v) => v || "(빈칸)").join(", ")}`);
    }
    const rows = parsed.rows.map((r) => {
      const meta = { [keepCol]: r[keepCol] };
      if (col !== ALL) meta[col] = r[col];
      return { credits: toCredits(amounts[col === ALL ? ALL : r[col]]), meta };
    });
    const total = rows.reduce((s, r) => s + r.credits, 0);
    const ok = await confirm({
      title: `코드 ${rows.length.toLocaleString()}개를 만들까요?`,
      body: `묶음 「${batch.trim()}」 · 크레딧 합계 ${formatCredits(total)}\n만든 뒤 CSV 로 내려받아 메일 머지에 쓰세요.`,
      confirmLabel: "만들기",
    });
    if (!ok) return;
    setBusy("create");
    try {
      const r = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch: batch.trim(), rows }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "코드를 만들지 못했어요");
      // 라우트는 보낸 순서 그대로 코드를 돌려준다 — 전체 행과 i 로 짝짓는다(이 화면의 메모리에만 있다).
      setMade({
        batch: batch.trim(),
        codes: body.codes.map((c, i) => ({ ...c, meta: parsed.rows[i] })),
      });
      setPasted("");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  async function remove(c) {
    const ok = await confirm({
      title: `${formatCode(c.code)} 를 지울까요?`,
      body: "아직 안 쓴 코드만 지울 수 있어요. 이미 메일로 보냈다면 받은 사람이 등록하지 못해요.",
      confirmLabel: "지우기",
    });
    if (!ok) return;
    setBusy(c.code);
    setErr("");
    try {
      const r = await fetch(`/api/admin/codes/${c.code}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "지우지 못했어요");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  // 코드를 넣은 승인 대기 계정 — 사용자 관리 화면과 같은 승인 라우트를 부른다.
  async function approve(c) {
    setBusy(c.code);
    setErr("");
    try {
      const r = await fetch(`/api/admin/users/${c.redeemed_by}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "승인하지 못했어요");
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy("");
    }
  }

  const batches = [...new Set((codes || []).map((c) => c.batch))];
  const visible = (codes || []).filter((c) => shown === ALL || c.batch === shown);
  const usedCount = visible.filter((c) => c.redeemed_by).length;

  return (
    <>
      <h1 className="pgtitle">크레딧 코드</h1>
      <p className="pgsub">
        와디즈 발송 정보 엑셀에서 표를 <b>머리글째 복사해 붙여 넣으면</b> 행마다 코드가 하나씩 만들어져요.
        CSV 로 내려받아 메일 머지에 쓰세요. 코드는 한 번만 쓸 수 있고 기한은 없어요.
      </p>

      {err && <p className="pgsub warn">{err}</p>}

      <section className="panel me-panel">
        <h2 className="me-h">코드 만들기</h2>
        <div className="me-row">
          <input
            className="sent-input"
            placeholder="묶음 이름 (예: 와디즈 1차 09-30)"
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            aria-label="묶음 이름"
          />
        </div>
        <textarea
          className="sent-input"
          rows={8}
          placeholder={"엑셀에서 복사한 표를 여기에 붙여 넣으세요 (첫 줄은 머리글)"}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          aria-label="붙여 넣은 표"
        />
        {parsed.headers.length > 0 && (
          <>
            <p className="pgsub">
              {parsed.rows.length.toLocaleString()}행 · 열 {parsed.headers.length}개 ({parsed.headers.join(", ")})
            </p>
            <div className="me-row">
              <select
                className="dlg-input tier-pick"
                value={col}
                onChange={(e) => setRewardCol(e.target.value)}
                aria-label="리워드 열"
              >
                <option value={ALL}>리워드 열 없음 — 모든 행이 같은 크레딧</option>
                {parsed.headers.map((h) => (
                  <option key={h} value={h}>리워드 열: {h}</option>
                ))}
              </select>
              <select
                className="dlg-input tier-pick"
                value={keepCol}
                onChange={(e) => setKeepPick(e.target.value)}
                aria-label="보관할 식별 열"
              >
                {parsed.headers.map((h) => (
                  <option key={h} value={h}>보관할 식별 열: {h}</option>
                ))}
              </select>
            </div>
            <p className="pgsub">
              DB 에는 식별 열과 리워드 열만 남아요. 이름·연락처 같은 나머지 열은 아래 [CSV 내려받기] 파일에만 들어가요.
            </p>
            {rewardValues.map((v) => (
              <label className="me-row" key={`amt-${v}`}>
                <span className="pgsub">
                  {col === ALL ? "크레딧" : `${v || "(빈칸)"} · ${parsed.rows.filter((r) => r[col] === v).length}행`}
                </span>
                <input
                  className="sent-input"
                  inputMode="numeric"
                  placeholder="예: 1000"
                  value={amounts[v] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [v]: e.target.value }))}
                />
              </label>
            ))}
          </>
        )}
        <div className="me-row">
          <button className="cta" disabled={busy === "create" || parsed.rows.length === 0} onClick={create}>
            {busy === "create" ? "만드는 중…" : "코드 만들기"}
          </button>
        </div>
        {made && (
          <div className="me-row">
            <p className="pgsub">
              「{made.batch}」 코드 {made.codes.length.toLocaleString()}개를 만들었어요.
              메일 머지용 전체 열 CSV 는 <b>지금만</b> 받을 수 있어요 — 화면을 떠나기 전에 내려받으세요.
            </p>
            <button className="mini" onClick={() => download(made.batch, codesCsv(made.codes))}>
              CSV 내려받기
            </button>
          </div>
        )}
      </section>

      <section className="panel me-panel">
        <h2 className="me-h">만든 코드</h2>
        {codes === null ? (
          <p className="pgsub">불러오는 중…</p>
        ) : codes.length === 0 ? (
          <p className="pgsub">아직 만든 코드가 없어요.</p>
        ) : (
          <>
            <div className="me-row">
              <select
                className="dlg-input tier-pick"
                value={shown}
                onChange={(e) => setShown(e.target.value)}
                aria-label="묶음"
              >
                <option value={ALL}>전체 묶음</option>
                {batches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
              <span className="pgsub">
                {visible.length.toLocaleString()}개 중 {usedCount.toLocaleString()}개 등록됨
              </span>
              <button
                className="mini"
                onClick={() => download(shown === ALL ? "크레딧 코드 전체" : shown, codesCsv(visible))}
              >
                CSV 다시 받기
              </button>
            </div>
            <div className="cost-table-wrap">
              <table className="cost-table">
                <thead>
                  <tr>
                    <th>묶음</th>
                    <th>코드</th>
                    <th>크레딧</th>
                    <th>만든 날</th>
                    <th>등록한 계정</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.code}>
                      <td>{c.batch}</td>
                      <td className="mono">{formatCode(c.code)}</td>
                      <td>{formatCredits(c.amount_credits)}</td>
                      <td className="mono">{ymd(c.created_at)}</td>
                      <td>
                        {!c.redeemed_by ? (
                          <span className="st-badge">안 씀</span>
                        ) : (
                          <>
                            {c.redeemer ? `${displayNameOf(c.redeemer)} · ${c.redeemer.email}` : "지운 계정"}
                            {" "}
                            <span className={`st-badge st-${c.redeemer?.status === "approved" ? "done" : "submitted"}`}>
                              {c.redeemer?.status === "approved" ? "승인됨" : c.redeemer?.status === "blocked" ? "차단됨" : "승인 대기"}
                            </span>
                          </>
                        )}
                      </td>
                      <td>
                        {!c.redeemed_by && (
                          <button className="mini" disabled={busy === c.code} onClick={() => remove(c)}>지우기</button>
                        )}
                        {c.redeemer?.status === "pending" && (
                          <button className="mini" disabled={busy === c.code} onClick={() => approve(c)}>승인</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
