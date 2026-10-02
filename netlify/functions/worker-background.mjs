// სახელის ბოლო "-background" Netlify-სთვის ნიშნავს: პასუხი მაშინვე დააბრუნე,
// სამუშაო კი მშვიდად დაასრულე. ასე Claude-ს ფიქრის დრო აქვს.

import { ask, say, loadChat, saveChat, tg } from "../lib/bot.mjs";

export default async (req) => {
  const secret = process.env.TELEGRAM_SECRET || "";
  if (secret && req.headers.get("x-bot-key") !== secret) {
    return new Response("no", { status: 401 });
  }

  const { chatId, text } = await req.json();
  if (!chatId || !text) return new Response("ok");

  try {
    if (text === "/start" || text === "/help") {
      await say(chatId, [
        "მოგესალმები. CRM-ის ასისტენტი ვარ.",
        "",
        "მკითხე რაც გინდა ბაზაზე — რამდენი ლიდი შემოვიდა დღეს, ვის რამდენი",
        "დაურეკავი ლიდი აქვს, ნუკის სტატისტიკა ამ კვირაში.",
        "",
        "შემიძლია შევცვალო კიდეც: სტატუსი, აგენტი, კომენტარი.",
        "დიდ ცვლილებას ჯერ გკითხავ.",
        "",
        "/clear — საუბრის ისტორიის გასუფთავება",
      ].join("\n"));
      return new Response("ok");
    }

    if (text === "/clear") {
      await saveChat(chatId, []);
      await say(chatId, "ისტორია გასუფთავდა.");
      return new Response("ok");
    }

    const history = await loadChat(chatId);
    const { text: reply, convo } = await ask(chatId, [...history, { role: "user", content: text }]);
    await saveChat(chatId, convo);
    await say(chatId, reply);
  } catch (e) {
    await tg("sendMessage", { chat_id: chatId, text: "შეცდომა: " + String(e.message).slice(0, 500) });
  }

  return new Response("ok");
};
