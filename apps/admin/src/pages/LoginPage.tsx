import { Building2, Lock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const { admin, signIn, signedOutReason } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (admin) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-navy-700 p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-white/10">
            <Building2 className="size-5 text-teal-400" />
          </div>
          <span className="text-lg font-semibold">PrimeCabs</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Intercity rides, run from one place.</h2>
          <p className="mt-4 text-white/70">Approve drivers and fares, follow every booking and handle refunds for the Nagpur network.</p>
        </div>
        <p className="text-xs text-white/40">For PrimeCabs staff only. Every action is recorded.</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-teal-500/10" aria-hidden />
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5" noValidate>
          <div>
            <div className="mb-6 flex items-center gap-2 lg:hidden">
              <Building2 className="size-5 text-brand-ink" />
              <span className="font-semibold text-brand-ink">PrimeCabs</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
            <p className="mt-1 text-sm text-ink-2">Use your PrimeCabs staff account.</p>
          </div>

          {signedOutReason && !error && <p className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm text-warning">{signedOutReason}</p>}

          <TextInput label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@primecabs.in" autoFocus />
          <TextInput label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />

          {error && (
            <p className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" loading={busy} className="w-full" icon={<Lock className="size-4" />}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
