import { Handler } from "@netlify/functions";

const BOT_TOKEN = process.env.BOT_TOKEN;
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  if (!BOT_TOKEN || !GROUP_CHAT_ID) {
    return { statusCode: 500, body: "Missing Telegram Config" };
  }

  try {
    const { text } = JSON.parse(event.body || "{}");
    if (!text) {
      return { statusCode: 400, body: "Missing text" };
    }

    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: GROUP_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });

    return { statusCode: 200, body: "OK" };
  } catch (err: any) {
    return { statusCode: 500, body: err.message };
  }
};
