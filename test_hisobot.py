# -*- coding: utf-8 -*-
"""Oflayn test: namuna Excel'lar + sinov to'lovlari → hisobot matni va Excel."""
import os, sys, tempfile
from datetime import date

import config
config.DB_FAYL = os.path.join(tempfile.mkdtemp(), "test.db")  # haqiqiy bazaga tegmaydi
import ainur, db, hisobot

papka = sys.argv[1] if len(sys.argv) > 1 else "namuna"
sana = date(2026, 9, 25)
for f in sorted(os.listdir(papka)):
    if f.endswith(".xlsx"):
        tur, q = ainur.excel_oqi(os.path.join(papka, f))
        db.fayl_saqla(sana.isoformat(), tur, "2026-09-25 18:45:00", 1, "Anvar", f, q)
        print(hisobot.fayl_xulosa(tur, q, sana), "\n")

# Summa o'qish tekshiruvi
for s, kut in [("1500000", 1500000), ("1 500 000", 1500000), ("1.500.000", 1500000),
               ("1,5 mln", 1500000), ("800 ming", 800000), ("500k", 500000), ("abc", None), ("0", None)]:
    assert hisobot.summa_oqi(s) == kut, (s, hisobot.summa_oqi(s))
assert hisobot.sana_oqi("24.09", sana) == date(2026, 9, 24)
assert hisobot.sana_oqi("01/09/26", sana) == date(2026, 9, 1)

# Sinov to'lovlari (NAMUNA)
m1 = db.mijoz_qosh("Sodiqjon aka"); m2 = db.mijoz_qosh("Bobojon og'a")
assert db.mijoz_qidir("sodiqjon  AKA")[0]["id"] == m1["id"]          # aniq moslik
assert db.mijoz_qidir("sodiq")[1][0]["id"] == m1["id"]               # qisman moslik
db.tolov_qosh(sana.isoformat(), "10:15:00", m1["id"], 15000000, "Naqd", "Eski qarz", 1, "Anvar")
db.tolov_qosh(sana.isoformat(), "12:40:00", m2["id"], 8000000, "Plastik", "Bugungi savdo", 2, "Jonibek")
t = db.tolov_qosh(sana.isoformat(), "13:05:00", m2["id"], 999, "Naqd", "Eski qarz", 2, "Jonibek")
db.tolov_bekor(t, "Jonibek, 25.09 13:06")                             # bekor qilingani hisobga kirmaydi
db.tolov_qosh(sana.isoformat(), "16:20:00", m1["id"], 20000000, "Perechisleniya", "Eski qarz", 1, "Anvar")

matn = hisobot.kunlik_matn(sana)
for b in hisobot.bolaklarga(matn):
    assert len(b) < 4096
print("\n".join(matn))
yol = os.path.join(tempfile.gettempdir(), "Hisobot20260925.xlsx")
hisobot.kunlik_excel(sana, yol)
print("\nExcel:", yol)
print("OK — barcha tekshiruvlar o'tdi")
