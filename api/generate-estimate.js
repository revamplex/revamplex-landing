export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { description } = req.body;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        input: `Create a detailed construction estimate with line items, labor, and materials based on this job:\n${description}`
      })
    });

    const data = await response.json();

    const output = data.output?.[0]?.content?.[0]?.text || "No response";

    res.status(200).json({ result: output });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI failed" });
  }
}
