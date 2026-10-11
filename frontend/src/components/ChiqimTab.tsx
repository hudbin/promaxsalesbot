import React, { useState, useEffect } from "react";
import { supabase, pul, haptic } from "../lib/supabase";
import {
  Plus,
  Calendar,
  Clock,
  ChevronRight,
  TrendingDown,
  Wallet,
  PieChart,
  Filter,
  CheckCircle,
  X,
  RefreshCw,
  Award,
} from "lucide-react";
import { ChiqimDetailsModal } from "./ChiqimDetailsModal";
import { YangiChiqimModal } from "./YangiChiqimModal";

type DavrTuri = "bugun" | "hafta" | "oy" | "boshqa";

interface ChiqimTabProps {
  xodimNomi?: string;
  telegramUserId?: number | string | null;
}

export function ChiqimTab({ xodimNomi, telegramUserId }: ChiqimTabProps = {}) {
  // Bugungi sana va oyning birinchi kuni
  const bugunStr = new Date().toISOString().split("T")[0];
  const oyBoshiStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split("T")[0];

  // Holatlar
  const [davr, setDavr] = useState<DavrTuri>("bugun");
  const [boshlanishSana, setBoshlanishSana] = useState(bugunStr);
  const [tugashSana, setTugashSana] = useState(bugunStr);
  const [rasxodlar, setRasxodlar] = useState<any[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);

  // Kategoriya bo'yicha filtrlash (ixtiyoriy bosganda)
  const [filterKat, setFilterKat] = useState<string | null>(null);

  // Modallar
  const [yangiModalOchiq, setYangiModalOchiq] = useState(false);
  const [tanlanganChiqim, setTanlanganChiqim] = useState<any>(null);
  const [xabar, setXabar] = useState<string | null>(null);

  // Davr o'zgarganda sanalarni o'rnatish
  const davrTanlandi = (d: DavrTuri) => {
    haptic("light");
    setDavr(d);
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    if (d === "bugun") {
      setBoshlanishSana(today);
      setTugashSana(today);
    } else if (d === "hafta") {
      const haftaOldin = new Date();
      haftaOldin.setDate(now.getDate() - 7);
      setBoshlanishSana(haftaOldin.toISOString().split("T")[0]);
      setTugashSana(today);
    } else if (d === "oy") {
      setBoshlanishSana(oyBoshiStr);
      setTugashSana(today);
    }
  };

  useEffect(() => {
    yuklaRasxodlar();
  }, [boshlanishSana, tugashSana]);

  async function yuklaRasxodlar() {
    if (!boshlanishSana || !tugashSana) return;
    setYuklanmoqda(true);

    try {
      const startIso = `${boshlanishSana}T00:00:00Z`;
      const endIso = `${tugashSana}T23:59:59Z`;

      const { data: rData, error } = await supabase
        .from("rasxodlar")
        .select("*, hisob:hisoblar(id, nom, valyuta, turi, guruhi)")
        .gte("sana_vaqt", startIso)
        .lte("sana_vaqt", endIso)
        .eq("holat", "faol")
        .order("sana_vaqt", { ascending: false });

      if (error) throw error;
      setRasxodlar(rData || []);
    } catch (err: any) {
      console.error("Rasxodlarni yuklashda xatolik:", err);
    } finally {
      setYuklanmoqda(false);
    }
  }

  // ---------------------------------------------------------------------------
  // HISOBLASHLAR VA STATISTIKA
  // ---------------------------------------------------------------------------
  let jamiUZS = 0;
  let jamiUSD = 0;

  // 1. Kategoriya bo'yicha taqsimot
  const katMap: Record<
    string,
    { nom: string; summaUZS: number; summaUSD: number; soni: number }
  > = {};

  // 2. Hisoblar (kassalar/shaxslar) bo'yicha taqsimot
  const hisobMap: Record<
    string,
    { nom: string; summaUZS: number; summaUSD: number; soni: number }
  > = {};

  rasxodlar.forEach((r) => {
    const s = Number(r.summa || 0);
    const val = r.valyuta || "UZS";

    if (val === "USD") {
      jamiUSD += s;
    } else {
      jamiUZS += s;
    }

    // Kategoriya
    const katNom = r.kategoriya || "Boshqa";
    if (!katMap[katNom]) {
      katMap[katNom] = { nom: katNom, summaUZS: 0, summaUSD: 0, soni: 0 };
    }
    katMap[katNom].soni += 1;
    if (val === "USD") katMap[katNom].summaUSD += s;
    else katMap[katNom].summaUZS += s;

    // Hisob
    const hisobNomi = r.hisob?.nom || (r.tolov_turi ? `${r.tolov_turi} kassa` : "Noma'lum kassa");
    if (!hisobMap[hisobNomi]) {
      hisobMap[hisobNomi] = { nom: hisobNomi, summaUZS: 0, summaUSD: 0, soni: 0 };
    }
    hisobMap[hisobNomi].soni += 1;
    if (val === "USD") hisobMap[hisobNomi].summaUSD += s;
    else hisobMap[hisobNomi].summaUZS += s;
  });

  // Kategoriyalarni summasi bo'yicha saralash
  const saralanganKategoriyalar = Object.values(katMap).sort(
    (a, b) => b.summaUZS + b.summaUSD * 12800 - (a.summaUZS + a.summaUSD * 12800)
  );

  // Hisoblarni summasi bo'yicha saralash
  const saralanganHisoblar = Object.values(hisobMap).sort(
    (a, b) => b.summaUZS + b.summaUSD * 12800 - (a.summaUZS + a.summaUSD * 12800)
  );

  // Eng ko'p xarajat chiqqan hisob (Top 1)
  const topHisob = saralanganHisoblar.length > 0 ? saralanganHisoblar[0] : null;

  // Filtr bo'yicha ro'yxat
  const korsatiladiganRasxodlar = filterKat
    ? rasxodlar.filter((r) => (r.kategoriya || "Boshqa") === filterKat)
    : rasxodlar;

  return (
    <div className="space-y-3 pb-8">
      {/* HEADER: SARLAVHA VA YANGI CHIQIM TUGMASI */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5">
            <TrendingDown className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            Xarajatlar (Chiqimlar)
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Kassadan chiqqan barcha to'lovlar va tahlil
          </p>
        </div>

        <button
          onClick={() => {
            haptic("medium");
            setYangiModalOchiq(true);
          }}
          className="px-3 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Chiqim qilish</span>
        </button>
      </div>

      {/* DAVR FILTER TOGGLE BUTTONS */}
      <div className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl flex gap-1">
        {(
          [
            { id: "bugun", label: "Bugun" },
            { id: "hafta", label: "Hafta" },
            { id: "oy", label: "Oy" },
            { id: "boshqa", label: "Boshqa" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => davrTanlandi(t.id)}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
              davr === t.id
                ? "bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-2xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* AGAR "BOSHQA" DAVR TANLANGAN BO'LSA - SANA ORALIG'I INPUTLARI */}
      {davr === "boshqa" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-xl grid grid-cols-2 gap-2 shadow-2xs animate-in fade-in">
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
              Boshlanish sana:
            </label>
            <input
              type="date"
              value={boshlanishSana}
              onChange={(e) => setBoshlanishSana(e.target.value)}
              className="w-full p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
              Tugash sana:
            </label>
            <input
              type="date"
              value={tugashSana}
              onChange={(e) => setTugashSana(e.target.value)}
              className="w-full p-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* ASOSIY KPI: JAMI XARAJAT KARTASI */}
      <div className="bg-gradient-to-br from-rose-500 to-rose-700 text-white p-3.5 rounded-2xl shadow-md space-y-1 relative overflow-hidden">
        <div className="flex justify-between items-start">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-100 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {davr === "bugun"
              ? "Bugungi jami xarajat"
              : davr === "hafta"
              ? "Oxirgi 7 kunlik xarajat"
              : davr === "oy"
              ? "Ushbu oydagi xarajat"
              : "Tanlangan davr xarajati"}
          </span>
          <span className="bg-rose-900/40 backdrop-blur-xs text-rose-100 text-[10px] font-black px-2 py-0.5 rounded-full">
            {rasxodlar.length} ta chiqim
          </span>
        </div>

        <div className="pt-0.5">
          <p className="text-2xl font-black tabular-nums tracking-tight">
            {pul(jamiUZS)} <span className="text-xs font-bold text-rose-100">so'm</span>
          </p>
          {jamiUSD > 0 && (
            <p className="text-sm font-bold text-rose-100 tabular-nums">
              + ${pul(jamiUSD)}
            </p>
          )}
        </div>
      </div>

      {/* 👑 ENG KO'P KIMNING HISOBIDAN CHIQIM BO'LAYOTGANLIGI */}
      {topHisob && (
        <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-3 rounded-2xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Eng ko'p chiqim ketayotgan hisob:
            </span>
            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded-full">
              {jamiUZS > 0
                ? `${Math.round((topHisob.summaUZS / jamiUZS) * 100)}% ulush`
                : "Top"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-200/70 dark:bg-amber-900/60 flex items-center justify-center text-amber-900 dark:text-amber-200 font-black text-sm">
                💳
              </div>
              <div>
                <p className="text-xs font-black text-slate-900 dark:text-white">
                  {topHisob.nom}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {topHisob.soni} ta chiqim amali
                </p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-xs font-black text-rose-700 dark:text-rose-400 tabular-nums">
                −{pul(topHisob.summaUZS)} so'm
              </p>
              {topHisob.summaUSD > 0 && (
                <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                  −${pul(topHisob.summaUSD)}
                </p>
              )}
            </div>
          </div>

          {/* Boshqa hisoblar ham bo'lsa (ixcham mini taqsimot) */}
          {saralanganHisoblar.length > 1 && (
            <div className="pt-1.5 border-t border-amber-200/60 dark:border-amber-900/40 grid grid-cols-2 gap-1.5">
              {saralanganHisoblar.slice(1, 3).map((h) => (
                <div
                  key={h.nom}
                  className="bg-white/70 dark:bg-slate-900/60 p-1.5 rounded-lg border border-amber-100 dark:border-amber-900/30 text-[10px] flex justify-between items-center"
                >
                  <span className="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[90px]">
                    {h.nom}
                  </span>
                  <span className="font-black text-rose-600 dark:text-rose-400 tabular-nums">
                    {pul(h.summaUZS)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 📊 KATEGORIYALAR BO'YICHA TAQSIMOT (SARFLANGAN MABLAG'LAR) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-2xs space-y-2.5">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <PieChart className="w-3.5 h-3.5 text-rose-500" />
            Kategoriyalar bo'yicha xarajatlar:
          </span>
          {filterKat && (
            <button
              onClick={() => {
                haptic("light");
                setFilterKat(null);
              }}
              className="text-[10px] font-bold text-rose-600 hover:underline flex items-center gap-0.5"
            >
              <X className="w-3 h-3" /> Filterni tozalash
            </button>
          )}
        </div>

        {saralanganKategoriyalar.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">
            Ushbu davrda hali xarajatlar kiritilmagan.
          </p>
        ) : (
          <div className="space-y-2">
            {saralanganKategoriyalar.map((kat) => {
              const foizUZS =
                jamiUZS > 0 ? Math.round((kat.summaUZS / jamiUZS) * 100) : 0;
              const isTanlangan = filterKat === kat.nom;

              return (
                <div
                  key={kat.nom}
                  onClick={() => {
                    haptic("light");
                    setFilterKat(isTanlangan ? null : kat.nom);
                  }}
                  className={`p-2 rounded-xl border transition-all cursor-pointer ${
                    isTanlangan
                      ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800"
                      : "bg-slate-50/70 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      {kat.nom}
                      <span className="text-[10px] text-slate-400 font-medium">
                        ({kat.soni} ta)
                      </span>
                    </span>

                    <div className="text-right flex items-center gap-2">
                      <span className="font-black text-rose-700 dark:text-rose-400 tabular-nums">
                        {pul(kat.summaUZS)} so'm
                        {kat.summaUSD > 0 && ` + $${pul(kat.summaUSD)}`}
                      </span>
                      <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 w-8 text-right">
                        {foizUZS}%
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-rose-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(4, foizUZS)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 📋 CHIQIMLAR TARIXI RO'YXATI */}
      <div className="space-y-1.5 pt-1">
        <div className="flex justify-between items-center px-0.5">
          <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {filterKat
              ? `"${filterKat}" xarajatlari`
              : "Xarajatlar ro'yxati"}
            <span className="text-slate-400 font-medium">
              ({korsatiladiganRasxodlar.length})
            </span>
          </h4>

          {filterKat && (
            <span className="text-[11px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md">
              Kategoriya: {filterKat}
            </span>
          )}
        </div>

        {korsatiladiganRasxodlar.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <TrendingDown className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
              Chiqimlar topilmadi
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Tanlangan davr yoki kategoriya bo'yicha xarajat yozuvlari mavjud emas.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {korsatiladiganRasxodlar.map((r) => (
              <div
                key={r.id}
                onClick={() => {
                  setTanlanganChiqim(r);
                  haptic("light");
                }}
                className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-800 rounded-xl flex justify-between items-center shadow-2xs cursor-pointer active:bg-slate-50 dark:active:bg-slate-800 transition-all group"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-slate-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                      {r.kategoriya}
                    </span>
                    {r.izoh && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
                        · {r.izoh}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                    <span>
                      {new Date(r.sana_vaqt).toLocaleDateString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                      })}{" "}
                      {new Date(r.sana_vaqt).toLocaleTimeString("ru-RU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span>•</span>
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      {r.hisob?.nom || r.tolov_turi}
                    </span>
                    {r.xodim && (
                      <>
                        <span>•</span>
                        <span>{r.xodim}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-right shrink-0">
                  <span className="font-black text-xs text-rose-700 dark:text-rose-400 tabular-nums">
                    −{pul(r.summa)} {r.valyuta}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ➕ YANGI CHIQIM MODALI */}
      {yangiModalOchiq && (
        <YangiChiqimModal
          onClose={() => setYangiModalOchiq(false)}
          onSuccess={() => {
            yuklaRasxodlar();
          }}
          xodimNomi={xodimNomi}
          telegramUserId={telegramUserId}
        />
      )}

      {/* 📄 CHIQIM TAFSILOTLARI MODALI */}
      {tanlanganChiqim && (
        <ChiqimDetailsModal
          rasxod={tanlanganChiqim}
          onClose={() => setTanlanganChiqim(null)}
          onOchirildi={() => {
            setTanlanganChiqim(null);
            yuklaRasxodlar();
          }}
        />
      )}
    </div>
  );
}
