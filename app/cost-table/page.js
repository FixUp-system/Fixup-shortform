// 실제 비용 — **내부 테스트 단계에서 모든 사용자가 보는 화면**(2026-08-25 사장님 지시).
//
// ★★ 이것은 **크레딧(정가)이 아니라 원가**다. 우리가 fal·OpenAI 에 실제로 내는 돈이다.
//   두 장부가 단위부터 다르다(CLAUDE.md 의 "장부가 둘이고 단위가 다르다") — 여기서
//   크레딧을 함께 보여 주면 그 둘이 섞여 읽힌다. 그래서 이 화면은 **달러와 원화만** 말한다.
//
// ★★★ 2026-09-02 — **모드별로 가른다**(사장님 지시: "비용테이블도 갱신해줘 각 모드별로").
//   그전에는 조합이 이 파일 안에 손으로 적힌 세 줄(ROWS)이었고 **단계별만** 담고 있었다.
//   이제 조합은 lib/cost-table.js 가 각 모드의 원천 표에서 뽑고, 이 화면은 **그리기만** 한다.
//
// ★★ **서버 컴포넌트다**("use client" 가 없다). 값을 lib/costs.js 의 estimateCost 한
//   자리에서 뽑기 때문이다 — 그 파일은 store·actor 를 끌어 화면이 import 할 수 없다.
//   표를 여기 손으로 적으면 단가가 바뀌는 날 이 화면만 낡는다(이 저장소가 "값이 두 벌이면
//   갈린다"로 여러 번 겪은 자리다). app/page.js 가 같은 모양의 선례다.
//
// ★ force-dynamic — 빌드 시점에 미리 굽지 않는다. estimateCost 자체는 순수하지만 그
//   모듈이 끌어오는 사슬(store)이 빌드 환경에서 env 를 요구할 수 있다.
export const dynamic = "force-dynamic";

import { estimateCost } from "../../lib/costs.js";
import { costTableSections } from "../../lib/cost-table.js";

// ★★ 환율은 **상수 + 기준일**이다(2026-08-25 00:02 UTC · open.er-api.com).
//   런타임에 외부 환율 API 를 부르지 않는 이유: 이 화면 하나 때문에 바깥 서비스에
//   의존성이 생기고, 그 API 가 죽으면 화면이 죽거나 값이 조용히 비어야 한다.
//   내부 테스트용 참고값이라 **언제 기준인지 적는 것**이 정확도보다 중요하다.
const USD_KRW = 1383.12;
const RATE_AT = "2026-08-25";

const usd = (n) => `$${n.toFixed(2)}`;
const krw = (n) => `${Math.round(n * USD_KRW).toLocaleString("ko-KR")}원`;

// 모드마다 무엇이 드는지 한 줄로 설명한다 — 합계가 왜 다른 규칙으로 읽히는지가 여기 있다.
const NOTE = {
  ad: (
    <>
      올려 주신 사진을 그대로 넘겨서 만들어요. 그림을 따로 만들지 않으니 <b>영상값만</b> 들어요.
    </>
  ),
  reel: (
    <>
      스토리보드는 컷이 몇 개든 <b>한 장</b>이라 값이 편당 한 번만 들어요. 영상은 길이와 화질이 값을 정해요.
    </>
  ),
};

export default function CostTablePage() {
  const sections = costTableSections(estimateCost);

  return (
    <>
      <h1 className="pgtitle">실제 비용</h1>
      <p className="pgsub">
        영상 한 편을 만들 때 실제로 나가는 돈이에요 — 크레딧이 아니라 <b>원가</b>예요.
        지금은 내부 테스트 단계라 모두가 볼 수 있게 열어 두었어요.
      </p>

      {sections.map((s) => (
        <section className="panel panel--wide" key={s.id}>
          <h2>{s.label}</h2>
          <p className="pgsub">{NOTE[s.id]}</p>

          <div className="tablewrap">
            <table className="costtable">
              <thead>
                <tr>
                  <th>모델</th>
                  <th>길이</th>
                  <th>화질</th>
                  {s.hasImage && <th className="num">스토리보드</th>}
                  <th className="num">영상</th>
                  <th className="num">합계</th>
                  <th className="num">원화</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={`${r.modelId}-${r.seconds}-${r.resolution}`}>
                    <td>{r.label}</td>
                    <td>{r.seconds}초</td>
                    <td>{r.resolution}</td>
                    {s.hasImage && <td className="num">{usd(r.image)}</td>}
                    <td className="num">{usd(r.video)}</td>
                    <td className="num"><b>{usd(r.total)}</b></td>
                    <td className="num">{krw(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="pgsub">
        환율 1달러 = {USD_KRW.toLocaleString("ko-KR")}원 ({RATE_AT} 기준). 참고용이라 실제 청구 시점의 환율과 달라요.
      </p>
    </>
  );
}
