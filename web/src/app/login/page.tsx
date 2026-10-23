"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout, PasswordInput } from "@/components/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Input, Label } from "@/components/ui/Field";
import { ApiError, loginUser } from "@/lib/api";
import { saveSession } from "@/lib/auth";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export default function LoginPage() {
  useDocumentTitle("Log in");
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await loginUser({ username: username.trim(), password });
      saveSession(session);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 404 || err.status === 400)) {
        setError("That username and password don't match.");
      } else {
        setError(err instanceof ApiError ? err.message : "Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to manage your accounts and send money.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            icon="user"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <Alert>{error}</Alert>}

        <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
          Log in
        </Button>

        <p className="pt-2 text-center text-sm text-ink-secondary">
          New to Swift?{" "}
          <Link href="/register" className="font-medium text-brand hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
