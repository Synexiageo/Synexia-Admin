// ახალი ანკეტა = ახალი ადამიანი ავიყვანეთ. 5 წუთში ერთხელ ვამოწმებთ
// და მაშინვე ვწერთ. რომელზე გავჩერდით, bot_alerts-ში ინახება.

import { sbTable, say, OWNER } from "../lib/bot.mjs";

export const config = { schedule: "*/5 * * * *" };

const ENTITY = { individual: "ფიზიკური პირი", entrepreneur: "მეწარმე", legal: "შპს" };
const KEY = "last-reg";

export default async () => {
  if (!OWNER) return new Response("ok");

  try {
    const mark = await sbTable(`bot_alerts?key=eq.${KEY}&select=at`);
    const since = mark?.[0]?.at ?? new Date(Date.now() - 15 * 60e3).toISOString();

    const regs = await sbTable(
      `registrations?created_at=gt.${encodeURIComponent(since)}`
      + `&select=created_at,first_name,last_name,phone,reg_city,occupation,entity_type,matched`
      + `&order=created_at.asc&limit=20`);

    if (!regs?.length) return new Response("ok");

    for (const r of regs) {
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || "—";
      const lines = [
        "🎉 ახალი ონბორდინგი",
        "",
        name,
        r.phone || "",
        r.reg_city ? "ადგილი: " + r.reg_city : "",
        r.occupation ? "საქმიანობა: " + r.occupation : "",
        ENTITY[r.entity_type] && r.entity_type !== "individual" ? "ტიპი: " + ENTITY[r.entity_type] : "",
        r.matched ? "" : "⚠ CRM-ში ლიდი ვერ მოიძებნა — ორგანულად ჩაიწერა",
      ].filter(Boolean);
      await say(OWNER, lines.join("\n"));
    }

    await sbTable("bot_alerts?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key: KEY, at: regs[regs.length - 1].created_at }),
    });
  } catch (e) {
    console.error("newreg:", e.message);
  }

  return new Response("ok");
};
