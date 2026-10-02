// როცა ელენე ფაილს ატვირთავს, 15 წუთში შეჯამება მოდის.
// ყოველ დღეზე ერთხელ — microps_days.notified ამას ადევნებს თვალს.

import { sbTable, say, OWNER } from "../lib/bot.mjs";

export const config = { schedule: "*/15 * * * *" };

const RATE = 25;   // ₾ ერთ მიღებულ საათზე

const REASON = {
  "Irrelevant Content": "ზედმეტი კადრი",
  "Hands": "ხელები არ ჩანს",
  "Camera": "კამერა",
  "Video too Short": "ვიდეო მოკლეა",
  "Corrupted Data": "დაზიანებული ფაილი",
  "Instruction Violation Review Pending": "ინსტრუქციის დარღვევა",
  "Blurry Video": "ბუნდოვანი ვიდეო",
  "IMU Sensor Issue": "სენსორი",
};

const MONTH = ["იანვარი","თებერვალი","მარტი","აპრილი","მაისი","ივნისი",
               "ივლისი","აგვისტო","სექტემბერი","ოქტომბერი","ნოემბერი","დეკემბერი"];

const gel = n => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");

// გამორჩეული ჯგუფები: ვინ ყველაზე მეტს აკეთებს და სად იკარგება ყველაზე მეტი
async function groups(day) {
  const rows = await sbTable(
    `microps_people?day=eq.${day}&recorded=gt.0&select=sub_gm,recorded,accepted&limit=5000`);
  if (!rows?.length) return "";

  const by = {};
  for (const r of rows) {
    const g = r.sub_gm || "—";
    (by[g] ||= { rec: 0, acc: 0 });
    by[g].rec += +r.recorded || 0;
    by[g].acc += +r.accepted || 0;
  }
  const list = Object.entries(by)
    .map(([g, v]) => ({ g, ...v, pct: v.rec ? Math.round(v.acc / v.rec * 100) : 0 }))
    .filter(x => x.rec >= 15);
  if (list.length < 2) return "";

  const best  = [...list].sort((a, b) => b.acc - a.acc)[0];
  const worst = [...list].sort((a, b) => a.pct - b.pct)[0];
  const out = [`ყველაზე დიდი ჯგუფი: ${best.g} — ${Math.round(best.acc)} სთ (${best.pct}%)`];
  if (worst.g !== best.g && worst.pct < best.pct - 5) {
    out.push(`ყველაზე დაბალი მიღება: ${worst.g} — ${worst.pct}% (${Math.round(worst.rec - worst.acc)} სთ დაკარგა)`);
  }
  return out.join("\n");
}

export default async () => {
  if (!OWNER) return new Response("ok");

  try {
    const days = await sbTable("microps_days?notified=is.false&select=*&order=day.desc&limit=1");
    const d = days?.[0];
    if (!d) return new Response("ok");

    const rec = +d.recorded || 0, acc = +d.accepted || 0;
    const pct = rec ? Math.round(acc / rec * 100) : 0;
    const lost = rec - acc;
    const [y, m, dd] = String(d.day).split("-");

    const reasons = Object.entries(d.rejections || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, n]) => `${REASON[k] || k} ${n}`).join(" · ");

    const lines = [
      `🎬 მიკროფსი — ${+dd} ${MONTH[+m - 1]}`,
      "",
      `წერდა ${d.people} კაცი`,
      `ჩაწერა ${Math.round(rec)} სთ · მიიღეს ${Math.round(acc)} სთ (${pct}%)`,
      `გადასახდელი: ${gel(acc * RATE)} ₾`,
      "",
      `დაიკარგა ${Math.round(lost)} სთ ≈ ${gel(lost * RATE)} ₾`,
    ];
    if (reasons) lines.push(`მიზეზი: ${reasons}`);
    lines.push("");
    if (d.low_rate) lines.push(`⚠️ ${d.low_rate} კაცს მიღება 60%-ზე დაბალი აქვს`);
    lines.push(`📉 ${d.trend_down} ეცემა · 📈 ${d.trend_up} იზრდება`);
    if (d.banned) lines.push(`🚫 გათიშული: ${d.banned}`);

    const g = await groups(d.day);
    if (g) lines.push("", g);

    await say(OWNER, lines.join("\n"));
    await sbTable(`microps_days?day=eq.${d.day}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ notified: true }),
    });
  } catch (e) {
    console.error("microps:", e.message);
  }

  return new Response("ok");
};
