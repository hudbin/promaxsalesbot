# -*- coding: utf-8 -*-
"""PROMAX kunlik hisobot boti — sozlamalar. Faqat shu faylni tahrirlang."""

# BotFather'dan olingan token (hech kimga ko'rsatmang)
BOT_TOKEN = "BU_YERGA_BOT_TOKENINI_QOYING"

# AinurPOS → Integratsiyalar → Connect API → Readonly token.
# Bo'sh qolsa — bot Excel rejimida ishlaydi.
AINUR_TOKEN = ""

VAQT_ZONASI = "Asia/Tashkent"

# Kunlik yakuniy hisobot guruhga yuboriladigan vaqt (SS:DD)
HISOBOT_VAQTI = "20:00"
# Shu vaqtgacha savdo Excel yuklanmasa — guruhga eslatma
ESLATMA_VAQTI = "19:00"
# Kunlik hisobotdan keyin guruhga qo'shimcha: haftalik (oxirgi 7 kun) — shu kuni
# (0=Dushanba ... 5=Shanba, 6=Yakshanba; None — o'chiq) va oylik (har oyning 1-sanasi)
HAFTALIK_KUN = 5
OYLIK_HISOBOT = True
# Kirim-chiqim lentasi: AinurPOS'ni necha daqiqada bir tekshirish
LENTA_DAQIQA = 3
# Ish kunlari: 0=Dushanba ... 6=Yakshanba
ISH_KUNLARI = (0, 1, 2, 3, 4, 5, 6)

# To'lov turlari: nomi → belgi (AinurPOS turlari shu nomlarga moslanadi).
# masalan: "Naqd USD": "💲",
TOLOV_TURLARI = {
    "Naqd": "💵",
    "Plastik": "💳",
    "Perechisleniya": "🏦",
}
VALYUTA = "so'm"

# --- Mini app (Telegram ichidagi sotuv ilovasi) ---
MINI_PORT = 8480        # kompyuterdagi ichki port
MINI_URL = ""           # doimiy HTTPS manzil (server bo'lsa). Bo'sh — cloudflared tunnel
# AinurPOS'ga yuboriladigan to'lov turi nomlari (kerak bo'lsa moslashtiriladi)
TOLOV_API = {"Naqd": "cash", "Plastik": "card", "Perechisleniya": "transfer"}

# Ichki hujjatlar mijozi (savdo emas: ombor→magazin va h.k.) — savdo va qarzga qo'shilmaydi,
# hisobotda «Narxsiz / ichki chiqim» blokida alohida ko'rsatiladi.
ICHKI_MIJOZLAR = ["X"]

# Qarzdorlik: necha kunlik AinurPOS hujjatlari hisobga olinadi (AinurPOS ishlatilgan davr)
QARZ_DAVRI_KUN = 180
# Menyu (Mijozlar/Qarzdorlik) ma'lumotini AinurPOS'dan qayta olish oralig'i, daqiqa
KESH_DAQIQA = 10

# Model nomidan olib tashlanadigan rang so'zlari (katta harfda)
RANG_SOZLARI = [
    "SINIY", "YASHIL", "QAXVA", "QAHVA", "JGAR", "JIGAR", "BEJ", "QORA", "OQ",
    "MALOCHNIE", "MALICHNIE", "XARDOL", "HARDOL", "ANTRAST", "ANTRASIT",
    "BALOTA", "BARDO", "BARDOVIY", "PERSIKI", "SERIY", "XAKKE", "MOKRIY",
    "VALYUTA", "ARALASH", "NOMALUM",
]

# Qo'lda birlashtirish: "rangsiz nom" → "model nomi".
# Xato yozilgan yoki kodsiz kiritilgan tovarlarni bitta modelga yig'ish uchun.
MODEL_ALIAS = {
    "VELIKAN UZUN": "VELEKAN UZUN",
    "VELEKAN UZUNVELEKAN UZUN": "VELEKAN UZUN",
    # Tasdiqlansa izohdan chiqaring:
    # "PAGON UZUN": "5017 PAGON UZUN",
    # "PALASA UZUN": "2042 PALASA UZUN",
}

# Ma'lumotlar bazasi va yuklangan Excel fayllar papkasi
DB_FAYL = "promax_hisobot.db"
FAYL_PAPKA = "yuklangan"
