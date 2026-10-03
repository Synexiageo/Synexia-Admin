// დიაგნოსტიკა: რომელი გასაღები მუშაობს და რომელი არა.
// თვითონ მნიშვნელობებს არ აჩვენებს — მხოლოდ იმას, მუშაობს თუ არა.

export default async () => {
  const out = {};
  const env = k => process.env[k] || "";

  // Telegram
  const tgToken = env("TELEGRAM_BOT_TOKEN");
  if (!tgToken) out.telegram = "ცვლადი არ არის";
  else {
    try {
      const r = await fetch(`https://api.telegram.org/bot${tgToken}/getMe`);
      const d = await r.json();
      out.telegram = d.ok ? `✓ @${d.result.username}` : `✗ ${d.description}`;
    } catch (e) { out.telegram = "✗ " + e.message; }
  }

  out.owner_id = env("TELEGRAM_OWNER_ID") || "ცვლადი არ არის";
  out.secret   = env("TELEGRAM_SECRET") ? "✓ დაყენებულია" : "ცვლადი არ არის";

  // Anthropic
  const aiKey = env("ANTHROPIC_API_KEY");
  if (!aiKey) out.anthropic = "ცვლადი არ არის";
  else {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": aiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.BOT_MODEL || "claude-opus-5-5",
          max_tokens: 4, messages: [{ role: "user", content: "hi" }],
        }),
      });
      const d = await r.json();
      out.anthropic = r.ok ? "✓ მუშაობს" : `✗ ${d.error?.message || r.status}`;
    } catch (e) { out.anthropic = "✗ " + e.message; }
  }

  // Supabase
  const sbKey = env("SB_SERVICE_KEY");
  if (!sbKey) out.supabase = "ცვლადი არ არის";
  else {
    try {
      const url = (env("SB_URL") || "https://tsfzuyujfcacultjexsy.supabase.co")
        + "/rest/v1/rpc/bot_schema";
      const r = await fetch(url, {
        method: "POST",
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json" },
        body: "{}",
      });
      out.supabase = r.ok ? "✓ მუშაობს" : `✗ ${r.status} ${(await r.text()).slice(0, 120)}`;
    } catch (e) { out.supabase = "✗ " + e.message; }
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
