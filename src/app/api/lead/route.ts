import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { notifyTeam } from "@/lib/notifier";

function getIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, company, role, use_case,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    referrer: clientReferrer } = body;

  if (!email?.trim() || !name?.trim()) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const ip = getIP(req);
  const userAgent = req.headers.get("user-agent") || "unknown";
  const serverReferrer = req.headers.get("referer") || "";
  const referrer = clientReferrer || serverReferrer || "";

  // Also parse UTM from request URL in case they were passed as query params
  const url = new URL(req.url);
  const utmSource = utm_source || url.searchParams.get("utm_source") || null;
  const utmMedium = utm_medium || url.searchParams.get("utm_medium") || null;
  const utmCampaign = utm_campaign || url.searchParams.get("utm_campaign") || null;
  const utmTerm = utm_term || url.searchParams.get("utm_term") || null;
  const utmContent = utm_content || url.searchParams.get("utm_content") || null;

  const supabase = createSupabaseAdminClient();

  // Insert into waitlist (cc_waitlist table)
  const { error } = await supabase.from("cc_waitlist").insert({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    company: company?.trim() || null,
    role: role || null,
    use_case: use_case?.trim() || null,
    status: "pending",
  });

  if (error) {
    // Duplicate email is a common expected error
    if (error.code === "23505" || error.message?.includes("duplicate") || error.message?.includes("unique")) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("[lead] insert error:", error);
    return NextResponse.json({ error: "Submission failed. Please try again." }, { status: 500 });
  }

  // Fire-and-forget notification
  const notifText = [
    `New ClaimCheck Studio Lead`,
    ``,
    `Name:      ${name}`,
    `Email:     ${email}`,
    `Company:   ${company || "-"}`,
    `Role:      ${role || "-"}`,
    `Use Case:  ${use_case || "-"}`,
    ``,
    `Timestamp: ${timestamp} UTC`,
    `IP:        ${ip}`,
    `UA:        ${userAgent}`,
    `Referrer:  ${referrer || "-"}`,
    ``,
    `UTM Source:   ${utmSource || "-"}`,
    `UTM Medium:   ${utmMedium || "-"}`,
    `UTM Campaign: ${utmCampaign || "-"}`,
    `UTM Term:     ${utmTerm || "-"}`,
    `UTM Content:  ${utmContent || "-"}`,
  ].join("\n");

  notifyTeam({
    subject: `New ClaimCheck Studio Lead: ${name} <${email}>`,
    text: notifText,
    html: `<pre style="font-family:monospace;font-size:14px">${notifText.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`,
  }).catch((e) => console.error("[lead] notifyTeam failed:", e));

  return NextResponse.json({ ok: true });
}
