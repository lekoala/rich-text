import { describe, expect, test } from "bun:test";
import { isSafeHref, matchSuggestionText, normalizeToolbar } from "../../src/helpers.js";

describe("normalizeToolbar", () => {
  test("keeps known unique commands", () => {
    expect(normalizeToolbar("bold italic bold nope")).toEqual(["bold", "italic"]);
  });

  test("supports none", () => {
    expect(normalizeToolbar("none")).toEqual([]);
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
    expect(matchSuggestionText("a@mar", ["@"])) .toBeNull();
  });

  test("rejects whitespace in a query", () => {
    expect(matchSuggestionText("Hello @mar tin", ["@"])) .toBeNull();
  });
});

describe("isSafeHref", () => {
  test("accepts normal and relative URLs", () => {
    expect(isSafeHref("https://example.com")).toBe(true);
    expect(isSafeHref("/patient/1")).toBe(true);
    expect(isSafeHref("mailto:hello@example.com")).toBe(true);
  });

  test("rejects executable URLs", () => {
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html,x")).toBe(false);
  });
});
