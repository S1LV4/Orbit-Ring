import { useState } from "react";

export interface Author {
  label: string;
  handle?: string;
}

const GITHUB_HANDLE = /^@([A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38})$/;

export function parseAuthors(author: string | undefined | null): Author[] {
  if (typeof author !== "string") return [];
  return author
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = GITHUB_HANDLE.exec(part);
      return m ? { label: "@" + m[1], handle: m[1] } : { label: part };
    });
}

function Avatar({ handle, size }: { handle: string; size: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={`https://github.com/${handle}.png?size=${size * 2}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="rounded-full shrink-0 bg-orbit-card border border-orbit-border"
      style={{ width: size, height: size }}
    />
  );
}

export function AuthorBadge({ author, size = 16 }: { author: Author; size?: number }) {
  if (!author.handle) return <span className="text-orbit-text-dim">{author.label}</span>;
  return (
    <a
      href={`https://github.com/${author.handle}`}
      target="_blank"
      rel="noreferrer noopener"
      title={`github.com/${author.handle}`}
      className="inline-flex items-center gap-1.5 align-middle text-orbit-text-dim hover:text-(--accent) hover:underline underline-offset-2 transition-colors"
      style={{ WebkitAppRegion: "no-drag" } as any}
    >
      <Avatar handle={author.handle} size={size} />
      <span>{author.label}</span>
    </a>
  );
}

export function AuthorCredit({ author, prefix = "by", size = 16 }: { author?: string | null; prefix?: string; size?: number }) {
  const authors = parseAuthors(author);
  if (authors.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-orbit-text-muted">
      <span>{prefix}</span>
      {authors.map((a, i) => (
        <span key={a.label + i} className="inline-flex items-center">
          <AuthorBadge author={a} size={size} />
          {i < authors.length - 1 && <span className="ml-0.5">,</span>}
        </span>
      ))}
    </div>
  );
}
