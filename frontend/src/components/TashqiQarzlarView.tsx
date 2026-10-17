import React, { useState, useEffect } from "react";
import { Search, Plus, ArrowDownRight, ArrowUpRight, CheckCircle2, HandCoins, Users, ChevronRight, Wallet, RefreshCw } from "lucide-react";
import { supabase, pul, haptic } from "../lib/supabase";
import { TashqiQarzModal } from "./TashqiQarzModal";
import { TashqiQarzTarixModal } from "./TashqiQarzTarixModal";
import { toast } from "sonner";

interface TashqiQarzlarViewProps {
  xodimNomi?: string;
  telegramUserId?: number | string | null;
  userRole?: string;
}

export function TashqiQarzlarView({ xodimNomi, telegramUserId, userRole = "sotuvchi" }: TashqiQarzlarViewProps) {
  const [balanslar, setBalanslar] = useState<any[]>([]);
  const [qidiruv, setQidiruv] = useState("");
  const [filtr, setFiltr] = useState<"barchasi" | "biz_berishimiz" | "biz_olishimiz">("barchasi");
  const [yuklanmoqda, setYuklanmoqda] = useState(true);

  // Modallar
  const [yangiModalOchiq, setYangiModalOchiq] = useState(false);
  const [modalAmal, setModalAmal] = useState<"oldim" | "qaytardim" | "berdim" | "qaytdi">("oldim");
  const [modalShaxs, setModalShaxs] = useState("");

  const [tarixShaxs, setTarixShaxs] = useState<any | null>(null);

  useEffect(() => {
    yuklaBalanslar();
  }, []);

  async function yuklaBalanslar() {
    setYuklanmoqda(true);
    try {
      const { data, error } = await supabase
        .from("view_tashqi_qarzlar_balans")
        .select("*")
        .order("oxirgi_harakat", { ascending: false });

      if (error) throw error;
      setBalanslar(data || []);
    } catch (err: any) {
      console.error("Tashqi qarz balansini yuklash xatosi:", err);
      toast.error("Tashqi qarzlarni yuklab bo'lmadi");
    } finally {
      setYuklanmoqda(false);
    }
  }

  // Jami hisob-kitoblar
  const jamiBizBerishimizUZS = balanslar
    .filter((b) => b.valyuta === "UZS")
    .reduce((s, b) => s + (Number(b.biz_berishimiz_kerak) || 0), 0);

  const jamiBizBerishimizUSD = balanslar
    .filter((b) => b.valyuta === "USD")
    .reduce((s, b) => s + (Number(b.biz_berishimiz_kerak) || 0), 0);

  const jamiBizOlishimizUZS = balanslar
    .filter((b) => b.valyuta === "UZS")
    .reduce((s, b) => s + (Number(b.biz_olishimiz_kerak) || 0), 0);

  const jamiBizOlishimizUSD = balanslar
    .filter((b) => b.valyuta === "USD")
    .reduce((s, b) => s + (Number(b.biz_olishimiz_kerak) || 0), 0);

  // Qidiruv va filtr
  const saralangan = balanslar.filter((item) => {
    const nomMos = item.shaxs_nomi.toLowerCase().includes(qidiruv.toLowerCase());
    if (!nomMos) return false;

    if (filtr === "biz_berishimiz") {
      return Number(item.biz_berishimiz_kerak) > 0;
    }
    if (filtr === "biz_olishimiz") {
      return Number(item.biz_olishimiz_kerak) > 0;
    }
    return true;
  });

  function ochYangiModal(amal: "oldim" | "qaytardim" | "berdim" | "qaytdi", shaxs: string = "") {
    setModalAmal(amal);
    setModalShaxs(shaxs);
    setYangiModalOchiq(true);
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {/* 1. Asosiy Statistik Kartalar (Admin va foydalanuvchilar uchun) */}
      <div className="grid grid-cols-2 gap-2">
        {/* Biz berishimiz kerak */}
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 p-3 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-400">
              Biz berishimiz kerak
            </span>
            <span className="text-xs">🔴</span>
          </div>
          <p className="text-sm sm:text-base font-black text-rose-950 dark:text-rose-200 tabular-nums mt-1 leading-snug">
            {pul(jamiBizBerishimizUZS)} so'm
          </p>
          {jamiBizBerishimizUSD > 0 && (
            <p className="text-xs font-black text-rose-700 dark:text-rose-300 tabular-nums mt-0.5">
              ${pul(jamiBizBerishimizUSD)}
            </p>
          )}
        </div>

        {/* Biz olishimiz kerak */}
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 p-3 rounded-xl shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
              Biz olishimiz kerak
            </span>
            <span className="text-xs">🟢</span>
          </div>
          <p className="text-sm sm:text-base font-black text-emerald-950 dark:text-emerald-200 tabular-nums mt-1 leading-snug">
            {pul(jamiBizOlishimizUZS)} so'm
          </p>
          {jamiBizOlishimizUSD > 0 && (
            <p className="text-xs font-black text-emerald-700 dark:text-emerald-300 tabular-nums mt-0.5">
              ${pul(jamiBizOlishimizUSD)}
            </p>
          )}
        </div>
      </div>

      {/* 2. Tezkor Harakat Tugmalari */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            haptic("light");
            ochYangiModal("oldim");
          }}
          className="py-2.5 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
        >
          <ArrowDownRight className="w-4 h-4" />
          <span>+ Qarz oldim</span>
        </button>

        <button
          onClick={() => {
            haptic("light");
            ochYangiModal("berdim");
          }}
          className="py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs active:scale-95 transition-all"
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>💸 Qarz berdim</span>
        </button>
      </div>

      {/* 3. Qidiruv va Filtr */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400 dark:text-slate-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Tanish yoki hamkor ismi..."
            value={qidiruv}
            onChange={(e) => setQidiruv(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl text-xs font-medium shadow-2xs focus:ring-2 focus:ring-amber-500"
          />
          {qidiruv && (
            <button
              onClick={() => setQidiruv("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filtr Chiplari */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => {
              setFiltr("barchasi");
              haptic("light");
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              filtr === "barchasi"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            }`}
          >
            Barchasi ({balanslar.length})
          </button>

          <button
            onClick={() => {
              setFiltr("biz_berishimiz");
              haptic("light");
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              filtr === "biz_berishimiz"
                ? "bg-rose-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            }`}
          >
            Biz berishimiz kerak (
            {balanslar.filter((b) => Number(b.biz_berishimiz_kerak) > 0).length})
          </button>

          <button
            onClick={() => {
              setFiltr("biz_olishimiz");
              haptic("light");
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              filtr === "biz_olishimiz"
                ? "bg-emerald-600 text-white shadow-2xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            }`}
          >
            Biz olishimiz kerak (
            {balanslar.filter((b) => Number(b.biz_olishimiz_kerak) > 0).length})
          </button>
        </div>
      </div>

      {/* 4. Tanishlar Ro'yxati */}
      <div className="space-y-2">
        {yuklanmoqda ? (
          <div className="text-center py-10 text-slate-400 text-xs font-bold">
            Yuklanmoqda...
          </div>
        ) : saralangan.length === 0 ? (
          <div className="text-center py-8 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 dark:text-slate-400 font-bold text-xs">
              Qarz yozuvlari topilmadi
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-[11px] mt-0.5">
              Yangi qarz olish yoki berish uchun yuqoridagi tugmalardan foydalaning.
            </p>
          </div>
        ) : (
          saralangan.map((item, idx) => {
            const bizBerishimiz = Number(item.biz_berishimiz_kerak) || 0;
            const bizOlishimiz = Number(item.biz_olishimiz_kerak) || 0;

            const oxirgiSana = item.oxirgi_harakat
              ? new Date(item.oxirgi_harakat).toLocaleDateString("ru-RU")
              : "";

            return (
              <div
                key={idx}
                onClick={() => {
                  haptic("light");
                  setTarixShaxs({
                    shaxsNomi: item.shaxs_nomi,
                    valyuta: item.valyuta || "UZS",
                    bizBerishimiz,
                    bizOlishimiz,
                  });
                }}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-600 p-3 rounded-xl shadow-2xs flex items-center justify-between cursor-pointer active:bg-slate-50 dark:active:bg-slate-800 transition-all group"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-white group-hover:text-amber-700 dark:group-hover:text-amber-400 truncate">
                      {item.shaxs_nomi}
                    </h4>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-amber-600 transition-colors flex-shrink-0" />
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {oxirgiSana && <span>Oxirgi harakat: {oxirgiSana}</span>}
                  </div>

                  {/* Balans Satri */}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {bizBerishimiz > 0 && (
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 tabular-nums">
                        🔴 Biz berishimiz: {pul(bizBerishimiz)} {item.valyuta}
                      </span>
                    )}

                    {bizOlishimiz > 0 && (
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60 tabular-nums">
                        🟢 Biz olishimiz: {pul(bizOlishimiz)} {item.valyuta}
                      </span>
                    )}

                    {bizBerishimiz === 0 && bizOlishimiz === 0 && (
                      <span className="text-[11px] font-bold text-slate-400">
                        ⚖️ Hisob-kitob yopilgan
                      </span>
                    )}
                  </div>
                </div>

                {/* Tezkor Tugma */}
                <div className="flex-shrink-0">
                  {bizBerishimiz > 0 ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        haptic("light");
                        ochYangiModal("qaytardim", item.shaxs_nomi);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 text-xs shadow-2xs active:scale-95 transition-transform"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Qaytarish
                    </button>
                  ) : bizOlishimiz > 0 ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        haptic("light");
                        ochYangiModal("qaytdi", item.shaxs_nomi);
                      }}
                      className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 text-xs shadow-2xs active:scale-95 transition-transform"
                    >
                      <HandCoins className="w-3.5 h-3.5" /> Qaytdi
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        haptic("light");
                        ochYangiModal("oldim", item.shaxs_nomi);
                      }}
                      className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold px-2.5 py-1.5 rounded-lg text-xs"
                    >
                      + Qarz
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 5. Yangi Qarz / Qaytarish Modali */}
      {yangiModalOchiq && (
        <TashqiQarzModal
          defaultAmal={modalAmal}
          defaultShaxsNomi={modalShaxs}
          xodimNomi={xodimNomi}
          telegramUserId={telegramUserId}
          onClose={() => setYangiModalOchiq(false)}
          onSuccess={() => {
            yuklaBalanslar();
          }}
        />
      )}

      {/* 6. Tarix Modali */}
      {tarixShaxs && (
        <TashqiQarzTarixModal
          shaxsNomi={tarixShaxs.shaxsNomi}
          valyuta={tarixShaxs.valyuta}
          bizBerishimiz={tarixShaxs.bizBerishimiz}
          bizOlishimiz={tarixShaxs.bizOlishimiz}
          onClose={() => setTarixShaxs(null)}
          onYangilash={() => {
            yuklaBalanslar();
          }}
          onTezkorAmal={(amal, shaxs) => {
            setTarixShaxs(null);
            ochYangiModal(amal, shaxs);
          }}
        />
      )}
    </div>
  );
}
