import React, { useState, useEffect } from "react";
import { X, DollarSign, Plus } from "lucide-react";
import { supabase, pul, haptic } from "../lib/supabase";
import { Combobox } from "./ui/Combobox";
import { toast } from "sonner";

const STANDART_KATEGORIYALAR = [
  { nom: "Ovqatlanish", belgi: "🍲", rang: "bg-orange-50 border-orange-200 text-orange-950" },
  { nom: "Taksi", belgi: "🚕", rang: "bg-yellow-50 border-yellow-200 text-yellow-950" },
  { nom: "Elektr", belgi: "💡", rang: "bg-blue-50 border-blue-200 text-blue-950" },
  { nom: "Ijara", belgi: "🏢", rang: "bg-purple-50 border-purple-200 text-purple-950" },
  { nom: "Xo'jalik", belgi: "📦", rang: "bg-emerald-50 border-emerald-200 text-emerald-950" },
  { nom: "Oylik", belgi: "💼", rang: "bg-indigo-50 border-indigo-200 text-indigo-950" },
  { nom: "Boshqa", belgi: "📝", rang: "bg-slate-50 border-slate-200 text-slate-950" },
];

interface YangiChiqimModalProps {
  onClose: () => void;
  onSuccess: () => void;
  xodimNomi?: string;
  telegramUserId?: number | string | null;
}

