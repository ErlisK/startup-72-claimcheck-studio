"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Verifying your link…");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // onAuthStateChange fires once Supabase processes the hash fragment
    // (#access_token=... or ?code=...) and creates a session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        setStatus("Signed in! Redirecting…");
        subscription.unsubscribe();
        router.replace("/dashboard");
      } else if (event === "TOKEN_REFRESHED") {
        router.replace("/dashboard");
      }
    });

    // Also try getting an existing session in case the event already fired
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe();
        router.replace("/dashboard");
      }
    });

    // Timeout fallback
    const timer = setTimeout(() => {
      setStatus("Link expired or invalid. Redirecting to login…");
      subscription.unsubscribe();
      router.replace("/login?error=auth_failed");
    }, 10000);

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center",
      justifyContent: "center", fontFamily: "system-ui, -apple-system, sans-serif"
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 24 }}>📋</div>
        <div style={{ color: "#fff", fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          ClaimCheck Studio
        </div>
        <p style={{ color: "#888", fontSize: 14 }}>{status}</p>
        <div style={{ marginTop: 24 }}>
          <div style={{
            width: 32, height: 32, border: "3px solid #1a3a6e",
            borderTopColor: "#4f8ef7", borderRadius: "50%",
            animation: "spin 0.8s linear infinite", margin: "0 auto"
          }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
