import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createSupabaseAdminClient } from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  // Check auth via Supabase session
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.split(" ")[1];
  const supabase = createSupabaseAdminClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { text, title } = await req.json();
  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const prompt = `You are a scientific fact-checker. Extract all factual claims from the following text that could be verified with peer-reviewed literature.

For each claim, provide:
1. The exact claim text (verbatim or close paraphrase)
2. A risk level: "low" (well-established), "medium" (plausible but needs verification), "high" (contested or potentially unsupported)
3. Suggested search query for PubMed/academic databases
4. Whether it's a statistical claim (number/percentage mentioned)

Return a JSON array of claims. Each claim object must have:
- id: sequential number starting from 1
- text: the claim text
- risk: "low" | "medium" | "high"
- query: PubMed search query string
- is_statistical: boolean
- category: one of "efficacy", "safety", "epidemiology", "mechanism", "general"

TEXT TO ANALYZE:
---
${text.substring(0, 8000)}
---

Return ONLY valid JSON array, no markdown or explanation.`;

  try {
    const message = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      return NextResponse.json({ error: "Unexpected response" }, { status: 500 });
    }

    let claims: unknown[];
    try {
      const jsonStr = content.text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();
      claims = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: "Failed to parse claims", raw: content.text }, { status: 500 });
    }

    // Save document to DB
    const { data: doc } = await supabase.from("documents").insert({
      user_id: user.id,
      title: title || "Untitled Document",
      text_content: text.substring(0, 10000),
      claim_count: claims.length,
      created_at: new Date().toISOString(),
    }).select().single();

    return NextResponse.json({ claims, document_id: doc?.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
