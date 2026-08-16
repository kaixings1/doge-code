"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders an agent message as markdown. Tailored to the streaming chat
 * surface: rules favor compact layout, monospace for code/JSON, and
 * safe link behavior. Anything react-markdown doesn't know about falls
 * back to plain text — we deliberately don't enable raw HTML.
 *
 * Memoized because the chat re-renders the whole transcript on every
 * stream tick; bailing out of re-parsing unchanged messages keeps long
 * threads from regressing under heavy streaming.
 */

const COMPONENTS: Components = {
  p: ({ className, ...props }) => (
    <p className={cn("mb-3 last:mb-0 leading-relaxed", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul className={cn("mb-3 list-disc space-y-1 pl-5 last:mb-0", className)} {...props} />
  ),
  ol: ({ className, ...props }) => (
    <ol className={cn("mb-3 list-decimal space-y-1 pl-5 last:mb-0", className)} {...props} />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("leading-relaxed", className)} {...props} />
  ),
  h1: ({ className, ...props }) => (
    <h1 className={cn("mb-2 mt-4 text-base font-semibold first:mt-0", className)} {...props} />
  ),
  h2: ({ className, ...props }) => (
    <h2 className={cn("mb-2 mt-4 text-base font-semibold first:mt-0", className)} {...props} />
  ),
  h3: ({ className, ...props }) => (
    <h3 className={cn("mb-2 mt-3 text-sm font-semibold first:mt-0", className)} {...props} />
  ),
  h4: ({ className, ...props }) => (
    <h4 className={cn("mb-1 mt-3 text-sm font-semibold first:mt-0", className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong className={cn("font-semibold text-foreground", className)} {...props} />
  ),
  em: ({ className, ...props }) => (
    <em className={cn("italic", className)} {...props} />
  ),
  a: ({ className, href, ...props }) => (
    <a
      className={cn("font-medium text-foreground underline underline-offset-2 hover:opacity-80", className)}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn("mb-3 border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground last:mb-0", className)}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("my-4 border-border", className)} {...props} />
  ),
  table: ({ className, ...props }) => (
    <div className="mb-3 w-full overflow-x-auto last:mb-0">
      <table className={cn("min-w-full border-collapse text-xs", className)} {...props} />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn("border-b px-2 py-1.5 text-left font-medium", className)}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td className={cn("border-b border-border/50 px-2 py-1.5 align-top", className)} {...props} />
  ),
  code: ({ className, children, ...props }) => {
    // react-markdown emits both inline and fenced `code`. Inline gets no
    // language hint and no surrounding `<pre>`. Fenced gets a language hint
    // ("language-json"). We distinguish by checking the language class.
    const isFenced = typeof className === "string" && className.startsWith("language-");
    if (isFenced) {
      // Render as plain inner; <pre> below provides the block container.
      return (
        <code className={cn("font-mono text-[12px] leading-relaxed", className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className={cn(
          "rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        "mb-3 max-w-full overflow-x-auto rounded-md border bg-muted/50 p-3 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
};

function MarkdownBase({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed text-foreground break-words [&>:first-child]:mt-0",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownBase);
