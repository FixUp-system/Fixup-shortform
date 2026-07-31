// 모든 테스트를 인메모리 저장소에 가둔다.
//
// 왜 필요한가: 비용 기록·프로젝트 저장은 실제 저장소로 나간다. 테스트가 fetch 를 mock 해
// 호출부를 돌리면 그 기록이 **실제 비용 기록에 섞인다** — 예전에 실제로 그렇게 오염됐다
// (테스트 16건이 data/costs.json 에 0원짜리로 쌓였다). 이제는 Supabase 를 오염시킨다.
//
// 파일마다 세우는 방식은 새 테스트가 생길 때마다 빠뜨릴 수 있어 여기서 한 번에 막는다.
import { beforeEach } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { resetMemoryStore } from "./lib/store/memory.js";

process.env.SHOTFORM_STORE = "memory";

// 인메모리 저장소는 모듈 스코프의 Map 이라 **한 파일 안의 테스트들이 서로 짐을 넘긴다.**
// 파일마다 beforeEach 를 적는 방식은 새 테스트 파일이 생길 때마다 빠뜨릴 수 있고,
// 빠뜨리면 앞 테스트가 남긴 프로젝트·비용 기록 위에서 도는 거짓 통과가 된다.
// 여기서 한 줄로 막는다(기존 파일들의 개별 리셋은 그대로 둬도 무해하다).
beforeEach(() => resetMemoryStore());

// SHOTFORM_DATA_DIR 을 아직 읽는 것들이 남아 있어 임시 폴더로 계속 가둔다.
// 실제로 이 줄을 빼고 전체 테스트를 한 번 돌렸더니 data/costs.json 에 0원짜리 15건이
// 다시 쌓였다 — 예전과 똑같은 오염이다.
//
// ★ 지우는 조건: **렌더 산출물이 로컬 파일로 남아 있는 한 지우지 않는다.**
// "비용 원장이 store 로 가면"이 아니다. 이 env 에 아직 기대는 곳(2026-07-31 실측):
//   - lib/compose.js                  (data/renders/ 아래 mp4)
//   - app/api/renders/[name]/route.js (그 mp4 를 되읽는 라우트)
// 이관으로 손을 뗀 곳(예전 근거였다가 이제 아닌 것): lib/costs.js 는 store 로 갔고,
// lib/pipeline.js 는 업로드가 Storage 로 가면서 이 env 를 더는 읽지 않는다.
// 그래도 결론은 그대로다 — 렌더 mp4 가 로컬이라, 이 줄을 지우면 이번엔 12MB 짜리
// mp4 가 저장소 data/renders/ 에 쌓이는 모양으로 같은 오염이 재발한다.
// (이 줄은 이미 한 번 "근거가 사라졌다"는 이유로 지워졌다가 실제 원장을 오염시켰다.
//  근거 목록이 낡았으면 목록을 고칠 일이지 줄을 지울 일이 아니다.)
process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-test-"));

// 클립 모델 env 는 테스트에서 지운다 — .env.local 을 Kling 으로 바꿔 두면 눈금 기대값이
// 머신마다 달라진다. 활성 프로필을 재는 테스트는 자기 안에서 직접 세운다.
delete process.env.FAL_I2V_ENDPOINT;
