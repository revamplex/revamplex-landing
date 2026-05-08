export const config = {
  api: {
    bodyParser: {
      sizeLimit: "50mb"
    }
  }
};

function isValidImageDataUrl(value) {
  return typeof value === "string" && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value.trim());
}

function extractOutputText(responseJson) {
  if (typeof responseJson?.output_text === "string") return responseJson.output_text;

  const parts = [];
  const output = Array.isArray(responseJson?.output) ? responseJson.output : [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (typeof c?.text === "string") parts.push(c.text);
    }
  }

  return parts.join("\n").trim();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in Vercel Environment Variables." });
    }

    const body = req.body || {};
    let pages = Array.isArray(body.pages) ? body.pages : [];

    const singleImage =
      body.imageDataUrl ||
      body.image_url ||
      body.fileData ||
      body.dataUrl ||
      "";

    if (!pages.length && isValidImageDataUrl(singleImage)) {
      pages = [{ pageNumber: 1, imageDataUrl: singleImage }];
    }

    pages = pages
      .map((p, index) => ({
        pageNumber: Number(p.pageNumber || index + 1),
        imageDataUrl: String(p.imageDataUrl || p.image_url || p.dataUrl || "").trim()
      }))
      .filter(p => isValidImageDataUrl(p.imageDataUrl))
      .slice(0, 5);

    if (!pages.length) {
      return res.status(400).json({
        error: "No readable PDF page images were received.",
        hint: "Convert PDF pages to JPEG in the browser first, then send pages[] to /api/ai-takeoff."
      });
    }

    const prompt = [
      "You are RevampLEX AI Take-Off Assistant for construction estimating.",
      "You are receiving one or more rendered JPG images from a PDF plan, blueprint, drawing, sketch, or site photo.",
      "Analyze all provided page images together.",
      "",
      "Return practical construction take-off quantities.",
      "",
      "Rules:",
      "- If no scale is readable, say measurements are approximate.",
      "- Do not invent exact dimensions when scale is missing.",
      "- Extract visible rooms, walls, floor areas, tile areas, linear feet, doors, windows, fixtures, cabinetry, roofing, siding, flooring, concrete, drywall, paint, or trade-specific counts when possible.",
      "- Include page references in notes when useful.",
      "- Output valid JSON only. No markdown.",
      "",
      "JSON shape:",
      "{",
      '  "summary": "short plain English summary",',
      '  "scale_found": true,',
      '  "confidence": "low | medium | high",',
      '  "items": [',
      '    { "item": "Floor tile", "qty": 120, "unit": "sqft", "trade": "Tile", "notes": "approximate, page 1" }',
      "  ],",
      '  "warnings": ["missing scale", "image resolution may limit accuracy"]',
      "}"
    ].join("\n");

    const content = [
      { type: "input_text", text: prompt },
      ...pages.map(p => ({
        type: "input_image",
        image_url: p.imageDataUrl,
        detail: "high"
      }))
    ];

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        input: [{ role: "user", content }],
        max_output_tokens: 2400
      })
    });

    const responseJson = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error("OpenAI AI Take-Off error:", responseJson);
      return res.status(openaiResponse.status).json({
        error: responseJson?.error?.message || "OpenAI AI Take-Off request failed.",
        details: responseJson
      });
    }

    const text = extractOutputText(responseJson);

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch (_) {}
      }
    }

    if (!parsed) {
      return res.status(200).json({
        summary: text || "AI Take-Off completed, but no structured JSON was returned.",
        scale_found: false,
        confidence: "low",
        items: [],
        warnings: ["AI response was not valid JSON."],
        raw: text
      });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("AI Take-Off server error:", err);
    return res.status(500).json({
      error: err.message || "AI Take-Off server error."
    });
  }
}
