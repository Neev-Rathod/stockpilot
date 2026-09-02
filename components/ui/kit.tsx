import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatPercent, formatSignedUsd } from "@/lib/format";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

// ── Panel ────────────────────────────────────────────────────────────────
export function Panel({
  className,
  children,
  padded = true,
}: {
  className?: string;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-hairline bg-panel",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  hint,
  action,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-txt">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-txt-mute">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Button ───────────────────────────────────────────────────────────────
type ButtonVariant = "solid" | "ghost" | "up" | "down" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  solid: "bg-accent text-[color:var(--on-accent)] hover:bg-accent-hover font-semibold",
  ghost: "bg-elevated text-txt-dim hover:text-txt hover:bg-hairline border border-hairline",
  outline: "bg-transparent text-txt-dim hover:text-txt border border-hairline hover:border-hairline-strong",
  up: "bg-up text-[#04150d] hover:brightness-110 font-semibold",
  down: "bg-down text-white hover:brightness-110 font-semibold",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-sm",
};

export function Button({
  variant = "solid",
  size = "md",
  className,
  children,
  ...props
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg transition disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────
type BadgeTone = "neutral" | "accent" | "up" | "down";
const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-elevated text-txt-dim border-hairline",
  accent: "bg-[color:var(--accent-soft)] text-accent border-[color:var(--accent-soft)]",
  up: "bg-[color:rgba(22,199,132,0.12)] text-up border-[color:rgba(22,199,132,0.2)]",
  down: "bg-[color:rgba(234,57,67,0.12)] text-down border-[color:rgba(234,57,67,0.2)]",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── PriceChange (single source of truth for +/- coloring) ──────────────────
export function PriceChange({
  amount,
  percent,
  className,
  showArrow = true,
}: {
  amount?: number;
  percent?: number;
  className?: string;
  showArrow?: boolean;
}) {
  const basis = percent ?? amount ?? 0;
  const positive = basis >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono font-semibold tnum",
        positive ? "text-up" : "text-down",
        className,
      )}
    >
      {showArrow && <Icon className="h-3.5 w-3.5" />}
      {amount !== undefined && <span>{formatSignedUsd(amount)}</span>}
      {percent !== undefined && <span>{formatPercent(percent)}</span>}
    </span>
  );
}

// ── Stat ─────────────────────────────────────────────────────────────────
export function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Panel>
      <div className="flex items-center justify-between text-xs text-txt-dim">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-3 font-mono text-xl font-bold tnum text-txt">{value}</div>
      {sub && <div className="mt-1 text-xs">{sub}</div>}
    </Panel>
  );
}

// ── Segmented control ──────────────────────────────────────────────────────
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg border border-hairline bg-elevated p-0.5", className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold transition",
            value === option.value
              ? "bg-accent text-[color:var(--on-accent)]"
              : "text-txt-dim hover:text-txt",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      {icon && <div className="text-txt-mute">{icon}</div>}
      <div className="text-sm font-semibold text-txt">{title}</div>
      {hint && <div className="max-w-sm text-xs text-txt-mute">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-elevated", className)} />;
}
