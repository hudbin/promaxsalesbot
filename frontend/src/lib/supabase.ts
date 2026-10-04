import { createClient } from "@supabase/supabase-js";

// Vite muhit o'zgaruvchilari (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY yoki VITE_SUPABASE_PUBLISHABLE_KEY)
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://your-project.supabase.co";

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_KEY ||
  "your-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function pul(n: number | string | null | undefined): string {
  const num = Number(n) || 0;
  return Math.round(num).toLocaleString("ru-RU").replace(/\u00a0/g, " ");
}

export function haptic(type: "light" | "medium" | "heavy" | "success" | "error" | "warning" = "light") {
  try {
    const tg = (window as any).Telegram?.WebApp?.HapticFeedback;
    if (tg) {
      if (type === "success" || type === "error" || type === "warning") {
        tg.notificationOccurred(type);
      } else {
        tg.impactOccurred(type);
      }
    }
  } catch {}
}
