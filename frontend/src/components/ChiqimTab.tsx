import React, { useState, useEffect } from "react";
import { supabase, pul, haptic } from "../lib/supabase";
import { DollarSign, CheckCircle, Clock, ChevronRight } from "lucide-react";
import { ChiqimDetailsModal } from "./ChiqimDetailsModal";
import { Combobox } from "./ui/Combobox";

const KATEGORIYALAR = [
  { nom: "Ovqatlanish", belgi: "🍲", rang: "bg-orange-50 border-orange-200 text-orange-950" },
  { nom: "Taksi", belgi: "🚕", rang: "bg-yellow-50 border-yellow-200 text-yellow-950" },
  { nom: "Elektr", belgi: "💡", rang: "bg-blue-50 border-blue-200 text-blue-950" },
  { nom: "Ijara", belgi: "🏢", rang: "bg-purple-50 border-purple-200 text-purple-950" },
  { nom: "Xo'jalik", belgi: "📦", rang: "bg-emerald-50 border-emerald-200 text-emerald-950" },
  { nom: "Oylik", belgi: "💼", rang: "bg-indigo-50 border-indigo-200 text-indigo-950" },
  { nom: "Boshqa", belgi: "📝", rang: "bg-slate-50 border-slate-200 text-slate-950" },
];

interface ChiqimTabProps {
  xodimNomi?: string;
  telegramUserId?: number | string | null;
}

