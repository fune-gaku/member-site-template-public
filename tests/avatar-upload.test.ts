import { z } from "astro/zod";
import { describe, expect, it } from "vitest";

import {
  ALLOWED_AVATAR_MIME,
  ALLOWED_AVATAR_MIME_LIST,
  ALLOWED_AVATAR_ACCEPT_ATTR,
  MAX_AVATAR_SIZE,
  sanitizeAvatarFileName,
} from "../src/lib/avatar-upload";

/**
 * Issue #008 (MIME / サイズ制限) + Issue #001 (日本語ファイル名) の網羅テスト。
 *
 * - `ALLOWED_AVATAR_MIME` / `MAX_AVATAR_SIZE` が storage.uploadAvatar の Zod
 *   refine で使う定数と同一であることを保証する (src/actions/index.ts と同じ import)。
 * - uploadAvatar の Zod スキーマはここでローカルに再構築してテストする
 *   (実 Action は Astro コンテキストが必要なため)。
 * - サニタイザは純関数なので直接呼び出してテストする。
 */

/** uploadAvatar で使われている Zod スキーマの再現 (src/actions/index.ts と同じ定義)。 */
const uploadAvatarSchema = z.object({
  file: z
    .instanceof(File)
    .refine((f) => f.size > 0 && f.size <= MAX_AVATAR_SIZE, {
      message: "ファイルサイズは5MB以下にしてください",
    })
    .refine((f) => ALLOWED_AVATAR_MIME.has(f.type), {
      message: "PNG / JPEG / WebP / GIF のみアップロード可能です",
    }),
});

function makeFile({
  name = "test.png",
  type = "image/png",
  size = 1024,
}: {
  name?: string;
  type?: string;
  size?: number;
}): File {
  // Uint8Array は全環境で File に入れられる。サイズは byteLength 準拠。
  const bytes = new Uint8Array(size);
  return new File([bytes], name, { type });
}

// ============================================================
// ALLOWED_AVATAR_MIME / 定数の整合性
// ============================================================

describe("ALLOWED_AVATAR_MIME 定数", () => {
  it("PNG / JPEG / WebP / GIF の 4 種類のみ許可する", () => {
    expect(ALLOWED_AVATAR_MIME.size).toBe(4);
    expect(ALLOWED_AVATAR_MIME.has("image/png")).toBe(true);
    expect(ALLOWED_AVATAR_MIME.has("image/jpeg")).toBe(true);
    expect(ALLOWED_AVATAR_MIME.has("image/webp")).toBe(true);
    expect(ALLOWED_AVATAR_MIME.has("image/gif")).toBe(true);
  });

  it("image/svg+xml を許可しない (Stored XSS 対策)", () => {
    expect(ALLOWED_AVATAR_MIME.has("image/svg+xml")).toBe(false);
  });

  it.each([
    "text/html",
    "application/octet-stream",
    "application/javascript",
    "image/bmp",
    "image/x-icon",
    "image/tiff",
    "",
  ])("その他の MIME (%s) を許可しない", (mime) => {
    expect(ALLOWED_AVATAR_MIME.has(mime)).toBe(false);
  });

  it("ALLOWED_AVATAR_MIME_LIST と Set は同じ要素を持つ", () => {
    expect(new Set(ALLOWED_AVATAR_MIME_LIST)).toEqual(ALLOWED_AVATAR_MIME);
  });

  it("ALLOWED_AVATAR_ACCEPT_ATTR が <input accept='...'> 形式の CSV である", () => {
    expect(ALLOWED_AVATAR_ACCEPT_ATTR).toBe(
      "image/png,image/jpeg,image/webp,image/gif",
    );
  });

  it("MAX_AVATAR_SIZE が 5MB である", () => {
    expect(MAX_AVATAR_SIZE).toBe(5 * 1024 * 1024);
    expect(MAX_AVATAR_SIZE).toBe(5_242_880);
  });
});

// ============================================================
// Zod スキーマ: MIME 検証 (Issue #008)
// ============================================================

describe("uploadAvatar Zod: MIME 検証", () => {
  it.each(["image/png", "image/jpeg", "image/webp", "image/gif"])(
    "%s を受け入れる",
    (mime) => {
      const file = makeFile({ type: mime });
      expect(uploadAvatarSchema.safeParse({ file }).success).toBe(true);
    },
  );

  it("image/svg+xml を 400 で拒否する (XSS 対策)", () => {
    const svg = makeFile({ name: "xss.svg", type: "image/svg+xml" });
    const result = uploadAvatarSchema.safeParse({ file: svg });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join("\n");
      expect(messages).toMatch(/PNG.*JPEG.*WebP.*GIF/);
    }
  });

  it.each([
    "text/html",
    "application/javascript",
    "application/octet-stream",
    "image/bmp",
    "", // 空文字
  ])("その他の MIME (%s) を拒否する", (mime) => {
    const file = makeFile({ type: mime });
    expect(uploadAvatarSchema.safeParse({ file }).success).toBe(false);
  });
});

// ============================================================
// Zod スキーマ: サイズ境界 (Issue #008)
// ============================================================

