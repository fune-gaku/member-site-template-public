import { describe, expect, it } from "vitest";

import { safeNextPath } from "../src/lib/safe-redirect";

describe("safeNextPath", () => {
  it.each([
    ["/member/dashboard", "/member/dashboard"],
    ["/member/profile?x=1", "/member/profile?x=1"],
  ])("allows relative paths: %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "//evil.example.com",
    "///evil.example.com",
    "/\\evil.example.com",
    "https://evil.example.com",
    "http://evil.example.com",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "",
    "   ",
    null,
    undefined,
  ])("rejects dangerous input: %s", (input) => {
    expect(safeNextPath(input as string | null)).toBe("/member/dashboard");
  });
});