export function ChiqimTab({ xodimNomi, telegramUserId }: ChiqimTabProps = {}) {
  const [summa, setSumma] = useState("");
  const [valyuta, setValyuta] = useState<"UZS" | "USD">("UZS");
  const [tanlanganKat, setTanlanganKat] = useState("Ovqatlanish");
  const [tolovTuri, setTolovTuri] = useState("naqd");
  const [kassaTuri, setKassaTuri] = useState("naqd_uzs");
  const [izoh, setIzoh] = useState("");
  const [bugungiRasxodlar, setBugungiRasxodlar] = useState<any[]>([]);
  const [tanlanganChiqim, setTanlanganChiqim] = useState<any>(null);
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
        p_xodim: xodimNomi || "Mini App",
        p_telegram_user_id: telegramUserId ? Number(telegramUserId) : null,
      });

      if (error) throw error;

      // 🚨 GURUHGA XABAR YUBORISH (HAR QANDAY CHIQIM UCHUN)
      try {
        const matn = 
          `🚨 <b>YANGI CHIQIM (XARAJAT) QAYD ETILDI</b>\n\n` +
          `💰 Summa: <b>${pul(sonSumma)} ${valyuta}</b>\n` +
          `📂 Kategoriya: <b>${tanlanganKat}</b>\n` +
          `💳 To'lov turi: <b>${tolovTuri}</b>\n` +
          (izoh.trim() ? `📝 Izoh: <i>${izoh.trim()}</i>\n` : "") +
          `👤 Kiritdi: <b>${xodimNomi || "Mini App"}</b>`;
          
        await fetch("/.netlify/functions/notify", {
          method: "POST",
          body: JSON.stringify({ text: matn }),
        });
      } catch (notifyErr) {
        console.error("Xabarnoma yuborishda xatolik:", notifyErr);
      }

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
    <div className="space-y-3">
      {/* Xabar */}
      {xabar && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl flex items-center gap-2 shadow-2xs text-xs font-semibold">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <p>{xabar}</p>
        </div>
      )}

      {/* Kunlik xulosa kartasi */}
      <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl flex justify-between items-center shadow-2xs">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Bugungi jami xarajat</span>
          <p className="text-lg font-black text-rose-900 tabular-nums">{pul(jamiBugungi)} so'm</p>
        </div>
        <span className="bg-rose-200 text-rose-900 font-extrabold px-2.5 py-0.5 rounded-full text-[11px]">
          {bugungiRasxodlar.length} ta chiqim
        </span>
      </div>

      {/* Summa maydoni */}
      <div className="bg-white border border-slate-200 p-3 rounded-xl shadow-2xs space-y-2">
        <div className="flex justify-between items-center">
          <label className="text-xs font-bold text-slate-700">Chiqim summasi:</label>
          <button
            onClick={() => {
              const yangi = valyuta === "UZS" ? "USD" : "UZS";
              setValyuta(yangi);
              setKassaTuri(yangi === "USD" ? "naqd_usd" : "naqd_uzs");
              haptic("light");
            }}
            className="px-2.5 py-1 bg-slate-100 rounded-lg text-xs font-black text-slate-700 flex items-center gap-1"
          >
            <DollarSign className="w-3 h-3" /> {valyuta}
          </button>
        </div>

        <input
          type="number"
          placeholder="masalan 50000"
          value={summa}
          onChange={(e) => setSumma(e.target.value)}
          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xl font-black text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-rose-500"
        />

        {/* Tezkor qo'shish tugmalari */}
        {valyuta === "UZS" && (
          <div className="grid grid-cols-4 gap-1.5">
            {[20000, 50000, 100000, 500000].map((v) => (
              <button
                key={v}
                onClick={() => qoshSumma(v)}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-[11px] font-bold text-slate-700 tabular-nums active:scale-95 transition-transform"
              >
                +{pul(v)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Kategoriya tugmalari */}
      <div>
        <label className="text-xs font-bold text-slate-700 block mb-1.5">Kategoriyani tanlang:</label>
        <div className="grid grid-cols-3 gap-2">
          {KATEGORIYALAR.map((kat) => {
            const tanlangan = tanlanganKat === kat.nom;
            return (
              <button
                key={kat.nom}
                onClick={() => {
                  setTanlanganKat(kat.nom);
                  haptic("light");
                }}
                className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all ${
                  tanlangan
                    ? "bg-rose-600 border-rose-600 text-white shadow-2xs scale-102"
                    : `${kat.rang} hover:border-slate-300`
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
          <label className="text-[11px] font-bold text-slate-600 mb-1 block">To'lov turi:</label>
          <Combobox
            title="To'lov turini tanlang"
            value={tolovTuri}
            onChange={(val) => {
              setTolovTuri(val);
              if (val === "plastik") setKassaTuri("plastik_uzs");
              else if (valyuta === "USD") setKassaTuri("naqd_usd");
              else setKassaTuri("naqd_uzs");
            }}
            options={[
              { value: "naqd", label: "Naqd pul", icon: "💵" },
              { value: "plastik", label: "Plastik karta", icon: "💳" },
              { value: "perechisleniya", label: "Perechisleniya", icon: "🏦" },
            ]}
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-600 mb-1 block">Qaysi kassadan chiqdi:</label>
          <Combobox
            title="Kassani tanlang"
            value={kassaTuri}
            onChange={setKassaTuri}
            options={[
              { value: "naqd_uzs", label: "Naqd (So'm)" },
              { value: "naqd_usd", label: "Naqd (Dollar)" },
              { value: "plastik_uzs", label: "Plastik karta" },
              { value: "bank_uzs", label: "Bank hisobi" },
            ]}
          />
        </div>
      </div>

      {/* Izoh */}
      <input
        type="text"
        placeholder="Izoh (masalan: bozorga taksi, tushlik do'kon uchun)..."
        value={izoh}
        onChange={(e) => setIzoh(e.target.value)}
        className="w-full p-2.5 bg-white border border-slate-200 rounded-lg font-medium text-xs shadow-2xs"
      />

      {/* Chiqimni saqlash tugmasi */}
      <button
        onClick={rasxodSaqla}
        disabled={yuklanmoqda}
        className="w-full py-2.5 bg-rose-600 text-white font-extrabold text-sm rounded-xl shadow-md active:scale-98 transition-all disabled:opacity-50"
      >
        {yuklanmoqda ? "Saqlanmoqda..." : "💸 Chiqimni Saqlash"}
      </button>

      {/* Bugungi chiqimlar tarixi */}
      <div className="pt-1">
        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> Bugungi xarajatlar tarixi
        </h4>
        <div className="space-y-1.5">
          {bugungiRasxodlar.length === 0 ? (
            <p className="text-xs text-slate-400 p-3 bg-white rounded-xl text-center">Bugun hali chiqim bo'lmadi.</p>
          ) : (
            bugungiRasxodlar.map((r) => (
              <div
                key={r.id}
                onClick={() => {
                  setTanlanganChiqim(r);
                  haptic("light");
                }}
                className="p-2.5 bg-white border border-slate-200 hover:border-rose-300 rounded-xl flex justify-between items-center shadow-2xs cursor-pointer active:bg-slate-50 transition-all group"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-slate-900 group-hover:text-rose-800">{r.kategoriya}</span>
                    {r.izoh && <span className="text-[11px] text-slate-500 truncate max-w-[150px]">· {r.izoh}</span>}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {new Date(r.sana_vaqt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                    {r.tolov_turi}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-xs text-rose-700 tabular-nums">
                    −{pul(r.summa)} {r.valyuta}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-rose-600 transition-colors" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chiqim Tafsilotlari Modali */}
      {tanlanganChiqim && (
        <ChiqimDetailsModal
          rasxod={tanlanganChiqim}
          onClose={() => setTanlanganChiqim(null)}
        />
      )}
    </div>
  );
}
