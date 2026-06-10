import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ size?: number | string; className?: string }>;

type Tone = "brand" | "gray" | "success" | "warning" | "error";

const toneClasses: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  gray: "bg-gray-100 text-gray-700 ring-gray-200",
  success: "bg-success-50 text-success-700 ring-success-200",
  warning: "bg-warning-50 text-warning-700 ring-warning-200",
  error: "bg-error-50 text-error-700 ring-error-200",
};

export function Badge({
  children,
  tone = "gray",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-200 bg-white shadow-xs",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-gray-500">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** Top KPI tile, matching the screenshot's stage summary cards. */
export function StatTile({
  code,
  value,
  label,
  caption,
  icon: Icon,
  highlight = false,
}: {
  code: string;
  value: ReactNode;
  label: string;
  caption?: string;
  icon?: IconType;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border p-5",
        highlight
          ? "border-brand-700 bg-brand-700 text-white shadow-lg"
          : "border-gray-200 bg-white shadow-xs"
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "eyebrow text-[10px] font-semibold",
            highlight ? "text-brand-100" : "text-gray-400"
          )}
        >
          {code}
        </span>
        {Icon && (
          <Icon
            size={16}
            className={highlight ? "text-brand-100" : "text-gray-300"}
          />
        )}
      </div>
      <span
        className={cn(
          "mt-3 text-3xl font-bold tracking-tight",
          highlight ? "text-white" : "text-gray-900"
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          "mt-1 text-sm font-medium",
          highlight ? "text-white" : "text-gray-700"
        )}
      >
        {label}
      </span>
      {caption && (
        <span
          className={cn(
            "mt-0.5 text-xs",
            highlight ? "text-brand-100" : "text-gray-400"
          )}
        >
          {caption}
        </span>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: IconType;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-gray-400 shadow-xs ring-1 ring-gray-200">
        <Icon size={22} />
      </div>
      <h3 className="mt-4 text-base font-semibold text-gray-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-sm text-gray-500">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";

export function Button({
  children,
  variant = "primary",
  icon: Icon,
  className,
  ...props
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  icon?: IconType;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-brand-600 text-white hover:bg-brand-700 shadow-xs disabled:opacity-50",
    secondary:
      "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50",
    ghost: "text-gray-600 hover:bg-gray-100 disabled:opacity-50",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed",
        variants[variant],
        className
      )}
      {...props}
    >
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className="h-full rounded-full bg-brand-500 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
