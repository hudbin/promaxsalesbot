import React, { useState, useEffect } from "react";
import { supabase, pul, haptic } from "../lib/supabase";
import { ShoppingCart, Plus, Trash2, Search, CheckCircle, UserPlus, DollarSign } from "lucide-react";
import { Combobox } from "./ui/Combobox";

interface SotuvTabProps {
  telegramFoydalanuvchi?: string;
}

export function SotuvTab({ telegramFoydalanuvchi }: SotuvTabProps) {
  const [tovarlar, setTovarlar] = useState<any[]>([]);
  const [mijozlar, setMijozlar] = useState<any[]>([]);
  const [qidiruv, setQidiruv] = useState("");
  const [savat, setSavat] = useState<any[]>([]);
  const [tanlanganMijoz, setTanlanganMijoz] = useState<any>(null);
  const [valyuta, setValyuta] = useState<"UZS" | "USD">("UZS");
  const [tolanganSumma, setTolanganSumma] = useState<string>("");
  const [tolovTuri, setTolovTuri] = useState<string>("naqd");
  const [kassaTuri, setKassaTuri] = useState<string>("naqd_uzs");
  const [izoh, setIzoh] = useState("");
  const [modalOchiq, setModalOchiq] = useState(false);
  const [mijozModalOchiq, setMijozModalOchiq] = useState(false);
  const [yangiMijozNom, setYangiMijozNom] = useState("");
  const [yangiMijozTel, setYangiMijozTel] = useState("");
  const [yuklanmoqda, setYuklanmoqda] = useState(false);
  const [muvaffaqiyat, setMuvaffaqiyat] = useState<string | null>(null);

  // Tovarni savatga qo'shish/tahrirlash dialog oynasi (Modal)
  const [tovarModalOchiq, setTovarModalOchiq] = useState(false);
  const [tanlanganTovar, setTanlanganTovar] = useState<any>(null);
  const [modalMiqdor, setModalMiqdor] = useState<string>("1");
  const [modalNarx, setModalNarx] = useState<string>("");

  useEffect(() => {
    yuklaMaLumot();
  }, []);

  async function yuklaMaLumot() {
    setYuklanmoqda(true);
    const { data: t } = await supabase.from("tovarlar").select("*").eq("faol", true).order("nom");
    if (t) setTovarlar(t);

    const { data: m } = await supabase.from("mijozlar").select("*").eq("faol", true).order("nom");
    if (m) setMijozlar(m);
    setYuklanmoqda(false);
  }

  // Tovarni tanlaganda dialog oynani ochish
  function tovarTanlandi(tovar: any) {
    haptic("light");
    setTanlanganTovar(tovar);
    const mavjud = savat.find((x) => x.tovar_id === tovar.id);
    const standartNarx = valyuta === "USD" ? (tovar.narx_optom_usd || tovar.narx_optom) : tovar.narx_optom;
    if (mavjud) {
      setModalMiqdor(String(mavjud.soni));
      setModalNarx(String(mavjud.narx));
    } else {
      setModalMiqdor("1");
      setModalNarx(String(standartNarx || ""));
    }
    setTovarModalOchiq(true);
  }

  // Dialog oynadan savatga saqlash (miqdor va narx kiritilgach)
  function tovarSavatgaSaqla() {
    if (!tanlanganTovar) return;
    const son = parseFloat(modalMiqdor);
    const narx = parseFloat(modalNarx);
    if (!son || son <= 0 || isNaN(son)) {
      alert("Iltimos, to'g'ri miqdor kiriting!");
      return;
    }
    if (isNaN(narx) || narx < 0) {
      alert("Iltimos, to'g'ri narx kiriting!");
      return;
    }

    haptic("medium");
    const borIndex = savat.findIndex((x) => x.tovar_id === tanlanganTovar.id);
    if (borIndex >= 0) {
      const yangiSavat = [...savat];
      yangiSavat[borIndex] = {
        ...yangiSavat[borIndex],
        soni: son,
        narx: narx,
      };
      setSavat(yangiSavat);
    } else {
      setSavat([
        ...savat,
        {
          tovar_id: tanlanganTovar.id,
          nom: tanlanganTovar.nom,
          model: tanlanganTovar.model,
          rasm_url: tanlanganTovar.rasm_url,
          birlik: tanlanganTovar.birlik || "dona",
          narx: narx,
          tannarx: tanlanganTovar.tannarx || 0,
          soni: son,
        },
      ]);
    }
    setTovarModalOchiq(false);
  }

  function tovarSavatdanOchir(tovarId: string) {
    haptic("medium");
    setSavat(savat.filter((x) => x.tovar_id !== tovarId));
    setTovarModalOchiq(false);
  }

  const jamiSumma = savat.reduce((sum, item) => sum + item.soni * item.narx, 0);

  // Savdoni yakunlash
  async function savdoniYakunla() {
    if (savat.length === 0) return;
    setYuklanmoqda(true);
    haptic("medium");

    const tolandi = Number(tolanganSumma) || 0;
    const qatorlar = savat.map((s) => ({
      tovar_id: s.tovar_id,
      nom: s.nom,
      soni: s.soni,
      narx: s.narx,
      tannarx: s.tannarx,
    }));

    try {
      const { data, error } = await supabase.rpc("fn_savdo_yaratish", {
        p_mijoz_id: tanlanganMijoz?.id || null,
        p_valyuta: valyuta,
        p_tolangan: tolandi,
        p_tolov_turi: tolovTuri,
        p_kassa_turi: kassaTuri,
        p_izoh: izoh,
        p_xodim: "Mini App",
        p_telegram_user_id: null,
        p_qatorlar: qatorlar,
      });

      if (error) throw error;

      haptic("success");
      setMuvaffaqiyat(`Savdo muvaffaqiyatli saqlandi! Chek: #${data?.slice(0, 8)}`);
      setSavat([]);
      setModalOchiq(false);
      setTolanganSumma("");
      setTanlanganMijoz(null);
      setIzoh("");
      await yuklaMaLumot();

      setTimeout(() => setMuvaffaqiyat(null), 4000);
    } catch (err: any) {
      haptic("error");
      alert("Xatolik yuz berdi: " + err.message);
    } finally {
      setYuklanmoqda(false);
    }
  }

  // Yangi mijoz qo'shish
  async function yangiMijozSaqla() {
    if (!yangiMijozNom.trim()) return;
    const { data, error } = await supabase
      .from("mijozlar")
      .insert({
        nom: yangiMijozNom.trim(),
        nom_norm: yangiMijozNom.trim().toLowerCase(),
        telefon: yangiMijozTel.trim() || null,
      })
      .select()
      .single();

    if (data) {
      setMijozlar([...mijozlar, data]);
      setTanlanganMijoz(data);
      setMijozModalOchiq(false);
      setYangiMijozNom("");
      setYangiMijozTel("");
      haptic("success");
    }
  }

  const saralanganTovarlar = tovarlar.filter(
    (t) =>
      t.nom.toLowerCase().includes(qidiruv.toLowerCase()) ||
      (t.model && t.model.toLowerCase().includes(qidiruv.toLowerCase()))
  );

  return (
    <div className="space-y-3">
      {/* Salom, Foydalanuvchi qatori (Faqat Sotuv bo'limida) */}
      <div className="flex items-center justify-between pb-0.5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          <p className="text-xs font-bold text-slate-700">
            Salom, {telegramFoydalanuvchi || "Foydalanuvchi"} 👋
          </p>
        </div>
      </div>

      {/* Muvaffaqiyat xabari */}
      {muvaffaqiyat && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl flex items-center gap-2 shadow-sm animate-fade-in text-sm font-semibold">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <p>{muvaffaqiyat}</p>
        </div>
      )}

      {/* Qidiruv & Valyuta */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Tovar yoki model nomi..."
            value={qidiruv}
            onChange={(e) => setQidiruv(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
          />
        </div>
        <button
          onClick={() => {
            const yangi = valyuta === "UZS" ? "USD" : "UZS";
            setValyuta(yangi);
            setKassaTuri(yangi === "USD" ? "naqd_usd" : "naqd_uzs");
            haptic("light");
          }}
          className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1 shadow-2xs transition-all ${
            valyuta === "USD" ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          {valyuta}
        </button>
      </div>

      {/* Savat paneli (agar savatda tovar bo'lsa) */}
      {savat.length > 0 && (
        <div className="sticky top-1 z-20 bg-emerald-700 text-white p-2.5 rounded-xl shadow-md flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-white/20 p-2 rounded-lg">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-emerald-100 font-bold leading-tight">
                {savat.reduce((a, b) => a + b.soni, 0)} ta tovar
              </p>
              <p className="text-base font-black tabular-nums leading-tight">
                {pul(jamiSumma)} {valyuta}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setTolanganSumma(String(jamiSumma));
              setModalOchiq(true);
              haptic("medium");
            }}
            className="bg-white text-emerald-800 font-extrabold px-3.5 py-1.5 rounded-lg text-xs shadow active:scale-95 transition-transform"
          >
            Rasmiylashtirish →
          </button>
        </div>
      )}

      {/* Mahsulotlar Kartochkalari (Ixcham, toza va chiroyli) */}
      <div className="grid grid-cols-1 gap-2">
        {saralanganTovarlar.map((tovar) => {
          const savatdagi = savat.find((x) => x.tovar_id === tovar.id);
          const narx = valyuta === "USD" ? (tovar.narx_optom_usd || tovar.narx_optom) : tovar.narx_optom;
          return (
            <div
              key={tovar.id}
              onClick={() => tovarTanlandi(tovar)}
              className={`bg-white border rounded-xl p-2.5 flex gap-2.5 items-center shadow-2xs hover:border-slate-300 active:bg-slate-50 transition-all cursor-pointer ${
                savatdagi ? "border-emerald-300 ring-1 ring-emerald-300/50 bg-emerald-50/20" : "border-slate-200"
              }`}
            >
              {/* Tovar rasmi */}
              <div className="w-14 h-14 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center border border-slate-100">
                {tovar.rasm_url ? (
                  <img src={tovar.rasm_url} alt={tovar.nom} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-black text-slate-300">{tovar.nom.charAt(0)}</span>
                )}
              </div>

              {/* Tovar ma'lumotlari */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm text-slate-900 truncate leading-snug">{tovar.nom}</h3>
                  {tovar.model && (
                    <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                      #{tovar.model}
                    </span>
                  )}
                </div>
                <p className="text-sm font-black text-emerald-700 tabular-nums mt-0.5">
                  {pul(narx)} {valyuta}
                </p>
                <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                  Qoldiq:{" "}
                  <span className={`font-bold ${tovar.qoldiq <= 5 ? "text-rose-600" : "text-slate-700"}`}>
                    {pul(tovar.qoldiq)} {tovar.birlik || "dona"}
                  </span>
                </p>
              </div>

              {/* Savat holati indikatori (Tugma bosilsa modal ochiladi, -/+ bosilmaydi) */}
              {savatdagi ? (
                <div className="flex flex-col items-end">
                  <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-black shadow-2xs">
                    {savatdagi.soni} {tovar.birlik || "ta"}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-semibold mt-0.5">savatda</span>
                </div>
              ) : (
                <div className="w-8 h-8 bg-emerald-600 text-white rounded-lg flex items-center justify-center font-bold shadow-2xs hover:bg-emerald-700">
                  <Plus className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tovar qo'shish / tahrirlash Dialog Oynasi (Modal) */}
      {tovarModalOchiq && tanlanganTovar && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-sm rounded-2xl p-4 space-y-3 shadow-2xl animate-fade-in border border-slate-100">
            {/* Modal Sarlavhasi */}
            <div className="flex items-start justify-between border-b pb-2">
              <div className="pr-2 min-w-0">
                <h3 className="font-bold text-sm text-slate-900 truncate leading-tight">
                  {tanlanganTovar.nom}
                </h3>
                {tanlanganTovar.model && (
                  <p className="text-[11px] text-slate-500 font-medium">#{tanlanganTovar.model}</p>
                )}
                <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                  Mavjud qoldiq: {pul(tanlanganTovar.qoldiq)} {tanlanganTovar.birlik || "dona"}
                </p>
              </div>
              <button
                onClick={() => setTovarModalOchiq(false)}
                className="text-slate-400 hover:text-slate-600 p-1 text-base font-bold leading-none"
              >
                ✕
              </button>
            </div>

            {/* Miqdor inputi - To'g'ridan-to'g'ri klaviatura orqali, +/- bosmasdan */}
            <div>
              <label className="text-xs font-bold text-slate-700 flex justify-between mb-1">
                <span>Miqdori ({tanlanganTovar.birlik || "dona"}):</span>
                <span className="text-[10px] text-slate-500 font-normal">Klaviatura orqali yozing</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  inputMode="decimal"
                  autoFocus
                  value={modalMiqdor}
                  onChange={(e) => setModalMiqdor(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border-2 border-emerald-500 rounded-xl font-black text-lg text-slate-900 tabular-nums focus:outline-none"
                  placeholder="1"
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-500">
                  {tanlanganTovar.birlik || "dona"}
                </span>
              </div>
            </div>

            {/* Narx inputi */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Sotish narxi (1 {tanlanganTovar.birlik || "dona"} uchun):
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={modalNarx}
                  onChange={(e) => setModalNarx(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-base text-slate-900 tabular-nums focus:outline-none focus:border-emerald-500"
                  placeholder="0"
                />
                <span className="absolute right-3 top-2.5 text-xs font-black text-emerald-700">
                  {valyuta}
                </span>
              </div>
            </div>

            {/* Jami hisob kartochkasi */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-900">Jami summa:</span>
              <span className="text-sm font-black text-emerald-800 tabular-nums">
                {pul((parseFloat(modalMiqdor) || 0) * (parseFloat(modalNarx) || 0))} {valyuta}
              </span>
            </div>

            {/* Tugmalar */}
            <div className="flex gap-2 pt-1">
              {savat.some((x) => x.tovar_id === tanlanganTovar.id) && (
                <button
                  onClick={() => tovarSavatdanOchir(tanlanganTovar.id)}
                  className="px-2.5 py-2 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold transition-colors"
                >
                  O'chirish
                </button>
              )}
              <button
                onClick={() => setTovarModalOchiq(false)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                Bekor
              </button>
              <button
                onClick={tovarSavatgaSaqla}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
              >
                {savat.some((x) => x.tovar_id === tanlanganTovar.id) ? "Saqlash" : "Savatga qo'shish"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Savdoni Rasmiylashtirish Modali */}
      {modalOchiq && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-3">
          <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-4 max-h-[85vh] overflow-y-auto space-y-3 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b">
              <h2 className="text-base font-bold text-slate-900">Sotuvni yakunlash</h2>
              <button onClick={() => setModalOchiq(false)} className="text-slate-400 p-1 font-bold text-lg">
                ✕
              </button>
            </div>

            {/* Savatdagi tovarlar qisqacha ro'yxati */}
            <div className="bg-slate-50 p-2.5 rounded-xl space-y-1.5 max-h-32 overflow-y-auto border border-slate-200">
              {savat.map((s) => (
                <div
                  key={s.tovar_id}
                  className="flex justify-between items-center text-xs font-semibold py-1 border-b border-slate-100 last:border-b-0"
                >
                  <span
                    onClick={() => {
                      const t = tovarlar.find((x) => x.id === s.tovar_id);
                      if (t) {
                        setModalOchiq(false);
                        tovarTanlandi(t);
                      }
                    }}
                    className="text-slate-800 hover:text-emerald-700 cursor-pointer flex-1 truncate pr-2"
                  >
                    {s.nom} ({s.soni}x {s.birlik})
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-bold text-slate-900">
                      {pul(s.soni * s.narx)} {valyuta}
                    </span>
                    <button onClick={() => tovarSavatdanOchir(s.tovar_id)} className="text-rose-500 hover:text-rose-700 p-0.5">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Mijoz tanlash */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-slate-700">Mijoz (Kontragent):</label>
                <button
                  onClick={() => setMijozModalOchiq(true)}
                  className="text-emerald-700 font-bold text-[11px] flex items-center gap-1 hover:underline"
                >
                  <UserPlus className="w-3 h-3" /> + Yangi mijoz
                </button>
              </div>
              <Combobox
                title="Mijozni tanlang"
                placeholder="Mijozni tanlang (yoki Chakana)..."
                searchPlaceholder="Mijoz ismi yoki telefoni..."
                value={tanlanganMijoz?.id || ""}
                onChange={(val) => {
                  const m = mijozlar.find((x) => x.id === val);
                  setTanlanganMijoz(m || null);
                }}
                options={[
                  { value: "", label: "Chakana (Nomsiz xaridor)", subLabel: "Oddiy xaridor" },
                  ...mijozlar.map((m) => {
                    const qarzMatnlari = [];
                    if (m.qarz_uzs > 0) qarzMatnlari.push(`${pul(m.qarz_uzs)} so'm`);
                    if (m.qarz_usd > 0) qarzMatnlari.push(`$${pul(m.qarz_usd)}`);
                    return {
                      value: m.id,
                      label: m.nom,
                      subLabel: m.telefon || m.manzil || undefined,
                      badge: qarzMatnlari.length > 0 ? `Qarzi: ${qarzMatnlari.join(" / ")}` : undefined,
                      badgeColor: "bg-amber-100 text-amber-800",
                    };
                  }),
                ]}
              />
            </div>

            {/* To'langan summa va qarz hisobi */}
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl space-y-2">
              <div className="flex justify-between font-bold text-slate-700 text-xs">
                <span>Jami xarid:</span>
                <span className="text-base font-black text-emerald-800 tabular-nums">
                  {pul(jamiSumma)} {valyuta}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">To'langan naqd summa:</label>
                <input
                  type="number"
                  value={tolanganSumma}
                  onChange={(e) => setTolanganSumma(e.target.value)}
                  placeholder="0"
                  className="w-full p-2 bg-white border border-emerald-300 rounded-lg font-black text-base text-emerald-900 tabular-nums focus:outline-none"
                />
              </div>

              {/* Tezkor to'lov tugmalari */}
              <div className="flex gap-2">
                <button
                  onClick={() => setTolanganSumma(String(jamiSumma))}
                  className="flex-1 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-bold"
                >
                  Hammasini to'ladi
                </button>
                <button
                  onClick={() => setTolanganSumma("0")}
                  className="flex-1 py-1.5 bg-rose-500 text-white rounded-lg text-[11px] font-bold"
                >
                  Hammasi qarzga
                </button>
              </div>

              <div className="flex justify-between items-center pt-1.5 border-t border-emerald-200 text-xs font-bold">
                <span className="text-rose-700">Qarzga ketadigan qismi:</span>
                <span className="text-sm font-black text-rose-700 tabular-nums">
                  {pul(Math.max(0, jamiSumma - (Number(tolanganSumma) || 0)))} {valyuta}
                </span>
              </div>
            </div>

            {/* To'lov usuli va Kassa */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 block">To'lov turi:</label>
                <Combobox
                  title="To'lov turi"
                  value={tolovTuri}
                  onChange={(val) => {
                    setTolovTuri(val);
                    if (val === "plastik") setKassaTuri("plastik_uzs");
                    else if (valyuta === "USD") setKassaTuri("naqd_usd");
                    else setKassaTuri("naqd_uzs");
                  }}
                  options={[
                    { value: "naqd", label: "Naqd pul", icon: "💵" },
                    { value: "plastik", label: "Plastik", icon: "💳" },
                    { value: "perechisleniya", label: "Bank", icon: "🏦" },
                  ]}
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 block">Tushadigan Kassa:</label>
                <Combobox
                  title="Kassani tanlang"
                  value={kassaTuri}
                  onChange={setKassaTuri}
                  options={[
                    { value: "naqd_uzs", label: "Naqd (So'm)" },
                    { value: "naqd_usd", label: "Naqd (Dollar)" },
                    { value: "plastik_uzs", label: "Plastik (So'm)" },
                    { value: "bank_uzs", label: "Bank (So'm)" },
                  ]}
                />
              </div>
            </div>

            {/* Izoh */}
            <input
              type="text"
              placeholder="Izoh (ixtiyoriy)..."
              value={izoh}
              onChange={(e) => setIzoh(e.target.value)}
              className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-medium"
            />

            {/* Tasdiqlash tugmasi */}
            <button
              onClick={savdoniYakunla}
              disabled={yuklanmoqda}
              className="w-full py-2.5 bg-emerald-700 text-white font-extrabold text-sm rounded-xl shadow-md active:scale-98 transition-all disabled:opacity-50"
            >
              {yuklanmoqda ? "Saqlanmoqda..." : "✅ Sotuvni Saqlash"}
            </button>
          </div>
        </div>
      )}

      {/* Yangi Mijoz Qo'shish Kichik Modali */}
      {mijozModalOchiq && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-sm rounded-xl p-4 space-y-2.5">
            <h3 className="font-bold text-sm text-slate-900">Yangi mijoz qo'shish</h3>
            <input
              type="text"
              placeholder="Ism yoki Do'kon nomi..."
              value={yangiMijozNom}
              onChange={(e) => setYangiMijozNom(e.target.value)}
              className="w-full p-2 border rounded-lg text-xs font-medium"
            />
            <input
              type="tel"
              placeholder="Telefon raqami..."
              value={yangiMijozTel}
              onChange={(e) => setYangiMijozTel(e.target.value)}
              className="w-full p-2 border rounded-lg text-xs font-medium"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setMijozModalOchiq(false)}
                className="flex-1 py-2 bg-slate-100 font-bold rounded-lg text-xs text-slate-700"
              >
                Bekor
              </button>
              <button
                onClick={yangiMijozSaqla}
                className="flex-1 py-2 bg-emerald-600 text-white font-bold rounded-lg text-xs"
              >
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
