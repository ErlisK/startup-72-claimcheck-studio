"use client";

import { useEffect, useState, useCallback } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import type { User, Session } from "@supabase/supabase-js";

interface Claim {
  id: number;
  text: string;
  risk: "low" | "medium" | "high";
  query: string;
  is_statistical: boolean;
  category: string;
  evidence?: Evidence;
  evidenceLoading?: boolean;
}

interface Evidence {
  results: Array<{
    uid: string;
    title: string;
    authors: string[];
    source: string;
    pubdate: string;
    doi?: string;
  }>;
  confidence: string;
  source_count: number;
}

const RISK_COLORS = {
  low: { bg: "#1a3a1a", text: "#4ade80", label: "Well-supported" },
  medium: { bg: "#2a2a1a", text: "#fbbf24", label: "Needs verification" },
  high: { bg: "#3a1a1a", text: "#f87171", label: "Potentially unsupported" },
};

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<"home" | "extractor">("home");
  const [inputText, setInputText] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [extractError, setExtractError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
      } else {
        setUser(data.session.user);
        setSession(data.session);
        setLoading(false);
      }
    });
  }, [router]);

  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const extractClaims = useCallback(async () => {
    if (!inputText.trim() || !session) return;
    setExtracting(true);
    setExtractError("");
    setClaims([]);

    try {
      const res = await fetch("/api/claims/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text: inputText, title: docTitle || "Untitled" }),
      });
      const data = await res.json() as { claims?: Claim[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      setClaims(data.claims || []);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setExtracting(false);
    }
  }, [inputText, docTitle, session]);

  const searchEvidence = useCallback(async (claimIndex: number) => {
    if (!session) return;
    const claim = claims[claimIndex];
    if (!claim) return;

    setClaims(prev => prev.map((c, i) => i === claimIndex ? { ...c, evidenceLoading: true } : c));

    try {
      const res = await fetch("/api/evidence/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ query: claim.query, claim_text: claim.text, claim_id: claim.id }),
      });
      const data = await res.json() as { results?: Evidence["results"]; confidence?: string; source_count?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Search failed");
      setClaims(prev => prev.map((c, i) => i === claimIndex ? {
        ...c,
        evidence: { results: data.results || [], confidence: data.confidence || "low", source_count: data.source_count || 0 },
        evidenceLoading: false,
      } : c));
    } catch {
      setClaims(prev => prev.map((c, i) => i === claimIndex ? { ...c, evidenceLoading: false } : c));
    }
  }, [claims, session]);

  const searchAllEvidence = useCallback(async () => {
    if (!session || claims.length === 0) return;
    for (let i = 0; i < claims.length; i++) {
      if (!claims[i].evidence) {
        await searchEvidence(i);
        await new Promise(r => setTimeout(r, 300)); // Rate limit
      }
    }
  }, [claims, session, searchEvidence]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#888" }}>Loading...</div>
      </div>
    );
  }

  const firstName = user?.user_metadata?.name?.split(" ")[0] || user?.email?.split("@")[0] || "there";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #1a1a1a", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#0a0a0a", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>📋</span>
          <span style={{ fontWeight: 700, fontSize: 18 }}>ClaimCheck Studio</span>
          <span style={{ background: "#1a2a4a", color: "#4f8ef7", fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>BETA</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ color: "#888", fontSize: 14 }}>{user?.email}</span>
          <button onClick={signOut} style={{ padding: "6px 16px", background: "transparent", color: "#888", border: "1px solid #333", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Nav */}
      <div style={{ borderBottom: "1px solid #1a1a1a", padding: "0 32px", display: "flex", gap: 0 }}>
        {([["home", "🏠 Overview"], ["extractor", "🔬 Claim Extractor"]] as const).map(([view, label]) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            style={{
              padding: "12px 20px", background: "transparent", color: activeView === view ? "#4f8ef7" : "#666",
              border: "none", borderBottom: activeView === view ? "2px solid #4f8ef7" : "2px solid transparent",
              cursor: "pointer", fontSize: 14, fontWeight: activeView === view ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 32px" }}>

        {activeView === "home" && (
          <>
            <div style={{ marginBottom: 40 }}>
              <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
                Welcome, {firstName}! 🎉
              </h1>
              <p style={{ color: "#888", fontSize: 16 }}>
                You&apos;re in early access. Here&apos;s what you can do right now:
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, marginBottom: 40 }}>
              {[
                { icon: "📄", title: "Claim Extractor", desc: "Upload a manuscript or paste text. Claude AI extracts every factual claim automatically.", status: "live", action: () => setActiveView("extractor") },
                { icon: "🔬", title: "Evidence Search", desc: "Search PubMed + CrossRef to find peer-reviewed sources for each claim.", status: "live", action: () => setActiveView("extractor") },
                { icon: "📊", title: "Confidence Scores", desc: "Provenance scoring and risk flags for unsupported assertions.", status: "coming" },
                { icon: "✍️", title: "Content Generator", desc: "Auto-generate tweet threads, LinkedIn posts, and explainer blogs.", status: "coming" },
                { icon: "📦", title: "Citation Bundle", desc: "Export DOIs, plain-language summaries, and snapshot PDFs.", status: "coming" },
                { icon: "🛡️", title: "Compliance Agent", desc: "Regulatory phrasing enforcement with auditable review trail.", status: "coming" },
              ].map(card => (
                <div
                  key={card.title}
                  onClick={card.action}
                  style={{
                    background: "#111", border: `1px solid ${card.status === "live" ? "#1a3a6e" : "#222"}`,
                    borderRadius: 12, padding: 24, position: "relative", overflow: "hidden",
                    cursor: card.action ? "pointer" : "default",
                    transition: "border-color 0.2s",
                  }}
                  onMouseEnter={e => { if (card.action) (e.currentTarget as HTMLDivElement).style.borderColor = "#4f8ef7"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = card.status === "live" ? "#1a3a6e" : "#222"; }}
                >
                  <div style={{
                    position: "absolute", top: 12, right: 12, fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600,
                    background: card.status === "live" ? "#1a3a1a" : "#1a1a2a",
                    color: card.status === "live" ? "#4ade80" : "#4f8ef7",
                  }}>
                    {card.status === "live" ? "LIVE" : "COMING SOON"}
                  </div>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>{card.icon}</div>
                  <h3 style={{ fontWeight: 600, marginBottom: 6 }}>{card.title}</h3>
                  <p style={{ color: "#666", fontSize: 13, lineHeight: 1.5 }}>{card.desc}</p>
                </div>
              ))}
            </div>

            <div style={{ background: "#0d1a2e", border: "1px solid #1a3a6e", borderRadius: 12, padding: 28 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>🚀 You&apos;re one of our first users</h3>
              <p style={{ color: "#7fb3f5", fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
                We&apos;re building ClaimCheck Studio feature by feature. Your feedback directly shapes what we build next.
              </p>
              <a href="mailto:hello@citebundle.com" style={{ display: "inline-block", padding: "10px 20px", background: "#4f8ef7", color: "#fff", borderRadius: 8, textDecoration: "none", fontSize: 14, fontWeight: 600 }}>
                📬 Send us feedback
              </a>
            </div>
          </>
        )}

        {activeView === "extractor" && (
          <>
            <div style={{ marginBottom: 32 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>🔬 Claim Extractor</h1>
              <p style={{ color: "#888", fontSize: 15 }}>
                Paste your text below. Claude AI will extract all factual claims, then you can search for peer-reviewed evidence for each one.
              </p>
            </div>

            {claims.length === 0 ? (
              <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: 28 }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", color: "#aaa", fontSize: 13, marginBottom: 6 }}>Document title (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 'Q1 Health Report' or 'Supplement Research'"
                    value={docTitle}
                    onChange={e => setDocTitle(e.target.value)}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #333", background: "#1a1a1a", color: "#fff", fontSize: 14, boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", color: "#aaa", fontSize: 13, marginBottom: 6 }}>Text content *</label>
                  <textarea
                    placeholder="Paste your manuscript, transcript, blog post, slide copy, or any text containing factual claims..."
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    rows={10}
                    style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid #333", background: "#1a1a1a", color: "#fff", fontSize: 14, lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
                  />
                  <div style={{ color: "#555", fontSize: 12, marginTop: 4 }}>{inputText.length} characters</div>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <button
                    onClick={extractClaims}
                    disabled={!inputText.trim() || extracting}
                    style={{ padding: "12px 28px", background: inputText.trim() ? "#4f8ef7" : "#1a1a1a", color: inputText.trim() ? "#fff" : "#555", border: "none", borderRadius: 8, cursor: inputText.trim() ? "pointer" : "not-allowed", fontSize: 15, fontWeight: 600 }}
                  >
                    {extracting ? "⚡ Extracting claims..." : "⚡ Extract Claims"}
                  </button>
                  <span style={{ color: "#555", fontSize: 13 }}>Powered by Claude AI</span>
                </div>
                {extractError && <p style={{ color: "#f87171", fontSize: 13, marginTop: 12 }}>❌ {extractError}</p>}
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ fontSize: 22, fontWeight: 700 }}>Found {claims.length} claims</h2>
                    <p style={{ color: "#888", fontSize: 13 }}>
                      {claims.filter(c => c.risk === "high").length} high risk · {claims.filter(c => c.risk === "medium").length} medium · {claims.filter(c => c.risk === "low").length} low risk
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={searchAllEvidence}
                      style={{ padding: "10px 20px", background: "#166534", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 }}
                    >
                      🔬 Search All Evidence
                    </button>
                    <button
                      onClick={() => { setClaims([]); setInputText(""); setExtractError(""); }}
                      style={{ padding: "10px 20px", background: "transparent", color: "#888", border: "1px solid #333", borderRadius: 8, cursor: "pointer", fontSize: 14 }}
                    >
                      ↩ New document
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {claims.map((claim, i) => {
                    const riskStyle = RISK_COLORS[claim.risk];
                    return (
                      <div key={claim.id} style={{ background: "#111", border: "1px solid #222", borderRadius: 12, overflow: "hidden" }}>
                        <div style={{ padding: "16px 20px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                                <span style={{ color: "#444", fontSize: 12, fontWeight: 600 }}>#{claim.id}</span>
                                <span style={{ background: riskStyle.bg, color: riskStyle.text, fontSize: 11, padding: "2px 8px", borderRadius: 12, fontWeight: 600 }}>
                                  {riskStyle.label}
                                </span>
                                <span style={{ background: "#1a1a2a", color: "#6b7de8", fontSize: 11, padding: "2px 8px", borderRadius: 12 }}>
                                  {claim.category}
                                </span>
                                {claim.is_statistical && (
                                  <span style={{ background: "#2a1a3a", color: "#c084fc", fontSize: 11, padding: "2px 8px", borderRadius: 12 }}>
                                    📊 statistical
                                  </span>
                                )}
                              </div>
                              <p style={{ color: "#ddd", fontSize: 14, lineHeight: 1.6, margin: 0 }}>{claim.text}</p>
                            </div>
                            <button
                              onClick={() => searchEvidence(i)}
                              disabled={claim.evidenceLoading}
                              style={{
                                flexShrink: 0, padding: "8px 16px", background: claim.evidence ? "#1a3a1a" : "#1a2a4a",
                                color: claim.evidence ? "#4ade80" : "#4f8ef7", border: `1px solid ${claim.evidence ? "#2d5a2d" : "#1a3a6e"}`,
                                borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600,
                              }}
                            >
                              {claim.evidenceLoading ? "Searching..." : claim.evidence ? `✓ ${claim.evidence.source_count} sources` : "🔬 Find Evidence"}
                            </button>
                          </div>
                        </div>

                        {claim.evidence && claim.evidence.results.length > 0 && (
                          <div style={{ borderTop: "1px solid #1a1a1a", padding: "12px 20px", background: "#0d0d0d" }}>
                            <div style={{ color: "#888", fontSize: 12, marginBottom: 10 }}>Evidence from PubMed + CrossRef:</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {claim.evidence.results.slice(0, 4).map(paper => (
                                <div key={paper.uid} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 8, padding: "10px 12px" }}>
                                  <div style={{ color: "#ddd", fontSize: 13, fontWeight: 600, marginBottom: 4, lineHeight: 1.4 }}>
                                    {paper.doi ? (
                                      <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer" style={{ color: "#4f8ef7", textDecoration: "none" }}>
                                        {paper.title}
                                      </a>
                                    ) : paper.title}
                                  </div>
                                  <div style={{ color: "#666", fontSize: 12 }}>
                                    {paper.authors.join(", ")} · {paper.source} · {paper.pubdate}
                                    {paper.doi && <span> · <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer" style={{ color: "#555" }}>DOI: {paper.doi}</a></span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {claim.evidence && claim.evidence.results.length === 0 && (
                          <div style={{ borderTop: "1px solid #1a1a1a", padding: "12px 20px", background: "#0d0d0d", color: "#666", fontSize: 13 }}>
                            No peer-reviewed sources found for this claim. Consider revising or flagging as unsupported.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
