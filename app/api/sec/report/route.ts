import { NextRequest, NextResponse } from "next/server";

// Only allow fetching from SEC domains — prevents this proxy from being used
// as a server-side request forgery (SSRF) vector against internal services.
const ALLOWED_HOST_SUFFIXES = ["sec.gov"];

function isAllowedSecUrl(raw: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  const ok = ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
  return ok ? parsed : null;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing report URL." }, { status: 400 });
  }

  const safeUrl = isAllowedSecUrl(decodeURIComponent(url));
  if (!safeUrl) {
    return NextResponse.json(
      { error: "Only https://sec.gov report URLs are allowed." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(safeUrl.toString(), {
      headers: {
        "User-Agent": "StockPilot/1.0",
        Accept:
          "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch report (${response.status}).` },
        { status: response.status },
      );
    }

    const rawText = await response.text();
    const contentType =
      response.headers.get("content-type") ?? "application/octet-stream";

    const kind = contentType.includes("xml")
      ? "xml"
      : contentType.includes("html") || /\.htm(l)?$/i.test(safeUrl.pathname)
        ? "html"
        : "text";

    return NextResponse.json({
      title: "SEC report preview",
      kind,
      rawText,
      sourceUrl: safeUrl.toString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while fetching the report.",
      },
      { status: 500 },
    );
  }
}