export function YangiChiqimModal({
  onClose,
  onSuccess,
  xodimNomi,
  telegramUserId,
}: YangiChiqimModalProps) {
  const [summa, setSumma] = useState("");
  const [valyuta, setValyuta] = useState<"UZS" | "USD">("UZS");
  const [kategoriyalar, setKategoriyalar] = useState(STANDART_KATEGORIYALAR);
  const [tanlanganKat, setTanlanganKat] = useState("Ovqatlanish");
  const [yangiKatOchiq, setYangiKatOchiq] = useState(false);
  const [yangiKatNom, setYangiKatNom] = useState("");
  const [tolovTuri, setTolovTuri] = useState("naqd");
  const [hisoblar, setHisoblar] = useState<any[]>([]);
  const [hisobId, setHisobId] = useState<string | null>(null);
  const [izoh, setIzoh] = useState("");
  const [yuklanmoqda, setYuklanmoqda] = useState(false);

  useEffect(() => {
    yuklaMalumotlar();
  }, []);

  async function yuklaMalumotlar() {
    // 1. Hisoblar
    const { data: hData } = await supabase.from("hisoblar").select("*").eq("faol", true);
    if (hData && hData.length > 0) {
      setHisoblar(hData);
      setHisobId(hData[0].id);
    }

    // 2. Bazadagi barcha unikal kategoriyalar
    try {
      const { data: barchaKat } = await supabase
        .from("rasxodlar")
        .select("kategoriya")
        .eq("holat", "faol")
        .limit(300);

      if (barchaKat && barchaKat.length > 0) {
        const mavjudNomlar = new Set(STANDART_KATEGORIYALAR.map((k) => k.nom.toLowerCase()));
        const yangiQoshimchalar: any[] = [];

        barchaKat.forEach((r: any) => {
          const nom = (r.kategoriya || "").trim();
          if (nom && !mavjudNomlar.has(nom.toLowerCase())) {
            mavjudNomlar.add(nom.toLowerCase());
            yangiQoshimchalar.push({
              nom,
              belgi: "🏷️",
              rang: "bg-teal-50 border-teal-200 text-teal-950",
            });
          }
        });

        if (yangiQoshimchalar.length > 0) {
          setKategoriyalar([...STANDART_KATEGORIYALAR, ...yangiQoshimchalar]);
        }
      }
    } catch (e) {
      console.error("Kategoriyalarni yuklashda xatolik:", e);
    }
  }

  function qoshSumma(qoshimcha: number) {
    haptic("light");
    const joriy = Number(summa) || 0;
    setSumma(String(joriy + qoshimcha));
  }

  async function rasxodSaqla() {
    const sonSumma = Number(summa);
    if (!sonSumma || sonSumma <= 0) {
      haptic("error");
      toast.error("Summa kiritilmadi!", { description: "Iltimos, chiqim summasini kiriting!" });
      return;
    }
    if (!hisobId) {
      haptic("error");
      toast.error("Hisob tanlanmadi!", { description: "Iltimos, xarajat qaysi hisobdan chiqqanini tanlang!" });
      return;
    }

    setYuklanmoqda(true);
    haptic("medium");

    try {
      const { error } = await supabase.rpc("fn_rasxod_yaratish_v2", {
        p_summa: sonSumma,
        p_valyuta: valyuta,
        p_kategoriya: tanlanganKat,
        p_tolov_turi: tolovTuri,
        p_hisob_id: hisobId,
        p_izoh: izoh.trim() || null,
        p_xodim: xodimNomi || "Mini App",
        p_telegram_user_id: telegramUserId ? Number(telegramUserId) : null,
      });

      if (error) throw error;

      // Guruhga xabarnoma yuborish
      try {
        const matn =
          `🚨 <b>YANGI CHIQIM (XARAJAT) QAYD ETILDI</b>\n\n` +
          `💰 Summa: <b>${pul(sonSumma)} ${valyuta}</b>\n` +
          `📂 Kategoriya: <b>${tanlanganKat}</b>\n` +
          `💳 To'lov turi: <b>${tolovTuri}</b>\n` +
          (izoh.trim() ? `📝 Izoh: <i>${izoh.trim()}</i>\n` : "") +
          `👤 Kiritdi: <b>${xodimNomi || "Mini App"}</b>`;

        await fetch("/api/notify", {
          method: "POST",
          body: JSON.stringify({ text: matn }),
        });
      } catch (notifyErr) {
        console.error("Xabarnoma yuborishda xatolik:", notifyErr);
      }

      haptic("success");
      toast.success("Xarajat saqlandi!", {
        description: `${tanlanganKat}: ${pul(sonSumma)} ${valyuta}`,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      haptic("error");
      toast.error("Xatolik", { description: err.message });
    } finally {
      setYuklanmoqda(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-3xl sm:rounded-2xl p-4 max-h-[92vh] overflow-y-auto space-y-3.5 shadow-2xl border border-transparent dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Yangi chiqim kiritish</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Do'kon xarajatlarini qayd qilish</p>
            </div>
          </div>
          <button
            onClick={() => {
              haptic("light");
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summa maydoni */}
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Chiqim summasi:</label>
            <button
              type="button"
              onClick={() => {
                const yangi = valyuta === "UZS" ? "USD" : "UZS";
                setValyuta(yangi);
                const mosHisob = hisoblar.find((h) => h.valyuta === yangi && h.turi === tolovTuri);
                if (mosHisob) setHisobId(mosHisob.id);
                haptic("light");
              }}
              className="px-2.5 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-black text-slate-700 dark:text-slate-200 flex items-center gap-1 shadow-2xs"
            >
              <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {valyuta}
            </button>
          </div>

          <input
            type="number"
            placeholder="0"
            value={summa}
            onChange={(e) => setSumma(e.target.value)}
            autoFocus
            className="w-full p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-2xl font-black text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-rose-500"
          />

          {/* Tezkor qo'shish tugmalari */}
          {valyuta === "UZS" && (
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {[20000, 50000, 100000, 500000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => qoshSumma(v)}
                  className="py-1.5 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-200 tabular-nums active:scale-95 transition-transform"
                >
                  +{pul(v)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Kategoriya tugmalari */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Kategoriyani tanlang:</label>
            <button
              type="button"
              onClick={() => {
                setYangiKatOchiq(!yangiKatOchiq);
                haptic("light");
              }}
              className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
            >
              {yangiKatOchiq ? "✕ Bekor qilish" : "➕ Yangi kategoriya"}
            </button>
          </div>

          {/* Yangi kategoriya kiritish maydoni */}
          {yangiKatOchiq && (
            <div className="mb-2 p-2 bg-rose-50/50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-xl flex gap-1.5 items-center animate-in fade-in">
              <input
                type="text"
                placeholder="Yangi kategoriya (masalan: Reklama, Kanselyariya)..."
                value={yangiKatNom}
                onChange={(e) => setYangiKatNom(e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
              <button
                type="button"
                onClick={() => {
                  const nom = yangiKatNom.trim();
                  if (!nom) {
                    toast.error("Kategoriya nomini yozing!");
                    return;
                  }
                  const mavjud = kategoriyalar.find((k) => k.nom.toLowerCase() === nom.toLowerCase());
                  if (mavjud) {
                    setTanlanganKat(mavjud.nom);
                  } else {
                    const yangi = {
                      nom,
                      belgi: "🏷️",
                      rang: "bg-teal-50 border-teal-200 text-teal-950",
                    };
                    setKategoriyalar((prev) => [...prev, yangi]);
                    setTanlanganKat(nom);
                  }
                  setYangiKatNom("");
                  setYangiKatOchiq(false);
                  haptic("medium");
                  toast.success(`"${nom}" kategoriyasi tanlandi!`);
                }}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shrink-0 transition-colors"
              >
                Qo'shish
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-0.5">
            {kategoriyalar.map((kat) => {
              const tanlangan = tanlanganKat === kat.nom;
              return (
                <button
                  key={kat.nom}
                  type="button"
                  onClick={() => {
                    setTanlanganKat(kat.nom);
                    haptic("light");
                  }}
                  className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all ${
                    tanlangan
                      ? "bg-rose-600 border-rose-600 text-white shadow-2xs scale-102"
                      : `${kat.rang} dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600`
                  }`}
                >
                  <span className="text-base">{kat.belgi}</span>
                  <span className="font-bold text-xs leading-tight truncate">{kat.nom}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* To'lov usuli va Kassa */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 block">To'lov turi:</label>
            <Combobox
              title="To'lov turini tanlang"
              value={tolovTuri}
              onChange={(val) => {
                setTolovTuri(val);
                const mosHisob = hisoblar.find((h) => h.valyuta === valyuta && h.turi === val);
                if (mosHisob) setHisobId(mosHisob.id);
              }}
              options={[
                { value: "naqd", label: "Naqd pul", icon: "💵" },
                { value: "plastik", label: "Plastik karta", icon: "💳" },
                { value: "perechisleniya", label: "Perechisleniya", icon: "🏦" },
              ]}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
              <span>Qaysi hisobdan:</span>
              <span className="text-[10px] text-rose-500 font-extrabold">* Shart</span>
            </label>
            <Combobox
              title="Hisobni tanlang"
              value={hisobId || ""}
              onChange={setHisobId}
              options={hisoblar.map((h) => ({
                value: h.id,
                label: `${h.nom} (${h.valyuta})`,
              }))}
            />
          </div>
        </div>

        {/* Izoh */}
        <div>
          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1 block">Izoh (ixtiyoriy):</label>
          <input
            type="text"
            placeholder="masalan: bozorga taksi, tushlik do'kon uchun..."
            value={izoh}
            onChange={(e) => setIzoh(e.target.value)}
            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-medium text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
        </div>

        {/* Chiqimni saqlash tugmasi */}
        <button
          type="button"
          onClick={rasxodSaqla}
          disabled={yuklanmoqda}
          className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black text-sm rounded-xl shadow-md active:scale-98 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {yuklanmoqda ? "Saqlanmoqda..." : "💸 Chiqimni Saqlash"}
        </button>
      </div>
    </div>
  );
}
