export const config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb"
    }
  }
};

function cleanDataUrl(value) {
  if (!value || typeof value !== "string") return "";
  return value.trim().replace(/\s/g, "");
}

function getMimeFromDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,/i);
  return match ? match[1].toLowerCase() : "";
}

function getBase64FromDataUrl(dataUrl) {
  return String(dataUrl || "").replace(/^data:[^;]+;base64,/i, "");
}

function isImageMime(mime) {
  return ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(String(mime || "").toLowerCase());
}

function isPdfMime(mime) {
  return String(mime || "").toLowerCase() === "application/pdf";
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

    // Accept several possible names so this works with your current front-end.
    const rawFile =
      body.fileData ||
      body.file_data ||
      body.dataUrl ||
      body.data_url ||
      body.imageDataUrl ||
      body.image_url ||
      body.base64 ||
      "";

    const fileName = body.fileName || body.filename || "revamplex-plan-upload";
    let dataUrl = cleanDataUrl(rawFile);

    // If the browser only sent raw base64, rebuild a data URL using mimeType.
    const providedMime = String(body.mimeType || body.mime || "").toLowerCase();
    if (dataUrl && !dataUrl.startsWith("data:") && providedMime) {
      dataUrl = `data:${providedMime};base64,${dataUrl}`;
    }

    const mime = getMimeFromDataUrl(dataUrl) || providedMime;

    if (!dataUrl || !dataUrl.startsWith("data:")) {
      return res.status(400).json({
        error: "Upload did not arrive as a valid base64 data URL.",
        hint: "Expected format like data:image/jpeg;base64,... or data:application/pdf;base64,..."
      });
    }

    if (!isImageMime(mime) && !isPdfMime(mime)) {
      return res.status(400).json({
        error: `Unsupported file type for AI Take-Off: ${mime || "unknown"}. Use PDF, JPG, PNG, or WEBP.`
      });
    }

    const takeoffPrompt = [
      "You are RevampLEX AI Take-Off Assistant for construction estimating.",
      "Analyze the uploaded plan, drawing, sketch, or site photo.",
      "Return practical construction take-off quantities.",
      "",
      "Important:",
      "- If the drawing has no scale, clearly say measurements are approximate.",
      "- Do not pretend exact measurements if scale is missing.",
      "- Extract visible rooms, wall lengths, floor areas, tile areas, doors, windows, fixtures, cabinetry, roofing/siding/flooring quantities when possible.",
      "- Output valid JSON only.",
      "",
      "JSON shape:",
      "{",
      '  "summary": "short plain English summary",',
      '  "scale_found": true,',
      '  "confidence": "low | medium | high",',
      '  "items": [',
      '    { "item": "Floor tile", "qty": 120, "unit": "sqft", "trade": "Tile", "notes": "approximate" }',
      "  ],",
      '  "warnings": ["missing scale", "photo angle may distort measurements"]',
      "}"
    ].join("\n");

    const content = [
      {
        type: "input_text",
        text: takeoffPrompt
      }
    ];

    if (isImageMime(mime)) {
      // Images use input_image + image_url.
      content.push({
        type: "input_image",
        image_url: dataUrl,
        detail: "high"
      });
    } else if (isPdfMime(mime)) {
      // PDFs must NOT be sent as input_image. They go as input_file.
      content.push({
        type: "input_file",
        filename: fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`,
        file_data: dataUrl
      });
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content
          }
        ],
        max_output_tokens: 1800
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
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (_) {}
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
