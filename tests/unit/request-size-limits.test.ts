import { describe, it, expect } from "vitest";

import {
  MAX_ACTION_BODY_SIZE,
  MAX_UPLOAD_BODY_SIZE,
  UPLOAD_ACTION_PATHS,
  checkActionBodySize,
  getActionBodyLimit,
} from "../../src/lib/request-size-limits";

describe("getActionBodyLimit", () => {
  it("/_actions/storage.uploadAvatar はアップロード上限 (6MB)", () => {
    expect(getActionBodyLimit("/_actions/storage.uploadAvatar")).toBe(
      MAX_UPLOAD_BODY_SIZE,
    );
  });

  it("UPLOAD_ACTION_PATHS に列挙されている全パスがアップロード上限になる", () => {
    for (const p of UPLOAD_ACTION_PATHS) {
      expect(getActionBodyLimit(p)).toBe(MAX_UPLOAD_BODY_SIZE);
    }
  });

  it("/_actions/posts.create は一般 Action 上限 (100KB)", () => {
    expect(getActionBodyLimit("/_actions/posts.create")).toBe(
      MAX_ACTION_BODY_SIZE,
    );
  });

  it("/_actions/auth.signIn も一般 Action 上限 (100KB)", () => {
    expect(getActionBodyLimit("/_actions/auth.signIn")).toBe(
      MAX_ACTION_BODY_SIZE,
    );
  });

  it("Action 以外のパスは null（検査スキップ）", () => {
    expect(getActionBodyLimit("/")).toBeNull();
    expect(getActionBodyLimit("/member/dashboard")).toBeNull();
    expect(getActionBodyLimit("/auth/signin")).toBeNull();
    expect(getActionBodyLimit("/_actions")).toBeNull(); // プレフィックスのみ
  });
});

describe("checkActionBodySize", () => {
  describe("Action 以外のパスは常に通す", () => {
    it("Content-Length 欠損でも通る", () => {
      expect(checkActionBodySize("/member/dashboard", null)).toEqual({
        ok: true,
      });
    });
    it("超巨大な Content-Length でも通る", () => {
      expect(checkActionBodySize("/member/dashboard", String(10 ** 9))).toEqual(
        { ok: true },
      );
    });
  });

  describe("一般 Action（100KB 上限）", () => {
    const path = "/_actions/posts.create";

    it("ちょうど上限ぴったりは通る", () => {
      expect(checkActionBodySize(path, String(MAX_ACTION_BODY_SIZE))).toEqual({
        ok: true,
      });
    });

    it("上限 + 1 は 413", () => {
      expect(
        checkActionBodySize(path, String(MAX_ACTION_BODY_SIZE + 1)),
      ).toEqual({
        ok: false,
        status: 413,
        message: "Payload Too Large",
      });
    });

    it("0 バイト（空ボディ）は通る", () => {
      expect(checkActionBodySize(path, "0")).toEqual({ ok: true });
    });

    it("Content-Length 欠損は 411", () => {
      expect(checkActionBodySize(path, null)).toEqual({
        ok: false,
        status: 411,
        message: "Length Required",
      });
    });

    it("空文字 / 空白だけの Content-Length は 411", () => {
      expect(checkActionBodySize(path, "")).toEqual({
        ok: false,
        status: 411,
        message: "Length Required",
      });
      expect(checkActionBodySize(path, "  ")).toEqual({
        ok: false,
        status: 411,
        message: "Length Required",
      });
    });

    it("非数値 / 負値 / 浮動小数の Content-Length は 411", () => {
      for (const bad of ["abc", "-1", "1.5", "NaN", "Infinity"]) {
        expect(checkActionBodySize(path, bad).ok).toBe(false);
        const res = checkActionBodySize(path, bad);
        if (!res.ok) expect(res.status).toBe(411);
      }
    });
  });

  describe("ファイルアップロード Action（6MB 上限）", () => {
    const path = "/_actions/storage.uploadAvatar";

    it("avatars 上限 5MB 相当（5_242_880）は通る", () => {
      expect(checkActionBodySize(path, String(5 * 1024 * 1024))).toEqual({
        ok: true,
      });
    });

    it("ちょうど 6MB 上限ぴったりは通る", () => {
      expect(checkActionBodySize(path, String(MAX_UPLOAD_BODY_SIZE))).toEqual({
        ok: true,
      });
    });

    it("6MB + 1 は 413", () => {
      expect(
        checkActionBodySize(path, String(MAX_UPLOAD_BODY_SIZE + 1)),
      ).toEqual({
        ok: false,
        status: 413,
        message: "Payload Too Large",
      });
    });

    it("100KB を超えても 6MB 以内なら通る（一般 Action 上限の影響を受けない）", () => {
      expect(checkActionBodySize(path, String(1_000_000))).toEqual({
        ok: true,
      });
    });
  });
});
