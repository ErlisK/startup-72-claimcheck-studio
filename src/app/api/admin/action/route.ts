import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "claimcheck-admin-2024";

function isAuthorized(req: NextRequest) {
  return req.headers.get("x-admin-secret") === ADMIN_SECRET;
}

async function sendInviteEmail(email: string, name: string, inviteUrl: string) {
  const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY;
  if (!AGENTMAIL_API_KEY) return;

  const firstName = name.split(" ")[0];
  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #222;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:#0d1a2e;padding:32px 40px;border-bottom:1px solid #1a3a6e;">
            <div style="font-size:28px;margin-bottom:8px;">📋</div>
            <div style="color:#fff;font-size:22px;font-weight:700;">ClaimCheck Studio</div>
            <div style="color:#4f8ef7;font-size:13px;margin-top:4px;">Evidence-backed content, at scale</div>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="color:#fff;font-size:24px;font-weight:700;margin:0 0 16px;">You're in, ${firstName}! 🎉</h2>
            <p style="color:#aaa;font-size:15px;line-height:1.6;margin:0 0 24px;">
              Your early access to <strong style="color:#fff;">ClaimCheck Studio</strong> is ready. 
              We're building the tools to turn your manuscripts, slide decks, and transcripts into 
              evidence-backed, channel-ready content — with peer-reviewed sources for every claim.
            </p>
            <div style="background:#0d1a2e;border:1px solid #1a3a6e;border-radius:12px;padding:20px;margin-bottom:28px;">
              <div style="color:#7fb3f5;font-size:13px;font-weight:600;margin-bottom:12px;">WHAT'S WAITING FOR YOU</div>
              <ul style="color:#aaa;font-size:14px;line-height:1.8;margin:0;padding-left:20px;">
                <li>📄 <strong style="color:#fff;">Claim Extractor</strong> — upload a doc, get claims in seconds</li>
                <li>🔬 <strong style="color:#fff;">Evidence Search</strong> — PubMed + CrossRef + Scite</li>
                <li>📊 <strong style="color:#fff;">Confidence Scores</strong> — know what's supported vs. risky</li>
                <li>✍️ <strong style="color:#fff;">Content Generator</strong> — tweet threads, LinkedIn, blog posts</li>
                <li>📦 <strong style="color:#fff;">Citation Bundle</strong> — DOIs, summaries, snapshot PDFs</li>
              </ul>
            </div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="${inviteUrl}" style="display:inline-block;padding:14px 40px;background:#4f8ef7;color:#fff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.3px;">
                  Access ClaimCheck Studio →
                </a>
              </td></tr>
            </table>
            <p style="color:#555;font-size:12px;text-align:center;margin-top:16px;">
              This link expires in 24 hours. Click it to set up your account — no password needed.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #1a1a1a;">
            <p style="color:#444;font-size:12px;text-align:center;margin:0;">
              Questions? Reply to this email or reach us at 
              <a href="mailto:hello@citebundle.com" style="color:#4f8ef7;">hello@citebundle.com</a><br>
              ClaimCheck Studio · citebundle.com
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await fetch("https://api.agentmail.to/v0/inboxes/scide-founder@agentmail.to/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AGENTMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: [email],
      subject: `You're in — ClaimCheck Studio Early Access 🎉`,
      html: htmlBody,
      text: `Hey ${firstName}, your early access to ClaimCheck Studio is ready!\n\nClick here to get started: ${inviteUrl}\n\nThis link expires in 24 hours.\n\nQuestions? Email hello@citebundle.com`,
    }),
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, action } = await req.json();
  if (!id || !action) {
    return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  if (action === "remove") {
    const { error } = await supabase.from("cc_waitlist").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "approve") {
    // Get the waitlist entry
    const { data: entry, error: fetchErr } = await supabase
      .from("cc_waitlist")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://citebundle.com";

    // Use inviteUserByEmail to create the user (this sends Supabase's default email,
    // but we ALSO send a custom branded email via AgentMail).
    // For already-existing users, fall back to generateLink.
    let userId: string | undefined;
    let inviteUrl: string;

    // Try invite first
    const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
      entry.email,
      {
        redirectTo: `${appUrl}/auth/callback`,
        data: { name: entry.name, company: entry.company, role: entry.role },
      }
    );

    if (inviteErr && !inviteErr.message?.includes("already been registered") && !inviteErr.message?.includes("already registered")) {
      return NextResponse.json({ error: inviteErr.message }, { status: 500 });
    }

    userId = inviteData?.user?.id;

    // Generate a fresh magic link (works for new AND existing users)
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: entry.email,
      options: {
        redirectTo: `${appUrl}/auth/callback`,
      },
    });

    if (linkErr) {
      return NextResponse.json({ error: linkErr.message }, { status: 500 });
    }

    inviteUrl = linkData?.properties?.action_link || `${appUrl}/login`;

    // Send branded email via AgentMail
    await sendInviteEmail(entry.email, entry.name, inviteUrl);

    // Mark as invited in waitlist
    await supabase
      .from("cc_waitlist")
      .update({ status: "invited", invited_at: new Date().toISOString() })
      .eq("id", id);

    // Upsert profile
    if (userId) {
      await supabase.from("profiles").upsert({
        id: userId,
        email: entry.email,
        name: entry.name,
        company: entry.company,
        role: entry.role,
        created_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true, user_id: userId });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
