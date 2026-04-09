import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { notifyTeam } from "@/lib/notifier";

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization") || "";
  const adminPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET || "claimcheck-admin-2024";
  // Support both "Bearer <token>" and plain token
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();
  return token === adminPassword;
}

interface Stats {
  leads: { total: number; last24h: number; last7d: number };
  topUtmSources7d: Array<{ source: string; count: number }>;
  topReferrers7d: Array<{ referrer: string; count: number }>;
  generatedAt: string;
}

async function computeStats(): Promise<Stats> {
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Total leads
  const { count: totalLeads } = await supabase
    .from("cc_waitlist")
    .select("*", { count: "exact", head: true });

  // Last 24h leads
  const { count: leads24h } = await supabase
    .from("cc_waitlist")
    .select("*", { count: "exact", head: true })
    .gte("created_at", ago24h);

  // Last 7d leads
  const { count: leads7d } = await supabase
    .from("cc_waitlist")
    .select("*", { count: "exact", head: true })
    .gte("created_at", ago7d);

  // Last 7d entries for UTM/referrer breakdown (up to 1000)
  const { data: recent7d } = await supabase
    .from("cc_waitlist")
    .select("meta")
    .gte("created_at", ago7d)
    .limit(1000);

  // Tally utm_source and referrers from meta jsonb
  const utmMap: Record<string, number> = {};
  const refMap: Record<string, number> = {};

  for (const row of recent7d || []) {
    const meta = row.meta as Record<string, string> | null;
    if (!meta) continue;
    const src = meta.utm_source;
    if (src) utmMap[src] = (utmMap[src] || 0) + 1;
    const ref = meta.referrer;
    if (ref) {
      // Normalize to hostname
      try {
        const hostname = new URL(ref).hostname;
        refMap[hostname] = (refMap[hostname] || 0) + 1;
      } catch {
        refMap[ref] = (refMap[ref] || 0) + 1;
      }
    }
  }

  const topUtmSources7d = Object.entries(utmMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, count]) => ({ source, count }));

  const topReferrers7d = Object.entries(refMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([referrer, count]) => ({ referrer, count }));

  return {
    leads: {
      total: totalLeads ?? 0,
      last24h: leads24h ?? 0,
      last7d: leads7d ?? 0,
    },
    topUtmSources7d,
    topReferrers7d,
    generatedAt: now.toISOString(),
  };
}

function buildDigestText(stats: Stats): string {
  const lines = [
    `ClaimCheck Studio — Daily Funnel Digest`,
    `Generated: ${stats.generatedAt}`,
    ``,
    `═══ LEADS ═══`,
    `  Total:    ${stats.leads.total}`,
    `  Last 24h: ${stats.leads.last24h}`,
    `  Last 7d:  ${stats.leads.last7d}`,
    ``,
    `═══ TOP UTM SOURCES (7d) ═══`,
  ];
  if (stats.topUtmSources7d.length === 0) {
    lines.push("  (none)");
  } else {
    for (const { source, count } of stats.topUtmSources7d) {
      lines.push(`  ${source}: ${count}`);
    }
  }
  lines.push(``, `═══ TOP REFERRERS (7d) ═══`);
  if (stats.topReferrers7d.length === 0) {
    lines.push("  (none)");
  } else {
    for (const { referrer, count } of stats.topReferrers7d) {
      lines.push(`  ${referrer}: ${count}`);
    }
  }
  return lines.join("\n");
}

// GET — return stats without sending notification (useful for /admin)
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const stats = await computeStats();
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    console.error("[daily-digest] GET error:", err);
    return NextResponse.json({ error: "Failed to compute stats" }, { status: 500 });
  }
}

// POST — compute stats and send notification
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const stats = await computeStats();
    const text = buildDigestText(stats);
    await notifyTeam({
      subject: "ClaimCheck Daily Funnel Digest",
      text,
      html: `<pre style="font-family:monospace;font-size:13px;line-height:1.5">${text}</pre>`,
    });
    return NextResponse.json({ ok: true, sent: true, stats });
  } catch (err) {
    console.error("[daily-digest] POST error:", err);
    return NextResponse.json({ error: "Failed to send digest" }, { status: 500 });
  }
}
