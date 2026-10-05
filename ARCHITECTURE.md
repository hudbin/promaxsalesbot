# PROMAX B2B STORE - Arxitektura (Architecture)

Ushbu hujjat AI agentlar va yangi dasturchilar loyihani yaxshiroq tushunishi uchun loyihaning tuzilishi, ishlatilgan texnologiyalar va tizim arxitekturasini tushuntiradi.

## 🌟 Umumiy Arxitektura

Loyiha ikkita asosiy qismdan iborat bo'lgan **Serverless (Bulutli)** arxitekturaga asoslangan Telegram Bot va Mini App (Web App) hisoblanadi.

Tizim quyidagi asosiy qismlardan iborat:
1. **Telegram Webhook (Backend)** - Netlify Functions orqali ishlaydi.
2. **Telegram Mini App (Frontend)** - React va Vite asosida qurilgan.
3. **Ma'lumotlar Bazasi** - Supabase (PostgreSQL).
4. **AI Tahlilchi** - Google Gemini API (Ovozli va matnli xabarlarni tushunish uchun).
5. *(Eski/Lokal versiya)* - `bot.py` va `ainur.py` orqali lokal kompyuterda (AinurPOS bilan integratsiyada) ishlovchi zaxira tizimi.

---

## 🏗️ 1. Backend: Netlify Functions (Serverless)

Asosiy API va Telegram bot logikasi `api/` papkasida (yoki Netlify functions da) joylashgan. Loyiha Netlify-da joylashtiriladi va 24/7 bepul ishlaydi.

- **`api/telegram-webhook.ts`**: Telegram botning asosiy Webhook fayli. 
  - Foydalanuvchilardan kelgan matn yoki ovozli xabarlarni (audio/ogg) qabul qiladi.
  - **Google Gemini AI** orqali xabarni JSON (Tranzaksiya turi: savdo, rasxod, qarz_tolov, tovar_kirim, savol) formatiga o'tkazadi.
  - Xodimlar (Admin/Sotuvchi) ruxsatlarini tekshiradi va telefon raqam orqali avtorizatsiya qiladi.
  - Supabase RPC funksiyalarini chaqirib baza bilan ishlaydi.
  
- **`api/daily-report.ts` / `api/send-report.ts`**: Har kuni (masalan soat 20:00 da) avtomatik ravishda kunlik hisobotni guruhga yuboruvchi Netlify Cron Job / Webhook funksiyalari.

---

## 💻 2. Frontend: Telegram Mini App (React + Vite)

Telegram ichida ochiladigan do'konning boshqaruv interfeysi `frontend/` papkasida joylashgan.

**Texnologiyalar stack-i:**
- **React (v19) + TypeScript**
- **Vite** - Loyihani yig'ish va tezkor ishga tushirish uchun.
- **Tailwind CSS + shadcn/ui** - Zamonaviy va responsiv UI komponentlari uchun.
- **Supabase JS Client** - To'g'ridan-to'g'ri bazaga ulanish va ma'lumotlarni o'qish/yozish uchun.
- **Lucide React** - Ikonkalar.
- **XLSX & jsPDF** - Hisobotlarni Excel va PDF formatda yuklab olish uchun.

**Asosiy bo'limlar (Routes/Components):**
- 🛒 **Sotuv:** Tovarlarni qidirish, savatga qoshish, mijozni tanlash va savdo qilish (naqd/qarz).
- 💸 **Chiqim (Rasxod):** Tezkor xarajatlarni (obed, taksi, va h.k.) kiritish.
- 📒 **Qarzlar:** Mijozlarning qarzdorligi ro'yxati va qarz to'lovlarini qabul qilish.
- 💰 **Kassa:** Naqd (so'm/dollar), plastik va bank hisoblari bo'yicha kirim-chiqimlarni monitoring qilish.
- 📦 **Ombor:** Tovarlar qoldig'i va narxlarini ko'rish.

---

## 🗄️ 3. Ma'lumotlar Bazasi: Supabase (PostgreSQL)

Barcha ma'lumotlar Supabase'da saqlanadi. Loyihaning DB strukturasi `supabase/schema.sql` faylida ko'rsatilgan.

**Asosiy jadvallar:**
- `xodimlar`: Botdan foydalanish ruxsatiga ega xodimlar va adminlar.
- `tovarlar`: Ombor qoldig'i, tannarx va sotish narxlari.
- `mijozlar`: B2B mijozlar va ularning umumiy qarzdorliklari.
- `savdolar`: Qilingan savdolar, to'lov va qarz summalari.
- `rasxodlar`: Kunlik xarajatlar.
- `qarz_tolovlari`: Mijozlar tomonidan qaytarilgan qarzlar.
- `tranzaksiya_qoralama`: AI orqali aniqlangan, lekin hali admin/sotuvchi tasdiqlamagan vaqtinchalik tranzaksiyalar.

**RPC (Remote Procedure Call) funksiyalar:**
Tranzaksiyalarni (masalan, savdo qilinganda tovar qoldig'ini ayirish va mijoz qarzini oshirish) xavfsiz, yagona tranzaksiyada (ACID) bajarish uchun `fn_savdo_yaratish`, `fn_rasxod_yaratish`, `fn_qarz_tolov_yaratish` kabi funksiyalar yozilgan.

---

## 🤖 4. Gemini AI Integratsiyasi

Sotuvchilarning ishini osonlashtirish uchun tizim Google Gemini modelidan foydalanadi (asosan `api/telegram-webhook.ts` ichida).

1. Sotuvchi botga ovozli xabar yuboradi: *"Obedga 75 ming naqd ketdi"*
2. Telegram bot Webhook orqali ovozli faylni qabul qiladi.
3. Gemini AI ovozni eshitib, toza JSON ga aylantiradi: 
   `{"amal": "rasxod", "kategoriya": "Ovqatlanish", "jami_summa": 75000, "valyuta": "UZS"}`
4. Bot xodimga tasdiqlash tugmasini (Inline Keyboard) yuboradi.
5. Tasdiqlangach, Supabase orqali ma'lumot bazaga saqlanadi.

---

## ⚙️ 5. Eski / Lokal Versiya (Python)

Loyiha tarkibida `bot.py`, `ainur.py`, `mini_server.py` va `config.py` kabi fayllar mavjud. Bu tizimning "AinurPOS" bilan integratsiya qilingan, lokal kompyuterda ishlovchi zaxira yoki oldingi versiyasi bo'lishi mumkin.
Bu qism:
- `python-telegram-bot` kutubxonasida yozilgan.
- Ma'lumotlarni lokal SQLite (`promax_hisobot.db`) va AinurPOS API dan oladi.
- `cloudflared` orqali lokal serverni internetga chiqaradi (mini_server.py uchun).

> **Muhim:** Yangi arxitektura asosan `api/` (Webhook) va `frontend/` (React) qismlariga qaratilgan bo'lib, Supabase orqali 100% bulutda (Serverless) ishlaydi. Shuning uchun loyihani rivojlantirishda birinchi navbatda shu qismlarga e'tibor qaratish lozim.
