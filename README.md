# PROMAX B2B STORE & KASSA TIZIMI

Promax do'koni uchun zamonaviy, 100% bulutli (Serverless) savdo, xarajatlar va pul oqimini (Kassa) boshqarish tizimi.

## 🌟 Tizim Imkoniyatlari
- **0$ Server Xarajati**: Doimiy ishlaydigan VPS yoki kompyuterni yoqib qo'yish shart emas. Netlify va Supabase bepul tariflarida 24/7 ishlaydi.
- **🎙 Gemini AI Ovozli va Matnli Xabarlar**: Sotuvchilar va do'kon rahbari (40+ yosh) Telegramga o'zbek tilida ovozli yoki qisqa matn yuboradi (masalan: *"Obedga 75 ming naqd ketdi"* yoki *"Akrom akaga 50 ta velikan berdim 200$ naqd 100$ qarz"*). AI buni tushunib, 1 ta tugma orqali tasdiqlash kartochkasi chiqaradi.
- **📱 Zamonaviy Telegram Mini App (shadcn/ui)**:
  - `🛒 Sotuv`: Mahsulot rasmi, narxi, qoldig'i, mijoz va savat.
  - `💸 Chiqim`: Katta tugmalar orqali xarajatlarni (Obed, Taksi, Elektr, Ijara...) 3 soniyada kiritish.
  - `📒 Qarzlar`: B2B qarzdorlar ro'yxati va qarz to'lash.
  - `💰 Kassa`: 4 ta kassa balansi (Naqd so'm, Naqd dollar, Karta, Bank hisobi) va kirim-chiqimlar oqimi.
  - `📦 Ombor`: Mahsulotlar ro'yxati va qoldiqlar.
- **📊 20:00 da Avtomatik Kunlik Hisobot**: Har kuni soat 20:00 da Telegram guruhiga kun yakunlari bo'yicha to'liq hisobot yuboriladi.

## 🚀 O'rnatish tartibi
Batafsil ko'rsatmalar [walkthrough.md](file:///C:/Users/ThinkPad%20X1/.gemini/antigravity/brain/30e3f2d9-c05e-475b-a15f-3401ce85bdaf/walkthrough.md) faylida keltirilgan.
1. `supabase/schema.sql` va `supabase/seed.sql` ni Supabase SQL Editor'da bajaring.
2. Loyihani GitHub orqali Netlify'ga ulang.
3. Telegram webhook'ni Netlify functions manziliga sozlang.
