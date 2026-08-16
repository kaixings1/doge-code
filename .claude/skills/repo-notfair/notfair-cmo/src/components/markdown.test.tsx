// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { Markdown } from "./markdown";

describe("Markdown", () => {
  it("renders a paragraph with leading-relaxed styling", () => {
    const { container } = render(<Markdown>Hello **world**</Markdown>);
    const p = container.querySelector("p");
    expect(p).not.toBeNull();
    expect(p?.className).toContain("leading-relaxed");
    expect(p?.querySelector("strong")?.textContent).toBe("world");
  });

  it("renders unordered and ordered lists", () => {
    const { container } = render(<Markdown>{"- a\n- b\n\n1. one\n2. two"}</Markdown>);
    const ul = container.querySelector("ul");
    const ol = container.querySelector("ol");
    expect(ul?.querySelectorAll("li").length).toBe(2);
    expect(ol?.querySelectorAll("li").length).toBe(2);
    expect(ul?.className).toContain("list-disc");
    expect(ol?.className).toContain("list-decimal");
  });

  it("renders headings h1-h4 as semibold elements", () => {
    const { container } = render(
      <Markdown>{"# H1\n\n## H2\n\n### H3\n\n#### H4"}</Markdown>,
    );
    expect(container.querySelector("h1")?.textContent).toBe("H1");
    expect(container.querySelector("h2")?.textContent).toBe("H2");
    expect(container.querySelector("h3")?.textContent).toBe("H3");
    expect(container.querySelector("h4")?.textContent).toBe("H4");
    expect(container.querySelector("h1")?.className).toContain("font-semibold");
  });

  it("links open in a new tab with noopener/noreferrer", () => {
    const { container } = render(
      <Markdown>{"[click](https://example.com)"}</Markdown>,
    );
    const a = container.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("href")).toBe("https://example.com");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("renders inline code with rounded muted background", () => {
    const { container } = render(<Markdown>{"Use `npm` here"}</Markdown>);
    const code = container.querySelector("code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe("npm");
    // Inline (no language-) -> uses rounded bg-muted; fenced uses leading-relaxed only.
    expect(code?.className).toContain("rounded");
    expect(code?.className).toContain("bg-muted");
  });

  it("renders fenced code blocks inside <pre> with language hint", () => {
    const md = "```json\n{\"a\":1}\n```";
    const { container } = render(<Markdown>{md}</Markdown>);
    const pre = container.querySelector("pre");
    const code = pre?.querySelector("code");
    expect(pre).not.toBeNull();
    expect(code?.className).toContain("language-json");
    expect(code?.className).toContain("font-mono");
    expect(pre?.className).toContain("overflow-x-auto");
  });

  it("renders blockquote, hr, and gfm table elements", () => {
    const md = [
      "> quoted",
      "",
      "---",
      "",
      "| a | b |",
      "| --- | --- |",
      "| 1 | 2 |",
    ].join("\n");
    const { container } = render(<Markdown>{md}</Markdown>);
    expect(container.querySelector("blockquote")?.textContent).toContain("quoted");
    expect(container.querySelector("hr")).not.toBeNull();
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(table?.parentElement?.className).toContain("overflow-x-auto");
    expect(container.querySelectorAll("th").length).toBe(2);
    expect(container.querySelectorAll("td").length).toBe(2);
  });

  it("emphasis renders as <em>", () => {
    const { container } = render(<Markdown>{"This is *italic* text"}</Markdown>);
    expect(container.querySelector("em")?.textContent).toBe("italic");
  });

  it("does not render raw HTML (script tags are escaped, not executed)", () => {
    const { container } = render(
      <Markdown>{"hi <script>alert(1)</script> bye"}</Markdown>,
    );
    // react-markdown without rehype-raw renders HTML as literal text.
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("alert(1)");
  });

  it("applies a user-supplied className to the wrapper", () => {
    const { container } = render(
      <Markdown className="custom-x">hello</Markdown>,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("custom-x");
    expect(wrapper.className).toContain("text-sm");
  });
});
