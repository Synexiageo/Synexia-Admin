// Telegram ბოტის საერთო ნაწილი — Claude, Supabase და Telegram ერთ ადგილას.
// გასაღებები მხოლოდ Netlify-ის გარემოს ცვლადებშია, კოდში არსად.

const env = (k, def) => process.env[k] ?? def;

export const OWNER = String(env("TELEGRAM_OWNER_ID", ""));
export const MODEL = env("BOT_MODEL", "claude-opus-5");

const SB_URL  = env("SB_URL", "https://tsfzuyujfcacultjexsy.supabase.co");
const SB_KEY  = env("SB_SERVICE_KEY", "");
const TG_TOKEN = env("TELEGRAM_BOT_TOKEN", "");
const AI_KEY  = env("ANTHROPIC_API_KEY", "");

// ── Supabase ──────────────────────────────────────────────────────
async function rpc(fn, args) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text.slice(0, 600));
  return text ? JSON.parse(text) : null;
}

export async function sbTable(path, init = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json", ...(init.headers || {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text.slice(0, 600));
  return text ? JSON.parse(text) : null;
}

async function audit(chatId, kind, query, affected, error) {
  try {
    await sbTable("bot_audit", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ chat_id: chatId, kind, query, affected, error }),
    });
  } catch { /* ჟურნალის შეცდომამ პასუხი არ უნდა შეაფერხოს */ }
}

// ── Telegram ──────────────────────────────────────────────────────
export async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export async function say(chatId, text) {
  const chunks = [];
  let rest = String(text ?? "").trim() || "—";
  while (rest.length > 3800) {
    let cut = rest.lastIndexOf("\n", 3800);
    if (cut < 2000) cut = 3800;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  chunks.push(rest);
  for (const c of chunks) await tg("sendMessage", { chat_id: chatId, text: c });
}

// ── ინსტრუმენტები ─────────────────────────────────────────────────
const TOOLS = [
  {
    name: "sql",
    description: "ბაზაში კითხვა. მხოლოდ SELECT ან WITH. მაქსიმუმ 500 სტრიქონი ბრუნდება — "
      + "დიდი სიისთვის count(*) ან group by გამოიყენე.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "PostgreSQL SELECT" } },
      required: ["query"],
    },
  },
  {
    name: "sql_write",
    description: "ბაზის შეცვლა: INSERT / UPDATE / DELETE. WHERE სავალდებულოა. "
      + "თუ 200-ზე მეტ სტრიქონს ეხება, ჯერ უარს იტყვის — მაშინ მომხმარებელს ჰკითხე "
      + "და დასტურის მიღების შემდეგ თავიდან გამოიძახე confirmed=true-თი.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        confirmed: { type: "boolean", description: "მომხმარებელმა ცალსახად დაადასტურა" },
      },
      required: ["query"],
    },
  },
  {
    name: "schema",
    description: "ბაზის ცხრილები და სვეტები. sql-ის წერამდე გამოიყენე, თუ არ გახსოვს სტრუქტურა.",
    input_schema: { type: "object", properties: {} },
  },
];

async function runTool(chatId, name, input) {
  if (name === "schema") return await rpc("bot_schema", {});
  if (name === "sql") {
    try {
      const out = await rpc("bot_sql_read", { q: input.query });
      await audit(chatId, "read", input.query, Array.isArray(out) ? out.length : null, null);
      return out;
    } catch (e) {
      await audit(chatId, "read", input.query, null, e.message);
      return { error: e.message };
    }
  }
  if (name === "sql_write") {
    try {
      const out = await rpc("bot_sql_write", { q: input.query, confirmed: !!input.confirmed });
      await audit(chatId, "write", input.query, out?.affected ?? null, null);
      return out;
    } catch (e) {
      await audit(chatId, "write", input.query, null, e.message);
      return { error: e.message };
    }
  }
  return { error: "უცნობი ინსტრუმენტი" };
}

// ── სისტემური მითითება ────────────────────────────────────────────
export const SYSTEM = `შენ ხარ Synexia-ს CRM-ის ასისტენტი. ესაუბრები კომპანიის მფლობელს Telegram-ში.

ენა: ქართული. მოკლედ, საქმიანად. ტელეგრამში მარკდაუნი არ იკითხება — ჩვეულებრივი ტექსტი წერე,
ცხრილის ნაცვლად სია. ციფრები ყოველთვის კონკრეტულად.

ბაზა: Supabase, PostgreSQL. მთავარი ცხრილია leads.
- status: New Lead, Potential Op., Interested, Contacted, In Negotiation, Onboarded,
  Declined, "არ უპასუხა 1", "არ უპასუხა 2", Retired, Unqualified, Phone Model Issue, დუპლიკატი
- assigned_to — აგენტის display_name (users ცხრილი)
- priority — ⭐ ცხელი ლიდი, sphere_rank — სფეროს რანგი 1-7
- segment: general | home. home = დიასახლისები.
- reg_date — როდის შემოვიდა. დრო UTC-შია, თბილისი = UTC+4.
  "დღევანდელი" = reg_date >= (current_date at time zone 'Asia/Tbilisi')::date
- registrations — ოფისში შევსებული ანკეტები, activity_log — ყველა ქმედების ჟურნალი

მნიშვნელოვანი კონტექსტი:
- დიასახლისებს (segment='home') 2026 წლის სექტემბრიდან აღარ ვიღებთ. სტატისტიკაში ცალკე
  გამოყავი ან გამორიცხე, თუ სხვა რამ არ გთხოვეს.
- ⭐ მხოლოდ უეჭველ ლიდზე ინთება. ეჭვის დროს ცხელში არ უნდა იყოს.
- Phone Model Issue = ტელეფონი სტანდარტს არ აკმაყოფილებს.

წესები:
- ციფრი ყოველთვის ბაზიდან აიღე, არასდროს გამოიცნო. არ იცი — sql გაუშვი.
- ცვლილებამდე თქვი, რას აპირებ, და მერე გააკეთე. თუ 200-ზე მეტ ლიდს ეხება,
  ჯერ აუცილებლად ჰკითხე.
- თუ მოთხოვნა ორაზროვანია, დააზუსტე და არ გამოიცნო.
- შეცდომა თუ მოხდა, პირდაპირ თქვი რა მოხდა. არ დამალო.`;

