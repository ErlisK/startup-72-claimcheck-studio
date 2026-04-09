"use client";

import { useState, useEffect, useCallback } from "react";

interface WaitlistEntry {
  id: string;
  name: string;
  email: string;
  company: string | null;
  role: string | null;
  use_case: string | null;
  status: string;
  invited_at: string | null;
  created_at: string;
}

interface AuthUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in: string | null;
  confirmed: boolean;
  metadata: Record<string, string>;
}

const DEFAULT_SECRET = "";

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState<"waitlist" | "users">("waitlist");

  const fetchWaitlist = useCallback(async () => {
    const res = await fetch("/api/admin/waitlist", {
      headers: { "x-admin-secret": secret },
    });
    const json = await res.json();
    if (json.data) setWaitlist(json.data);
  }, [secret]);

  const fetchUsers = useCallback(async () => {
    const res = await fetch(`/api/admin/users?secret=${encodeURIComponent(secret)}`);
    const json = await res.json();
    if (json.users) setUsers(json.users);
  }, [secret]);

  const login = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/waitlist", {
      headers: { "x-admin-secret": secret },
    });
    if (res.ok) {
      const json = await res.json();
      setWaitlist(json.data || []);
      setAuthed(true);
      await fetchUsers();
    } else {
      setMsg("❌ Wrong secret");
    }
    setLoading(false);
  };

  const doAction = async (id: string, action: "approve" | "remove") => {
    setLoading(true);
    setMsg("");
    const res = await fetch("/api/admin/action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": secret,
      },
      body: JSON.stringify({ id, action }),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg(action === "approve" ? "✅ Invite sent!" : "🗑️ Removed.");
      await fetchWaitlist();
    } else {
      setMsg("❌ " + (json.error || "Error"));
    }
    setLoading(false);
  };

  const deleteUser = async (userId: string, email: string) => {
    if (!confirm(`Delete user ${email}? This is permanent.`)) return;
    setLoading(true);
    const res = await fetch(`/api/admin/users?secret=${encodeURIComponent(secret)}&user_id=${userId}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.ok) {
      setMsg("🗑️ User deleted.");
      await fetchUsers();
    } else {
      setMsg("❌ " + json.error);
    }
    setLoading(false);
  };

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: "#111", border: "1px solid #333", borderRadius: 12, padding: 40, width: 360 }}>
          <h1 style={{ color: "#fff", marginBottom: 24, fontSize: 22 }}>🔐 Admin Login</h1>
          <input
            type="password"
            placeholder="Admin secret"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            onKeyDown={e => e.key === "Enter" && login()}
            style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #444", background: "#1a1a1a", color: "#fff", marginBottom: 12, boxSizing: "border-box" }}
          />
          <button
            onClick={login}
            disabled={loading}
            style={{ width: "100%", padding: "10px 0", background: "#4f8ef7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}
          >
            {loading ? "Checking..." : "Enter"}
          </button>
          {msg && <p style={{ color: "#ff6b6b", marginTop: 12 }}>{msg}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff", padding: 32 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>ClaimCheck Admin</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => { setTab("waitlist"); fetchWaitlist(); }}
              style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #444", background: tab === "waitlist" ? "#4f8ef7" : "#1a1a1a", color: "#fff", cursor: "pointer" }}
            >
              Waitlist ({waitlist.length})
            </button>
            <button
              onClick={() => { setTab("users"); fetchUsers(); }}
              style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #444", background: tab === "users" ? "#4f8ef7" : "#1a1a1a", color: "#fff", cursor: "pointer" }}
            >
              App Users ({users.length})
            </button>
          </div>
        </div>

        {msg && (
          <div style={{ background: "#1a2a1a", border: "1px solid #2d5a2d", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
            {msg}
          </div>
        )}

        {tab === "waitlist" && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 16, color: "#aaa" }}>Waitlist Entries</h2>
            {waitlist.length === 0 && <p style={{ color: "#666" }}>No entries yet.</p>}
            {waitlist.map(entry => (
              <div key={entry.id} style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: 20, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>{entry.name}</div>
                    <div style={{ color: "#888", fontSize: 14 }}>{entry.email}</div>
                    {entry.company && <div style={{ color: "#666", fontSize: 13 }}>{entry.company} · {entry.role}</div>}
                    {entry.use_case && <div style={{ color: "#555", fontSize: 13, marginTop: 6, maxWidth: 500 }}>"{entry.use_case}"</div>}
                    <div style={{ fontSize: 12, color: "#444", marginTop: 6 }}>
                      Joined {new Date(entry.created_at).toLocaleDateString()}
                      {entry.invited_at && ` · Invited ${new Date(entry.invited_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      background: entry.status === "invited" ? "#1a3a1a" : "#2a2a1a",
                      color: entry.status === "invited" ? "#4ade80" : "#fbbf24",
                    }}>
                      {entry.status}
                    </span>
                    {entry.status !== "invited" && (
                      <button
                        onClick={() => doAction(entry.id, "approve")}
                        disabled={loading}
                        style={{ padding: "6px 14px", background: "#166534", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
                      >
                        ✉️ Invite
                      </button>
                    )}
                    <button
                      onClick={() => doAction(entry.id, "remove")}
                      disabled={loading}
                      style={{ padding: "6px 14px", background: "#7f1d1d", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
                    >
                      🗑️ Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "users" && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 16, color: "#aaa" }}>Active App Users</h2>
            {users.length === 0 && <p style={{ color: "#666" }}>No users yet.</p>}
            {users.map(user => (
              <div key={user.id} style={{ background: "#111", border: "1px solid #222", borderRadius: 10, padding: 20, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{user.metadata?.name || user.email}</div>
                    <div style={{ color: "#888", fontSize: 14 }}>{user.email}</div>
                    {user.metadata?.company && <div style={{ color: "#666", fontSize: 13 }}>{user.metadata.company}</div>}
                    <div style={{ fontSize: 12, color: "#444", marginTop: 4 }}>
                      Created {new Date(user.created_at).toLocaleDateString()}
                      {user.last_sign_in && ` · Last login ${new Date(user.last_sign_in).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      background: user.confirmed ? "#1a3a1a" : "#3a2a1a",
                      color: user.confirmed ? "#4ade80" : "#fb923c",
                    }}>
                      {user.confirmed ? "confirmed" : "pending"}
                    </span>
                    <button
                      onClick={() => deleteUser(user.id, user.email)}
                      disabled={loading}
                      style={{ padding: "6px 14px", background: "#7f1d1d", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

