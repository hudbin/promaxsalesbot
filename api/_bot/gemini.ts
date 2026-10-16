import { GEMINI_API_KEYS, GEMINI_API_KEY, GEMINI_MODELS, getSupabase } from "./config";

// -----------------------------------------------------------------------------
// GEMINI API GA SO'ROV YUBORISH (Ko'p akkauntli va zaxira modellar bilan)
// -----------------------------------------------------------------------------
export async function callGeminiRaw(contents: any[]): Promise<{ ok: boolean; text?: string; error?: string }> {
  if (GEMINI_API_KEYS.length === 0) {
    return {
      ok: false,
      error: "Google Gemini API kaliti (GEMINI_API_KEY) kiritilmagan. Iltimos, Environment Variables ga qo'shing.",
    };
  }

  let oxirgiXato = "";

  // 1-bosqich: Eng yaxshi modeldan boshlab tekshiramiz
  for (const model of GEMINI_MODELS) {
    // 2-bosqich: Har bir model uchun barcha kalitlarni sinab ko'ramiz
    for (let keyIndex = 0; keyIndex < GEMINI_API_KEYS.length; keyIndex++) {
      const apiKey = GEMINI_API_KEYS[keyIndex];
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents }),
        });

        const data = await resp.json();
        if (data?.error) {
          const errMsg = data.error.message || JSON.stringify(data.error);
          oxirgiXato = errMsg;
          console.warn(`[Gemini Fallback] Model ${model} (Kalit #${keyIndex + 1}) xato berdi (${resp.status}): ${errMsg}`);
          continue;
        }

        const javob = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (javob) {
          return { ok: true, text: javob };
        }
      } catch (e: any) {
        oxirgiXato = e?.message || "Ulanish xatosi";
        console.warn(`[Gemini Fallback] Model ${model} (Kalit #${keyIndex + 1}) ulanish xatosi:`, oxirgiXato);
      }
    }
  }

  return {
    ok: false,
    error: oxirgiXato || "Barcha Gemini API kalitlari va zaxira modellari band yoki limit tugagan.",
  };
}

// JSON qaytaruvchi yordamchi
export async function callGeminiJson(contents: any[]): Promise<{ ok: boolean; data?: any; error?: string }> {
  const res = await callGeminiRaw(contents);
  if (!res.ok || !res.text) {
    return { ok: false, error: res.error };
  }

  try {
    const tozalangan = res.text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(tozalangan);
    return { ok: true, data: parsed };
  } catch (err: any) {
    return { ok: false, error: "AI javobini JSON formatida o'qib bo'lmadi: " + res.text };
  }
}

// Gemini'dan tabiiy tilda javob olish (Text-to-Text)
export async function geminiTabiiyJavob(prompt: string): Promise<string> {
  const res = await callGeminiRaw([{ parts: [{ text: prompt }] }]);
  if (!res.ok || !res.text) {
    return "Kechirasiz, sun'iy intellekt tahlil qilishda qiyinchilikka uchradi: " + (res.error || "");
  }
  return res.text;
}

