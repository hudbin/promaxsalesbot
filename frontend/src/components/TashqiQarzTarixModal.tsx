import React, { useState, useEffect } from "react";
import { X, ArrowDownRight, ArrowUpRight, CheckCircle2, HandCoins, Trash2, Clock, Calendar, AlertCircle } from "lucide-react";
import { supabase, pul, haptic, getJoriyXodimNomi } from "../lib/supabase";
import { toast } from "sonner";

interface TashqiQarzTarixModalProps {
  shaxsNomi: string;
  valyuta: "UZS" | "USD";
  bizBerishimiz: number;
  bizOlishimiz: number;
  onClose: () => void;
  onYangilash: () => void;
  onTezkorAmal: (amal: "oldim" | "qaytardim" | "berdim" | "qaytdi", shaxs: string) => void;
}

export function TashqiQarzTarixModal({
  shaxsNomi,
  valyuta,
  bizBerishimiz,
  bizOlishimiz,
  onClose,
  onYangilash,
  onTezkorAmal,
}: TashqiQarzTarixModalProps) {
  const [tarix, setTarix] = useState<any[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(true);
  const [ochirishId, setOchirishId] = useState<string | null>(null);

  useEffect(() => {
    yuklaTarix();
  }, [shaxsNomi]);

  async function yuklaTarix() {
    setYuklanmoqda(true);
    try {
      const norm = shaxsNomi.trim().toLowerCase();
      const { data, error } = await supabase
        .from("tashqi_qarzlar")
        .select(`
          id,
          sana_vaqt,
          amal,
          summa,
          valyuta,
          maqsad,
          kassaga_tasir,
          bevosita_rasxod_id,
          izoh,
          xodim,
          holat,
          hisoblar (
            nom
          )
        `)
        .eq("shaxs_nomi_norm", norm)
        .eq("holat", "faol")
        .order("sana_vaqt", { ascending: false });

      if (error) throw error;
      setTarix(data || []);
    } catch (err: any) {
      console.error("Tarixni yuklash xatosi:", err);
      toast.error("Tarixni yuklab bo'lmadi");
    } finally {
      setYuklanmoqda(false);
    }
  }

  async function bekorQilish(id: string) {
    haptic("warning");
    if (!window.confirm("Haqiqatan ham ushbu qarz yozuvini bekor qilmoqchimisiz?")) {
      return;
    }

    try {
      setOchirishId(id);
      const xodim = getJoriyXodimNomi();
      const { error } = await supabase.rpc("fn_tashqi_qarz_bekor_qilish", {
        p_qarz_id: id,
        p_xodim: xodim,
      });

      if (error) throw error;

      haptic("success");
      toast.success("Yozuv bekor qilindi!");
      yuklaTarix();
      onYangilash();
    } catch (err: any) {
      console.error("Bekor qilish xatosi:", err);
      toast.error("Bekor qilishda xatolik:", { description: err?.message });
      haptic("error");
    } finally {
      setOchirishId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-lg">
              👤
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white leading-tight">
                {shaxsNomi}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Oldi-berdi tranzaksiyalari tarixi
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

        {/* Status Card & Quick Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 p-2.5 rounded-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Biz berishimiz kerak
              </span>
              <p className="text-base font-black text-rose-700 dark:text-rose-300 tabular-nums mt-0.5">
                {bizBerishimiz > 0 ? `${pul(bizBerishimiz)} ${valyuta}` : "0"}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 p-2.5 rounded-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Biz olishimiz kerak
              </span>
              <p className="text-base font-black text-emerald-700 dark:text-emerald-300 tabular-nums mt-0.5">
                {bizOlishimiz > 0 ? `${pul(bizOlishimiz)} ${valyuta}` : "0"}
              </p>
            </div>
          </div>

          {/* Quick Buttons */}
          <div className="flex gap-2">
            {bizBerishimiz > 0 && (
              <button
                onClick={() => {
                  haptic("light");
                  onTezkorAmal("qaytardim", shaxsNomi);
                }}
                className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Qarzni qaytarish</span>
              </button>
            )}

            {bizOlishimiz > 0 && (
              <button
                onClick={() => {
                  haptic("light");
                  onTezkorAmal("qaytdi", shaxsNomi);
                }}
                className="flex-1 py-2 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
              >
                <HandCoins className="w-3.5 h-3.5" />
                <span>Qarzni qaytarib olish</span>
              </button>
            )}

            <button
              onClick={() => {
                haptic("light");
                onTezkorAmal("oldim", shaxsNomi);
              }}
              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95"
            >
              <span>+ Yana qarz</span>
            </button>
          </div>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {yuklanmoqda ? (
            <div className="text-center py-10 text-slate-400 text-xs font-bold">
              Tarix yuklanmoqda...
            </div>
          ) : tarix.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <Clock className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-slate-500 font-bold text-xs">Ushbu shaxs bilan yozuvlar yo'q</p>
            </div>
          ) : (
            tarix.map((row) => {
              const isOldim = row.amal === "oldim";
              const isQaytardim = row.amal === "qaytardim";
              const isBerdim = row.amal === "berdim";
              const isQaytdi = row.amal === "qaytdi";

              let badgeRang = "";
              let badgeBelgi = "";
              let amalNomi = "";

              if (isOldim) {
                badgeRang = "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200 dark:border-rose-800";
                badgeBelgi = "➕";
                amalNomi = "Qarz olindi";
              } else if (isQaytardim) {
                badgeRang = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
                badgeBelgi = "✓";
                amalNomi = "Qarz qaytarildi";
              } else if (isBerdim) {
                badgeRang = "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200 dark:border-amber-800";
                badgeBelgi = "💸";
                amalNomi = "Qarz berildi";
              } else if (isQaytdi) {
                badgeRang = "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400 border-sky-200 dark:border-sky-800";
                badgeBelgi = "📥";
                amalNomi = "Berilgan qarz qaytdi";
              }

              const sana = new Date(row.sana_vaqt);
              const sanaText = `${sana.toLocaleDateString("ru-RU")} ${sana.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;

              return (
                <div
                  key={row.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl shadow-2xs space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${badgeRang}`}>
                          {badgeBelgi} {amalNomi}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                          {sanaText}
                        </span>
                      </div>

                      <p className="text-sm font-black text-slate-900 dark:text-white tabular-nums mt-1">
                        {pul(row.summa)} {row.valyuta}
                      </p>
                    </div>

                    <button
                      onClick={() => bekorQilish(row.id)}
                      disabled={ochirishId === row.id}
                      title="Ushbu yozuvni bekor qilish"
                      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Joylashuv va izoh */}
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 space-y-0.5 border-t border-slate-100 dark:border-slate-800 pt-1.5">
                    {row.bevosita_rasxod_id ? (
                      <p className="text-amber-700 dark:text-amber-400 font-semibold">
                        💼 Ishchiga to'g'ridan-to'g'ri (Oylik rasxodi yozilgan)
                      </p>
                    ) : row.hisoblar?.nom ? (
                      <p className="text-slate-700 dark:text-slate-300">
                        🏦 Kassa: {row.hisoblar.nom}
                      </p>
                    ) : (
                      <p className="text-slate-400 italic">
                        📝 Kassaga aloqasiz (Qarz daftari)
                      </p>
                    )}

                    {row.maqsad && (
                      <p>
                        <span className="font-bold text-slate-600 dark:text-slate-300">Maqsad:</span> {row.maqsad}
                      </p>
                    )}

                    {row.izoh && (
                      <p>
                        <span className="font-bold text-slate-600 dark:text-slate-300">Izoh:</span> {row.izoh}
                      </p>
                    )}

                    {row.xodim && (
                      <p className="text-[10px] text-slate-400 pt-0.5">
                        ✍️ Kiritdi: {row.xodim}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
