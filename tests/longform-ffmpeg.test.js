// ffmpeg — 인자는 순수 함수로 만들고(여기서 잰다), 실행은 얇게 둔다(lib/compose.js 와 같은 방식).
import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { frameAtArgs, lastFrameArgs, concatList, joinArgs, runFfmpeg } from "../lib/longform/ffmpeg.js";

describe("인자", () => {
  it("한 프레임 — 빠른 탐색(-ss 가 -i 앞)", () => {
    expect(frameAtArgs({ input: "a.mp4", at: 7.5, out: "f.jpg" }))
      .toEqual(["-y", "-ss", "7.5", "-i", "a.mp4", "-frames:v", "1", "-q:v", "2", "f.jpg"]);
  });

  it("마지막 프레임 — 끝에서 0.1초 안쪽", () => {
    expect(lastFrameArgs({ input: "a.mp4", out: "l.jpg" }))
      .toEqual(["-y", "-sseof", "-0.1", "-i", "a.mp4", "-update", "1", "-frames:v", "1", "-q:v", "2", "l.jpg"]);
  });

  it("★ 이어 붙이기는 재인코딩이 없다 — 하드컷이고 화질 손실 0", () => {
    const a = joinArgs({ list: "c.txt", out: "o.mp4" });
    expect(a).toEqual(["-y", "-f", "concat", "-safe", "0", "-i", "c.txt", "-c", "copy", "o.mp4"]);
  });

  it("목록은 슬래시로 쓰고 작은따옴표를 이스케이프한다 — 윈도 경로에서 깨지지 않게", () => {
    const text = concatList(["C:\\run\\seg1.mp4", "C:\\run\\it's.mp4"]);
    expect(text).toBe("file 'C:/run/seg1.mp4'\nfile 'C:/run/it'\\''s.mp4'\n");
  });
});

describe("실행기", () => {
  const fakeSpawn = (code, stderr = "") => () => {
    const p = new EventEmitter();
    p.stderr = new EventEmitter();
    setTimeout(() => { p.stderr.emit("data", stderr); p.emit("close", code); }, 0);
    return p;
  };

  it("0 으로 끝나면 풀린다", async () => {
    await expect(runFfmpeg(["-version"], { bin: "ffmpeg", spawnImpl: fakeSpawn(0) })).resolves.toBeUndefined();
  });

  it("★ 실패하면 stderr 꼬리를 담아 던진다 — 원인을 못 보면 고칠 수 없다", async () => {
    await expect(runFfmpeg(["x"], { bin: "ffmpeg", spawnImpl: fakeSpawn(1, "Invalid data found") }))
      .rejects.toThrow(/ffmpeg 실패\(1\).*Invalid data found/);
  });
});
