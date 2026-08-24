// ext-loader.mjs 를 등록한다. `node --import ./scripts/measure/ext-loader-reg.mjs …` 로 쓴다.
import { register } from "node:module";
register("./ext-loader.mjs", import.meta.url);
