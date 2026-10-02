// გაფრთხილებები — საათში ერთხელ. აქ Claude არ მონაწილეობს:
// შემოწმებები ზუსტი და იაფი უნდა იყოს, პასუხიც ყოველთვის ერთნაირი.
// ერთი და იგივე გაფრთხილება 6 საათში ერთხელ მოდის, რომ არ დაგღალოს.

import { sbTable, say, OWNER } from "../lib/bot.mjs";

export const config = { schedule: "7 * * * *" };

const GENERAL = "&or=(segment.neq.home,segment.is.null)";

// ზუსტი რაოდენობა content-range სათაურში მოდის, სხეულში არა
async function exact(path) {
  const url = `${process.env.SB_URL || "https://tsfzuyujfcacultjexsy.supabase.co"}/rest/v1/${path}&select=id`;
  const r = await fetch(url, {
    headers: {
      apikey: process.env.SB_SERVICE_KEY, Authorization: `Bearer ${process.env.SB_SERVICE_KEY}`,
      Prefer: "count=exact", Range: "0-0",
    },
  });
  const cr = r.headers.get("content-range") || "";
  return parseInt(cr.split("/")[1], 10) || 0;
}

async function alreadySent(key, hours = 6) {
  const since = new Date(Date.now() - hours * 3600e3).toISOString();
  const rows = await sbTable(`bot_alerts?key=eq.${encodeURIComponent(key)}&at=gte.${since}&select=key`);
  if (rows?.length) return true;
  await sbTable("bot_alerts?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key, at: new Date().toISOString() }),
  });
  return false;
}

export default async () => {
  if (!OWNER) return new Response("ok");

  const now = new Date();
  const tbilisiHour = (now.getUTCHours() + 4) % 24;
  const alerts = [];

  try {
    // 1. ნაკადი გაჩერდა — სამუშაო საათებში 2 საათია ლიდი არ შემოსულა
    if (tbilisiHour >= 11 && tbilisiHour <= 22) {
      const since = new Date(Date.now() - 2 * 3600e3).toISOString();
      const fresh = await exact(`leads?reg_date=gte.${since}${GENERAL}`);
      if (fresh === 0 && !(await alreadySent("no-leads"))) {
        alerts.push("⚠️ 2 საათია ახალი ლიდი არ შემოსულა. შეამოწმე Meta-ს რეკლამა და Make-ის სცენარი.");
      }
    }

    // 2. დაურეკავი ⭐ ცხელი ლიდები, რომლებიც დილიდან გაჩერდა
    const dayAgo = new Date(Date.now() - 24 * 3600e3).toISOString();
    const coldHot = await exact(
      `leads?status=eq.New%20Lead&priority=is.true&reg_date=lt.${dayAgo}${GENERAL}`);
    if (coldHot >= 20 && !(await alreadySent("hot-stale"))) {
      alerts.push(`⚠️ ${coldHot} ცხელი ლიდი დღეზე მეტია New Lead-ში დევს.`);
    }

    // 3. აგენტის გარეშე დარჩენილი ლიდები
    const orphan = await exact(`leads?status=eq.New%20Lead&assigned_to=is.null${GENERAL}`);
    if (orphan >= 30 && !(await alreadySent("orphan"))) {
      alerts.push(`⚠️ ${orphan} ლიდი აგენტის გარეშეა — არავის სიაში არ ჩანს.`);
    }

    // 4. ანკეტები — სამუშაო დღის შუაში ერთიც არ შევსებულა
    if (tbilisiHour === 15) {
      const day = new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
      const regs = await exact(`registrations?created_at=gte.${day}T00:00:00`);
      if (regs === 0 && !(await alreadySent("no-regs", 12))) {
        alerts.push("⚠️ დღეს ჯერ ერთი ანკეტაც არ შევსებულა. ფორმა ხომ არ გატყდა?");
      }
    }

    if (alerts.length) await say(OWNER, alerts.join("\n\n"));
  } catch (e) {
    if (!(await alreadySent("watch-error", 12))) {
      await say(OWNER, "შემოწმება ვერ გავუშვი: " + String(e.message).slice(0, 300));
    }
  }

  return new Response("ok");
};
