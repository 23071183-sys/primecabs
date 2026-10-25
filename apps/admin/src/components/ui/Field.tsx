import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const control =
  "block w-full rounded-xl border-0 bg-card px-3 text-sm text-ink ring-1 ring-inset ring-line-strong placeholder:text-ink-3 focus:ring-2 focus:ring-inset focus:ring-teal-500 disabled:bg-muted disabled:text-ink-2 aria-invalid:ring-danger";

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-2">{hint}</p>
      ) : null}
    </div>
  );
}

type WithLabel = { label: string; hint?: ReactNode; error?: string };

export function TextInput({ label, hint, error, className = "", prefix, suffix, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> & WithLabel & { prefix?: string; suffix?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-2">{prefix}</span>}
        <input id={id} aria-invalid={!!error || undefined} {...rest} className={`${control} h-10 ${prefix ? "pl-7" : ""} ${suffix ? "pr-16" : ""} ${className}`} />
        {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-2">{suffix}</span>}
      </div>
    </Field>
  );
}

export function SelectInput({ label, hint, error, children, className = "", ...rest }: SelectHTMLAttributes<HTMLSelectElement> & WithLabel) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <select id={id} aria-invalid={!!error || undefined} {...rest} className={`${control} h-10 pr-8 ${className}`}>
        {children}
      </select>
    </Field>
  );
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & WithLabel>(function TextArea(
  { label, hint, error, className = "", ...rest },
  ref,
) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <textarea ref={ref} id={id} aria-invalid={!!error || undefined} rows={3} {...rest} className={`${control} py-2 ${className}`} />
    </Field>
  );
});

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {hint && <p className="text-xs text-ink-2">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-teal-500" : "bg-line-strong"}`}
      >
        <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-card shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </div>
  );
}

/** Search box with an icon slot. */
export function SearchInput({ value, onChange, placeholder, icon }: { value: string; onChange: (v: string) => void; placeholder: string; icon: ReactNode }) {
  return (
    <div className="relative w-full sm:w-72">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-3">{icon}</span>
      <input
        type="search"
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${control} h-9 pl-9`}
      />
    </div>
  );
}
