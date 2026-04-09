"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createSupabaseBrowserClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://citebundle.com";

    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appUrl}/api/auth/callback`,
      },
    });

    if (err) {
      setError(err.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "system-ui, -apple-system, sans-serif"
    }}>
      <div style={{ background: "#111", border: "1px solid #222", borderRadius: 16, padding: 48, width: 400, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📋</div>
        <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 700, marginBottom: 8 }}>ClaimCheck Studio</h1>
        <p style={{ color: "#888", fontSize: 14, marginBottom: 32 }}>Sign in to your account</p>

        {sent ? (
          <div>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
            <h2 style={{ color: "#fff", fontSize: 20, marginBottom: 8 }}>Check your email</h2>
            <p style={{ color: "#888", fontSize: 14 }}>
              We sent a magic link to <strong style={{ color: "#fff" }}>{email}</strong>.<br />
              Click it to sign in — no password needed.
            </p>
          </div>
        ) : (
          <form onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 8,
                border: "1px solid #333", background: "#1a1a1a", color: "#fff",
                fontSize: 15, marginBottom: 12, boxSizing: "border-box"
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "12px 0", background: "#4f8ef7", color: "#fff",
                border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer"
              }}
            >
              {loading ? "Sending..." : "Send magic link"}
            </button>
            {error && <p style={{ color: "#ff6b6b", fontSize: 13, marginTop: 12 }}>{error}</p>}
            <p style={{ color: "#555", fontSize: 12, marginTop: 20 }}>
              Don't have access yet?{" "}
              <a href="/" style={{ color: "#4f8ef7" }}>Join the waitlist</a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

