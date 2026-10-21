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

Quyidagi 14 ta amal turidan birini aniqlang:
1. "savdo": Mahsulot sotildi yoki mijozga tovar berildi.
2. "tovar_vozvrat": Mijoz tovar qaytardi / vozvrat qildi (masalan: "Akrom aka 50 ta Hudi vozvrat qildi", "Bobojon og'adan 20 ta 3008 qaytdi").
3. "rasxod": Yagona xarajat qilindi (masalan: "Obedga 60 ming ketdi").
4. "kop_rasxod": Bitta so'rovda BIR NECHTA xarajat aytilganda (masalan: "Obedga 50 ming, taksiga 30 ming, internetga 100 ming" yoki "Kassadan obedga 50 ming, plastikdan internetga 100 ming").
5. "qarz_tolov": Mijoz eski qarzini to'ladi / qaytardi (pul bilan).
6. "tovar_kirim": Do'konga (omborga) yangi tovar keldi, kirim qilindi yoki mahsulot qoldig'i kiritildi.
7. "pul_otkazma": Kassalar (hisoblar) o'rtasida pul o'tkazish.
8. "balans_sozlash": Kassa yoki hisobdagi real pul mablag'ini to'g'irlash / balansni sozlash (masalan: "Asosiy kassa naqd pulini 50 mln ga to'g'irla", "Kassadagi pulni 45 million deb qo'y", "Plastikda 10 mln so'm bor", "USD kassani 2500$ ga to'g'irla").
9. "qarz_eslatma": Mijozga qarzini eslatish, qarzdorlik bo'yicha xabar yuborish yoki tayyorlash.
10. "qarz_pdf": Mijozlarning qarzdorlik ro'yxati yoki bitta mijozning akt-sverkasini PDF hujjat shaklida so'raganda (masalan: "qarzdorlar ro'yxati pdf", "Ali akt sverka fayl", "Vali qarz hujjati").
11. "tashqi_qarz_pdf": Bizning qarzlarimiz (hamkorlar/tanishlar bilan qarz balansi) yoki biror sherik bilan hisob-kitobni PDF formatida so'raganda (masalan: "bizning qarzlar pdf", "tashqi qarzlar ro'yxati pdf", "Akmal aka bilan hisob-kitob fayli", "hamkorlar bilan akt-sverka pdf").
12. "kunlik_hisobot_pdf": Kunlik yakuniy hisobotni PDF hujjat shaklida so'raganda (masalan: "bugungi hisobot pdf", "17-oktyabr hisobotini faylda ber", "kunlik hisobot pdf").
13. "tashqi_qarz": Tanish/sherik/hamkor bilan shaxsiy qarz oldi-berdisi (masalan: "Ali akadan oylik uchun 63 mln oldim", "Akmaldan 50 mln qarz oldim", "Ali akaga 20 mln qaytardim", "Boburga 10 mln qarz berdim", "Bobur 10 mln qarzini qaytardi").
14. "savol": Foydalanuvchi bazadagi holat, hisobot, qarzlar, qoldiqlarga doir ma'lumot so'ramoqda (tranzaksiya emas).

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

