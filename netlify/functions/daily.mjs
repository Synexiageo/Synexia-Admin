// დილის შეჯამება — ყოველ დილას 9:00-ზე (თბილისი).
// ციფრებს Claude იღებს ბაზიდან; ონბორდინგი კი პირდაპირ ანკეტებიდან ითვლება.

import { ask, say, onboardingReport, tbilisiWindow, OWNER } from "../lib/bot.mjs";

export const config = { schedule: "0 5 * * *" };   // 05:00 UTC = 09:00 თბილისი

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

  let people = "";
  try {
    const w = tbilisiWindow(1);
    const { count, text } = await onboardingReport(w.from, w.to);
    people = count ? `🎉 გუშინ ავიყვანეთ ${count} ადამიანი\n\n${text}` : "🙁 გუშინ " + text;
  } catch (e) {
    people = "ანკეტები ვერ წავიკითხე: " + String(e.message).slice(0, 200);
  }

  await say(OWNER, "☀️ დილის შეჯამება\n\n" + summary + "\n\n―――――\n\n" + people);
  return new Response("ok");
};
