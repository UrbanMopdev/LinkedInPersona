"use client";

import { createClient } from "@/lib/supabase/client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { error } =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/app");
  }

  return (
    <main style={{ maxWidth: 400, margin: "80px auto", padding: "0 16px" }}>
      <h1>{mode === "signup" ? "Create account" : "Sign in to LinkedIn Persona"}</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email" style={{ display: "block", marginBottom: 4 }}>
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{
            width: "100%",
            padding: 8,
            marginBottom: 12,
            boxSizing: "border-box",
          }}
        />
        <label htmlFor="password" style={{ display: "block", marginBottom: 4 }}>
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          style={{
            width: "100%",
            padding: 8,
            marginBottom: 12,
            boxSizing: "border-box",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: 10 }}
        >
          {loading
            ? mode === "signup"
              ? "Creating account..."
              : "Signing in..."
            : mode === "signup"
              ? "Create account"
              : "Sign in"}
        </button>
        {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}
      </form>
      <p style={{ marginTop: 16, textAlign: "center", fontSize: 14 }}>
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => { setMode("signup"); setError(null); }}
              style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", padding: 0, fontSize: 14 }}
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => { setMode("login"); setError(null); }}
              style={{ background: "none", border: "none", color: "#0070f3", cursor: "pointer", padding: 0, fontSize: 14 }}
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </main>
  );
}
