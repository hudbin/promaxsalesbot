import { createClient } from "@supabase/supabase-js";

// Muhit o'zgaruvchilari
export const BOT_TOKEN = process.env.BOT_TOKEN || "";
export const SUPABASE_URL = process.env.SUPABASE_URL || "";
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
export const GEMINI_API_KEYS = Array.from(
  new Set(
    [
      ...(process.env.GEMINI_API_KEYS || "").split(","),
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_BACKUP,
    ]
      .map((k) => k?.trim())
      .filter(Boolean)
  )
) as string[];
export const GEMINI_API_KEY = GEMINI_API_KEYS[0] || "";
export const GEMINI_MODELS = Array.from(
  new Set(
    [
      "gemini-3.5-flash-lite",
      "gemini-3.5-flash",
      process.env.GEMINI_MODEL,
      "gemini-3.8-flash",
      "gemini-2.5-flash",
    ].filter(Boolean)
  )
) as string[];
export const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_ID || "";
export const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || "580858047";
export const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || "promax2026";

let _supabaseClient: any = null;
export function getSupabase(): any {
  if (!_supabaseClient) {
    const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || SUPABASE_URL || "").trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!url || !key) {
      console.warn('[Supabase Warning] SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY mavjud emas!');
      return null;
    }
    _supabaseClient = createClient(url, key);
  }
  return _supabaseClient;
}

// Global xavfsiz proxy: fayl ichidagi barcha supabase.from(...) va supabase.rpc(...) chaqiruvlari uchun
export const supabase: any = new Proxy({} as any, {
  get(_target, prop) {
    const client = getSupabase();
    if (!client) {
      throw new Error("Supabase kalitlari mavjud emas (SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY yo'q)");
    }
    return client[prop];
  }
});

export const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Yordamchi: Telegram API ga xabar yuborish
export async function tgPost(method: string, body: Record<string, any>) {
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`[tgPost XATO] ${method}:`, JSON.stringify(data), "Body:", JSON.stringify(body));
    } else {
      console.log(`[tgPost Muvaffaqiyatli] ${method}`);
    }
    return data;
  } catch (err: any) {
    console.error(`[tgPost Tarmoq Xatosi] ${method}:`, err?.message || err);
    return { ok: false, error: err?.message };
  }
}

// Yordamchi: Pulni chiroyli formatlash (1 500 000)
export function pul(n: number): string {
  return Math.round(n || 0).toLocaleString("ru-RU").replace(/\u00a0/g, " ");
}

// Yordamchi: HTML teglarni butunlay tozalab oddiy matnga aylantirish (Fallback uchun)
export function stripHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Yordamchi: Markdown formatdagi matnni Telegram HTML ga xavfsiz o'tkazish
export function formatTelegramHtml(text: string): string {
  if (!text) return "";
  let out = text;

  // 1. Markdown almashtirishlar
  out = out.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
  out = out.replace(/__(.*?)__/g, "<b>$1</b>");
  out = out.replace(/```(?:html|sql|json)?\s*([\s\S]*?)```/gi, "<pre>$1</pre>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/(?<=^|\s)\*([^*]+)\*(?=\s|$|[.,!?:])/g, "<i>$1</i>");
  out = out.replace(/^>\s?(.*)$/gm, "<blockquote>$1</blockquote>");

  // 2. Bare '&' ni &amp; ga o'girish (agar allaqachon &amp;, &lt;, &gt; kabi entity bo'lmasa)
  out = out.replace(/&(?!amp;|lt;|gt;|quot;|#\d+;)/g, "&amp;");

  // 3. Ruxsat etilmagan HTML teglarini tozalash / almashtirish
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/?(?:span|div|p|ul|ol|li|h[1-6])[^>]*>/gi, "");

  // 4. Faqat Telegram qo'llab-quvvatlaydigan teglarga ruxsat berish
  const allowed = ["b", "i", "u", "s", "code", "pre", "blockquote", "a", "strong", "em", "del", "tg-spoiler"];
  const tagRegex = new RegExp(`^<\\/?(${allowed.join("|")})(\\s+[^>]*)?>$`, "i");

  // Matn ichidagi har qanday <...> ni tekshiramiz: agar ruxsat etilgan teg bo'lmasa, &lt;...&gt; qilamiz
  out = out.replace(/<([^>]+)>/g, (match, inside) => {
    if (tagRegex.test(match)) {
      return match;
    }
    return `&lt;${inside}&gt;`;
  });

  return out;
}

// Yordamchi: Telefon raqamni standart formatga keltirish (+998901234567)
export function normalizePhone(raw: string): string {
  if (!raw) return "";
  let digits = raw.replace(/[^\d+]/g, "");
  if (!digits.startsWith("+")) {
    if (digits.length === 12 && digits.startsWith("998")) {
      digits = "+" + digits;
    } else if (digits.length === 9) {
      digits = "+998" + digits;
    } else {
      digits = "+" + digits;
    }
  }
  return digits;
}

// Yordamchi: tolov_turi qiymatini bazadagi CHECK constraint ('naqd' | 'plastik' | 'perechisleniya') ga moslash
export function normalizeTolovTuri(raw?: string, hisobTuri?: string): "naqd" | "plastik" | "perechisleniya" {
  if (hisobTuri === "plastik") return "plastik";
  if (hisobTuri === "bank") return "perechisleniya";
  if (hisobTuri === "naqd") return "naqd";

  const s = String(raw || "").toLowerCase().trim();
  if (s === "plastik" || /karta|plastik|click|payme|uzcard|humo/i.test(s)) {
    return "plastik";
  }
  if (s === "perechisleniya" || /perechis|bank|hisob\s*raqam|otkazma|o'tkazma/i.test(s)) {
    return "perechisleniya";
  }
  return "naqd";
}
