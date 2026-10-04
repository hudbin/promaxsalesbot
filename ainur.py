# -*- coding: utf-8 -*-
"""
AinurPOS Excel hisobotlarini o'qish.

Qo'llab-quvvatlanadigan hisobotlar (ustun nomlari bo'yicha avtomatik aniqlanadi):
  1) "sotuv"  — Tovarlar bo'yicha savdo: Nomi, Shtrix-kod, Daromad, Foyda,
                 Sebest..., Sotish, Sotilgan
  2) "qoldiq" — Tovar harakati: Nomi, Shtrix-kod, Dastlabki qoldiq, Kelish,
                 Iste'mol, Yakuniy qoldiq
Interfeys rus tiliga o'tkazilsa ham ishlashi uchun ruscha nomlar ham qo'shilgan.
"""
import re
import openpyxl

import config

# --- Ustun sinonimlari: (maydon, [aniq nomlar], [boshlanishi]) -------------
SOTUV_USTUN = {
    "nomi":     (["nomi", "наименование", "название", "name"], []),
    "shtrix":   (["shtrix-kod", "штрихкод", "штрих-код", "barcode"], []),
    "daromad":  (["daromad", "выручка", "revenue"], []),
    "foyda":    (["foyda", "прибыль", "profit"], []),
    "tannarx":  ([], ["sebest", "себест"]),
    "sotish":   (["sotish", "продажи", "кол-во продаж"], []),
    "sotilgan": (["sotilgan", "продано", "sold"], []),
}
QOLDIQ_USTUN = {
    "nomi":    (["nomi", "наименование", "название", "name"], []),
    "shtrix":  (["shtrix-kod", "штрихкод", "штрих-код", "barcode"], []),
    "boshl":   (["dastlabki qoldiq", "начальный остаток"], []),
    "kelish":  (["kelish", "приход"], []),
    "istemol": (["iste'mol", "istemol", "расход"], []),
    "yakuniy": (["yakuniy qoldiq", "конечный остаток"], []),
}
# Hisobot turini aniqlash uchun majburiy ustunlar
MAJBURIY = {
    "sotuv": ("nomi", "daromad", "sotilgan"),
    "qoldiq": ("nomi", "kelish", "yakuniy"),
}


class NotanishHisobot(Exception):
    """Excel tanilmadi — foydalanuvchiga ustunlar ro'yxati ko'rsatiladi."""


def _norm(s):
    """Sarlavhani solishtirish uchun normallashtirish."""
    s = str(s or "").strip().lower()
    for a in "ʻʼ‘’`":
        s = s.replace(a, "'")
    return re.sub(r"\s+", " ", s)


def _son(v):
    """Katak qiymatini songa aylantirish ('1 200,5' → 1200.5)."""
    if v is None or v == "":
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace("\u00a0", "").replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _ustunlarni_top(sarlavha, lugat):
    """Sarlavha qatoridan maydon → ustun indeksi xaritasini yasash."""
    xarita = {}
    for i, h in enumerate(sarlavha):
        h = _norm(h)
        if not h:
            continue
        for maydon, (aniq, bosh) in lugat.items():
            if maydon in xarita:
                continue
            if h in aniq or any(h.startswith(b) for b in bosh):
                xarita[maydon] = i
                break
    return xarita


def excel_oqi(yol):
    """
    Excel faylni o'qib (tur, qatorlar) qaytaradi.
    tur: "sotuv" | "qoldiq"; qatorlar: dict ro'yxati.
    """
    wb = openpyxl.load_workbook(yol, data_only=True, read_only=True)
    ws = wb.worksheets[0]
    satrlar = list(ws.iter_rows(values_only=True))
    wb.close()

    # Sarlavha qatorini birinchi 15 qatordan qidiramiz
    for idx, satr in enumerate(satrlar[:15]):
        for tur, lugat in (("sotuv", SOTUV_USTUN), ("qoldiq", QOLDIQ_USTUN)):
            xarita = _ustunlarni_top(satr, lugat)
            if all(m in xarita for m in MAJBURIY[tur]):
                return tur, _qatorlar(satrlar[idx + 1:], xarita, lugat)

    birinchi = [str(x) for x in (satrlar[0] if satrlar else []) if x not in (None, "")]
    raise NotanishHisobot(", ".join(birinchi[:12]) or "bo'sh fayl")


