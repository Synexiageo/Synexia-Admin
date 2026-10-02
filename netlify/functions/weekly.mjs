// კვირის რეპორტი — ორშაბათს 9:30-ზე, გასულ კვირაზე (ორშაბათი–კვირა).

import { ask, say, onboardingReport, tbilisiWindow, OWNER } from "../lib/bot.mjs";

export const config = { schedule: "30 5 * * 1" };   // ორშაბათი 05:30 UTC = 09:30 თბილისი

export default async () => {
  if (!OWNER) return new Response("ok");

  const prompt = `კვირის რეპორტი გასულ კვირაზე (ბოლო 7 სრული დღე, გუშინდლის ჩათვლით).
შეადარე წინა კვირას და დაწერე მოკლედ, ციფრებით:
1. რამდენი ლიდი შემოვიდა — და რამდენით მეტი ან ნაკლები, ვიდრე წინა კვირას
2. რამდენი გახდა Onboarded, ანუ რეალურად ავიყვანეთ
3. რამდენი ლიდი დამუშავდა და რამდენი დარჩა დაურეკავი
4. აგენტების მიხედვით: ვინ რამდენი ლიდი დაამუშავა და რამდენი ონბორდინგი გამოუვიდა
5. ლიდების გადანაწილება სტატუსების მიხედვით — სად იკარგება ყველაზე მეტი
6. ბოლოს 2-3 წინადადება: რა გაუმჯობესდა, რა გაუარესდა, რაზე ღირს ყურადღების გამახვილება

დიასახლისების სეგმენტი არ ჩათვალო. მისალმება არ დაწერო.`;

  let summary;
  try {
    summary = (await ask(OWNER, [{ role: "user", content: prompt }], { maxRounds: 14 })).text;
  } catch (e) {
    summary = "რეპორტი ვერ გავაკეთე: " + String(e.message).slice(0, 300);
  }

  let people = "";
  try {
    const w = tbilisiWindow(7, 7);
    const { count, text } = await onboardingReport(w.from, w.to);
    people = count ? `🎉 კვირაში ავიყვანეთ ${count} ადამიანი\n\n${text}` : "🙁 ამ კვირაში " + text;
  } catch (e) {
    people = "ანკეტები ვერ წავიკითხე: " + String(e.message).slice(0, 200);
  }

  await say(OWNER, "📊 კვირის რეპორტი\n\n" + summary + "\n\n―――――\n\n" + people);
  return new Response("ok");
};