JSON strukturasi "tashqi_qarz" amali uchun:
{
  "amal": "tashqi_qarz",
  "qarz_amali": "oldim" | "qaytardim" | "berdim" | "qaytdi",
  "shaxs_nomi": "Shaxs ismi (masalan: Ali aka, Akmal, Bobur)",
  "summa": 0.0,
  "valyuta": "UZS" | "USD",
  "maqsad": "Oylik uchun" | "Tovar uchun" | "Shaxsiy" | null,
  "bevosita_oylik": true | false,
  "hisob_id": "agar kassa/hisob aytilgan bo'lsa hisob UUID, aks holda null",
  "izoh": "Qisqa izoh yoki null"
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

JSON strukturasi "tashqi_qarz_pdf" amali uchun:
{
  "amal": "tashqi_qarz_pdf",
  "shaxs_nomi": "Bitta aniq hamkor/tanish so'ralgan bo'lsa uning ismi, hamma tashqi qarzlar bo'lsa null",
  "sana_boshlanish": "YYYY-MM-DD formatidagi boshlanish sanasi yoki null",
  "sana_tugash": "YYYY-MM-DD formatidagi tugash sanasi yoki null"
}

JSON strukturasi "kunlik_hisobot_pdf" amali uchun:
{
  "amal": "kunlik_hisobot_pdf",
  "sana": "YYYY-MM-DD formatidagi sana (agar aytilmagan bo'lsa bugungi sana)"
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

Agar "savol" bo'lsa, siz PROMAX ulgurji do'koni rahbarining Bosh Buxgalteri va Shaxsiy Moliyaviy Tahlilchisi (Personal Financial Analyst) sifatida eng to'g'ri, moslashuvchan Postgres SQL (SELECT) yozishingiz SHART!

O'TA MUHIM SQL VA HISOBOT QOIDALARI:
1. SANA FORMATI VA VAQT MINTAQASI (Asia/Tashkent UTC+5):
   - Foydalanuvchi "16.10.2026", "17.10.2026" yoki "16-oktyabr" kabi sanalarni aytsa, SQL da 'YYYY-MM-DD' ('2026-10-16') formatida foydalaning.
   - Sanani tekshirishda DOIMO Toshkent vaqtiga o'tkazib tekshiring:
     (sana_vaqt AT TIME ZONE 'Asia/Tashkent')::date = 'YYYY-MM-DD'
   - Aniq davr yoki sana oralig'i so'ralganda:
     (sana_vaqt AT TIME ZONE 'Asia/Tashkent')::date BETWEEN 'boshlanish' AND 'tugash'

2. JORIY BALANSLAR VS TARIXIY SANALAR (MUHIM QAT'IY TALAB!):
   - "view_kassa_balans" va "view_ai_xulosa" FAQAT HOZIRGI LAHZADAGI jonli ko'rsatkichlar uchun.
   - DIQQAT: "view_kassa_balans" va "view_ai_xulosa" da "sana_vaqt" ustuni UMUMAN YO'Q! O'tgan sanalar (masalan: 16.10.2026, kecha, o'tgan hafta, ma'lum davr) uchun ushbu VIEW lardan foydalanmang va ularga HECH QACHON "WHERE sana_vaqt = ..." deb yozmang (aks holda "column sana_vaqt does not exist" xatosi beradi)!
   - O'tgan sanadagi yoki bugungi operatsiyalar ro'yxati uchun DOIMO asosiy jadvallardan foydalaning:
     * savdolar
     * rasxodlar
     * qarz_tolovlari
     * kassa_harakatlari

3. HISOBOT TURLARI VA MOS JADVALLAR:
   A) "SAVDO", "SAVDOLAR HISOBOTI", "BUGUNGI SAVDOLAR", "SOTUVLAR RO'YXATI":
      - Foydalanuvchi qilingan savdolar, sotuvlar yoki cheklar ro'yxatini so'raganda:
      - Jadval: savdolar (LEFT JOIN mijozlar m ON savdolar.mijoz_id = m.id)
      - Shart: holat != 'bekor_qilindi'
      - Misol SQL:
        SELECT s.raqam, s.sana_vaqt, s.valyuta, s.jami_summa, s.tolangan_summa, s.qarz_summa, s.tolov_turi, s.xodim, s.izoh, m.nom AS mijoz_nomi, m.telefon AS mijoz_telefoni
        FROM savdolar s
        LEFT JOIN mijozlar m ON s.mijoz_id = m.id
        WHERE s.holat != 'bekor_qilindi' AND (s.sana_vaqt AT TIME ZONE 'Asia/Tashkent')::date = '2026-10-18'
        ORDER BY s.sana_vaqt ASC

   B) "KIRIM", "KASSA KIRIMI", "TUSHUMLAR", "KUNLIK KIRIM", "QANCHA PUL TUSHDI":
      - DO'KONDA KIRIM (TUSHUM) DEB SAVDOLARDAN KELIB TUSHGAN PUL (tolangan_summa) VA ESKI QARZ TO'LOVLARIDAN QAYTGAN PULLAR TUSHUNILADI!
      - Usul 1 (Tavsiya etiladi - Kassa harakatlaridan to'liq kirimlar):
        SELECT kh.id, kh.sana_vaqt, kh.amal, kh.summa, kh.valyuta, kh.manba_turi, kh.izoh, h.nom AS hisob_nomi
        FROM kassa_harakatlari kh
        LEFT JOIN hisoblar h ON kh.hisob_id = h.id
        WHERE kh.amal = 'kirim' AND (kh.sana_vaqt AT TIME ZONE 'Asia/Tashkent')::date = '2026-10-16'
        ORDER BY kh.sana_vaqt ASC
      - Usul 2 (Savdo tushumlari va qarz qaytishlarini birlashtirib):
        SELECT 'savdo' AS turi, s.raqam::text AS hujjat, s.sana_vaqt, s.tolangan_summa AS summa, s.valyuta, s.tolov_turi, m.nom AS mijoz_nomi
        FROM savdolar s LEFT JOIN mijozlar m ON s.mijoz_id = m.id
        WHERE s.holat != 'bekor_qilindi' AND s.tolangan_summa > 0 AND (s.sana_vaqt AT TIME ZONE 'Asia/Tashkent')::date = '2026-10-16'
        UNION ALL
        SELECT 'qarz_tolov' AS turi, q.id::text AS hujjat, q.sana_vaqt, q.summa, q.valyuta, q.tolov_turi, m.nom AS mijoz_nomi
        FROM qarz_tolovlari q LEFT JOIN mijozlar m ON q.mijoz_id = m.id
        WHERE (q.sana_vaqt AT TIME ZONE 'Asia/Tashkent')::date = '2026-10-16'
        ORDER BY sana_vaqt ASC

   C) "CHIQIM", "RASXOD", "XARAJATLAR", "KUNLIK CHIQIM":
      - Jadval: rasxodlar (LEFT JOIN hisoblar h ON rasxodlar.hisob_id = h.id)
      - Shart: holat != 'bekor_qilindi'
      - Misol SQL:
        SELECT r.id, r.sana_vaqt, r.summa, r.valyuta, r.kategoriya, r.tolov_turi, r.izoh, r.xodim, h.nom AS hisob_nomi
        FROM rasxodlar r
        LEFT JOIN hisoblar h ON r.hisob_id = h.id
        WHERE r.holat != 'bekor_qilindi' AND (r.sana_vaqt AT TIME ZONE 'Asia/Tashkent')::date = '2026-10-16'
        ORDER BY r.sana_vaqt ASC

   D) "KUNLIK HISOBOT", "MOLIYAVIY HISOBOT", "KIRIM VA CHIQIM ALOHIDA":
      - Foydalanuvchi kunlik to'liq hisobot so'raganda o'sha kungi savdolar, qarz to'lovlari va chiqimlarni taqdim eting:
        SELECT
          'savdo' AS bolim, COALESCE(SUM(jami_summa), 0) AS jami_summa, COALESCE(SUM(tolangan_summa), 0) AS tushum, COALESCE(SUM(qarz_summa), 0) AS nasiya, valyuta
        FROM savdolar WHERE holat != 'bekor_qilindi' AND (sana_vaqt AT TIME ZONE 'Asia/Tashkent')::date = '2026-10-16' GROUP BY valyuta
        UNION ALL
        SELECT 'qarz_qaytgan' AS bolim, 0, COALESCE(SUM(summa), 0), 0, valyuta
        FROM qarz_tolovlari WHERE (sana_vaqt AT TIME ZONE 'Asia/Tashkent')::date = '2026-10-16' GROUP BY valyuta
        UNION ALL
        SELECT 'chiqim' AS bolim, COALESCE(SUM(summa), 0), 0, 0, valyuta
        FROM rasxodlar WHERE holat != 'bekor_qilindi' AND (sana_vaqt AT TIME ZONE 'Asia/Tashkent')::date = '2026-10-16' GROUP BY valyuta

   E) "MIJOZLAR QARZLARI" ("Mijozlarimizning qarzi qancha?", "Qarzdorlar ro'yxati", "Nasiyalar qancha?", "Kimlar qarzdor?"):
      - Bu mijozlarning do'konga to'lashi kerak bo'lgan nasiya qarzlari!
      - Umumiy mijozlar qarzi summasi:
        SELECT COALESCE(SUM(qarz_uzs), 0) AS jami_qarz_uzs, COALESCE(SUM(qarz_usd), 0) AS jami_qarz_usd, COUNT(*) AS qarzdor_mijozlar_soni
        FROM mijozlar WHERE (qarz_uzs > 0 OR qarz_usd > 0) AND faol = true
      - Eng katta qarzdor mijozlar ro'yxati:
        SELECT nom, telefon, qarz_uzs, qarz_usd
        FROM mijozlar WHERE (qarz_uzs > 0 OR qarz_usd > 0) AND faol = true
        ORDER BY qarz_uzs DESC LIMIT 15
      - Bitta aniq mijoz qarzi so'ralganda:
        SELECT nom, telefon, qarz_uzs, qarz_usd FROM mijozlar WHERE nom_norm ILIKE '%akrom%'

   F) "BIZNING QARZLARIMIZ" / "TASHQI QARZLAR" ("Bizning joriy qarzlarimiz qancha?", "Biz kimdan qancha qarzmiz?", "Tanishlardan olingan qarzlar"):
      - Bu do'kon rahbarining tanishlar, sheriklar yoki yetkazib beruvchilardan olgan qarzlari (biz qaytarib berishimiz kerak bo'lgan summa)!
      - Bizning umumiy qarzimiz summasi:
        SELECT COALESCE(SUM(biz_berishimiz_kerak), 0) AS jami_bizning_qarzimiz, valyuta
        FROM view_tashqi_qarzlar_balans WHERE biz_berishimiz_kerak > 0 GROUP BY valyuta
      - Shaxslar bo'yicha kimdan qancha qarzmiz:
        SELECT shaxs_nomi, biz_berishimiz_kerak, valyuta
        FROM view_tashqi_qarzlar_balans WHERE biz_berishimiz_kerak > 0
        ORDER BY biz_berishimiz_kerak DESC
      - Shuningdek biz boshqalarga bergan qarzlar so'ralsa ("Biz kimga qarz berganmiz?", "Bizning haqqimiz"):
        SELECT shaxs_nomi, biz_olishimiz_kerak, valyuta
        FROM view_tashqi_qarzlar_balans WHERE biz_olishimiz_kerak > 0
        ORDER BY biz_olishimiz_kerak DESC

   G) "KASSA QOLDIG'I", "HISOB BALANSI", "KARTADAGI PUL", "JORIY BALANSLAR":
      - Foydalanuvchi kassadagi, xodimdagi yoki kartadagi joriy qoldiqni so'raganda view_kassa_balans dan foydalaning!
      - Barcha kassalar/hisoblar balansi:
        SELECT kassa_nomi, kassa_turi, joriy_balans, valyuta FROM view_kassa_balans ORDER BY kassa_nomi
      - Bitta aniq shaxs, karta yoki kassa qoldig'i (masalan: "Qahramon kartasidagi qoldiq", "Asosiy kassa qoldig'i", "Plastik balansi"):
        SELECT kassa_nomi, kassa_turi, joriy_balans, valyuta FROM view_kassa_balans WHERE kassa_nomi ILIKE '%Qahramon%'
      - DIQQAT: view_kassa_balans da (hisob_id, kassa_nomi, kassa_turi, valyuta, joriy_balans) ustunlari mavjud! Unda "sana_vaqt" ustuni YO'Q!