// ── Claude-ის ციკლი ───────────────────────────────────────────────
export async function ask(chatId, messages, { maxRounds = 10 } = {}) {
  const convo = [...messages];
  for (let i = 0; i < maxRounds; i++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": AI_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL, max_tokens: 4000, system: SYSTEM, tools: TOOLS, messages: convo,
      }),
    });
    if (!r.ok) throw new Error("Claude: " + (await r.text()).slice(0, 500));
    const res = await r.json();
    convo.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      const text = res.content.filter(c => c.type === "text").map(c => c.text).join("\n").trim();
      return { text, convo };
    }

    const results = [];
    for (const c of res.content.filter(c => c.type === "tool_use")) {
      const out = await runTool(chatId, c.name, c.input || {});
      results.push({
        type: "tool_result",
        tool_use_id: c.id,
        content: JSON.stringify(out).slice(0, 40000),
      });
    }
    convo.push({ role: "user", content: results });
  }
  return { text: "ვერ დავასრულე — ძალიან ბევრი ნაბიჯი დასჭირდა.", convo };
}

// ── ონბორდინგი: ქალაქების, ქალაქში კი პროფესიების მიხედვით ────────
// პროფესიას CRM-ის ველიდან ვიღებთ — ანკეტაში თავისუფალი ტექსტია და არ ჯგუფდება.
const inList = a => "(" + a.map(v => `"${v}"`).join(",") + ")";

export async function onboardingReport(from, to) {
  const regs = await sbTable(
    `registrations?created_at=gte.${encodeURIComponent(from)}&created_at=lt.${encodeURIComponent(to)}`
    + `&select=lead_id,reg_city,occupation&limit=1000`);

  if (!regs?.length) return { count: 0, text: "ახალი ონბორდინგი არ ყოფილა." };

  const ids = [...new Set(regs.map(r => r.lead_id).filter(Boolean))];
  const leads = [];
  for (let i = 0; i < ids.length; i += 100) {
    const part = await sbTable(
      `leads?id=in.${encodeURIComponent(inList(ids.slice(i, i + 100)))}&select=id,city,profession&limit=200`);
    leads.push(...(part || []));
  }
  const byId = Object.fromEntries(leads.map(l => [l.id, l]));

  const cities = {};
  for (const r of regs) {
    const lead = byId[r.lead_id] || {};
    const city = r.reg_city || lead.city || "ქალაქი უცნობია";
    const prof = lead.profession || (r.occupation || "").trim() || "პროფესია უცნობია";
    (cities[city] ||= {});
    cities[city][prof] = (cities[city][prof] || 0) + 1;
  }

  const out = [];
  const order = Object.entries(cities)
    .map(([city, profs]) => [city, profs, Object.values(profs).reduce((a, b) => a + b, 0)])
    .sort((a, b) => b[2] - a[2]);
  for (const [city, profs, total] of order) {
    out.push(`${city} — ${total}`);
    for (const [p, n] of Object.entries(profs).sort((a, b) => b[1] - a[1])) {
      out.push(`   ${p}: ${n}`);
    }
  }
  return { count: regs.length, text: out.join("\n") };
}

// თბილისის დღის საზღვრები UTC-ში. back=1 — გუშინ, back=7..1 — გასული კვირა.
export function tbilisiWindow(backDays, lengthDays = 1) {
  const tb = new Date(Date.now() + 4 * 3600e3);
  const midnight = new Date(tb.toISOString().slice(0, 10) + "T00:00:00Z").getTime() - 4 * 3600e3;
  const to = midnight - (backDays - lengthDays) * 24 * 3600e3;
  return { from: new Date(to - lengthDays * 24 * 3600e3).toISOString(), to: new Date(to).toISOString() };
}

// ── საუბრის მეხსიერება ────────────────────────────────────────────
export async function loadChat(chatId) {
  const rows = await sbTable(`bot_chats?chat_id=eq.${chatId}&select=messages`);
  return rows?.[0]?.messages ?? [];
}

export async function saveChat(chatId, convo) {
  // ბოლო 20 შეტყობინება ყოფნის — თან მთლიანი ისტორია ძვირდება
  const trimmed = convo.slice(-20);
  await sbTable("bot_chats?on_conflict=chat_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ chat_id: chatId, messages: trimmed, updated_at: new Date().toISOString() }),
  });
}
