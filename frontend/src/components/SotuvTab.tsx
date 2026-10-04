import React, { useState, useEffect } from "react";
import { supabase, pul, haptic } from "../lib/supabase";
import { ShoppingCart, Plus, Minus, Trash2, Search, CheckCircle, UserPlus, DollarSign } from "lucide-react";

export function SotuvTab() {
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

  // Tovarlar va mijozlarni yuklash
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

  // Savat amallari
  function savatgaQosh(tovar: any) {
    haptic("light");
    const bor = savat.find((x) => x.tovar_id === tovar.id);
    const narx = valyuta === "USD" ? (tovar.narx_optom_usd || tovar.narx_optom) : tovar.narx_optom;
    if (bor) {
      setSavat(savat.map((x) => (x.tovar_id === tovar.id ? { ...x, soni: x.soni + 1 } : x)));
    } else {
      setSavat([
        ...savat,
        {
          tovar_id: tovar.id,
          nom: tovar.nom,
          model: tovar.model,
          rasm_url: tovar.rasm_url,
          narx: narx,
          tannarx: tovar.tannarx || 0,
          soni: 1,
        },
      ]);
    }
  }

  function soniniOzgarti(tovarId: string, delta: number) {
    haptic("light");
    setSavat(
      savat
        .map((x) => (x.tovar_id === tovarId ? { ...x, soni: Math.max(1, x.soni + delta) } : x))
        .filter((x) => x.soni > 0)
    );
  }

  function ochirSavatdan(tovarId: string) {
    haptic("medium");
    setSavat(savat.filter((x) => x.tovar_id !== tovarId));
  }

  const jamiSumma = savat.reduce((sum, item) => sum + item.soni * item.narx, 0);

  // Savdoni tasdiqlash
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
      setMuvaffaqiyat(`Savdo muvaffaqiyatli saqlandi! Chek ID: #${data?.slice(0, 8)}`);
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
    <div className="space-y-4">
      {/* Muvaffaqiyat xabari */}
      {muvaffaqiyat && (
        <div className="p-4 bg-emerald-600 text-white rounded-2xl flex items-center gap-3 shadow-lg animate-fade-in">
          <CheckCircle className="w-6 h-6 flex-shrink-0" />
          <p className="font-semibold text-lg">{muvaffaqiyat}</p>
        </div>
      )}

      {/* Qidiruv & Valyuta */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3.5 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Tovar yoki model nomi..."
            value={qidiruv}
            onChange={(e) => setQidiruv(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-lg font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
          />
        </div>
        <button
          onClick={() => {
            const yangi = valyuta === "UZS" ? "USD" : "UZS";
            setValyuta(yangi);
            setKassaTuri(yangi === "USD" ? "naqd_usd" : "naqd_uzs");
            haptic("light");
          }}
          className={`px-4 py-3 rounded-xl font-bold text-base flex items-center gap-1 shadow-sm transition-all ${
            valyuta === "USD" ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"
          }`}
        >
          <DollarSign className="w-5 h-5" />
          {valyuta}
        </button>
      </div>

      {/* Savat tugmasi (agar savatda tovar bo'lsa) */}
      {savat.length > 0 && (
        <div className="sticky top-2 z-20 bg-emerald-700 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2.5 rounded-xl">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-emerald-100 font-bold">
                {savat.reduce((a, b) => a + b.soni, 0)} dona tovar
              </p>
              <p className="text-2xl font-black tabular-nums">
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
            className="bg-white text-emerald-800 font-extrabold px-5 py-3 rounded-xl text-base shadow active:scale-95 transition-transform"
          >
            Rasmiylashtirish →
          </button>
        </div>
      )}

      {/* Mahsulotlar Kartochkalari (40+ yoshdagilar uchun katta va rasmli) */}
      <div className="grid grid-cols-1 gap-3">
        {saralanganTovarlar.map((tovar) => {
          const savatdagi = savat.find((x) => x.tovar_id === tovar.id);
          const narx = valyuta === "USD" ? (tovar.narx_optom_usd || tovar.narx_optom) : tovar.narx_optom;
          return (
            <div
              key={tovar.id}
              className="bg-white border border-slate-200 p-3.5 rounded-2xl flex gap-3 items-center shadow-sm hover:border-slate-300 transition-all"
            >
              {/* Tovar rasmi */}
              <div className="w-20 h-20 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-slate-100">
                {tovar.rasm_url ? (
                  <img src={tovar.rasm_url} alt={tovar.nom} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-black text-slate-300">{tovar.nom.charAt(0)}</span>
                )}
              </div>

              {/* Tovar ma'lumotlari */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg text-slate-900 truncate leading-snug">{tovar.nom}</h3>
                  {tovar.model && (
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-semibold">
                      #{tovar.model}
                    </span>
                  )}
                </div>
                <p className="text-xl font-extrabold text-emerald-700 tabular-nums mt-0.5">
                  {pul(narx)} {valyuta}
                </p>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  Qoldiq:{" "}
                  <span className={`font-bold ${tovar.qoldiq <= 5 ? "text-rose-600" : "text-slate-700"}`}>
                    {pul(tovar.qoldiq)} {tovar.birlik}
                  </span>
                </p>
              </div>

              {/* Savatga qo'shish tugmasi */}
              {savatdagi ? (
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <button
                    onClick={() => soniniOzgarti(tovar.id, -1)}
                    className="w-9 h-9 bg-white border border-slate-200 rounded-lg flex items-center justify-center font-bold text-lg text-slate-700 active:bg-slate-200"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-7 text-center font-black text-base tabular-nums">{savatdagi.soni}</span>
                  <button
                    onClick={() => soniniOzgarti(tovar.id, 1)}
                    className="w-9 h-9 bg-emerald-600 text-white rounded-lg flex items-center justify-center font-bold text-lg active:bg-emerald-700"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => savatgaQosh(tovar)}
                  className="w-12 h-12 bg-emerald-600 text-white rounded-xl flex items-center justify-center font-bold shadow-md hover:bg-emerald-700 active:scale-95 transition-transform"
                >
                  <Plus className="w-6 h-6" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Savdoni Rasmiylashtirish Modali */}
      {modalOchiq && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b">
              <h2 className="text-xl font-black text-slate-900">Sotuvni yakunlash</h2>
              <button onClick={() => setModalOchiq(false)} className="text-slate-400 p-1 font-bold text-xl">
                ✕
              </button>
            </div>

            {/* Savatdagi tovarlar qisqacha */}
            <div className="bg-slate-50 p-3 rounded-xl space-y-2 max-h-36 overflow-y-auto border">
              {savat.map((s) => (
                <div key={s.tovar_id} className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-slate-700">
                    {s.nom} ({s.soni}x)
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-bold">
                      {pul(s.soni * s.narx)} {valyuta}
                    </span>
                    <button onClick={() => ochirSavatdan(s.tovar_id)} className="text-rose-500 p-0.5">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Mijoz tanlash */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-bold text-slate-700">Mijoz (Kontragent):</label>
                <button
                  onClick={() => setMijozModalOchiq(true)}
                  className="text-emerald-700 font-bold text-xs flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" /> + Yangi mijoz
                </button>
              </div>
              <select
                value={tanlanganMijoz?.id || ""}
                onChange={(e) => {
                  const m = mijozlar.find((x) => x.id === e.target.value);
                  setTanlanganMijoz(m || null);
                }}
                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-base focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Chakana (Nomsiz xaridor)</option>
                {mijozlar.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom} {m.qarz_uzs > 0 ? `(Qarzi: ${pul(m.qarz_uzs)} so'm)` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* To'langan summa va qarz hisobi */}
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl space-y-2">
              <div className="flex justify-between font-bold text-slate-700">
                <span>Jami xarid:</span>
                <span className="text-xl font-black text-emerald-800 tabular-nums">
                  {pul(jamiSumma)} {valyuta}
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">To'langan naqd summa:</label>
                <input
                  type="number"
                  value={tolanganSumma}
                  onChange={(e) => setTolanganSumma(e.target.value)}
                  placeholder="0"
                  className="w-full p-3 bg-white border border-emerald-300 rounded-xl font-black text-xl text-emerald-900 tabular-nums focus:outline-none"
                />
              </div>

              {/* Tezkor to'lov tugmalari */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setTolanganSumma(String(jamiSumma))}
                  className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold"
                >
                  Hammasini to'ladi
                </button>
                <button
                  onClick={() => setTolanganSumma("0")}
                  className="flex-1 py-2 bg-rose-500 text-white rounded-lg text-xs font-bold"
                >
                  Hammasi qarzga
                </button>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-emerald-200 text-sm font-bold">
                <span className="text-rose-700">Qarzga ketadigan qismi:</span>
                <span className="text-xl font-black text-rose-700 tabular-nums">
                  {pul(Math.max(0, jamiSumma - (Number(tolanganSumma) || 0)))} {valyuta}
                </span>
              </div>
            </div>

            {/* To'lov usuli va Kassa */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">To'lov turi:</label>
                <select
                  value={tolovTuri}
                  onChange={(e) => setTolovTuri(e.target.value)}
                  className="w-full p-3 bg-slate-50 border rounded-xl text-sm font-bold"
                >
                  <option value="naqd">💵 Naqd pul</option>
                  <option value="plastik">💳 Plastik karta</option>
                  <option value="perechisleniya">🏦 Perechisleniya</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Tushadigan Kassa:</label>
                <select
                  value={kassaTuri}
                  onChange={(e) => setKassaTuri(e.target.value)}
                  className="w-full p-3 bg-slate-50 border rounded-xl text-sm font-bold"
                >
                  <option value="naqd_uzs">Naqd (So'm)</option>
                  <option value="naqd_usd">Naqd (Dollar)</option>
                  <option value="plastik_uzs">Plastik (So'm)</option>
                  <option value="bank_uzs">Bank (So'm)</option>
                </select>
              </div>
            </div>

            {/* Izoh */}
            <input
              type="text"
              placeholder="Izoh (ixtiyoriy)..."
              value={izoh}
              onChange={(e) => setIzoh(e.target.value)}
              className="w-full p-3 bg-slate-50 border rounded-xl text-sm font-medium"
            />

            {/* Tasdiqlash tugmasi */}
            <button
              onClick={savdoniYakunla}
              disabled={yuklanmoqda}
              className="w-full py-4 bg-emerald-700 text-white font-black text-lg rounded-2xl shadow-xl active:scale-98 transition-all disabled:opacity-50"
            >
              {yuklanmoqda ? "Saqlanmoqda..." : "✅ Sotuvni Saqlash"}
            </button>
          </div>
        </div>
      )}

      {/* Yangi Mijoz Qo'shish Kichik Modali */}
      {mijozModalOchiq && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-lg text-slate-900">Yangi mijoz qo'shish</h3>
            <input
              type="text"
              placeholder="Ism yoki Do'kon nomi..."
              value={yangiMijozNom}
              onChange={(e) => setYangiMijozNom(e.target.value)}
              className="w-full p-3 border rounded-xl font-medium"
            />
            <input
              type="tel"
              placeholder="Telefon raqami..."
              value={yangiMijozTel}
              onChange={(e) => setYangiMijozTel(e.target.value)}
              className="w-full p-3 border rounded-xl font-medium"
            />
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setMijozModalOchiq(false)}
                className="flex-1 py-3 bg-slate-100 font-bold rounded-xl text-slate-700"
              >
                Bekor
              </button>
              <button
                onClick={yangiMijozSaqla}
                className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl"
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
