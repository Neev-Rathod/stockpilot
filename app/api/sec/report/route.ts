import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing report URL." }, { status: 400 });
  }

  try {
    const response = await fetch(decodeURIComponent(url), {
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
      : contentType.includes("html") || /\.htm(l)?$/i.test(url)
        ? "html"
        : "text";

    return NextResponse.json({
      title: "SEC report preview",
      kind,
      rawText,
      sourceUrl: decodeURIComponent(url),
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
