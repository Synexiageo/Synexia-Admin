// დღის შეჯამება — ნაგულისხმევად მიკროფსის ფაილის ატვირთვისთანავე იგზავნება
// (იხ. microps.mjs). ეს აქ სათადარიგოა: თუ 14:00-მდე ფაილი არ ატვირთულა,
// შეჯამება მაინც მოდის, რომ დღე უშეჯამებოდ არ დარჩეს.

import { sendDailySummary, claimOnce, OWNER } from "../lib/bot.mjs";

export const config = { schedule: "0 10 * * *" };   // 10:00 UTC = 14:00 თბილისი

export default async () => {
  if (!OWNER) return new Response("ok");
  try {
    if (await claimOnce("daily")) await sendDailySummary();
  } catch (e) {
    console.error("daily:", e.message);
  }
  return new Response("ok");
};
