import React, { useState, useEffect } from "react";
import { 
  X, User, Phone, MapPin, HandCoins, History, ArrowDownLeft, 
  ShoppingBag, Edit2, Trash2, Check, AlertTriangle, Loader2 
} from "lucide-react";
import { pul, haptic, supabase } from "../lib/supabase";
import { toast } from "sonner";

interface MijozDetailsModalProps {
  mijoz: any;
  onClose: () => void;
  onTolovOchish: (mijoz: any) => void;
  onMijozYangilandi?: () => void;
}

export function MijozDetailsModal({ mijoz, onClose, onTolovOchish, onMijozYangilandi }: MijozDetailsModalProps) {
  const [tarix, setTarix] = useState<any[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  
  // Tahrirlash holati
  const [tahrirlashRejimi, setTahrirlashRejimi] = useState(false);
  const [tahrirNom, setTahrirNom] = useState(mijoz?.nom || "");
  const [tahrirTelefon, setTahrirTelefon] = useState(mijoz?.telefon || "");
  const [tahrirManzil, setTahrirManzil] = useState(mijoz?.manzil || "");
  const [tahrirIzoh, setTahrirIzoh] = useState(mijoz?.izoh || "");
  const [saqlanmoqda, setSaqlanmoqda] = useState(false);
  const [tahrirXato, setTahrirXato] = useState("");

  // O'chirish holati
  const [ochirishTasdiq, setOchirishTasdiq] = useState(false);
  const [ochirilmoqda, setOchirilmoqda] = useState(false);
  const [ochirishXato, setOchirishXato] = useState("");

  useEffect(() => {
    if (mijoz?.id) {
      yuklaMijozTarixi();
      setTahrirNom(mijoz.nom || "");
      setTahrirTelefon(mijoz.telefon || "");
      setTahrirManzil(mijoz.manzil || "");
      setTahrirIzoh(mijoz.izoh || "");
    }
  }, [mijoz]);

  async function yuklaMijozTarixi() {
    setYuklanmoqda(true);
    try {
      // 1. Oxirgi savdolar
      const { data: savdolar } = await supabase
        .from("savdolar")
        .select("id, sana_vaqt, valyuta, jami_summa, tolangan_summa, qarz_summa, izoh")
        .eq("mijoz_id", mijoz.id)
        .order("sana_vaqt", { ascending: false })
        .limit(10);

      // 2. Oxirgi qarz to'lovlari
      const { data: tolovlar } = await supabase
        .from("qarz_tolovlari")
        .select("id, sana_vaqt, valyuta, summa, tolov_turi, izoh")
        .eq("mijoz_id", mijoz.id)
        .order("sana_vaqt", { ascending: false })
        .limit(10);

      const birlashgan: any[] = [];
      if (savdolar) {
        savdolar.forEach((s) => {
          birlashgan.push({
            id: s.id,
            tur: "savdo",
            sana: s.sana_vaqt,
            summa: s.jami_summa,
            qarz: s.qarz_summa,
            valyuta: s.valyuta,
            izoh: s.izoh,
          });
        });
      }
      if (tolovlar) {
        tolovlar.forEach((t) => {
          birlashgan.push({
            id: t.id,
            tur: "qarz_tolov",
            sana: t.sana_vaqt,
            summa: t.summa,
            valyuta: t.valyuta,
            izoh: t.izoh,
          });
        });
      }

      birlashgan.sort((a, b) => new Date(b.sana).getTime() - new Date(a.sana).getTime());
      setTarix(birlashgan.slice(0, 15));
    } catch (e) {
      console.error(e);
    } finally {
      setYuklanmoqda(false);
    }
  }

  // Mijoz ma'lumotlarini saqlash
  async function mijozniSaqlash() {
    if (!tahrirNom.trim()) {
      setTahrirXato("Mijoz ismini kiritish majburiy!");
      return;
    }

    setSaqlanmoqda(true);
    setTahrirXato("");
    haptic("medium");

    try {
      const { error } = await supabase
        .from("mijozlar")
        .update({
          nom: tahrirNom.trim(),
          nom_norm: tahrirNom.trim().toLowerCase(),
          telefon: tahrirTelefon.trim() || null,
          manzil: tahrirManzil.trim() || null,
          izoh: tahrirIzoh.trim() || null,
        })
        .eq("id", mijoz.id);

      if (error) throw error;

      mijoz.nom = tahrirNom.trim();
      mijoz.telefon = tahrirTelefon.trim() || null;
      mijoz.manzil = tahrirManzil.trim() || null;
      mijoz.izoh = tahrirIzoh.trim() || null;

      haptic("success");
      toast.success("Mijoz ma'lumotlari yangilandi!");
      setTahrirlashRejimi(false);
      if (onMijozYangilandi) onMijozYangilandi();
    } catch (err: any) {
      haptic("error");
      setTahrirXato("Xatolik: " + err.message);
      toast.error("Xatolik", { description: err.message });
    } finally {
      setSaqlanmoqda(false);
    }
  }

  // Mijozni o'chirish / arxivlash
  async function mijozniOchirish() {
    const qarzUzs = Number(mijoz.qarz_uzs || 0);
    const qarzUsd = Number(mijoz.qarz_usd || 0);

    if (qarzUzs > 0 || qarzUsd > 0) {
      const xatoMatn = `Ushbu mijozning qarzi mavjud (${qarzUzs > 0 ? pul(qarzUzs) + " so'm " : ""}${qarzUsd > 0 ? "$" + pul(qarzUsd) : ""}). Avval qarz to'liq yopilishi shart!`;
      setOchirishXato(xatoMatn);
      toast.error("Mijozni o'chirib bo'lmaydi", { description: xatoMatn });
      haptic("error");
      return;
    }

    setOchirilmoqda(true);
    setOchirishXato("");
    haptic("medium");

    try {
      // Savdolar mavjudligini tekshirish
      const { count } = await supabase
        .from("savdolar")
        .select("*", { count: "exact", head: true })
        .eq("mijoz_id", mijoz.id);

      if (count && count > 0) {
        // Avval savdo qilingan -> Arxivlash (faol = false)
        const { error } = await supabase
          .from("mijozlar")
          .update({ faol: false })
          .eq("id", mijoz.id);

        if (error) throw error;
        toast.success("Mijoz arxivlandi (savdolar tarixi saqlangan holda)");
      } else {
        // Savdo bo'lmagan -> Butunlay o'chirish
        const { error } = await supabase
          .from("mijozlar")
          .delete()
          .eq("id", mijoz.id);

        if (error) throw error;
        toast.success("Mijoz butunlay o'chirildi");
      }

      haptic("success");
      if (onMijozYangilandi) onMijozYangilandi();
      onClose();
    } catch (err: any) {
      haptic("error");
      setOchirishXato("O'chirishda xatolik: " + err.message);
      toast.error("O'chirishda xatolik", { description: err.message });
      setOchirilmoqda(false);
    }
  }

  if (!mijoz) return null;

  const hasDebt = Number(mijoz.qarz_uzs || 0) > 0 || Number(mijoz.qarz_usd || 0) > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-3xl sm:rounded-2xl p-4 space-y-3.5 shadow-2xl max-h-[88vh] overflow-y-auto border border-transparent dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                {tahrirlashRejimi ? "Mijozni Tahrirlash" : mijoz.nom}
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">B2B Mijoz kartochkasi</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!tahrirlashRejimi && (
              <button
                onClick={() => {
                  setTahrirlashRejimi(true);
                  haptic("light");
                }}
                title="Tahrirlash"
                className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-indigo-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TAHRIRLASH FORMASI */}
        {tahrirlashRejimi ? (
          <div className="space-y-3 p-1 animate-fade-in">
            {tahrirXato && (
              <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold">
                {tahrirXato}
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Mijoz nomi / Do'koni *
              </label>
              <input
                type="text"
                value={tahrirNom}
                onChange={(e) => setTahrirNom(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Telefon raqami
              </label>
              <input
                type="tel"
                value={tahrirTelefon}
                onChange={(e) => setTahrirTelefon(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Manzil / Do'kon joylashuvi
              </label>
              <input
                type="text"
                value={tahrirManzil}
                onChange={(e) => setTahrirManzil(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Izoh / Eslatma
              </label>
              <textarea
                value={tahrirIzoh}
                onChange={(e) => setTahrirIzoh(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white resize-none"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTahrirlashRejimi(false)}
                className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold"
              >
                Bekor
              </button>
              <button
                type="button"
                onClick={mijozniSaqlash}
                disabled={saqlanmoqda}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-50"
              >
                {saqlanmoqda ? "Saqlanmoqda..." : "Saqlash"}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Aloqa va Manzil */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
              {mijoz.telefon && (
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <a href={`tel:${mijoz.telefon}`} className="font-bold hover:underline">
                    {mijoz.telefon}
                  </a>
                </div>
              )}
              {mijoz.manzil && (
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="font-medium">{mijoz.manzil}</span>
                </div>
              )}
              {mijoz.izoh && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 italic pt-1 border-t border-slate-200 dark:border-slate-700">
                  "{mijoz.izoh}"
                </p>
              )}
            </div>

            {/* Qarz Balansi */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 p-2.5 rounded-xl">
                <span className="text-[10px] font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider block">
                  So'mdagi qarzi
                </span>
                <p className="text-base font-black text-amber-950 dark:text-amber-200 tabular-nums mt-0.5">
                  {pul(mijoz.qarz_uzs || 0)} so'm
                </p>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 p-2.5 rounded-xl">
                <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider block">
                  Dollardagi qarzi
                </span>
                <p className="text-base font-black text-emerald-950 dark:text-emerald-200 tabular-nums mt-0.5">
                  ${pul(mijoz.qarz_usd || 0)}
                </p>
              </div>
            </div>

            {/* Qarz To'lash Tugmasi */}
            {hasDebt && (
              <button
                onClick={() => onTolovOchish(mijoz)}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
              >
                <HandCoins className="w-4 h-4" /> Qarz To'lovini Qabul Qilish
              </button>
            )}

            {/* O'chirish ogohlantirish / xatoligi */}
            {ochirishXato && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <p>{ochirishXato}</p>
              </div>
            )}

            {/* O'chirishni tasdiqlash */}
            {ochirishTasdiq && (
              <div className="bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 p-3 rounded-2xl space-y-2 text-xs animate-fade-in">
                <p className="font-bold text-rose-900 dark:text-rose-200">
                  Haqiqatan ham ushbu mijozni o'chirmoqchimisiz?
                </p>
                <p className="text-[11px] text-rose-700 dark:text-rose-300">
                  Agar bu mijoz bilan avval savdo qilingan bo'lsa, hisobotlar buzilmasligi uchun u arxivlanadi.
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setOchirishTasdiq(false)}
                    disabled={ochirilmoqda}
                    className="flex-1 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-lg"
                  >
                    Bekor
                  </button>
                  <button
                    onClick={mijozniOchirish}
                    disabled={ochirilmoqda}
                    className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg flex items-center justify-center gap-1"
                  >
                    {ochirilmoqda ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    <span>{ochirilmoqda ? "Bajarilmoqda..." : "Tasdiqlayman"}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Savdolar va To'lovlar Tarixi */}
            <div className="space-y-2 pt-1">
              <h4 className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-400" /> Oxirgi Amallar Tarixi
              </h4>

              {yuklanmoqda ? (
                <p className="text-center text-slate-400 py-4 text-xs font-medium">Tarix yuklanmoqda...</p>
              ) : tarix.length === 0 ? (
                <p className="text-center text-slate-400 py-4 text-xs font-medium">Bu mijoz bo'yicha tarix mavjud emas.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {tarix.map((item) => (
                    <div
                      key={item.id + item.tur}
                      className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 p-2.5 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            item.tur === "savdo"
                              ? "bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-400"
                              : "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {item.tur === "savdo" ? (
                            <ShoppingBag className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white leading-tight">
                            {item.tur === "savdo" ? "Savdo (Qarzga)" : "Qarz to'lovi"}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(item.sana).toLocaleDateString("ru-RU")} ·{" "}
                            {new Date(item.sana).toLocaleTimeString("ru-RU", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p
                          className={`font-black tabular-nums ${
                            item.tur === "savdo" ? "text-slate-900 dark:text-white" : "text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {item.tur === "qarz_tolov" ? "−" : ""}
                          {pul(item.summa)} {item.valyuta}
                        </p>
                        {item.tur === "savdo" && item.qarz > 0 && (
                          <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                            qarz: {pul(item.qarz)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* O'chirish va Yopish tugmalari */}
            {!ochirishTasdiq && (
              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setOchirishTasdiq(true);
                    setOchirishXato("");
                    haptic("light");
                  }}
                  className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/80 text-rose-700 dark:text-rose-400 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-rose-200 dark:border-rose-900/60"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>O'chirish</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-xs rounded-xl transition-colors"
                >
                  Yopish
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
