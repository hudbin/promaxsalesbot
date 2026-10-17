import React, { useState, useEffect } from "react";
import { X, HandCoins, ArrowDownRight, ArrowUpRight, DollarSign, Wallet, CheckCircle2 } from "lucide-react";
import { supabase, pul, haptic, getJoriyXodimNomi } from "../lib/supabase";
import { toast } from "sonner";

interface TashqiQarzModalProps {
  onClose: () => void;
  onSuccess: () => void;
  defaultAmal?: "oldim" | "qaytardim" | "berdim" | "qaytdi";
  defaultShaxsNomi?: string;
  xodimNomi?: string;
  telegramUserId?: number | string | null;
}

export function TashqiQarzModal({
  onClose,
  onSuccess,
  defaultAmal = "oldim",
  defaultShaxsNomi = "",
  xodimNomi,
  telegramUserId,
}: TashqiQarzModalProps) {
  const [amal, setAmal] = useState<"oldim" | "qaytardim" | "berdim" | "qaytdi">(defaultAmal);
  const [shaxsNomi, setShaxsNomi] = useState(defaultShaxsNomi);
  const [summa, setSumma] = useState("");
  const [valyuta, setValyuta] = useState<"UZS" | "USD">("UZS");
  const [hisobId, setHisobId] = useState<string | null>(null);
  const [hisoblar, setHisoblar] = useState<any[]>([]);
  const [bevositaOylik, setBevositaOylik] = useState(false);
  const [maqsad, setMaqsad] = useState("");
  const [izoh, setIzoh] = useState("");
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [mavjudShaxslar, setMavjudShaxslar] = useState<string[]>([]);

  useEffect(() => {
    yuklaMalumotlar();
  }, []);

  async function yuklaMalumotlar() {
    try {
      // 1. Hisoblar
      const { data: hData } = await supabase.from("hisoblar").select("*").eq("faol", true);
      if (hData && hData.length > 0) {
        setHisoblar(hData);
        // Default birinchi mos hisobni tanlash
        setHisobId(hData[0].id);
      }

      // 2. Mavjud shaxslar ro'yxatini olish (avtoto'ldirish uchun)
      const { data: qData } = await supabase
        .from("tashqi_qarzlar")
        .select("shaxs_nomi")
        .eq("holat", "faol")
        .limit(200);

      if (qData) {
        const nomlar = Array.from(new Set(qData.map((it: any) => it.shaxs_nomi).filter(Boolean)));
        setMavjudShaxslar(nomlar);
      }
    } catch (err) {
      console.error("Yuklash xatosi:", err);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanNom = shaxsNomi.trim();
    if (!cleanNom) {
      toast.error("Shaxs ismi kiritilmadi!", { description: "Iltimos, tanish/hamkor ismini kiriting." });
      haptic("error");
      return;
    }

    const sonSumma = Number(summa);
    if (!sonSumma || sonSumma <= 0) {
      toast.error("Summa noto'g'ri!", { description: "Iltimos, musbat summa kiriting." });
      haptic("error");
      return;
    }

    setSaqlanmoqda(true);
    haptic("medium");

    try {
      const finalXodim = xodimNomi || getJoriyXodimNomi();
      const { data, error } = await supabase.rpc("fn_tashqi_qarz_yaratish", {
        p_shaxs_nomi: cleanNom,
        p_amal: amal,
        p_summa: sonSumma,
        p_valyuta: valyuta,
        p_hisob_id: bevositaOylik ? null : hisobId,
        p_bevosita_oylik: bevositaOylik && amal === "oldim",
        p_maqsad: maqsad.trim() || (bevositaOylik ? "Oylik uchun" : null),
        p_izoh: izoh.trim() || null,
        p_xodim: finalXodim,
        p_telegram_user_id: telegramUserId ? Number(telegramUserId) : null,
      });

      if (error) throw error;

      haptic("success");
      toast.success("Muvaffaqiyatli saqlandi!", {
        description: `${cleanNom} bo'yicha qarz operatsiyasi qayd etildi.`,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Qarz saqlash xatosi:", err);
      toast.error("Saqlashda xatolik:", { description: err?.message || "Noma'lum xatolik" });
      haptic("error");
    } finally {
      setSaqlanmoqda(false);
    }
  }

  const mosHisoblar = hisoblar.filter((h) => h.valyuta === valyuta || h.valyuta === "BARCHASI");

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              🤝
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white leading-tight">
                Tanishlar Qarz Operatsiyasi
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Olingan va berilgan qarzlar daftari
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              haptic("light");
              onClose();
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Amal Tanlash (4 ta variant) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Amal turi
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setAmal("oldim");
                  haptic("light");
                }}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  amal === "oldim"
                    ? "bg-rose-500 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span>Qarz oldim</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAmal("qaytardim");
                  setBevositaOylik(false);
                  haptic("light");
                }}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  amal === "qaytardim"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Qarz qaytardim</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAmal("berdim");
                  setBevositaOylik(false);
                  haptic("light");
                }}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  amal === "berdim"
                    ? "bg-amber-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Qarz berdim</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAmal("qaytdi");
                  setBevositaOylik(false);
                  haptic("light");
                }}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  amal === "qaytdi"
                    ? "bg-sky-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <HandCoins className="w-3.5 h-3.5" />
                <span>Qarz qaytdi</span>
              </button>
            </div>
          </div>

          {/* Shaxs Ismi */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {amal === "oldim"
                ? "Kimdan olindi?"
                : amal === "qaytardim"
                ? "Kimga qaytarildi?"
                : amal === "berdim"
                ? "Kimga berildi?"
                : "Kimdan qaytdi?"}
            </label>
            <input
              type="text"
              required
              placeholder="Masalan: Ali aka, Akmal, Bobur..."
              value={shaxsNomi}
              onChange={(e) => setShaxsNomi(e.target.value)}
              list="mavjud-shaxslar-list"
              className="w-full px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500"
            />
            <datalist id="mavjud-shaxslar-list">
              {mavjudShaxslar.map((nom, idx) => (
                <option key={idx} value={nom} />
              ))}
            </datalist>
          </div>

          {/* Summa va Valyuta */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Summa va Valyuta
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                required
                min="1"
                step="any"
                placeholder="0"
                value={summa}
                onChange={(e) => setSumma(e.target.value)}
                className="flex-1 px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-base font-black text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500"
              />
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setValyuta("UZS");
                    haptic("light");
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                    valyuta === "UZS"
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  UZS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setValyuta("USD");
                    haptic("light");
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                    valyuta === "USD"
                      ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  USD ($)
                </button>
              </div>
            </div>
            {Number(summa) > 0 && (
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1 pl-1">
                {pul(summa)} {valyuta}
              </p>
            )}
          </div>

          {/* Olingan qarz bo'lsa: Bevosita ishchi oyligiga berildimi? */}
          {amal === "oldim" && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bevositaOylik}
                  onChange={(e) => {
                    setBevositaOylik(e.target.checked);
                    if (e.target.checked && !maqsad) {
                      setMaqsad("Oylik uchun");
                    }
                    haptic("light");
                  }}
                  className="w-4 h-4 text-amber-600 rounded-sm focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-amber-950 dark:text-amber-200">
                  💼 To'g'ridan-to'g'ri ishchiga oylik sifatida berildi
                </span>
              </label>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1 pl-6 leading-tight">
                Pul do'kon kassasiga kirmasdan ishchining plastikiga o'tgan bo'lsa, kassa o'zgarmaydi,
                ammo bazaga "Oylik" xarajati (rasxod) yoziladi.
              </p>
            </div>
          )}

          {/* Kassa / Hisob Tanlash */}
          {!bevositaOylik && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {amal === "oldim" || amal === "qaytdi"
                  ? "Kirim hisobi (qaysi kassa/kartaga tushdi?)"
                  : "Chiqim hisobi (qaysi kassa/kartadan to'landi?)"}
              </label>
              <select
                value={hisobId || ""}
                onChange={(e) => setHisobId(e.target.value || null)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
              >
                <option value="">🚫 Kassaga aloqasiz (Faqat qarz daftari)</option>
                {mosHisoblar.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.nom} ({h.valyuta})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                Kassa tanlansa, kassa balansi avtomatik kirim/chiqim bo'ladi.
              </p>
            </div>
          )}

          {/* Maqsad */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Maqsad (Ixtiyoriy)
            </label>
            <input
              type="text"
              placeholder="Masalan: Oylik uchun, Do'kon ijarasi, Tovar kirimi..."
              value={maqsad}
              onChange={(e) => setMaqsad(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Izoh */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Izoh (Ixtiyoriy)
            </label>
            <input
              type="text"
              placeholder="Qo'shimcha eslatma yoki shartlar..."
              value={izoh}
              onChange={(e) => setIzoh(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Submit button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={saqlanmoqda}
              className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
            >
              {saqlanmoqda ? (
                <span>Saqlanmoqda...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {amal === "oldim"
                      ? "Qarzni qayd qilish"
                      : amal === "qaytardim"
                      ? "Qarz qaytarilganini yozish"
                      : amal === "berdim"
                      ? "Berilgan qarzni saqlash"
                      : "Qaytgan qarzni saqlash"}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
