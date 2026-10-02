// დილის შეჯამება — ყოველ დილას 9:00-ზე (თბილისი).
// ციფრებს Claude იღებს ბაზიდან; გუშინდელი ონბორდინგის სია კი პირდაპირ
// ბაზიდან მოდის, რომ სახელები ზუსტად ისე ჩამოიწეროს, როგორც ჩაიწერა.

import { ask, say, sbTable, OWNER } from "../lib/bot.mjs";

export const config = { schedule: "0 5 * * *" };   // 05:00 UTC = 09:00 თბილისი

const ENTITY = { entrepreneur: "მეწარმე", legal: "შპს" };

// გუშინდელი დღე თბილისის დროით, UTC-ის საზღვრებად
function yesterday() {
  const tb = new Date(Date.now() + 4 * 3600e3);
  const day = new Date(tb.toISOString().slice(0, 10) + "T00:00:00Z");
  const end = new Date(day.getTime() - 4 * 3600e3);
  return { from: new Date(end.getTime() - 24 * 3600e3).toISOString(), to: end.toISOString() };
}

async function onboarded() {
  const { from, to } = yesterday();
  const regs = await sbTable(
    `registrations?created_at=gte.${encodeURIComponent(from)}&created_at=lt.${encodeURIComponent(to)}`
    + `&select=first_name,last_name,phone,reg_city,occupation,entity_type,matched`
    + `&order=created_at.asc&limit=200`);

  if (!regs?.length) return "🙁 გუშინ ახალი ონბორდინგი არ ყოფილა.";

  const lines = regs.map(r => {
    const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || "—";
    const bits = [r.reg_city, r.occupation, ENTITY[r.entity_type]].filter(Boolean).join(", ");
    return `• ${name}${bits ? " — " + bits : ""}${r.matched ? "" : " (ორგანული)"}`;
  });
  return `🎉 გუშინ ავიყვანეთ ${regs.length} ადამიანი\n\n` + lines.join("\n");
}

export default async () => {
  if (!OWNER) return new Response("ok");

  const prompt = `დილის შეჯამება. ბაზიდან აიღე და მოკლედ დაწერე:
1. გუშინ რამდენი ლიდი შემოვიდა (ზოგადი სეგმენტი) და რამდენი იყო ⭐ ცხელი
2. გუშინ რამდენ ლიდს შეეცვალა სტატუსი — ანუ რამდენი დამუშავდა
3. ახლა რამდენი დაურეკავი New Lead არის და ვის რამდენი აქვს
4. თუ რამე თვალში საცემია — ერთ აგენტთან სხვებზე ბევრად მეტი დაგროვდა,
   ან ლიდების ნაკადი მკვეთრად დაეცა — ბოლოს ერთი წინადადებით თქვი.

ანკეტებს ნუ ჩამოთვლი, ის ცალკე მოდის. დიასახლისების სეგმენტი არ ჩათვალო.
მისალმება არ დაწერო.`;

  let summary;
  try {
    summary = (await ask(OWNER, [{ role: "user", content: prompt }])).text;
  } catch (e) {
    summary = "შეჯამება ვერ გავაკეთე: " + String(e.message).slice(0, 300);
  }

  let people;
  try {
    people = await onboarded();
  } catch (e) {
    people = "ანკეტები ვერ წავიკითხე: " + String(e.message).slice(0, 200);
  }

  await say(OWNER, "☀️ დილის შეჯამება\n\n" + summary + "\n\n―――――\n\n" + people);
  return new Response("ok");
};
