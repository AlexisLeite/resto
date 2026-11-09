"use client";
import Link from "next/link";
export function WorkspaceTabs<T extends string>({
  label,
  value,
  options,
  change,
  href,
  beforeNavigate,
}: {
  label: string;
  value: T;
  options: readonly { id: T; label: string; count?: number }[];
  change: (value: T) => void;
  href?: (value: T) => string;
  beforeNavigate?: (value: T) => void;
}) {
  return (
    <nav className="workspace-tabs" aria-label={label}>
      {options.map((option) =>
        href ? (
          <Link
            key={option.id}
            href={href(option.id)}
            scroll={false}
            className={`workspace-tabs__item${value === option.id ? " workspace-tabs__item--active" : ""}`}
            aria-current={value === option.id ? "page" : undefined}
            onClick={() => beforeNavigate?.(option.id)}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="workspace-tabs__count">{option.count}</span>
            )}
          </Link>
        ) : (
          <button
            key={option.id}
            type="button"
            className={`workspace-tabs__item${value === option.id ? " workspace-tabs__item--active" : ""}`}
            aria-pressed={value === option.id}
            onClick={() => change(option.id)}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="workspace-tabs__count">{option.count}</span>
            )}
          </button>
        ),
      )}
    </nav>
  );
}
