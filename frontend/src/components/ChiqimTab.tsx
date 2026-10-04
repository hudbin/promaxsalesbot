import React, { useState, useEffect } from "react";
import { supabase, pul, haptic } from "../lib/supabase";
import { DollarSign, CheckCircle, Clock } from "lucide-react";

const KATEGORIYALAR = [
  { nom: "Obed", belgi: "🍲", rang: "bg-orange-50 border-orange-200 text-orange-950" },
  { nom: "Taksi", belgi: "🚕", rang: "bg-yellow-50 border-yellow-200 text-yellow-950" },
  { nom: "Elektr", belgi: "💡", rang: "bg-blue-50 border-blue-200 text-blue-950" },
  { nom: "Ijara", belgi: "🏢", rang: "bg-purple-50 border-purple-200 text-purple-950" },
  { nom: "Xo'jalik", belgi: "📦", rang: "bg-emerald-50 border-emerald-200 text-emerald-950" },
  { nom: "Oylik", belgi: "💼", rang: "bg-indigo-50 border-indigo-200 text-indigo-950" },
  { nom: "Boshqa", belgi: "📝", rang: "bg-slate-50 border-slate-200 text-slate-950" },
];

export function ChiqimTab() {
  const [summa, setSumma] = useState("");
  const [valyuta, setValyuta] = useState<"UZS" | "USD">("UZS");
  const [tanlanganKat, setTanlanganKat] = useState("Obed");
  const [tolovTuri, setTolovTuri] = useState("naqd");
  const [kassaTuri, setKassaTuri] = useState("naqd_uzs");
  const [izoh, setIzoh] = useState("");
  const [bugungiRasxodlar, setBugungiRasxodlar] = useState<any[]>([]);
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xabar, setXabar] = useState<string | null>(null);

  useEffect(() => {
    yuklaRasxodlar();
  }, []);

  async function yuklaRasxodlar() {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("rasxodlar")
      .select("*")
      .gte("sana_vaqt", `${today}T00:00:00Z`)
      .eq("holat", "faol")
      .order("sana_vaqt", { ascending: false });

    if (data) setBugungiRasxodlar(data);
  }

  async function rasxodSaqla() {
    const sonSumma = Number(summa);
    if (!sonSumma || sonSumma <= 0) {
      alert("Iltimos, summani kiriting!");
      return;
    }

    setYuklanmoqda(true);
    haptic("medium");

    try {
      const { data, error } = await supabase.rpc("fn_rasxod_yaratish", {
        p_summa: sonSumma,
        p_valyuta: valyuta,
        p_kategoriya: tanlanganKat,
        p_tolov_turi: tolovTuri,
        p_kassa_turi: kassaTuri,
        p_izoh: izoh.trim() || null,
        p_xodim: "Mini App",
        p_telegram_user_id: null,
      });

      if (error) throw error;

      haptic("success");
      setXabar(`${pul(sonSumma)} ${valyuta} xarajat saqlandi!`);
      setSumma("");
      setIzoh("");
      await yuklaRasxodlar();

      setTimeout(() => setXabar(null), 3000);
    } catch (err: any) {
      haptic("error");
      alert("Xatolik: " + err.message);
    } finally {
      setYuklanmoqda(false);
    }
  }

  function qoshSumma(qoshimcha: number) {
    haptic("light");
    const joriy = Number(summa) || 0;
    setSumma(String(joriy + qoshimcha));
  }

  const jamiBugungi = bugungiRasxodlar
    .filter((r) => r.valyuta === "UZS")
    .reduce((sum, r) => sum + Number(r.summa), 0);

  return (
    <div className="space-y-4">
      {/* Xabar */}
      {xabar && (
        <div className="p-4 bg-emerald-600 text-white rounded-2xl flex items-center gap-3 shadow-lg">
          <CheckCircle className="w-6 h-6 flex-shrink-0" />
          <p className="font-semibold text-lg">{xabar}</p>
        </div>
      )}

      {/* Kunlik xulosa kartasi */}
      <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex justify-between items-center">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Bugungi jami xarajat</span>
          <p className="text-2xl font-black text-rose-900 tabular-nums">{pul(jamiBugungi)} so'm</p>
        </div>
        <span className="bg-rose-200 text-rose-900 font-extrabold px-3 py-1 rounded-full text-xs">
          {bugungiRasxodlar.length} ta chiqim
        </span>
      </div>

      {/* Summa maydoni */}
      <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm space-y-3">
        <div className="flex justify-between items-center">
          <label className="text-sm font-bold text-slate-700">Chiqim summasi:</label>
          <button
            onClick={() => {
              const yangi = valyuta === "UZS" ? "USD" : "UZS";
              setValyuta(yangi);
              setKassaTuri(yangi === "USD" ? "naqd_usd" : "naqd_uzs");
              haptic("light");
            }}
            className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-black text-slate-700 flex items-center gap-1"
          >
            <DollarSign className="w-3.5 h-3.5" /> {valyuta}
          </button>
        </div>

        <input
          type="number"
          placeholder="masalan 50000"
          value={summa}
          onChange={(e) => setSumma(e.target.value)}
          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-3xl font-black text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-rose-500"
        />

        {/* Tezkor qo'shish tugmalari */}
        {valyuta === "UZS" && (
          <div className="grid grid-cols-4 gap-2">
            {[20000, 50000, 100000, 500000].map((v) => (
              <button
                key={v}
                onClick={() => qoshSumma(v)}
                className="py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 tabular-nums active:scale-95 transition-transform"
              >
                +{pul(v)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Kategoriya tugmalari (Katta, 40+ yoshdagilar uchun qulay) */}
      <div>
        <label className="text-sm font-bold text-slate-700 block mb-2">Kategoriyani tanlang:</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {KATEGORIYALAR.map((kat) => {
            const tanlangan = tanlanganKat === kat.nom;
            return (
              <button
                key={kat.nom}
                onClick={() => {
                  setTanlanganKat(kat.nom);
                  haptic("light");
                }}
                className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                  tanlangan
                    ? "bg-rose-600 border-rose-600 text-white shadow-md scale-102"
                    : `${kat.rang} hover:border-slate-300`
                }`}
              >
                <span className="text-2xl">{kat.belgi}</span>
                <span className="font-bold text-base leading-tight">{kat.nom}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* To'lov usuli va Kassa */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">To'lov turi:</label>
          <select
            value={tolovTuri}
            onChange={(e) => {
              setTolovTuri(e.target.value);
              if (e.target.value === "plastik") setKassaTuri("plastik_uzs");
              else if (valyuta === "USD") setKassaTuri("naqd_usd");
              else setKassaTuri("naqd_uzs");
            }}
            className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold shadow-sm"
          >
            <option value="naqd">💵 Naqd pul</option>
            <option value="plastik">💳 Plastik karta</option>
            <option value="perechisleniya">🏦 Perechisleniya</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 mb-1 block">Qaysi kassadan chiqdi:</label>
          <select
            value={kassaTuri}
            onChange={(e) => setKassaTuri(e.target.value)}
            className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold shadow-sm"
          >
            <option value="naqd_uzs">Naqd (So'm)</option>
            <option value="naqd_usd">Naqd (Dollar)</option>
            <option value="plastik_uzs">Plastik karta</option>
            <option value="bank_uzs">Bank hisobi</option>
          </select>
        </div>
      </div>

      {/* Izoh */}
      <input
        type="text"
        placeholder="Izoh (masalan: bozorga taksi, tushlik do'kon uchun)..."
        value={izoh}
        onChange={(e) => setIzoh(e.target.value)}
        className="w-full p-3.5 bg-white border border-slate-200 rounded-xl font-medium text-base shadow-sm"
      />

      {/* Chiqimni saqlash tugmasi */}
      <button
        onClick={rasxodSaqla}
        disabled={yuklanmoqda}
        className="w-full py-4 bg-rose-600 text-white font-black text-lg rounded-2xl shadow-xl active:scale-98 transition-all disabled:opacity-50"
      >
        {yuklanmoqda ? "Saqlanmoqda..." : "💸 Chiqimni Saqlash"}
      </button>

      {/* Bugungi chiqimlar tarixi */}
      <div className="pt-2">
        <h4 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Clock className="w-4 h-4" /> Bugungi xarajatlar tarixi
        </h4>
        <div className="space-y-2">
          {bugungiRasxodlar.length === 0 ? (
            <p className="text-sm text-slate-400 p-4 bg-white rounded-xl text-center">Bugun hali chiqim bo'lmadi.</p>
          ) : (
            bugungiRasxodlar.map((r) => (
              <div
                key={r.id}
                className="p-3 bg-white border border-slate-200 rounded-xl flex justify-between items-center shadow-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{r.kategoriya}</span>
                    {r.izoh && <span className="text-xs text-slate-500 truncate max-w-[150px]">· {r.izoh}</span>}
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(r.sana_vaqt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                    {r.tolov_turi}
                  </span>
                </div>
                <span className="font-extrabold text-base text-rose-700 tabular-nums">
                  −{pul(r.summa)} {r.valyuta}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