// -----------------------------------------------------------------------------
// GEMINI AI TAHLILCHISI (O'zbek tilidagi matn va audio xabarlar)
// -----------------------------------------------------------------------------
export async function geminiTahlil(
  matn: string,
  audioBase64?: string,
  mimeType?: string,
  chatId?: number
): Promise<{ ok: boolean; data?: any; error?: string }> {
  if (!GEMINI_API_KEY) {
    return {
      ok: false,
      error: "Google Gemini API kaliti (GEMINI_API_KEY) kiritilmagan. Iltimos, Environment Variables ga qo'shing.",
    };
  }

  // Hisoblarni bazadan olish
  let hisoblarRoyxatiText = "";
  try {
    const { data: hisoblar } = await getSupabase().from("hisoblar").select("id, nom").eq("faol", true);
    if (hisoblar && hisoblar.length > 0) {
      hisoblarRoyxatiText = hisoblar.map((h: any, i: number) => `${i + 1}. ${h.nom} (ID: ${h.id})`).join("\n");
    } else {
      hisoblarRoyxatiText = "Hisoblar topilmadi.";
    }
  } catch (err) {
    hisoblarRoyxatiText = "Hisoblar ro'yxatini olishda xato.";
  }

  // Chiqim (rasxod) kategoriyalarini bazadan olish
  let mavjudKategoriyalarText = "";
  try {
    const { data: rKategoriyalar } = await getSupabase()
      .from("rasxodlar")
      .select("kategoriya")
      .eq("holat", "faol")
      .limit(300);
    const katSet = new Set<string>([
      "Ovqatlanish", "Taksi", "Elektr", "Ijara", "Oylik", "Xo'jalik"
    ]);
    if (rKategoriyalar && rKategoriyalar.length > 0) {
      rKategoriyalar.forEach((r: any) => {
        if (r.kategoriya && typeof r.kategoriya === "string" && r.kategoriya.trim()) {
          katSet.add(r.kategoriya.trim());
        }
      });
    }
    mavjudKategoriyalarText = Array.from(katSet).join(", ");
  } catch (err) {
    mavjudKategoriyalarText = "Ovqatlanish, Taksi, Elektr, Ijara, Oylik, Xo'jalik";
  }

  // Toshkent vaqti bo'yicha joriy sana va vaqtni aniqlash (UTC+5)
  const nowTashkent = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));
  const bugunStr = nowTashkent.toISOString().slice(0, 10);
  const kechaDate = new Date(nowTashkent);
  kechaDate.setDate(kechaDate.getDate() - 1);
  const kechaStr = kechaDate.toISOString().slice(0, 10);

  const haftaKunlari = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
  const haftaKuni = haftaKunlari[nowTashkent.getDay()];
  const soatVaqt = nowTashkent.toTimeString().slice(0, 5);

  const prompt = `
Siz ulgurji va chakana savdo (B2B) do'koni uchun buxgalter yordamchi AI hisoblanasiz.
Foydalanuvchi do'kon sotuvchisi yoki rahbari (40+ yosh). Ular sizga o'zbek tilida (lotin yoki kirill) matn yoki ovozli xabar yuboradi.

BUGUNGI REAL KALENDAR SANASI VA VAQTI (O'zbekiston / Toshkent vaqti UTC+5):
- Bugun: ${bugunStr} (${haftaKuni})
- Hozirgi soat: ${soatVaqt}
- Kecha: ${kechaStr}
- Joriy oy: ${bugunStr.slice(0, 7)}

Xabardan tranzaksiyani aniqlab, FAQAT toza JSON formatida javob bering. Hech qanday markdown (\`\`\`json) yoki ortiqcha so'z qo'shmang!

Quyidagi 11 ta amal turidan birini aniqlang:
1. "savdo": Mahsulot sotildi yoki mijozga tovar berildi.
2. "tovar_vozvrat": Mijoz tovar qaytardi / vozvrat qildi (masalan: "Akrom aka 50 ta Hudi vozvrat qildi", "Bobojon og'adan 20 ta 3008 qaytdi").
3. "rasxod": Yagona xarajat qilindi (masalan: "Obedga 60 ming ketdi").
4. "kop_rasxod": Bitta so'rovda BIR NECHTA xarajat aytilganda (masalan: "Obedga 50 ming, taksiga 30 ming, internetga 100 ming" yoki "Kassadan obedga 50 ming, plastikdan internetga 100 ming").
5. "qarz_tolov": Mijoz eski qarzini to'ladi / qaytardi (pul bilan).
6. "tovar_kirim": Do'konga (omborga) yangi tovar keldi, kirim qilindi yoki mahsulot qoldig'i kiritildi.
7. "pul_otkazma": Kassalar (hisoblar) o'rtasida pul o'tkazish.
8. "balans_sozlash": Kassa yoki hisobdagi real pul mablag'ini to'g'irlash / balansni sozlash (masalan: "Asosiy kassa naqd pulini 50 mln ga to'g'irla", "Kassadagi pulni 45 million deb qo'y", "Plastikda 10 mln so'm bor", "USD kassani 2500$ ga to'g'irla").
9. "qarz_eslatma": Mijozga qarzini eslatish, qarzdorlik bo'yicha xabar yuborish yoki tayyorlash.
10. "qarz_pdf": Foydalanuvchi qarzdorlar ro'yxatini yoki mijozning qarz hisobotini (akt-sverka) PDF ko'rinishida so'raganda.
11. "savol": Foydalanuvchi bazadagi holat, hisobot, qarzlar, qoldiqlarga doir ma'lumot so'ramoqda (tranzaksiya emas).

JSON strukturasi 1, 2, 3, 5, 6 amallar uchun:
{
  "amal": "savdo" | "tovar_vozvrat" | "rasxod" | "qarz_tolov" | "tovar_kirim",
  "valyuta": "UZS" | "USD",
  "jami_summa": 0.0,
  "tolangan_summa": 0.0,
  "tolov_turi": "naqd" | "plastik" | "perechisleniya",
  "hisob_id": "eng mos hisob UUID raqami yoki null",
  "mijoz_nomi": "Mijoz ismi yoki do'koni" (agar savdo, vozvrat yoki qarz to'lovi bo'lsa, aks holda null),
  "kategoriya": "Xarajat kategoriyasi nomi (string)" (agar rasxod bo'lsa),
  "tovar_nomi": "Tovar nomi" (agar tovar_kirim bo'lsa),
  "soni": 0.0 (agar tovar_kirim bo'lsa),
  "tannarx": 0.0 (agar tovar_kirim bo'lsa),
  "narx_optom": 0.0 (agar tovar_kirim bo'lsa),
  "birlik": "dona" | "metr" | "pachka" | "kg" (agar tovar_kirim bo'lsa, default: "dona"),
  "izoh": "Qisqa tushuntirish",
  "qatorlar": [
    {
      "nom": "Tovar nomi",
      "soni": 1.0,
      "narx": 0.0
    }
  ]
}

JSON strukturasi "kop_rasxod" amali uchun (Bir nechta xarajat bo'lsa):
{
  "amal": "kop_rasxod",
  "valyuta": "UZS" | "USD",
  "jami_summa": 0.0,
  "xarajatlar": [
    {
      "kategoriya": "Xarajat kategoriyasi (Ovqatlanish, Taksi, Internet va h.k.)",
      "summa": 0.0,
      "hisob_id": "agar ushbu xarajat uchun aniq hisob/kassa aytilgan bo'lsa uning UUID raqami, aks holda null",
      "izoh": "Qisqa izoh (masalan: Tushlik, Bozorga taksi)"
    }
  ]
}

JSON strukturasi "pul_otkazma" amali uchun:
{
  "amal": "pul_otkazma",
  "valyuta": "UZS" | "USD",
  "jami_summa": 0.0,
  "chiqim_hisob_id": "Pul chiqib ketayotgan hisob UUID",
  "kirim_hisob_id": "Pul tushayotgan hisob UUID",
  "izoh": "Qisqa izoh"
}

JSON strukturasi "balans_sozlash" amali uchun:
{
  "amal": "balans_sozlash",
  "hisob_id": "aniq aytilgan bo'lsa hisob UUID, aks holda null",
  "yangi_balans": 0.0,
  "valyuta": "UZS" | "USD",
  "izoh": "Qisqa izoh yoki null"
}

JSON strukturasi "qarz_eslatma" amali uchun:
{
  "amal": "qarz_eslatma",
  "mijoz_nomi": "Mijoz ismi yoki do'koni",
  "xabar_matni": "Ixtiyoriy foydalanuvchi aytgan maxsus xabar matni yoki null"
}

JSON strukturasi "qarz_pdf" amali uchun:
{
  "amal": "qarz_pdf",
  "mijoz_nomi": "Bitta aniq mijoz so'ralgan bo'lsa uning ismi/do'koni, butun ro'yxat bo'lsa null",
  "sana_boshlanish": "YYYY-MM-DD formatidagi boshlanish sanasi yoki null",
  "sana_tugash": "YYYY-MM-DD formatidagi tugash sanasi yoki null"
}

JSON strukturasi "savol" amali uchun:
{
  "amal": "savol",
  "sql": "SELECT ... FROM ...",
  "izoh": "Siz yaratgan so'rov nimani anglatishini qisqacha izohi",
  "mijoz_nomi": "agar savol bitta mijoz haqida bo'lsa uning ismi, aks holda null",
  "pdf_soraldi": true | false,
  "sana_boshlanish": "YYYY-MM-DD yoki null",
  "sana_tugash": "YYYY-MM-DD yoki null"
}

Agar "savol" bo'lsa, siz PROMAX do'koni rahbarining Shaxsiy Yordamchisi (Personal Assistant) sifatida eng to'g'ri, moslashuvchan Postgres SQL (SELECT) yozishingiz SHART!
Jadvallar va Maxsus Aqlli Funksiyalar:
1. MIJOZ VA QARZDORLIK:
   - SANA BO'YICHA QARZ VA OBOROT: fn_mijoz_qarz_tarixiy_nom('Akrom aka', bosh, tugash)
   - AQLLI QIDIRUV: fn_ai_mijoz_qidirish('soz') yoki ILIKE '%...%'
   - Jadval: mijozlar (id, nom, nom_norm, telefon, manzil, qarz_uzs, qarz_usd, faol)
   - Tayyor ko'rinish: view_ai_qarzdorlar (barcha qarzdorlar ro'yxati)

2. DO'KON (OMBOR) VA TOVARLAR (QOLDIQLAR):
   - AQLLI TOVAR QIDIRUV: fn_ai_tovar_qidirish('model yoki nom')
   - Jadval: tovarlar (id, nom, model, shtrixkod, birlik, tannarx, narx_optom, narx_chakana, valyuta, qoldiq, ogohlantirish_qoldiq, faol)

3. DO'KON XULOSASI VA KO'RSATKICHLARI:
   - Tayyor ko'rinish: view_ai_xulosa, view_bugungi_hisobot, view_kassa_balans
   - Savdolar: savdolar (id, raqam, sana_vaqt, mijoz_id, valyuta, jami_summa, tolangan_summa, qarz_summa, tolov_turi, hisob_id, holat, xodim)
   - Rasxodlar: rasxodlar (id, sana_vaqt, summa, valyuta, kategoriya, tolov_turi, hisob_id, izoh, xodim)
   - Qarz to'lovlari: qarz_tolovlari (id, sana_vaqt, mijoz_id, summa, valyuta, tolov_turi, hisob_id, xodim)

BAZADAGI MAVJUD CHIQIM (RASXOD) KATEGORIYALARI:
[${mavjudKategoriyalarText}]

CHIQIM (RASXOD) KATEGORIYASI QOIDALARI:
1. Agar xarajat mavjud kategoriyalarga to'g'ri kelsa (yoki sinonimi bo'lsa, masalan: tushlik/obed -> "Ovqatlanish", yandex/yo'lkira -> "Taksi"), o'sha kategoriyani tanlang.
2. AGAR MAVJUD KATEGORIYALARGA MOS KELMASA:
   HECH QACHON "Boshqa" DEB YOZMANG!
   Buning o'rniga aniq 1-2 so'zli yangi o'zbekcha kategoriya yarating (masalan: "Reklama", "Kanselyariya", "Ta'mirlash", "Logistika", "Qadoqlash", "Kommunal", "Internet").

BAZADAGI MAVJUD HISOBLAR RO'YXATI (Kassalar):
${hisoblarRoyxatiText}

O'TA MUHIM QOIDALAR (HISOBLAR / KASSA BO'YICHA):
- Agar matnda pul QAYSI HISOBGA tushgani yoki QAYSI HISOBDAN chiqqani ANIQ aytilgan bo'lsa, mos hisobning UUID sini "hisob_id" ga yozing.
- AGAR QAYSI HISOB EKANLIGI ANIQ AYTILMAGAN BO'LSA: "hisob_id": null deb qaytaring!
`;

  const contents: any[] = [];
  contents.push({ role: "user", parts: [{ text: prompt }] });
  contents.push({ role: "model", parts: [{ text: "Tushundim. Men FAQAT toza JSON formatida javob beraman. Qolgan narsalarni qo'shmayman." }] });

  // Xotirani (history) yuklash
  if (chatId) {
    try {
      const { data: history } = await getSupabase()
        .from("ai_chat_history")
        .select("role, content")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: false })
        .limit(2);
      
      if (history && history.length > 0) {
        history.reverse().forEach((msg: any) => {
          contents.push({ role: msg.role, parts: [{ text: msg.content }] });
        });
      }
    } catch (err) {
      console.error("Xotirani yuklashda xato:", err);
    }
  }

  const currentParts: any[] = [];
  if (audioBase64) {
    const cleanMimeType = (mimeType || "audio/ogg").split(";")[0].trim();
    currentParts.push({
      inlineData: {
        mimeType: cleanMimeType,
        data: audioBase64,
      },
    });
    currentParts.push({ text: "DIQQAT: Javobingiz orqadagi xotirani hisobga olgan holda faqat toza JSON bo'lishi shart!" });
  } else if (matn) {
    currentParts.push({ text: `Foydalanuvchi xabari: "${matn}"\n\nDIQQAT: Javobingiz orqadagi xotirani hisobga olgan holda faqat toza JSON bo'lishi shart!` });
  }

  contents.push({ role: "user", parts: currentParts });

  return await callGeminiJson(contents);
}
