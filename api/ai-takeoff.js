const OpenAI = require("openai");

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: "25mb"
    }
  }
};

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function safeJsonParse(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try { return JSON.parse(cleaned); } catch (err) { return null; }
}

function fallbackResult(rawText) {
  return {
    summary: rawText || "AI returned text but not valid JSON. Review manually.",
    assumptions: ["AI response could not be parsed into structured take-off items."],
    missing_info: ["Try a clearer plan image or provide a known scale/reference."],
    risks: ["Contractor must verify all take-off quantities before bidding."],
    items: []
  };
}

function normalizeImageDataUrl(value) {
  if (!value || typeof value !== "string") return "";
  const cleaned = value.trim();

  // OpenAI image inputs accept fully qualified URLs or base64 data URLs.
  // Keep this strict so bad PDF/file strings do not create vague pattern errors.
  const valid = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\r\n]+$/i.test(cleaned);
  if (!valid) return "";

  // Normalize jpg -> jpeg and remove line breaks from the base64 body.
  const commaIndex = cleaned.indexOf(",");
  const header = cleaned.slice(0, commaIndex).replace("image/jpg", "image/jpeg");
  const body = cleaned.slice(commaIndex + 1).replace(/[\r\n\s]/g, "");
  return `${header},${body}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in Vercel Environment Variables." });
    }

    const { imageDataUrl, fileName, projectContext } = req.body || {};
    const cleanImageDataUrl = normalizeImageDataUrl(imageDataUrl);

    if (!cleanImageDataUrl) {
      return res.status(400).json({
        error: "The uploaded file was not converted into a valid PNG/JPG/WebP image. Re-upload as a screenshot/image, or use the updated project-room file that converts PDFs/photos before sending."
      });
    }

    const context = projectContext || {};

    const prompt = `
You are RevampLEX AI Take-Off Assistant for construction estimating.

Read the uploaded drawing, blueprint page, marked plan, sketch, or site photo.
Extract contractor-reviewed estimate-ready quantities.

Project context:
- Job title: ${context.job_title || "Unknown"}
- Trade focus: ${context.trade || "General Renovation"}
- City: ${context.city || ""}
- Budget: ${context.budget || ""}
- Known scale/reference: ${context.known_scale || "Not provided"}
- Job description: ${context.description || ""}
- Contractor instructions: ${context.contractor_instructions || ""}

Return ONLY valid JSON with this exact shape:
{
  "summary": "plain English take-off summary",
  "assumptions": ["assumption 1"],
  "missing_info": ["missing measurement or unclear item"],
  "risks": ["risk or warning"],
  "items": [
    {
      "name": "Floor tile area",
      "quantity": 120,
      "unit": "sqft",
      "suggested_material_unit_cost": 3.25,
      "suggested_labor_hours": 8,
      "suggested_labor_rate": 75,
      "confidence": "high | medium | low | review",
      "notes": "how you got this quantity or what to verify"
    }
  ]
}

Rules:
- If scale is unclear, estimate only from visible dimensions and flag confidence low/review.
- Do not invent exact hidden dimensions.
- Prefer construction units: sqft, linear ft, cubic yd, pieces, fixtures, openings, squares, bags, rolls.
- Include doors, windows, fixtures, baseboard, wall area, floor area, ceiling area, roofing squares, siding squares, concrete volume, or trade-specific quantities when visible.
- Suggested costs are starter placeholders only and should be conservative.
`;

    const response = await client.responses.create({
      model: process.env.OPENAI_TAKEOFF_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: cleanImageDataUrl, detail: "high" }
          ]
        }
      ],
      temperature: 0.2
    });

    const text = response.output_text || "";
    const parsed = safeJsonParse(text);

    if (!parsed) return res.status(200).json(fallbackResult(text));

    return res.status(200).json({
      summary: parsed.summary || "AI take-off complete. Review before bidding.",
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
      missing_info: Array.isArray(parsed.missing_info) ? parsed.missing_info : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
      source_file: fileName || "uploaded drawing"
    });
  } catch (err) {
    console.error("AI take-off error:", err);
    return res.status(500).json({ error: err.message || "AI take-off failed." });
  }
};