def _qatorlar(satrlar, xarita, lugat):
    natija = []
    for satr in satrlar:
        nomi = satr[xarita["nomi"]] if xarita["nomi"] < len(satr) else None
        nomi = re.sub(r"\s+", " ", str(nomi or "")).strip()
        # Bo'sh va "Jami/Итого" qatorlarini tashlab ketamiz
        if not nomi or _norm(nomi) in ("jami", "итого", "всего", "total"):
            continue
        q = {"nomi": nomi}
        for maydon in lugat:
            if maydon == "nomi":
                continue
            i = xarita.get(maydon)
            v = satr[i] if i is not None and i < len(satr) else None
            q[maydon] = str(v or "").strip() if maydon == "shtrix" else _son(v)
        natija.append(q)
    return natija


# --- Model bo'yicha guruhlash -----------------------------------------------
_RANG = set(config.RANG_SOZLARI)
_TON = {"T", "OCH", "O", "TO'Q", "TOQ"}  # to'q / och belgilari


def rangsiz(nomi):
    """Nom oxiridagi rang so'zlarini olib tashlaydi: '5007 OCH SINIY' → '5007'."""
    s = re.sub(r"\s+", " ", nomi.upper()).strip()
    s = re.sub(r"^(\d+)([A-ZА-Я])", r"\1 \2", s)  # '9001PAXMOQ' → '9001 PAXMOQ'
    t = s.split(" ")
    while len(t) > 1:
        if t[-1] in _RANG:
            t.pop()
        elif t[-1] == "RANG":  # '16 RANG', 'NOMALUM RANG'
            t.pop()
            if len(t) > 1 and (t[-1].isdigit() or t[-1] == "NOMALUM"):
                t.pop()
        elif t[-1] in _TON:
            t.pop()
        else:
            break
    return " ".join(t)


def modellarga_guruhla(qatorlar):
    """
    Sotuv qatorlarini model bo'yicha jamlaydi.
    Qoida: nom raqamli kod bilan boshlansa (5007, 3002...) — kod bo'yicha,
    aks holda rangsiz nom bo'yicha. config.MODEL_ALIAS qo'lda birlashtirish uchun.
    """
    guruh = {}
    for q in qatorlar:
        nom = rangsiz(q["nomi"])
        nom = config.MODEL_ALIAS.get(nom, nom)
        kod = nom.split(" ")[0]
        kalit = kod if kod.isdigit() else nom
        g = guruh.setdefault(kalit, {"model": nom, "dona": 0.0, "summa": 0.0,
                                     "sotish": 0.0, "narxsiz_dona": 0.0,
                                     "pozitsiya": 0, "narxlar": {}})
        # Ko'rinadigan nom: eng to'liq (uzun) variant
        if len(nom) > len(g["model"]):
            g["model"] = nom
        g["dona"] += q["sotilgan"]
        g["summa"] += q["daromad"]
        g["sotish"] += q["sotish"]
        g["pozitsiya"] += 1
        if q["sotilgan"] > 0 and q["daromad"] == 0:
            g["narxsiz_dona"] += q["sotilgan"]
        if q["sotilgan"] > 0:  # narx → dona
            narx = round(q["daromad"] / q["sotilgan"], -2)
            g["narxlar"][narx] = g["narxlar"].get(narx, 0) + q["sotilgan"]
    # Summa, keyin dona bo'yicha kamayish tartibida
    return sorted(guruh.values(), key=lambda g: (-g["summa"], -g["dona"]))
