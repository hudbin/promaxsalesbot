import React, { useState, useEffect } from "react";
import { supabase, pul, haptic } from "../lib/supabase";
import { Search, Phone, MapPin, HandCoins, CheckCircle, ChevronRight } from "lucide-react";
import { MijozDetailsModal } from "./MijozDetailsModal";
import { Combobox } from "./ui/Combobox";

export function QarzlarTab() {
  const [mijozlar, setMijozlar] = useState<any[]>([]);
  const [qidiruv, setQidiruv] = useState("");
  const [tanlanganMijoz, setTanlanganMijoz] = useState<any>(null);
  const [tanlanganMijozDetali, setTanlanganMijozDetali] = useState<any>(null);
  const [tolovSumma, setTolovSumma] = useState("");
  const [valyuta, setValyuta] = useState<"UZS" | "USD">("UZS");
  const [tolovTuri, setTolovTuri] = useState("naqd");
  const [kassaTuri, setKassaTuri] = useState("naqd_uzs");
  const [izoh, setIzoh] = useState("");
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [xabar, setXabar] = useState<string | null>(null);

  useEffect(() => {
    yuklaMijozlar();
  }, []);

  async function yuklaMijozlar() {
    setYuklanmoqda(true);
    const { data } = await supabase
      .from("mijozlar")
      .select("*")
      .eq("faol", true)
      .or("qarz_uzs.gt.0,qarz_usd.gt.0")
      .order("qarz_uzs", { ascending: false });

    if (data) setMijozlar(data);
    setYuklanmoqda(false);
  }

  async function qarzTolovSaqla() {
    const sonSumma = Number(tolovSumma);
    if (!sonSumma || sonSumma <= 0 || !tanlanganMijoz) return;

    setYuklanmoqda(true);
    haptic("medium");

    try {
      const { data, error } = await supabase.rpc("fn_qarz_tolov_yaratish", {
        p_mijoz_id: tanlanganMijoz.id,
        p_summa: sonSumma,
        p_valyuta: valyuta,
        p_tolov_turi: tolovTuri,
        p_kassa_turi: kassaTuri,
        p_izoh: izoh.trim() || null,
        p_xodim: "Mini App",
        p_telegram_user_id: null,
      });

      if (error) throw error;

      haptic("success");
      setXabar(`${tanlanganMijoz.nom} dan ${pul(sonSumma)} ${valyuta} qarz to'lovi qabul qilindi!`);
      setTanlanganMijoz(null);
      setTolovSumma("");
      setIzoh("");
      await yuklaMijozlar();

      setTimeout(() => setXabar(null), 4000);
    } catch (err: any) {
      haptic("error");
      alert("Xatolik: " + err.message);
    } finally {
      setYuklanmoqda(false);
    }
  }

  const jamiQarzUZS = mijozlar.reduce((sum, m) => sum + Number(m.qarz_uzs || 0), 0);
  const jamiQarzUSD = mijozlar.reduce((sum, m) => sum + Number(m.qarz_usd || 0), 0);

  const saralangan = mijozlar.filter(
    (m) =>
      m.nom.toLowerCase().includes(qidiruv.toLowerCase()) ||
      (m.telefon && m.telefon.includes(qidiruv)) ||
      (m.manzil && m.manzil.toLowerCase().includes(qidiruv.toLowerCase()))
  );

  function ochTolovModali(m: any) {
    setTanlanganMijoz(m);
    if (m.qarz_usd > 0 && m.qarz_uzs <= 0) {
      setValyuta("USD");
      setKassaTuri("naqd_usd");
      setTolovSumma(String(m.qarz_usd));
    } else {
      setValyuta("UZS");
      setKassaTuri("naqd_uzs");
      setTolovSumma(String(m.qarz_uzs));
    }
    haptic("medium");
  }

  const kassaOptions = [
    { value: "naqd_uzs", label: "Naqd (So'm)" },
    { value: "naqd_usd", label: "Naqd (Dollar)" },
    { value: "plastik_uzs", label: "Plastik karta" },
    { value: "bank_uzs", label: "Bank hisobi" },
  ];

  return (
    <div className="space-y-3">
      {/* Muvaffaqiyat xabari */}
      {xabar && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl flex items-center gap-2 shadow-2xs text-xs font-semibold">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <p>{xabar}</p>
        </div>
      )}

      {/* Jami Qarzdorlik Balansi */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">So'mdagi jami qarz</span>
          <p className="text-base font-black text-amber-950 tabular-nums mt-0.5">{pul(jamiQarzUZS)} so'm</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Dollardagi jami qarz</span>
          <p className="text-base font-black text-emerald-950 tabular-nums mt-0.5">${pul(jamiQarzUSD)}</p>
        </div>
      </div>

      {/* Qidiruv */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Mijoz ismi, telefon yoki bozor..."
          value={qidiruv}
          onChange={(e) => setQidiruv(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium shadow-2xs focus:ring-2 focus:ring-amber-500"
        />
      </div>

      {/* Qarzdor Mijozlar Ro'yxati */}
      <div className="space-y-2">
        {saralangan.length === 0 ? (
          <p className="text-slate-400 text-center py-6 font-medium text-xs">Qarzdor mijozlar topilmadi.</p>
        ) : (
          saralangan.map((m) => (
            <div
              key={m.id}
              onClick={() => {
                setTanlanganMijozDetali(m);
                haptic("light");
              }}
              className="bg-white border border-slate-200 hover:border-amber-300 p-2.5 rounded-xl shadow-2xs flex justify-between items-center cursor-pointer active:bg-slate-50 transition-all group"
            >
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-bold text-sm text-slate-900 group-hover:text-amber-800 truncate leading-snug">{m.nom}</h4>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-amber-600 transition-colors flex-shrink-0" />
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-medium text-slate-500 mt-0.5">
                  {m.telefon && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {m.telefon}
                    </span>
                  )}
                  {m.manzil && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {m.manzil}
                    </span>
                  )}
                </div>

                <div className="flex gap-2.5 mt-1 text-xs font-black">
                  {m.qarz_uzs > 0 && <span className="text-amber-700 tabular-nums">{pul(m.qarz_uzs)} so'm</span>}
                  {m.qarz_usd > 0 && <span className="text-emerald-700 tabular-nums">${pul(m.qarz_usd)}</span>}
                </div>
              </div>

              {/* Qarz to'lash tugmasi */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  ochTolovModali(m);
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-2xs flex-shrink-0 active:scale-95 transition-transform text-xs"
              >
                <HandCoins className="w-3.5 h-3.5" /> To'lov
              </button>
            </div>
          ))
        )}
      </div>

      {/* Qarz To'lovini Qabul Qilish Modali */}
      {tanlanganMijoz && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-3 animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-4 space-y-3 shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{tanlanganMijoz.nom}</h3>
                <p className="text-[11px] text-slate-500">Qarz to'lovini qabul qilish</p>
              </div>
              <button onClick={() => setTanlanganMijoz(null)} className="text-slate-400 p-1 font-bold text-lg">
                ✕
              </button>
            </div>

            {/* Joriy qarz */}
            <div className="bg-slate-50 p-2.5 rounded-lg border flex justify-between font-bold text-xs">
              <span className="text-slate-600">Joriy qarz:</span>
              <span className="text-amber-800 tabular-nums">
                {tanlanganMijoz.qarz_uzs > 0 ? `${pul(tanlanganMijoz.qarz_uzs)} so'm ` : ""}
                {tanlanganMijoz.qarz_usd > 0 ? `$${pul(tanlanganMijoz.qarz_usd)}` : ""}
              </span>
            </div>

            {/* Valyuta tanlash */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setValyuta("UZS");
                  setKassaTuri("naqd_uzs");
                  setTolovSumma(String(tanlanganMijoz.qarz_uzs || ""));
                }}
                className={`flex-1 py-1.5 rounded-lg font-bold text-xs border ${
                  valyuta === "UZS" ? "bg-amber-600 text-white border-amber-600 shadow-2xs" : "bg-slate-50 text-slate-700"
                }`}
              >
                So'm (UZS)
              </button>
              <button
                onClick={() => {
                  setValyuta("USD");
                  setKassaTuri("naqd_usd");
                  setTolovSumma(String(tanlanganMijoz.qarz_usd || ""));
                }}
                className={`flex-1 py-1.5 rounded-lg font-bold text-xs border ${
                  valyuta === "USD" ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs" : "bg-slate-50 text-slate-700"
                }`}
              >
                Dollar (USD)
              </button>
            </div>

            {/* Summa */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Qaytarilayotgan summa:</label>
              <input
                type="number"
                value={tolovSumma}
                onChange={(e) => setTolovSumma(e.target.value)}
                placeholder="0"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-black text-lg text-slate-900 tabular-nums focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Kassa Combobox */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 mb-1 block">Qaysi kassaga tushdi:</label>
              <Combobox
                title="Kassani tanlang"
                value={kassaTuri}
                onChange={setKassaTuri}
                options={kassaOptions}
              />
            </div>

            {/* Izoh */}
            <input
              type="text"
              placeholder="Izoh (masalan: do'konga olib kelib berdi)..."
              value={izoh}
              onChange={(e) => setIzoh(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
            />

            {/* Saqlash */}
            <button
              onClick={qarzTolovSaqla}
              disabled={yuklanmoqda}
              className="w-full py-2.5 bg-amber-600 text-white font-extrabold text-sm rounded-xl shadow-md active:scale-98 transition-all disabled:opacity-50"
            >
              {yuklanmoqda ? "Saqlanmoqda..." : "✅ To'lovni Qabul Qilish"}
            </button>
          </div>
        </div>
      )}

      {/* Mijoz Tafsilotlari Modali */}
      {tanlanganMijozDetali && (
        <MijozDetailsModal
          mijoz={tanlanganMijozDetali}
          onClose={() => setTanlanganMijozDetali(null)}
          onTolovOchish={(m) => {
            setTanlanganMijozDetali(null);
            ochTolovModali(m);
          }}
        />
      )}
    </div>
  );
}
