// 광고 경로의 파이프라인 — 청구 → 생성 → 저장, 실패하면 환불.
//
// 기존 lib/pipeline.js 를 부르지 않는다. 컷·이미지·낭독·합성이 없는 경로다.
import { randomUUID } from "crypto";
import { getProject, updateProject } from "../projects.js";
import { getStore } from "../store/index.js";
import { chargeAd, refundAd } from "../charges.js";
import { MAX_SCENARIO_TRIES } from "../pricing.js";
import { readRefBytes } from "../refs-io.js";
import { generateScenario as defaultScenario } from "./scenario.js";
import { generateAdVideo as defaultGenerate } from "./generate.js";

const RENDERS_BUCKET = "renders";

// fal 산출물은 기본이 publicly readable 이다 — 우리 비공개 버킷으로 옮긴다.
// 미공개 캠페인 영상이면 URL 이 새는 것만으로 사고다.
async function storeVideoDefault(url, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`완성본을 내려받지 못했어요 (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const name = `${randomUUID()}.mp4`;
  await getStore().putObject(RENDERS_BUCKET, name, bytes, "video/mp4");
  return `/api/renders/${name}`;
}

export async function runScenarioStep(projectId, ownerId, deps = {}) {
  const make = deps.generateScenario || defaultScenario;
  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  const tries = Number(project.scenario?.tries) || 0;
  // 무료지만 무제한은 아니다 — 라우트가 청구 앞에서 보는 상한과 같은 값이다
  if (tries >= MAX_SCENARIO_TRIES) throw new Error("시나리오를 너무 많이 다시 썼어요");

  const scenario = await make({ project });
  await updateProject(projectId, ownerId, (p) => ({
    ...p,
    scenario: { ...scenario, tries: (Number(p.scenario?.tries) || 0) + 1 },
    status: "scenario",
    video_error: null,
  }));
}

export async function runAdRenderPipeline(projectId, ownerId, deps = {}) {
  const make = deps.generateAdVideo || defaultGenerate;
  const store = deps.storeVideo || storeVideoDefault;

  const project = await getProject(projectId, ownerId);
  if (!project) throw new Error("프로젝트를 찾을 수 없어요");
  // 시나리오 없이 굽지 않는다 — 그러면 무엇을 만드는지 아무도 모른다
  if (!project.scenario?.text) throw new Error("시나리오를 먼저 만들어 주세요");

  // ★ 청구가 생성 앞이다. 잔액 없이 fal 이 나가는 길을 안 만든다.
  await chargeAd({ userId: ownerId, projectId, seconds: project.settings?.seconds });
  await updateProject(projectId, ownerId, (p) => ({ ...p, status: "rendering", video_error: null }));

  try {
    // 레퍼런스 바이트는 여기서 읽는다 — generate 는 바이트만 받는다(imagegen 과 같은 규약)
    const refs = [];
    for (const photo of project.material?.photos || []) {
      const key = photo.url?.split("/").pop();
      const bytes = key ? await readRefBytes({ source: "upload", key }) : null;
      if (bytes) refs.push({ key, bytes });
    }
    const out = await make({ project, scenario: project.scenario, refs });
    const url = await store(out.url);
    await updateProject(projectId, ownerId, (p) => ({
      ...p, videos: [{ url, seconds: out.seconds }], status: "done", video_error: null,
    }));
  } catch (e) {
    // 못 준 것은 받지 않는다. 지우지 않고 음수 행으로 되돌린다.
    // ★ 환불이 실패해도 원래 오류를 삼키지 않는다 — catch 는 여기서만 끝내고 e 는 그대로 던진다.
    await refundAd({ projectId }).catch(() => {});
    await updateProject(projectId, ownerId, (p) => ({
      ...p, status: "scenario", video_error: e?.message || "영상을 만들지 못했어요",
    })).catch(() => {});
    throw e;
  }
}
