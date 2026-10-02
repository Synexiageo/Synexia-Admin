// Telegram-ის webhook. აქ მხოლოდ შემოწმება ხდება და სამუშაო ფონურ
// ფუნქციას გადაეცემა — Telegram პასუხს 10 წამში ელოდება, Claude კი
// შეიძლება უფრო დიდხანს ფიქრობდეს.

import { OWNER, tg } from "../lib/bot.mjs";

export default async (req) => {
  if (req.method !== "POST") return new Response("ok");

  // Telegram-ს თან მოჰყვება საიდუმლო სათაური — ამით ვრწმუნდებით, რომ
  // მოთხოვნა მართლა მისგანაა და არა შემთხვევითი მნახველისგან.
  const secret = process.env.TELEGRAM_SECRET || "";
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("no", { status: 401 });
  }

  let update;
  try { update = await req.json(); } catch { return new Response("ok"); }

  const msg = update.message || update.edited_message;
  const chatId = msg?.chat?.id;
  const text = msg?.text;
  if (!chatId || !text) return new Response("ok");

  if (OWNER && String(msg.from?.id) !== OWNER) {
    await tg("sendMessage", { chat_id: chatId, text: "ეს ბოტი პირადია." });
    return new Response("ok");
  }

  await tg("sendChatAction", { chat_id: chatId, action: "typing" });

  // ფონურ ფუნქციას ვუშვებთ და პასუხს არ ველოდებით — ის 202-ს მაშინვე აბრუნებს
  const base = new URL(req.url).origin;
  await fetch(`${base}/.netlify/functions/worker-background`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bot-key": secret },
    body: JSON.stringify({ chatId, text }),
  }).catch(() => {});

  return new Response("ok");
};
