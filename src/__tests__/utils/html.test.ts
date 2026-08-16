import { describe, it, expect } from "vitest";
import { looksLikeHtml, slimdownHtml } from "../../utils/html.js";

describe("looksLikeHtml", () => {
  it("detects full HTML documents", () => {
    expect(looksLikeHtml("<!DOCTYPE html><html><body>hi</body></html>")).toBe(true);
  });

  it("detects HTML fragments", () => {
    expect(looksLikeHtml("<div>hello</div>")).toBe(true);
    expect(looksLikeHtml("<p>paragraph</p>")).toBe(true);
    expect(looksLikeHtml('<a href="/link">text</a>')).toBe(true);
    expect(looksLikeHtml("<html><head></head><body></body></html>")).toBe(true);
    expect(looksLikeHtml("<body>content</body>")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(looksLikeHtml("just plain text")).toBe(false);
    expect(looksLikeHtml("")).toBe(false);
    expect(looksLikeHtml("no tags here")).toBe(false);
  });
});

describe("slimdownHtml", () => {
  it("removes svg elements", () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"></svg><div>text</div>';
    const result = slimdownHtml(input);
    expect(result).not.toContain("<svg");
    expect(result).toContain("<div>text</div>");
  });

  it("removes img tags", () => {
    const input = '<img src="photo.jpg" alt="photo"><p>content</p>';
    const result = slimdownHtml(input);
    expect(result).not.toContain("<img");
    expect(result).toContain("<p>content</p>");
  });

  it("removes data URI attributes", () => {
    const input = '<a href="data:text/html,test">link</a>';
    const result = slimdownHtml(input);
    expect(result).not.toContain("data:");
    expect(result).toContain("<a>link</a>");
  });

  it("strips all attributes except href", () => {
    const input = '<a href="/link" class="btn" id="main">text</a>';
    const result = slimdownHtml(input);
    expect(result).toBe('<a href="/link">text</a>');
  });

  it("keeps href when present", () => {
    const input = '<a href="https://example.com">example</a>';
    const result = slimdownHtml(input);
    expect(result).toBe('<a href="https://example.com">example</a>');
  });

  it("handles empty input", () => {
    expect(slimdownHtml("")).toBe("");
  });
});
