// ზარების webhook — ტელეფონიის მომწოდებელი ყოველ ზარზე აქ გვიგზავნის.
//
// მისამართი: https://synexia-admin.netlify.app/api/calls
// გასაღები:  Netlify-ის CALLS_WEBHOOK_TOKEN. მომწოდებელს იგივე უნდა ჰქონდეს
//            და გამოგზავნოს სათაურით `X-Webhook-Token`, `Authorization: Bearer`,
//            ან, თუ სხვა გზა არ აქვს, მისამართში `?token=`.
//
// მომწოდებელი CityNet-ია. მისი ფორმატი (ერთი JSON ზარზე):
//   {"date_time":"2025-11-13 13:38:19","unique_id":"1763026699.138808","dir":"in",
//    "src":"577208418","dst":"995322114411","opr":"102","mob":"","dur":"583",
//    "rec":"https://audio.citynet.ge/listen/...wav","status":"ANSWERED","meta_data":""}
// ველების სახელებს მაინც ფართოდ ვკითხულობთ და ნედლ შეტყობინებასაც ვინახავთ —
// თუ რამე ვერ ვიცანით, დაკარგული არ იქნება.

import { timingSafeEqual, createHash } from "node:crypto";
import { sbTable } from "../lib/bot.mjs";

export const config = { path: "/api/calls" };

const PROVIDER = "caller";

// გასაღები რეპოში არ არის — მხოლოდ მისი SHA-256. თვითონ გასაღები
// მფლობელის კომპიუტერზეა (Desktop/calls_webhook_token.txt) და მომწოდებელს
// გადაეცემა. შესაცვლელად: ახალი გასაღების ჰეში აქ, ან Netlify-ში
// CALLS_WEBHOOK_TOKEN — ის თუ არსებობს, უპირატესია.
const TOKEN_SHA256 = "4aa853c1fcee4861b2153e8ce49ef0693eb5e4c2c7adb8c03303730605133495";

function tokenOk(req) {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  const got = req.headers.get("x-webhook-token")
    || (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "")
    || url.searchParams.get("token") || "";

  const plain = process.env.CALLS_WEBHOOK_TOKEN || "";
  if (plain) {
    const a = Buffer.from(got), b = Buffer.from(plain);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  if (!TOKEN_SHA256) return null; // გასაღები არსად არ არის დაყენებული — ვკეტავთ
  const a = createHash("sha256").update(got).digest();
  const b = Buffer.from(TOKEN_SHA256, "hex");
  return timingSafeEqual(a, b);
}

// პირველი შევსებული ველი რამდენიმე შესაძლო სახელიდან
const pick = (o, ...keys) => {
  for (const k of keys) {
    const v = o[k] ?? o[k.toLowerCase()] ?? o[k.toUpperCase()];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
};

// ქართული მობილური → +995XXXXXXXXX; შიდა/მოკლე ნომერი → null
function phone(v) {
  if (v == null) return null;
  let d = String(v).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 12 && d.startsWith("995")) d = d.slice(3);
  if (d.length === 10 && d.startsWith("0")) d = d.slice(1);
  return d.length === 9 ? "+995" + d : null;
}

function time(v) {
  if (v == null) return null;
  if (/^\d{9,13}$/.test(String(v))) {
    const n = Number(v);
    return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  }
  // „2026-11-13 14:05:00" ზონის გარეშე — თბილისის დროდ ვთვლით
  const s = String(v).trim();
  const iso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s) ? s.replace(" ", "T") + "+04:00" : s;
  const d = new Date(iso);
  return isNaN(d) ? null : d.toISOString();
}

function direction(v) {
  // მხოლოდ ზუსტი მნიშვნელობები — „ringing"-იც „in"-ს შეიცავს
  const s = String(v || "").toLowerCase().trim();
  if (/^(out|outbound|outgoing|o)$|გამავ/.test(s)) return "outbound";
  if (/^(in|inbound|incoming|i)$|შემომ/.test(s)) return "inbound";
  return null;
}

