import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // setupFiles 는 테스트 파일마다(각 워커에서) 한 번씩 돈다 — 파일별로 다른 임시 폴더를 잡는다.
    // 목적은 저장소의 data/ 를 건드리지 않는 것이므로 그것으로 충분하다.
    setupFiles: ["./vitest.setup.js"],
  },
});
