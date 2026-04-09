/**
 * Unified notification utility.
 * Tries AgentMail first (if AGENTMAIL_API_KEY + TEAM_ALERT_EMAIL are set),
 * falls back to creating a GitHub Issue.
 */

const AGENTMAIL_INBOX = "scide-founder@agentmail.to";
const AGENTMAIL_API = "https://api.agentmail.to/v0/inboxes";
const GITHUB_API = "https://api.github.com";
const GITHUB_REPO = "ErlisK/startup-72-claimcheck-studio";

interface NotifyPayload {
  subject: string;
  text: string;
  html?: string;
}

async function sendViaAgentMail(payload: NotifyPayload): Promise<boolean> {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  const toEmail = process.env.TEAM_ALERT_EMAIL;
  if (!apiKey || !toEmail) return false;

  try {
    const res = await fetch(`${AGENTMAIL_API}/${AGENTMAIL_INBOX}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: [toEmail],
        subject: payload.subject,
        text: payload.text,
        html: payload.html || undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[notifier] AgentMail error", res.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notifier] AgentMail exception:", err);
    return false;
  }
}

async function sendViaGitHubIssue(payload: NotifyPayload): Promise<boolean> {
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    console.error("[notifier] No GITHUB_PERSONAL_ACCESS_TOKEN for fallback");
    return false;
  }

  try {
    // Ensure "lead" label exists (best effort)
    await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/labels`, {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "claimcheck-notifier",
      },
      body: JSON.stringify({ name: "lead", color: "2563eb", description: "Lead notification" }),
    });

    const res = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "claimcheck-notifier",
      },
      body: JSON.stringify({
        title: payload.subject,
        body: payload.text,
        labels: ["lead"],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[notifier] GitHub issue error", res.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notifier] GitHub issue exception:", err);
    return false;
  }
}

export async function notifyTeam(payload: NotifyPayload): Promise<void> {
  const sent = await sendViaAgentMail(payload);
  if (!sent) {
    console.log("[notifier] AgentMail unavailable, falling back to GitHub Issue");
    await sendViaGitHubIssue(payload);
  }
}