4. JADVAL USTUNLARI ANIQ TAVSIFI:
   - hisoblar: (id, nom, turi ['naqd'|'plastik'|'bank'|'boshqa'], valyuta ['UZS'|'USD'], joriy_balans, faol)
   - view_kassa_balans: (hisob_id, kassa_nomi, kassa_turi, valyuta, joriy_balans) - barcha kassalar va kartalar jonli balansi!
   - savdolar: (id, raqam, sana_vaqt, mijoz_id, valyuta, jami_summa, tolangan_summa, qarz_summa, tolov_turi, hisob_id, holat, xodim, izoh)
   - rasxodlar: (id, sana_vaqt, summa, valyuta, kategoriya, tolov_turi, hisob_id, izoh, xodim, holat)
   - qarz_tolovlari: (id, sana_vaqt, mijoz_id, summa, valyuta, tolov_turi, hisob_id, xodim, izoh)
   - kassa_harakatlari: (id, sana_vaqt, amal ['kirim'|'chiqim'], summa, valyuta, manba_turi ['savdo'|'rasxod'|'qarz_tolov'|'transfer'|'boshlangich'], hisob_id, izoh)
   - tovarlar: (id, nom, model, shtrixkod, birlik, tannarx, narx_optom, narx_chakana, valyuta, qoldiq, faol, yaratilgan). DIQQAT: tovarlarda 'sana_vaqt' yo'q, 'yaratilgan' bor!
   - mijozlar: (id, nom, nom_norm, telefon, manzil, qarz_uzs, qarz_usd, faol)
   - tashqi_qarzlar: (id, sana_vaqt, shaxs_nomi, shaxs_nomi_norm, amal, summa, valyuta, maqsad, hisob_id, holat)
   - view_tashqi_qarzlar_balans: (shaxs_nomi, valyuta, jami_olingan, jami_qaytarilgan, jami_berilgan, jami_qaytgan, biz_berishimiz_kerak, biz_olishimiz_kerak)
     * "Kimlardan qancha qarzimiz bor?" -> SELECT shaxs_nomi, biz_berishimiz_kerak, valyuta FROM view_tashqi_qarzlar_balans WHERE biz_berishimiz_kerak > 0
     * "Kimlar bizdan qarzdor?" / "Biz bergan qarzlar" -> SELECT shaxs_nomi, biz_olishimiz_kerak, valyuta FROM view_tashqi_qarzlar_balans WHERE biz_olishimiz_kerak > 0
     * Bitta aniq tanish qoldig'i -> SELECT * FROM view_tashqi_qarzlar_balans WHERE shaxs_nomi_norm ILIKE '%akmal%'


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
