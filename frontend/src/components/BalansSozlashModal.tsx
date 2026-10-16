import React, { useState, useEffect } from "react";
import { supabase, pul, haptic } from "../lib/supabase";
import { X, SlidersHorizontal, ArrowUpRight, ArrowDownLeft, Equal, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  hisoblar: any[];
  boshlangichHisobId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function BalansSozlashModal({ hisoblar, boshlangichHisobId, onClose, onSuccess }: Props) {
  const [hisobId, setHisobId] = useState(boshlangichHisobId || hisoblar[0]?.id || "");
  const [joriyBalans, setJoriyBalans] = useState<number>(0);
  const [yangiBalans, setYangiBalans] = useState<string>("");
  const [izoh, setIzoh] = useState("");
  const [loading, setLoading] = useState(false);
  const [balansYuklanmoqda, setBalansYuklanmoqda] = useState(false);
  const [error, setError] = useState("");

  const tanlanganHisob = hisoblar.find((h) => h.id === hisobId) || hisoblar[0];
  const valyuta = tanlanganHisob?.valyuta || "UZS";

  // Tanlangan hisobning eng so'nggi real balansini olish
  useEffect(() => {
    if (!hisobId) return;
    async function yuklaBalans() {
      setBalansYuklanmoqda(true);
      const { data } = await supabase
        .from("view_kassa_balans")
        .select("joriy_balans")
        .eq("hisob_id", hisobId)
        .maybeSingle();

      const joriy = Number(data?.joriy_balans || 0);
      setJoriyBalans(joriy);
      setYangiBalans(String(joriy));
      setBalansYuklanmoqda(false);
    }
    yuklaBalans();
  }, [hisobId]);

  const numYangiBalans = yangiBalans.trim() === "" ? 0 : Number(yangiBalans);
  const farq = numYangiBalans - joriyBalans;

  async function handleSozlash(e: React.FormEvent) {
    e.preventDefault();
    haptic("light");
    if (!hisobId) return setError("Iltimos, hisobni tanlang.");
    if (isNaN(numYangiBalans)) return setError("Yangi balansni to'g'ri kiriting.");

    setLoading(true);
    setError("");

    const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    const xodimIsm = tgUser?.first_name ? `${tgUser.first_name} ${tgUser.last_name || ""}`.trim() : "Admin";
    const finalIzoh = izoh.trim() || "Balans to'g'rilandi (korrektirovka)";

    try {
      // 1. Supabase RPC orqali xavfsiz to'g'irlash
      const { data: rpcRes, error: rpcErr } = await supabase.rpc("fn_kassa_balans_sozlash", {
        p_hisob_id: hisobId,
        p_yangi_balans: numYangiBalans,
        p_izoh: finalIzoh,
        p_xodim: xodimIsm,
        p_telegram_user_id: tgUser?.id || null,
      });

      if (rpcErr) {
        console.warn("fn_kassa_balans_sozlash RPC chaqiruvida xatolik, fallback:", rpcErr.message);
        // Fallback: Agar RPC hali o'rnatilmagan bo'lsa, kassa_harakatlariga to'g'ridan-to'g'ri yozamiz
        if (farq !== 0) {
          const amalTur = farq > 0 ? "kirim" : "chiqim";
          const { error: insErr } = await supabase.from("kassa_harakatlari").insert({
            amal: amalTur,
            summa: Math.abs(farq),
            valyuta: valyuta,
            manba_turi: "korrektirovka",
            manba_id: hisobId,
            hisob_id: hisobId,
            izoh: `${finalIzoh} (${joriyBalans} ➔ ${numYangiBalans})`,
          });
          if (insErr) throw insErr;
        }
      }

      // 2. Telegram guruhiga bildirishnoma yuborish
      let farqYozuvi = "";
      if (farq > 0) {
        farqYozuvi = `📈 Farq (Kirim): +${pul(farq)} ${valyuta}`;
      } else if (farq < 0) {
        farqYozuvi = `📉 Farq (Chiqim): -${pul(Math.abs(farq))} ${valyuta}`;
      } else {
        farqYozuvi = `⚖️ Farq: 0 ${valyuta} (O'zgarishsiz)`;
      }

      const hisobotMatn =
        `⚖️ <b>KASSA BALANSI TO'G'IRLANDI</b>\n\n` +
        `🏦 Hisob: <b>${tanlanganHisob?.nom || "Kassa"}</b>\n` +
        `📊 Eski balans: <code>${pul(joriyBalans)} ${valyuta}</code>\n` +
        `🎯 Yangi real balans: <b>${pul(numYangiBalans)} ${valyuta}</b>\n` +
        `${farqYozuvi}\n` +
        `📝 Izoh: <i>${finalIzoh}</i>\n` +
        `✍️ Sozladi: <b>${xodimIsm}</b>`;

      try {
        await fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: hisobotMatn }),
        });
      } catch (e) {
        console.warn("Telegram guruhiga notify yuborishda xato:", e);
      }

      haptic("success");
      toast.success("Hisob balansi muvaffaqiyatli to'g'irlandi!", {
        description: `${tanlanganHisob?.nom}: ${pul(numYangiBalans)} ${valyuta}`,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      haptic("error");
      setError(err?.message || "Balansni to'g'irlashda xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in p-4 sm:p-0 pb-10">
      <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800">
        {/* Sarlavha */}
        <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-extrabold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            Balansni To'g'irlash (Korrektirovka)
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSozlash} className="p-4 space-y-4 overflow-y-auto">
          {error && (
            <div className="text-red-500 text-xs font-medium p-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Hisob tanlash */}
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">
              Qaysi hisobni to'g'irlamoqchisiz?
            </label>
            <select
              value={hisobId}
              onChange={(e) => setHisobId(e.target.value)}
              className="w-full border p-2.5 rounded-xl text-sm font-semibold dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
            >
              {hisoblar.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nom} ({h.valyuta})
                </option>
              ))}
            </select>
          </div>

          {/* Joriy va Yangi balans taqqoslash kartasi */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-500 dark:text-slate-400">Tizimdagi joriy balans:</span>
              <span className="font-black tabular-nums text-slate-700 dark:text-slate-300">
                {balansYuklanmoqda ? "Yuklanmoqda..." : `${pul(joriyBalans)} ${valyuta}`}
              </span>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                Haqiqiy (Real) Balans:
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={yangiBalans}
                  onChange={(e) => setYangiBalans(e.target.value)}
                  placeholder="0"
                  className="w-full border p-2.5 rounded-xl text-base font-black dark:bg-slate-900 dark:border-slate-700 text-slate-900 dark:text-white tabular-nums pr-16"
                  required
                />
                <span className="absolute right-3 top-3 text-xs font-extrabold text-slate-400 uppercase pointer-events-none">
                  {valyuta}
                </span>
              </div>
            </div>

            {/* Farq (Delta) ko'rsatkichi */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-500 dark:text-slate-400">Farq (Audit-trail):</span>
              {farq > 0 ? (
                <span className="font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1 tabular-nums">
                  <ArrowDownLeft className="w-3.5 h-3.5" /> +{pul(farq)} {valyuta} (Kirim)
                </span>
              ) : farq < 0 ? (
                <span className="font-black text-rose-600 dark:text-rose-400 flex items-center gap-1 tabular-nums">
                  <ArrowUpRight className="w-3.5 h-3.5" /> -{pul(Math.abs(farq))} {valyuta} (Chiqim)
                </span>
              ) : (
                <span className="font-bold text-slate-400 flex items-center gap-1 tabular-nums">
                  <Equal className="w-3.5 h-3.5" /> 0 {valyuta} (O'zgarishsiz)
                </span>
              )}
            </div>
          </div>

          {/* Izoh */}
          <div>
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">
              Izoh (ixtiyoriy):
            </label>
            <input
              type="text"
              value={izoh}
              onChange={(e) => setIzoh(e.target.value)}
              placeholder="Masalan: AinurPOS migratsiyasi to'g'rilanishi..."
              className="w-full border p-2.5 rounded-xl text-xs dark:bg-slate-800 dark:border-slate-700 text-slate-900 dark:text-white"
            />
          </div>

          {/* Tugmalar */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 transition-colors"
            >
              Bekor qilish
            </button>
            <button
              type="submit"
              disabled={loading || balansYuklanmoqda}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? "Saqlanmoqda..." : "To'g'irlash"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
