import { describe, expect, test } from "bun:test";
import { isSafeHref, matchSuggestionText, normalizeToolbar, toolbarGroups } from "../../src/helpers.js";

describe("normalizeToolbar", () => {
  test("keeps known unique commands", () => {
    expect(normalizeToolbar("bold italic bold nope")).toEqual(["bold", "italic"]);
  });

  test("supports none", () => {
    expect(normalizeToolbar("none")).toEqual([]);
  });

  test("keeps group separators but drops empty groups", () => {
    expect(normalizeToolbar("| bold|italic | | nope | undo |")).toEqual(["bold", "|", "italic", "|", "undo"]);
    expect(normalizeToolbar(["nope", "|", "bold"])).toEqual(["bold"]);
  });

  test("the default toolbar is grouped", () => {
    expect(toolbarGroups(normalizeToolbar(null))).toEqual([
      ["bold", "italic"],
      ["bullet-list", "ordered-list"],
      ["link", "blockquote"],
      ["undo", "redo"],
    ]);
  });
});

describe("matchSuggestionText", () => {
  test("finds a mention after whitespace", () => {
    expect(matchSuggestionText("Hello @mar", ["@", "/"])).toEqual({
      trigger: "@",
      query: "mar",
      start: 6,
      end: 10,
    });
  });

  test("does not trigger inside an email-like token", () => {
    expect(matchSuggestionText("a@mar", ["@"])).toBeNull();
  });

  test("rejects whitespace in a query", () => {
    expect(matchSuggestionText("Hello @mar tin", ["@"])).toBeNull();
  });
});

describe("isSafeHref", () => {
  test("accepts normal and relative URLs", () => {
    expect(isSafeHref("https://example.com")).toBe(true);
    expect(isSafeHref("/projects/1")).toBe(true);
    expect(isSafeHref("mailto:hello@example.com")).toBe(true);
  });

  test("rejects executable URLs", () => {
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html,x")).toBe(false);
  });

  test("rejects obfuscated and non-allowlisted schemes", () => {
    expect(isSafeHref(" JaVaScRiPt:alert(1)")).toBe(false);
    expect(isSafeHref("java\tscript:alert(1)")).toBe(false);
    expect(isSafeHref("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeHref("ftp://files.test")).toBe(false);
    expect(isSafeHref("file:///etc/passwd")).toBe(false);
    expect(isSafeHref("")).toBe(false);
  });

  test("accepts tel, hash and document-relative URLs", () => {
    expect(isSafeHref("tel:+3221234567")).toBe(true);
    expect(isSafeHref("#section")).toBe(true);
    expect(isSafeHref("../up")).toBe(true);
    expect(isSafeHref("page.html")).toBe(true);
  });
});
