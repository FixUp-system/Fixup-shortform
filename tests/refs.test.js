// 아바타 풀 — 파일이 없는 항목은 조용히 빠져야 한다.
// 첨부되지 않을 사진을 가리키는 지시는 그림을 망친다(업로드 사진에 이미 같은 방어가 있다).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { AVATARS } from "../lib/refs.js";
import { availableAvatars, avatarFile } from "../lib/cast.js";

let dir;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "shotform-av-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("AVATARS", () => {
  it("항목마다 id·file·kind·label·traits 가 있다", () => {
    expect(AVATARS.length).toBeGreaterThan(0);
    for (const a of AVATARS) {
      expect(a.id, JSON.stringify(a)).toMatch(/^av-/);
      expect(a.file).toMatch(/\.(jpg|jpeg|png)$/);
      expect(a.kind).toBe("person");
      expect(typeof a.label).toBe("string");
      expect(a.traits.length).toBeGreaterThan(0);
    }
  });

  it("id 가 겹치지 않는다", () => {
    const ids = AVATARS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("availableAvatars", () => {
  it("폴더가 비어 있으면 빈 배열 — 켜도 아무것도 부러지지 않는다", async () => {
    expect(await availableAvatars(dir)).toEqual([]);
  });

  it("폴더가 아예 없어도 빈 배열이다", async () => {
    expect(await availableAvatars(path.join(dir, "없는폴더"))).toEqual([]);
  });

  it("파일이 있는 항목만 돌려준다", async () => {
    writeFileSync(path.join(dir, AVATARS[0].file), "x");
    const got = await availableAvatars(dir);
    expect(got.map((a) => a.id)).toEqual([AVATARS[0].id]);
  });
});

describe("avatarFile", () => {
  it("id 로 절대경로를 만든다", () => {
    expect(avatarFile(AVATARS[0].id, dir)).toBe(path.join(dir, AVATARS[0].file));
  });

  it("없는 id 는 null", () => {
    expect(avatarFile("av-없음", dir)).toBe(null);
  });
});
