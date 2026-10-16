// api/telegram-webhook.ts
// PROMAX B2B TELEGRAM WEBHOOK: ENTRYPOINT ROUTER (MODULARIZED)

import { handleCallbackQuery } from "./_bot/callbacks";
import { handleMessage } from "./_bot/messages";

export default async function handler(req: any, res: any) {
  if (req.method === "GET") {
    return res.status(200).send("Promax Bot Webhook Active on Vercel");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  let update: any;
  try {
    update = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch {
    return res.status(400).send("Invalid JSON");
  }

  console.log("[Webhook Update Keldi]:", JSON.stringify(update));

  try {
    // 1. TUGMA BOSILGANDA (CALLBACK QUERY - TASDIQLASH / BEKOR QILISH / TANLASH)
    if (update.callback_query) {
      return await handleCallbackQuery(update.callback_query, res);
    }

    // 2. MATN, OVOZ YOKI KONTAKT XABARI KELGANDA
    if (update.message) {
      return await handleMessage(update.message, res);
    }

    return res.status(200).send("OK");
  } catch (err: any) {
    console.error("[Webhook Router Xatolik]:", err);
    return res.status(200).send("OK");
  }
}
