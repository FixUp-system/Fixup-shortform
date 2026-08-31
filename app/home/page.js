// 홈 — **만드는 방식을 고르는 첫 화면**(2026-08-28 사장님 지시).
//
// ★★ 사장님이 캔버스에서 다듬은 시안을 그대로 옮긴 것이다. 캔버스 산출물은 전부 인라인
//   스타일인데 이 저장소는 그것을 막으므로(tests/design-system.test.js) 클래스로 옮겼다 —
//   **보이는 것은 그대로다**(치수·간격을 한 톨도 안 바꿨다). 스타일은 app/globals.css 의
//   `.home-*` 한 뭉치다.
//
// ★★ 도해가 곧 설명이다. 두 방식의 차이는 **만드는 순서**에서 나온다:
//     원클릭 — 소재에서 곧장 한 편을 만든다(중간이 덮여 있다)
//     단계별 — 확인·수정한 이미지를 참조해 그 흐름대로 만든다(칸이 열려 있다)
//   그래서 "볼 수 있는가"와 "얼마나 매끄러운가"가 **같은 뿌리에서 갈린다.**
//
// ★ 줄무늬 자리는 **실제 썸네일이 들어갈 자리**다(사장님 메모). 지금은 빈 면이다.
// ★ 서버 컴포넌트다 — 상태가 없다. 사이드바는 AppShell 이 이미 그린다(여기서 안 그린다).
import Link from "next/link";

export const metadata = { title: "shotform — 무엇을 만들까요" };

export default function HomePage() {
  return (
    <section className="panel panel--wide home">
      <p className="eyebrow">무엇을 만들까요</p>
      <h1>만드는 방식을 먼저 고릅니다</h1>
      <p className="lede">
        한 번에 통으로 굽느냐, 나눠 굽고 이어 붙이느냐. 그 차이 하나가{" "}
        <strong>중간을 볼 수 있는지</strong>와 <strong>화면이 얼마나 매끄러운지</strong>를 함께 정합니다.
      </p>

      <div className="home-modes">
        {/* ── 원클릭 — 안에서 한 번에 만든다 ───────────────────────── */}
        <section className="home-mode">
          <div>
            <div className="head">
              <h2>원클릭 영상</h2>
              <span className="home-pick">권장</span>
            </div>
            <p className="sub">소재만 적으면 영상까지 한 번에 나옵니다.</p>
          </div>

          <div className="home-stage">
            {/* 칸이 안에 있지만 덮여 있다 — 볼 수 없다는 뜻이다 */}
            <div className="home-sealed">
              <span className="pane" />
              <span className="pane" />
              <span className="pane" />
              <span className="veil"><span>안에서 한 번에</span></span>
            </div>

            <span className="home-down" />

            <div className="home-out">
              <div className="home-film"><i /><i /><i /><i /></div>
              <span className="cap">매끄럽게 이어진 한 편</span>
            </div>
          </div>

          <ul className="home-facts">
            <li><span className="m ok" /><span>화면이 <strong>더 매끄럽습니다</strong></span></li>
            <li><span className="m ok" /><span>기다리기만 하면 됩니다</span></li>
            <li className="no"><span className="m nope" /><span>중간을 볼 수 없습니다</span></li>
            <li className="no"><span className="m nope" /><span>고치려면 처음부터 다시</span></li>
          </ul>

          <Link className="cta" href="/ads/new">원클릭으로 만들기</Link>
        </section>

        {/* ── 단계별 — 칸마다 보고 고친다 ──────────────────────────── */}
        <section className="home-mode">
          <div>
            <div className="head"><h2>단계별 영상</h2></div>
            <p className="sub">칸마다 보고, 마음에 안 드는 자리만 고칩니다.</p>
          </div>

          <div className="home-stage">
            <div className="home-steps">
              <div className="home-step">
                <span className="pane" />
                <span className="cap"><span className="name">대본</span><span className="act">본다</span></span>
              </div>
              <span className="home-arw" />
              <div className="home-step">
                <span className="pane" />
                <span className="cap"><span className="name">그림</span><span className="act">고친다</span></span>
              </div>
              <span className="home-arw" />
              <div className="home-step">
                <span className="pane" />
                <span className="cap"><span className="name">영상</span><span className="act">본다</span></span>
              </div>
            </div>

            <span className="home-down" />

            <div className="home-out">
              <div className="home-film joined"><i /><i /><i /><i /></div>
              <span className="cap">이미지 흐름대로 만든 한 편</span>
            </div>
          </div>

          <ul className="home-facts">
            <li><span className="m ok" /><span>그림과 영상을 <strong>굽기 전에 봅니다</strong></span></li>
            <li><span className="m ok" /><span>틀린 자리만 골라 다시 만듭니다</span></li>
            <li className="no"><span className="m nope" /><span>이미지에 맞추느라 움직임이 덜 자연스러울 수 있습니다</span></li>
            <li className="no"><span className="m nope" /><span>손이 더 갑니다</span></li>
          </ul>

          <Link className="cta ghost" href="/reel/new">단계별로 만들기</Link>
        </section>
      </div>

      <p className="home-note">
        <b>*</b>
        <span>중간에 시나리오·이미지 편집이 필요 없으면 원클릭 영상을 권합니다.</span>
      </p>

      {/* ── 모델 — 두 방식 모두에서 고른다 ─────────────────────────── */}
      <section className="step-section">
        <h3>모델은 두 가지입니다</h3>
        <p className="pgsub">어느 방식으로 만들든 여기서 고릅니다. 길이와 품질이 갈립니다.</p>
        <div className="home-models">
          <div className="home-model">
            <span className="name">기본</span>
            <span className="len">15초까지</span>
            <span className="why">짧은 한 편에 넉넉합니다</span>
          </div>
          <div className="home-model">
            <span className="name">프로</span>
            <span className="len">30초까지</span>
            <span className="why">영상 퀄리티가 <strong>월등히 좋습니다</strong></span>
          </div>
        </div>
      </section>
    </section>
  );
}
