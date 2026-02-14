"use client";

import { createClient } from "@/lib/supabase/client";
import { FormEvent, useEffect, useState } from "react";

const COOLDOWN_SECONDS = 60;
const LS_KEY = "magic_link_sent_at";

function getRemainingCooldown(): number {
  const sentAt = localStorage.getItem(LS_KEY);
  if (!sentAt) return 0;
  const elapsed = Math.floor((Date.now() - Number(sentAt)) / 1000);
  return Math.max(0, COOLDOWN_SECONDS - elapsed);
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Restore cooldown from localStorage on mount
  useEffect(() => {
    const remaining = getRemainingCooldown();
    if (remaining > 0) setCooldown(remaining);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (cooldown > 0) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
      setCooldown(COOLDOWN_SECONDS);
      localStorage.setItem(LS_KEY, String(Date.now()));
    }
    setLoading(false);
  }

  return (
    <main style={{ maxWidth: 400, margin: "80px auto", padding: "0 16px" }}>
      <h1>Sign in to LinkedIn Persona</h1>
      {sent ? (
        <div>
          <p>Check your email for a magic link to sign in.</p>
          {cooldown > 0 ? (
            <p style={{ color: "#666", fontSize: 14 }}>
              You can request a new link in {cooldown}s
            </p>
          ) : (
            <button
              onClick={() => setSent(false)}
              style={{ width: "100%", padding: 10 }}
            >
              Send another link
            </button>
          )}
        </div>
      ) : (
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
          <button
            type="submit"
            disabled={loading || cooldown > 0}
            style={{ width: "100%", padding: 10 }}
          >
            {loading
              ? "Sending..."
              : cooldown > 0
                ? `Wait ${cooldown}s`
                : "Send magic link"}
          </button>
          {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}
        </form>
      )}
    </main>
  );
}
