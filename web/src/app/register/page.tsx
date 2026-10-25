"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthLayout, PasswordInput } from "@/components/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { FieldHint, Input, Label } from "@/components/ui/Field";
import { errorMessage, loginUser, registerUser } from "@/lib/api";
import { saveSession } from "@/lib/auth";
import { navigateFresh } from "@/lib/hooks";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

function passwordStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const capped = Math.min(4, score);
  return { score: capped, label: ["Too weak", "Weak", "Fair", "Good", "Strong"][capped] };
}

function StrengthMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  const colors = ["bg-critical", "bg-critical", "bg-warn", "bg-good", "bg-good"];
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i < Math.max(score, 1) ? colors[score] : "bg-surface-3"}`}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-muted">Password strength: {label}</p>
    </div>
  );
}

export default function RegisterPage() {
  useDocumentTitle("Create account");
  const [form, setForm] = useState({ username: "", full_name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const usernameInvalid = form.username !== "" && !/^[a-zA-Z0-9]+$/.test(form.username);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (usernameInvalid) return;
    setError(null);
    setLoading(true);
    try {
      const input = { ...form, username: form.username.trim(), full_name: form.full_name.trim(), email: form.email.trim() };
      await registerUser(input);
      const session = await loginUser({ username: input.username, password: input.password });
      saveSession(session);
      navigateFresh("/dashboard");
    } catch (err) {
      setError(errorMessage(err, "Registration failed. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="It takes less than a minute. No paperwork in the sandbox.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" autoComplete="name" value={form.full_name} onChange={update("full_name")} required autoFocus />
        </div>
        <div>
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            icon="user"
            autoComplete="username"
            value={form.username}
            onChange={update("username")}
            invalid={usernameInvalid}
            required
          />
          {usernameInvalid && <FieldHint tone="critical">Letters and numbers only.</FieldHint>}
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={update("email")} required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            minLength={6}
            autoComplete="new-password"
            value={form.password}
            onChange={update("password")}
            required
          />
          {form.password && <StrengthMeter password={form.password} />}
        </div>

        {error && <Alert>{error}</Alert>}

        <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
          Create account
        </Button>

        <p className="pt-2 text-center text-sm text-ink-secondary">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
