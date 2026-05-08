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
}  return String(mime || "").toLowerCase() === "application/pdf";
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

async function uploadPdfToOpenAI({ dataUrl, fileName, apiKey }) {
  const base64 = getBase64FromDataUrl(dataUrl);
  if (!base64) {
    throw new Error("PDF upload failed: missing base64 PDF data.");
  }

  const buffer = Buffer.from(base64, "base64");
  const blob = new Blob([buffer], { type: "application/pdf" });

  const form = new FormData();
  form.append("purpose", "user_data");
  form.append("file", blob, safeFileName(fileName, "revamplex-plan.pdf"));

  const uploadRes = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  const uploadJson = await uploadRes.json();

  if (!uploadRes.ok) {
    console.error("OpenAI file upload error:", uploadJson);
    throw new Error(uploadJson?.error?.message || "Could not upload PDF to OpenAI Files API.");
  }

  if (!uploadJson?.id) {
    throw new Error("OpenAI file upload did not return a file ID.");
  }

  return uploadJson.id;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in Vercel Environment Variables." });
    }

    const body = req.body || {};

    const rawFile =
      body.fileData ||
      body.file_data ||
      body.dataUrl ||
      body.data_url ||
      body.imageDataUrl ||
      body.image_url ||
      body.base64 ||
      "";

    const providedMime = String(body.mimeType || body.mime || "").toLowerCase();
    const fileName = safeFileName(body.fileName || body.filename || "revamplex-upload");

    let dataUrl = cleanDataUrl(rawFile);

    if (dataUrl && !dataUrl.startsWith("data:") && providedMime) {
      dataUrl = `data:${providedMime};base64,${dataUrl}`;
    }

    const mime = getMimeFromDataUrl(dataUrl) || providedMime;

    if (!dataUrl || !dataUrl.startsWith("data:")) {
      return res.status(400).json({
        error: "Upload did not arrive as a valid base64 data URL.",
        hint: "Expected data:image/jpeg;base64,... or data:application/pdf;base64,..."
      });
    }

    if (!isImageMime(mime) && !isPdfMime(mime)) {
      return res.status(400).json({
        error: `Unsupported file type for AI Take-Off: ${mime || "unknown"}. Use PDF, JPG, PNG, or WEBP.`
      });
    }

    const takeoffPrompt = [
      "You are RevampLEX AI Take-Off Assistant for construction estimating.",
      "Analyze the uploaded construction plan, drawing, sketch, blueprint, or site photo.",
      "Return practical construction take-off quantities.",
      "",
      "Rules:",
      "- If the drawing has no readable scale, say measurements are approximate.",
      "- Do not invent exact measurements if scale is missing.",
      "- Extract visible rooms, walls, floor areas, tile areas, linear feet, doors, windows, fixtures, cabinetry, roofing, siding, flooring, concrete, drywall, paint, or trade-specific counts when possible.",
      "- Output valid JSON only. No markdown.",
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
      // Images can be sent directly as data URLs.
      content.push({
        type: "input_image",
        image_url: dataUrl,
        detail: "high"
      });
    }

    if (isPdfMime(mime)) {
      // Safer PDF path: upload to OpenAI Files API first, then reference file_id.
      const fileId = await uploadPdfToOpenAI({
        dataUrl,
        fileName: fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`,
        apiKey
      });

      content.push({
        type: "input_file",
        file_id: fileId
      });
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        input: [
          {
            role: "user",
            content
          }
        ],
        max_output_tokens: 2200
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
