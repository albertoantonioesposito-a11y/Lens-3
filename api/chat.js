export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "web-search-2025-03-05",
        },
        body: JSON.stringify(req.body),
      });

      const data = await response.json();

      // Retry su errori temporanei
      if ((response.status === 529 || response.status === 503 || response.status === 429) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        continue;
      }

      return res.status(response.status).json(data);
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        return res.status(500).json({ error: err.message });
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}
