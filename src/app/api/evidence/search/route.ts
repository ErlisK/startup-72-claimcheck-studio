import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase";

interface PubMedArticle {
  uid: string;
  title: string;
  authors: string[];
  source: string;
  pubdate: string;
  doi?: string;
  abstract?: string;
}

async function searchPubMed(query: string, maxResults = 5): Promise<PubMedArticle[]> {
  try {
    // Search PubMed
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;
    const searchRes = await fetch(searchUrl, { headers: { "User-Agent": "ClaimCheckStudio/1.0" } });
    const searchData = await searchRes.json() as { esearchresult?: { idlist?: string[] } };
    const ids: string[] = searchData.esearchresult?.idlist || [];
    
    if (ids.length === 0) return [];

    // Fetch summaries
    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
    const summaryRes = await fetch(summaryUrl, { headers: { "User-Agent": "ClaimCheckStudio/1.0" } });
    const summaryData = await summaryRes.json() as { result?: Record<string, { title?: string; authors?: Array<{ name: string }>; source?: string; pubdate?: string; articleids?: Array<{ idtype: string; value: string }> }> };
    
    const results: PubMedArticle[] = [];
    for (const id of ids) {
      const article = summaryData.result?.[id];
      if (!article) continue;
      const doi = article.articleids?.find((a) => a.idtype === "doi")?.value;
      results.push({
        uid: id,
        title: article.title || "Unknown title",
        authors: article.authors?.slice(0, 3).map((a) => a.name) || [],
        source: article.source || "",
        pubdate: article.pubdate || "",
        doi,
      });
    }
    return results;
  } catch {
    return [];
  }
}

async function searchCrossRef(query: string, maxResults = 3): Promise<PubMedArticle[]> {
  try {
    const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${maxResults}&sort=relevance&mailto=hello@citebundle.com`;
    const res = await fetch(url);
    const data = await res.json() as { message?: { items?: Array<{ DOI?: string; title?: string[]; author?: Array<{ given?: string; family?: string }>; "container-title"?: string[]; published?: { "date-parts"?: number[][] } }> } };
    const items = data.message?.items || [];
    
    return items.map(item => ({
      uid: item.DOI || "",
      title: item.title?.[0] || "Unknown title",
      authors: item.author?.slice(0, 3).map(a => `${a.family || ""}, ${a.given || ""}`.trim()) || [],
      source: item["container-title"]?.[0] || "CrossRef",
      pubdate: item.published?.["date-parts"]?.[0]?.[0]?.toString() || "",
      doi: item.DOI,
    }));
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  // Check auth
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

  const { query, claim_text, claim_id } = await req.json();
  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  const [pubmedResults, crossrefResults] = await Promise.all([
    searchPubMed(query, 5),
    searchCrossRef(query, 3),
  ]);

  // Deduplicate by DOI
  const seen = new Set<string>();
  const combined = [...pubmedResults, ...crossrefResults].filter(r => {
    const key = r.doi || r.uid;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Score: simple confidence based on number of results
  const confidence = combined.length >= 3 ? "high" : combined.length >= 1 ? "medium" : "low";

  return NextResponse.json({
    claim_id,
    claim_text,
    results: combined,
    confidence,
    source_count: combined.length,
  });
}
