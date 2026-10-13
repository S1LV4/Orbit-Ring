import type { CSSProperties } from "react";

interface SvgIconProps {
  markup: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function SvgIcon({ markup, size = 16, className, style }: SvgIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