function status(v, talk) {
  const s = String(v || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (/no_?answer|noanswer|missed|unanswered|timeout/.test(s)) return "no_answer";
  if (/busy/.test(s)) return "busy";
  if (/fail|cancel|congestion|reject|error/.test(s)) return "failed";
  if (/answer|complete|success|connected|talk/.test(s)) return "answered";
  if (talk > 0) return "answered";
  return s || null;
}

function normalize(ev) {
  const id = pick(ev, "call_id", "callId", "id", "uuid", "uniqueid", "unique_id", "linkedid", "session_id");
  const dir = direction(pick(ev, "direction", "type", "call_type", "dir"));
  const from = pick(ev, "from", "caller", "src", "caller_number", "source");
  const to = pick(ev, "to", "callee", "dst", "destination", "called_number");
  const customer = pick(ev, "customer_phone", "client_phone", "phone", "number", "customer");

  // კლიენტის ნომერი: ცალკე ველი თუ აქვს — ის; თუ არა, მიმართულების
  // მიხედვით; ბოლოს — რომელიც ქართული მობილურია (ოპერატორს შიდა ნომერი აქვს)
  const leadPhone = phone(customer)
    || (dir === "outbound" ? phone(to) : dir === "inbound" ? phone(from) : null)
    || phone(to) || phone(from);

  const talk = Number(pick(ev, "talk_duration", "billsec", "talk_time", "duration_talk", "conversation_duration", "duration", "dur")) || 0;
  const st = status(pick(ev, "status", "disposition", "result", "call_status", "event"), talk);
  const agent = pick(ev, "agent", "operator", "agent_id", "operator_id", "extension", "ext", "user", "username", "agent_name", "opr");

  return {
    provider_call_id: id != null ? String(id) : null,
    direction: dir,
    status: st,
    lead_phone: leadPhone,
    agent_ext: agent != null ? String(agent).trim() : null,
    started_at: time(pick(ev, "started_at", "start", "start_time", "calldate", "created_at", "timestamp", "date_time")),
    answered_at: time(pick(ev, "answered_at", "answer", "answer_time")),
    ended_at: time(pick(ev, "ended_at", "end", "end_time", "hangup_time")),
    // CityNet-ის dur უპასუხო ზარზეც შეიძლება ზარის რეკვის დრო იყოს — ხანგრძლივობას
    // მხოლოდ ნაპასუხებ ზარზე ვინახავთ, თორემ „გამოტოვებული 9 წუთი" გამოჩნდება
    duration_sec: (st === "answered" ? talk : 0) || null,
    recording_url: pick(ev, "recording_url", "record_url", "recording", "record", "recordingUrl", "rec"),
  };
}

async function findLead(p) {
  if (!p) return null;
  const rows = await sbTable(`leads?phone=eq.${encodeURIComponent(p)}&select=id&order=created_at.desc&limit=1`);
  return rows?.[0]?.id || null;
}

async function findAgent(ext) {
  if (!ext) return null;
  // ჯერ შიდა ნომრით, მერე CRM-ის მომხმარებლის სახელით
  const e = encodeURIComponent(ext);
  const byExt = await sbTable(`users?call_ext=eq.${e}&select=display_name&limit=1`);
  if (byExt?.[0]) return byExt[0].display_name;
  // ilike-ში „_" და „%" ნებისმიერ ასოს ნიშნავს — giorgi_m სხვას არ უნდა დაემთხვეს
  const lit = encodeURIComponent(String(ext).replace(/[%_\\]/g, "\\$&"));
  const byName = await sbTable(`users?username=ilike.${lit}&select=display_name&limit=1`);
  return byName?.[0]?.display_name || null;
}

async function save(ev) {
  const row = normalize(ev);
  if (!row.provider_call_id) return { ok: false, reason: "no call id" };

  const [lead_id, agent_name] = await Promise.all([findLead(row.lead_phone), findAgent(row.agent_ext)]);
  const out = { provider: PROVIDER, ...row, lead_id, agent_name, raw: ev };

  // ერთი ზარის შემდეგი მოვლენა წინას ავსებს და არ შლის — ცარიელ ველებს არ ვაგზავნით
  for (const k of Object.keys(out)) if (out[k] === null || out[k] === undefined) delete out[k];

  await sbTable("calls?on_conflict=provider,provider_call_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(out),
  });
  // მომწოდებელს ვუბრუნებთ მხოლოდ „მიღებულია" — არა ის, ვიპოვეთ თუ არა
  // ლიდი. თორემ გასაღების მფლობელს შეეძლებოდა ნომრების გადამოწმება,
  // ვინ არის ჩვენს ბაზაში.
  return { ok: true, call_id: row.provider_call_id };
}

async function readBody(req) {
  const type = req.headers.get("content-type") || "";
  const text = await req.text();
  if (!text) return null;
  // curl -d '{...}' JSON-ს form-urlencoded სათაურით აგზავნის — ამიტომ ჯერ
  // ტექსტს ვუყურებთ და არა სათაურს
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) {
    try { return JSON.parse(t); } catch { /* ქვემოთ ფორმად ვცდით */ }
  }
  if (type.includes("application/x-www-form-urlencoded") || text.includes("=")) return Object.fromEntries(new URLSearchParams(text));
  return JSON.parse(text);
}

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  // ზოგი მომწოდებელი მისამართს GET-ით ამოწმებს, სანამ შეინახავს
  if (req.method === "GET" || req.method === "HEAD") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false }, 405);

  const auth = tokenOk(req);
  if (auth === null) return json({ ok: false, error: "not configured" }, 503);
  if (!auth) return json({ ok: false, error: "unauthorized" }, 401);

  let body;
  try { body = await readBody(req); } catch { return json({ ok: false, error: "bad body" }, 400); }
  if (!body) return json({ ok: false, error: "empty" }, 400);

  // ერთი მოვლენა, მასივი, ან { events: [...] } / { data: {...} }
  const events = Array.isArray(body) ? body
    : Array.isArray(body.events) ? body.events
    : body.data && typeof body.data === "object" ? [body.data]
    : [body];

  try {
    const results = [];
    for (const ev of events) results.push(await save(ev));
    return json({ ok: true, results });
  } catch (e) {
    // 500 — რომ მომწოდებელმა ხელახლა სცადოს და ზარი არ დაიკარგოს
    console.error("calls webhook:", e.message);
    return json({ ok: false, error: "storage" }, 500);
  }
};
