"use client";

import { Bell, Eye, EyeOff, LockKeyhole, LogIn, Mail, RefreshCcw, Route, ShieldCheck, TriangleAlert } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const POINTS = [
  { icon: Route,       title: "Every channel, one API",     text: "Email, SMS and Telegram from one call, rendered from your templates and branding." },
  { icon: RefreshCcw,  title: "Delivery you can trust",     text: "Retries with backoff and automatic failover between providers, every attempt logged." },
  { icon: ShieldCheck, title: "Hardened sign-in",           text: "Argon2id passwords, sessions in HttpOnly cookies, and a lock after repeated failures." },
];

function LoginForm() {
  const router  = useRouter();
  const params  = useSearchParams();
  const expired = params.get("expired") === "1";

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res  = await fetch("/api/auth/login", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ email: email.trim(), password }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? "Sign-in failed");
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed");
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use your administrator account.</p>
      </div>

      {expired && !error && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm text-warning-foreground ring-1 ring-inset ring-warning/40" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Your session ended. Please sign in again.
        </p>
      )}

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Email</span>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="email"
            autoComplete="username"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 pl-8"
            aria-label="Email"
            required
            autoFocus
          />
        </div>
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Password</span>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 pr-9 pl-8"
            aria-label="Password"
            required
          />
          <button
            type="button"
            onClick={() => setShow((value) => !value)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </label>

      {error && (
        <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive ring-1 ring-inset ring-destructive/30" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <Button type="submit" disabled={busy || !email.trim() || !password} className="h-10 w-full">
        <LogIn className="size-4" aria-hidden />
        {busy ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Forgot your password? An administrator can reset it with <code className="rounded bg-muted px-1">bun run admin:create</code>.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* brand panel: the sidebar's dark navy, flat */}
      <section className="hidden flex-col bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Bell className="size-5" aria-hidden />
          </span>
          <div>
            <div className="font-semibold text-white">one-way-notification</div>
            <div className="text-xs text-sidebar-foreground/60">admin console</div>
          </div>
        </div>

        <div className="my-auto max-w-md">
          <h2 className="text-3xl leading-tight font-semibold text-white">Notifications that reach people.</h2>
          <p className="mt-3 text-sm text-sidebar-foreground/70">
            Manage templates, providers and external systems, and see what happened to every message in one place.
          </p>
          <ul className="mt-8 space-y-5">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div>
                  <div className="text-sm font-medium text-white">{title}</div>
                  <div className="text-sm text-sidebar-foreground/70">{text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bell className="size-5" aria-hidden />
            </span>
            <span className="font-semibold">one-way-notification</span>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
