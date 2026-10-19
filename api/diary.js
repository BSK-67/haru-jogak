// Vercel 서버리스 함수: 앱 -> (이 함수) -> Gemini. API 키는 서버 환경변수에만 있습니다.
const hits = new Map();

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  // 1) 접속 코드 확인 (ACCESS_CODE를 설정한 경우)
  const code = process.env.ACCESS_CODE;
  if (code && req.headers["x-access-code"] !== code) return res.status(401).json({ error: "code" });

  // 2) 하루 사용 횟수 제한 (접속자 주소 기준, 간이 방식)
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0] || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const k = ip + "|" + day;
  const n = (hits.get(k) || 0) + 1;
  hits.set(k, n);
  if (hits.size > 5000) hits.clear();
  if (n > Number(process.env.DAILY_LIMIT || 30)) return res.status(429).json({ error: "limit" });

  // 3) 입력 확인
  const prompt = String((req.body && req.body.prompt) || "").slice(0, 6000);
  if (!prompt) return res.status(400).json({ error: "empty" });
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) return res.status(500).json({ error: "not_configured" });

  // 4) Gemini 호출
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.9 },
        }),
      }
    );
    if (!r.ok) return res.status(502).json({ error: "upstream", status: r.status });
    const j = await r.json();
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    return res.status(200).json({ text: parts.map((p) => p.text || "").join("") });
  } catch (e) {
    return res.status(502).json({ error: "fail" });
  }
};
