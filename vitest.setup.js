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
// ★ 지우는 조건: 아래 근거 목록이 전부 비면 지워도 된다. 목록이 낡았으면
// 목록을 고칠 일이지 줄을 지울 일이 아니다(이 줄은 이미 한 번 "근거가 사라졌다"는
// 이유로 지워졌다가 실제 원장을 오염시켰다).
//
// 2026-08-12 갱신(`grep -rn "SHOTFORM_DATA_DIR" lib/ app/ scripts/` 실측) — 렌더 산출물
// Storage 이관으로 lib/compose.js 와 app/api/renders/[name]/route.js 는 이 env 를 더는
// 읽지 않는다(합성은 임시 폴더를 쓰고 finally 에서 지우며, 라우트는 Storage 에서 읽는다).
// 그런데도 이 줄이 필요한 건 아래가 아직 SHOTFORM_DATA_DIR 을 읽어서다:
//   - scripts/migrate-renders-to-storage.mjs (구 로컬 data/renders/ 를 읽어 Storage 로 올리는
//     1회성 이관 스크립트 — 테스트가 이 스크립트를 직접 부르지는 않지만, 이 env 를 실수로
//     저장소 data/ 로 흘리면 이관 스크립트가 그 자리를 읽어 갈 수 있다)
//   - scripts/measure/compare-clip-models.mjs · compare-image-models.mjs ·
//     compare-style-presets.mjs · subtitle-split.mjs (측정 스크립트 — 테스트가 부르지 않음)
//   - scripts/migrate-to-supabase.mjs (구 이관 스크립트, 1회성)
// 즉 지금 남은 근거는 "테스트 스위트가 이 스크립트들을 부른다"가 아니라 "이 env 이름이
// 살아 있는 한, 세워 두지 않으면 실수로 실행됐을 때 저장소 data/ 를 겨냥한다"는 방어선이다.
// 세워 두지 않고 전체 테스트를 돌렸을 때 실제로 data/costs.json 이 오염된 전례가 있다
// (아래 문단). 근거가 완전히 없어지면(위 스크립트들이 전부 지워지거나 이 env 를 놓으면)
// 이 줄도 지운다.
process.env.SHOTFORM_DATA_DIR = mkdtempSync(path.join(tmpdir(), "shotform-test-"));
