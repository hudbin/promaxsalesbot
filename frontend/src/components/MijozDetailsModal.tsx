import React, { useState, useEffect } from "react";
import { X, User, Phone, MapPin, HandCoins, History, ArrowDownLeft, ShoppingBag } from "lucide-react";
import { pul, haptic, supabase } from "../lib/supabase";

interface MijozDetailsModalProps {
  mijoz: any;
  onClose: () => void;
  onTolovOchish: (mijoz: any) => void;
}

export function MijozDetailsModal({ mijoz, onClose, onTolovOchish }: MijozDetailsModalProps) {
  const [tarix, setTarix] = useState<any[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);

  useEffect(() => {
    if (mijoz?.id) {
      yuklaMijozTarixi();
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

  if (!mijoz) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-4 space-y-3.5 shadow-2xl max-h-[88vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">{mijoz.nom}</h3>
              <p className="text-[10px] text-slate-400 font-medium">B2B Mijoz tafsilotlari</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Aloqa va Manzil */}
        <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl space-y-2">
          {mijoz.telefon ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-700 font-bold">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{mijoz.telefon}</span>
              </div>
              <a
                href={`tel:${mijoz.telefon}`}
                className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-black active:scale-95"
              >
                Qo'ng'iroq
              </a>
            </div>
          ) : (
            <p className="text-xs text-slate-400 font-medium">Telefon raqam kiritilmagan</p>
          )}

          {mijoz.manzil && (
            <div className="flex items-center gap-2 text-xs text-slate-600 pt-1 border-t border-slate-200">
              <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="truncate">{mijoz.manzil}</span>
            </div>
          )}

          {mijoz.izoh && (
            <p className="text-[11px] text-slate-500 italic bg-white p-2 rounded-lg border border-slate-200">
              "{mijoz.izoh}"
            </p>
          )}
        </div>

        {/* Joriy Qarzdorlik Balansi */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">
              So'mdagi qarzi
            </span>
            <p className="text-base font-black text-amber-950 tabular-nums mt-0.5">
              {pul(mijoz.qarz_uzs || 0)}
            </p>
            <p className="text-[10px] text-amber-700 font-medium">so'm</p>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
              Dollardagi qarzi
            </span>
            <p className="text-base font-black text-emerald-950 tabular-nums mt-0.5">
              ${pul(mijoz.qarz_usd || 0)}
            </p>
            <p className="text-[10px] text-emerald-700 font-medium">AQSH dollari</p>
          </div>
        </div>

        {/* Qarz To'lash Asosiy Tugmasi */}
        <button
          onClick={() => {
            haptic("light");
            onTolovOchish(mijoz);
          }}
          className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
        >
          <HandCoins className="w-4 h-4" /> Ushbu mijozdan qarz qabul qilish
        </button>

        {/* Tranzaksiyalar Tarixi */}
        <div className="space-y-1.5 pt-1">
          <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-slate-400" /> Oxirgi harakatlar
          </h4>

          {yuklanmoqda ? (
            <p className="text-xs text-slate-400 text-center py-4">Tarix yuklanmoqda...</p>
          ) : tarix.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl">
              Harakatlar tarixi topilmadi.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
              {tarix.map((item) => (
                <div
                  key={item.id + item.tur}
                  className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        item.tur === "savdo"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {item.tur === "savdo" ? (
                        <ShoppingBag className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 leading-tight">
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
                        item.tur === "savdo" ? "text-slate-900" : "text-emerald-700"
                      }`}
                    >
                      {item.tur === "qarz_tolov" ? "−" : ""}
                      {pul(item.summa)} {item.valyuta}
                    </p>
                    {item.tur === "savdo" && item.qarz > 0 && (
                      <p className="text-[10px] font-bold text-rose-600">
                        qarz: {pul(item.qarz)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