describe("uploadAvatar Zod: サイズ境界", () => {
  it("1 byte のファイルを受け入れる", () => {
    const file = makeFile({ size: 1 });
    expect(uploadAvatarSchema.safeParse({ file }).success).toBe(true);
  });

  it("5MB ちょうどを受け入れる", () => {
    const file = makeFile({ size: MAX_AVATAR_SIZE });
    expect(uploadAvatarSchema.safeParse({ file }).success).toBe(true);
  });

  it("5MB + 1 byte を拒否する", () => {
    const file = makeFile({ size: MAX_AVATAR_SIZE + 1 });
    const result = uploadAvatarSchema.safeParse({ file });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join("\n");
      expect(messages).toMatch(/5MB/);
    }
  });

  it("サイズ 0 のファイルを拒否する (空ファイル防止)", () => {
    const file = makeFile({ size: 0 });
    expect(uploadAvatarSchema.safeParse({ file }).success).toBe(false);
  });
});

// ============================================================
// sanitizeAvatarFileName: Issue #001 (日本語・多言語 OK)
// ============================================================

describe("sanitizeAvatarFileName: 日本語・多言語・絵文字を保持", () => {
  it.each([
    ["プロフィール画像.jpg", "プロフィール画像.jpg"],
    ["会社ロゴ-2024.png", "会社ロゴ-2024.png"],
    ["田中 太郎.jpeg", "田中 太郎.jpeg"],
    ["测试图片.png", "测试图片.png"], // 中国語
    ["테스트.gif", "테스트.gif"], // 韓国語
    ["résumé.webp", "résumé.webp"], // アクセント付きラテン文字
    ["😀emoji.jpg", "😀emoji.jpg"], // 絵文字
    ["🎉🎊🎈.png", "🎉🎊🎈.png"], // 絵文字のみ
    ["file_name-1.2.3.png", "file_name-1.2.3.png"], // 安全な記号は保持
  ])("`%s` をそのまま保持する", (input, expected) => {
    expect(sanitizeAvatarFileName(input)).toBe(expected);
  });
});

describe("sanitizeAvatarFileName: パストラバーサル対策", () => {
  it("`../../etc/passwd` の `/` と `..` を無害化する", () => {
    const out = sanitizeAvatarFileName("../../etc/passwd");
    expect(out).not.toContain("..");
    expect(out).not.toContain("/");
    expect(out.length).toBeGreaterThan(0);
    // 実質 `_._etc_passwd` のような形になる（先頭ドット / 空白はトリム）
    expect(out).toContain("etc");
    expect(out).toContain("passwd");
  });

  it("Windows 形式のパス区切り `\\` を置換する", () => {
    const out = sanitizeAvatarFileName("..\\..\\windows\\system32.exe");
    expect(out).not.toContain("\\");
    expect(out).not.toContain("..");
  });

  it("`テスト..画像.png` の `..` を置換する", () => {
    const out = sanitizeAvatarFileName("テスト..画像.png");
    expect(out).not.toContain("..");
    expect(out).toContain("テスト");
    expect(out).toContain("画像");
    expect(out.endsWith(".png")).toBe(true);
  });

  it("連続する `...` `....` も `..` が残らないように畳み込む", () => {
    expect(sanitizeAvatarFileName("a...b").includes("..")).toBe(false);
    expect(sanitizeAvatarFileName("a....b").includes("..")).toBe(false);
    expect(sanitizeAvatarFileName("a.....b").includes("..")).toBe(false);
  });
});

describe("sanitizeAvatarFileName: 危険文字の置換", () => {
  it.each([
    ["file<script>.jpg", /^file_script_\.jpg$/],
    ['name"with"quote.png', /^name_with_quote\.png$/],
    ["a:b*c?d.png", /^a_b_c_d\.png$/],
    ["a|b.png", /^a_b\.png$/],
    ["a/b/c.png", /^a_b_c\.png$/],
  ])("`%s` の危険文字を `_` に置換する", (input, expected) => {
    expect(sanitizeAvatarFileName(input)).toMatch(expected);
  });

  it("NUL 文字を無害化する", () => {
    const out = sanitizeAvatarFileName("file\u0000name.png");
    expect(out).not.toContain("\u0000");
    expect(out.endsWith(".png")).toBe(true);
  });

  it.each(["\u0001", "\u0007", "\u001f", "\u007f"])(
    "制御文字を置換する",
    (ch) => {
      const out = sanitizeAvatarFileName(`a${ch}b.png`);
      expect(out).not.toContain(ch);
      expect(out.endsWith(".png")).toBe(true);
    },
  );
});

describe("sanitizeAvatarFileName: エッジケース", () => {
  it("空文字列は `file` にフォールバックする", () => {
    expect(sanitizeAvatarFileName("")).toBe("file");
  });

  it("空白のみは `file` にフォールバックする", () => {
    expect(sanitizeAvatarFileName("   ")).toBe("file");
  });

  it("先頭末尾の空白をトリムする", () => {
    expect(sanitizeAvatarFileName("  hello.png  ")).toBe("hello.png");
  });

  it("末尾のドットをトリム (Windows 事故回避)", () => {
    const out = sanitizeAvatarFileName("hello.png.");
    expect(out.endsWith(".")).toBe(false);
    expect(out).toContain("hello");
  });

  it("先頭ドットファイルのドットをトリム", () => {
    const out = sanitizeAvatarFileName(".hiddenfile");
    expect(out.startsWith(".")).toBe(false);
  });

  it("スラッシュのみの入力にはパス区切りが残らない", () => {
    expect(sanitizeAvatarFileName("////")).not.toContain("/");
  });
});
