import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-teal-500 text-teal-900 hover:bg-teal-400 active:bg-teal-600 font-bold",
  secondary: "bg-card text-ink ring-1 ring-inset ring-line-strong hover:bg-muted active:bg-muted font-semibold",
  danger: "bg-card text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger-bg active:bg-danger-bg font-semibold",
  ghost: "text-ink-2 hover:bg-muted hover:text-ink font-medium",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[10px]",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

/** While `loading`, the button ignores clicks, so a double tap can't submit twice. */
export function Button({ variant = "secondary", size = "md", loading, icon, children, className = "", disabled, onClick, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled}
      aria-busy={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-muted hover:text-ink ${className}`}
    >
      {children}
    </button>
  );
}
