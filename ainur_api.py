# -*- coding: utf-8 -*-
"""
AinurPOS Connect API v4 — rasmiy tavsif (Ainur POS Connect API 1.0.14) asosida.

  Manzil:        https://connect.ainur.app/api/v4
  Avtorizatsiya: X-AINUR-API-Access-Token sarlavhasi
  Savdo:         GET /documents/sales   (time_start/time_end "Y-m-d H:i:s", offset/limit ≤100)
                 — javobda sotuv VA qaytarish hujjatlari aralash keladi
  Qaytarish:     GET /documents/return?type=sales
  Mijozlar:      GET /customers

Tavsifda ichki obyektlar (customer, payment_terms, metrics, actor) tuzilishi
yozilmagan — ular ehtiyotkor usulda o'qiladi va /api buyrug'ida kalitlari
ko'rsatiladi, kerak bo'lsa aniq moslashtiriladi.
"""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import config
from ainur import _son

BAZA = "https://connect.ainur.app/api/v4"
TZ = ZoneInfo(config.VAQT_ZONASI)
LIMIT = 100  # API ruxsat bergan eng katta sahifa hajmi

# API to'lov turi nomi → config.TOLOV_TURLARI dagi nom
_TURLAR = {
    "Naqd": ("cash", "naqd", "налич", "nal"),
    "Plastik": ("card", "karta", "карт", "terminal", "uzcard", "humo", "plastik", "visa"),
    "Perechisleniya": ("transfer", "bank", "перечисл", "perechis", "wire", "безнал", "invoice"),
}


class APIXato(Exception):
    """Foydalanuvchiga ko'rsatiladigan tushunarli xato."""


def token():
    t = (getattr(config, "AINUR_TOKEN", "") or "").strip()
    return "" if (not t or "BU_YERGA" in t) else t


# --- HTTP ------------------------------------------------------------------------
UZILISH_DAQIQA = 3        # AinurPOS javob bermasa, shuncha vaqt qayta urinmaslik
_uzildi = {"vaqt": None}  # oxirgi ulanish xatosi vaqti


def uzilganmi():
    v = _uzildi["vaqt"]
    return v is not None and (datetime.now(TZ) - v).total_seconds() < UZILISH_DAQIQA * 60


def tez_tekshir():
    """AinurPOS tirikmi — 8 soniyada javob bermasa, uzilgan deb belgilanadi."""
    _get("/documents/sales", {"limit": 1}, timeout=8)


def _get(yol, prm=None, timeout=30):
    """GET so'rov → JSON. Xatolar APIXato ga aylantiriladi."""
    if not token():
        raise APIXato("config.py da AINUR_TOKEN yo'q.")
    if uzilganmi():
        raise APIXato(f"AinurPOS serveri javob bermayapti ({_uzildi['vaqt']:%H:%M} dan beri). "
                      "Internetni tekshiring, birozdan keyin qayta urinib ko'ring.")
    url = BAZA + yol + ("?" + urllib.parse.urlencode(prm, doseq=True) if prm else "")
    req = urllib.request.Request(url, headers={
        "X-AINUR-API-Access-Token": token(),
        "Accept": "application/json", "User-Agent": "PromaxBot/2.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            natija = json.loads(r.read().decode("utf-8"))
        _uzildi["vaqt"] = None
        return natija
    except urllib.error.HTTPError as e:
        matn = e.read().decode("utf-8", "replace")[:200]
        if e.code == 401:
            raise APIXato("Token qabul qilinmadi (401). AinurPOS → Connect API da token "
                          "borligini va «Saqlash» bosilganini tekshiring.")
        if e.code == 403:
            raise APIXato(f"Ruxsat yo'q (403): {matn}")
        raise APIXato(f"API xatosi {e.code}: {matn}")
    except Exception as e:  # internet yo'q / server javob bermayapti / vaqt tugadi
        _uzildi["vaqt"] = datetime.now(TZ)
        raise APIXato(f"AinurPOS'ga ulanib bo'lmadi: {e}")


def _hammasi(yol, prm):
    """offset/limit bilan barcha sahifalarni yig'ish."""
    natija = []
    for i in range(200):  # himoya: ko'pi bilan 20 000 yozuv
        d = _get(yol, dict(prm, offset=i * LIMIT, limit=LIMIT))
        r = d if isinstance(d, list) else ((d or {}).get("data") or [])
        natija += [x for x in r if isinstance(x, dict)]
        if len(r) < LIMIT:
            break
    return natija


KERAKLI = [("Savdo", "/documents/sales", {}),
           ("Qaytarish", "/documents/return", {"type": "sales"}),
           ("Kirim", "/documents/purchases", {}),
           ("Qoldiq tuzatish", "/documents/changes", {}),
           ("Mijozlar/qarz", "/customers", {})]


def tekshir():
    """Bot ishlatadigan har bir bo'limga ruxsatni tekshirish → [(nom, ok, izoh)]."""
    natija = []
    for nom, yol, prm in KERAKLI:
        try:
            _get(yol, dict(prm, limit=1))
            natija.append((nom, True, "ruxsat bor"))
        except APIXato as e:
            natija.append((nom, False, str(e)))
    return natija


def _davr_yigish(yol, bosh, oxir, prm=None):
    """[bosh, oxir] davrini 31 kunlik bo'laklarga bo'lib, hujjatlarni takrorsiz yig'ish."""
    natija, korilgan, d = [], set(), bosh
    while d <= oxir:
        e = min(d + timedelta(days=30), oxir)
        for x in _hammasi(yol, dict(prm or {}, time_start=f"{d} 00:00:00",
                                    time_end=f"{e} 23:59:59")):
            if x.get("id") not in korilgan:
                korilgan.add(x.get("id"))
                natija.append(x)
        d = e + timedelta(days=1)
    return natija


def mijozlar_royxati():
    """AinurPOS mijozlari: [{id, nom, telefon}]."""
    natija = []
    for m in _hammasi("/customers", {}):
        b = m.get("billing") if isinstance(m.get("billing"), dict) else {}
        natija.append({"id": m.get("id"), "nom": _nom(m) or "Nomsiz",
                       "telefon": str(m.get("phone") or b.get("phone") or "")})
    return natija


# --- Yordamchilar ------------------------------------------------------------------
def _vaqt(v):
    """ISO vaqtni Toshkent vaqtiga o'tkazish."""
    if not v:
        return None
    try:
        d = datetime.fromisoformat(str(v).replace("Z", "+00:00").replace(" ", "T", 1))
    except ValueError:
        return None
    return d.astimezone(TZ) if d.tzinfo else d.replace(tzinfo=TZ)


def _hujjat_vaqti(doc):
    tl = doc.get("timeline") if isinstance(doc.get("timeline"), dict) else {}
    return _vaqt(doc.get("processed_at") or tl.get("processed_at") or doc.get("created_at"))


def _nom(v):
    """Ism: name / full_name / title, bo'lmasa first_name + last_name."""
    if isinstance(v, dict):
        for k in ("name", "full_name", "title", "fio"):
            if v.get(k):
                return str(v[k]).strip()
        return " ".join(str(v[k]).strip() for k in ("first_name", "last_name") if v.get(k))
    return str(v or "").strip()


def _tur(kalit):
    s = str(kalit).lower()
    for tur, belgilar in _TURLAR.items():
        if any(b in s for b in belgilar):
            return tur
    return None


def _tolov_turlari(obj):
    """payment_terms ichidan to'lov turlari summasi: {tur: summa}."""
    turlar = {}

    def qosh(tur, v):
        turlar[tur] = turlar.get(tur, 0) + _son(v)

    def yur(o):
        if isinstance(o, list):
            for x in o:
                yur(x)
        elif isinstance(o, dict):
            # {type: "cash", sum: 100} ko'rinishi
            t = next((o[k] for k in ("type", "method", "payment_type", "name", "title")
                      if isinstance(o.get(k), str)), None)
            s = next((o[k] for k in ("sum", "amount", "value", "total")
                      if k in o and not isinstance(o[k], (dict, list, bool))), None)
            if t is not None and s is not None and _tur(t):
                qosh(_tur(t), s)
                return
            # {cash: 100, card: 50} ko'rinishi
            for k, v in o.items():
                if isinstance(v, (dict, list)):
                    yur(v)
                elif (not isinstance(v, bool) and _son(v) and _tur(k)
                      and not any(x in k.lower() for x in ("change", "rest", "сдач"))):
                    qosh(_tur(k), v)
    yur(obj)
    return {k: v for k, v in turlar.items() if v}


def _qarz_maydoni(mijoz):
    """Mijoz yozuvidan qarz summasini topish (tavsifda yozilmagan maydon)."""
    def qarzmi(k, v):
        return any(b in k.lower() for b in ("debt", "долг", "qarz")) and \
            not isinstance(v, (dict, list, bool))
    for k, v in mijoz.items():
        if qarzmi(k, v):
            return k, _son(v)
        if isinstance(v, dict):
            for k2, v2 in v.items():
                if qarzmi(k2, v2):
                    return f"{k}.{k2}", _son(v2)
    return None, None


def _tolov_holati(d, jami):
    """Hujjat bo'yicha to'langan summa va to'lov turlari."""
    pt = d.get("payment_terms") if isinstance(d.get("payment_terms"), dict) else {}
    mt = d.get("metrics") if isinstance(d.get("metrics"), dict) else {}
    turlar = _tolov_turlari(pt)
    paid = mt.get("paid_sum", pt.get("paid_sum"))
    kam = pt.get("underpayment")  # to'lanmagan qoldiq
    if (paid is None or isinstance(paid, bool) or not _son(paid)) and \
            kam is not None and not isinstance(kam, bool):
        paid = max(jami - _son(kam), 0)
    if paid is None or isinstance(paid, bool):
        paid = sum(turlar.values()) if turlar else (jami if d.get("financial_status") == "paid" else 0)
    paid = _son(paid)
    return (min(paid, jami) if jami else paid), turlar


def hujjatlar_davr(bosh, oxir, nomlar=None):
    """
    Davrdagi sotuv hujjatlarining to'lov holati — qarzdorlik va qarz to'lovlari uchun.
    Qarz = hujjat jami − to'langan (AinurPOS: underpayment).
    """
    nomlar = nomlar or {}
    try:
        qayt = {d.get("id") for d in _davr_yigish("/documents/return", bosh, oxir, {"type": "sales"})}
    except APIXato:
        qayt = set()
    natija = []
    for d in _davr_yigish("/documents/sales", bosh, oxir):
        if d.get("id") in qayt or (d.get("document_flags") or {}).get("deleted"):
            continue
        v = _hujjat_vaqti(d)
        jami = _son(d.get("total_price"))
        mid, mnom = _mijoz(d, nomlar)
        if jami <= 0 or ichkimi(mnom):  # ichki / narxsiz hujjat — qarz emas
            continue
        paid, turlar = _tolov_holati(d, jami)
        natija.append({
            "id": d.get("id"), "raqam": str(d.get("order_number") or d.get("name") or ""),
            "sana": v.date().isoformat() if v else "", "mijoz_id": mid,
            "mijoz": mnom,
            "jami": jami, "tolangan": paid, "turlar": turlar,
            "dona": sum(abs(_son(i.get("quantity"))) for i in d.get("line_items") or []
                        if isinstance(i, dict))})
    return natija


def _norm(s):
    s = (s or "").lower()
    for a in "ʻʼ‘’`":
        s = s.replace(a, "'")
    return re.sub(r"\s+", " ", s).strip()


_ICHKI = {_norm(x) for x in getattr(config, "ICHKI_MIJOZLAR", ["X"])}


def ichkimi(nom):
    """Ichki (savdo emas) hujjat mijozi: masalan ombor→magazin uchun «X»."""
    return _norm(nom) in _ICHKI


def _mijoz(d, nomlar):
    """
    Hujjat mijozi → (kalit, ism). DIQQAT: client_id — AinurPOS hisobi (kompaniya) ID si,
    hamma hujjatda bir xil; mijoz ID si customer.id da keladi.
    """
    cust = d.get("customer") if isinstance(d.get("customer"), dict) else {}
    mid = cust.get("id") or ""
    nom = _nom(cust) or nomlar.get(mid, "")
    return (mid or ("n:" + _norm(nom) if nom else "")), (nom or "Mijozsiz")


def _kalitlar(o):
    return "{" + ", ".join(list(o)[:12]) + "}" if isinstance(o, dict) else "yo'q"


# --- Asosiy funksiya -----------------------------------------------------------------
def kun_sotuvi(sana):
    return davr_sotuvi(sana, sana)


def davr_sotuvi(bosh, oxir):
    """
    Davr ma'lumotlari (bir kun yoki bir necha kun):
      qatorlar  — tovar qatorlari (nomi + narx bo'yicha jamlangan)
      hujjatlar — sotuv hujjatlari (mijoz, sotuvchi, jami, to'langan, to'lov turlari)
      qaytarish — qaytarish hujjatlari
      mijozlar  — [{id, nom, qarz|None}] (hozirgi holat)
      diag      — tekshiruv uchun ma'lumot
    """
    # Toshkent vaqti bo'yicha kun aniq chiqishi uchun ±1 kun olinib, keyin filtrlanadi
    d1, d2 = bosh - timedelta(days=1), oxir + timedelta(days=1)
    diag = {}

    diag["ogoh"] = []
    # 1) Mijozlar: ism va qarz (ixtiyoriy bo'lim)
    try:
        mijoz_xom = _hammasi("/customers", {})
    except APIXato as e:
        mijoz_xom = []
        diag["ogoh"].append(f"Mijozlar: {e}")
    mijozlar, nomlar = [], {}
    for m in mijoz_xom:
        k, q = _qarz_maydoni(m)
        if k:
            diag.setdefault("qarz_maydoni", k)
        mijozlar.append({"id": m.get("id"), "nom": _nom(m), "qarz": q})
        nomlar[m.get("id")] = _nom(m)
    diag["mijozlar"] = len(mijozlar)

    # 2) Qaytarishlar (sotuv ro'yxatidan chiqarib tashlash uchun ham kerak)
    try:
        qayt_xom = _davr_yigish("/documents/return", d1, d2, {"type": "sales"})
    except APIXato as e:
        qayt_xom = []
        diag["ogoh"].append(f"Qaytarish: {e}")
    qayt_idlar = {d.get("id") for d in qayt_xom}
    qaytarish = []
    for d in qayt_xom:
        v = _hujjat_vaqti(d)
        if not v or not (bosh <= v.date() <= oxir) or (d.get("document_flags") or {}).get("deleted"):
            continue
        qaytarish.append({
            "raqam": str(d.get("order_number") or d.get("name") or ""),
            "vaqt": v.strftime("%H:%M"),
            "mijoz": _mijoz(d, nomlar)[1],
            "dona": sum(abs(_son(i.get("quantity"))) for i in d.get("line_items") or []),
            "jami": _son(d.get("total_price"))})

    # 3) Sotuvlar
    try:
        sotuv_xom = _davr_yigish("/documents/sales", d1, d2)
    except APIXato as e:
        if "403" in str(e):
            raise APIXato("Savdo bo'limiga ruxsat yo'q (403). AinurPOS → Connect API → token "
                          "ACCESS ni «RO + Orders» qilib Saqlang yoki tarifda Connect API "
                          "hujjatlari borligini support'dan so'rang.")
        raise
    qator, hujjat = {}, []
    ichki_q, ichki_h = {}, []  # 0 so'mlik yoki ichki («X») hujjatlar — savdoga qo'shilmaydi
    for d in sotuv_xom:
        if d.get("id") in qayt_idlar or (d.get("document_flags") or {}).get("deleted"):
            continue
        v = _hujjat_vaqti(d)
        if not v or not (bosh <= v.date() <= oxir):
            continue
        if not diag.get("namuna"):  # birinchi hujjatning ichki obyektlari kalitlari
            diag["namuna"] = {k: _kalitlar(d.get(k)) for k in
                              ("customer", "payment_terms", "metrics", "actor", "document_flags")}
            diag["qiymat"] = {"payment_terms": d.get("payment_terms"),
                              "paid_sum": (d.get("metrics") or {}).get("paid_sum"),
                              "financial_status": d.get("financial_status"),
                              "total_price": d.get("total_price"),
                              "boshqa_kalitlar": [k for k in d if k not in (
                                  "id", "uuid", "name", "order_number", "created_at", "updated_at",
                                  "processed_at", "financial_status", "total_price", "subtotal_price",
                                  "total_discounts", "note", "location_id", "client_id", "user_id",
                                  "line_items", "customer", "source", "destination", "payment_terms",
                                  "document_flags", "metrics", "timeline", "references", "actor")]}
        items = [i for i in d.get("line_items") or [] if isinstance(i, dict)]
        royxat = sum(abs(_son(i.get("quantity"))) * _son(i.get("price")) for i in items)
        jami = _son(d.get("total_price")) or royxat
        _, mijoz_nomi = _mijoz(d, nomlar)
        ichki = ichkimi(mijoz_nomi) or jami == 0
        manzil_q = ichki_q if ichki else qator
        # Chegirma qatorlarga mutanosib taqsimlanadi — model summalari hujjat jami bilan mos
        k = jami / royxat if royxat else 1
        for i in items:
            soni, narx = abs(_son(i.get("quantity"))), _son(i.get("price")) * k
            nomi = re.sub(r"\s+", " ", str(i.get("title") or "?")).strip()
            q = manzil_q.setdefault((nomi, round(narx)), {
                "nomi": nomi, "shtrix": str(i.get("sku") or ""), "daromad": 0.0,
                "foyda": 0.0, "tannarx": 0.0, "sotish": 0.0, "sotilgan": 0.0})
            q["sotilgan"] += soni
            q["daromad"] += soni * narx
            q["sotish"] += 1
            ll = i.get("legacy_line") if isinstance(i.get("legacy_line"), dict) else {}
            if ll.get("cost"):  # tannarx (kassir huquqiga qarab bo'lmasligi mumkin)
                q["tannarx"] += _son(ll["cost"]) * soni
                q["foyda"] = q["daromad"] - q["tannarx"]
        paid, turlar = _tolov_holati(d, jami)
        (ichki_h if ichki else hujjat).append({
            "raqam": str(d.get("order_number") or d.get("name") or ""),
            "vaqt": v.strftime("%H:%M") if bosh == oxir else v.strftime("%d.%m %H:%M"),
            "mijoz": mijoz_nomi, "xodim": _nom(d.get("actor")),
            "jami": jami, "tolangan": paid, "turlar": turlar})

    os.makedirs(config.FAYL_PAPKA, exist_ok=True)
    nom = f"api_{bosh:%Y%m%d}" + ("" if bosh == oxir else f"_{oxir:%Y%m%d}")
    with open(os.path.join(config.FAYL_PAPKA, nom + ".json"), "w", encoding="utf-8") as f:
        json.dump({"sotuv": sotuv_xom, "qaytarish": qayt_xom, "mijozlar": mijoz_xom},
                  f, ensure_ascii=False)
    diag["nomlar"] = nomlar
    diag["ichki_q"], diag["ichki_h"] = list(ichki_q.values()), ichki_h
    diag.update(olingan=len(sotuv_xom), hujjat=len(hujjat), qaytarish=len(qaytarish),
                tolov_turi=sum(1 for h in hujjat if h["turlar"]))
    return list(qator.values()), hujjat, qaytarish, mijozlar, diag


def diag_matn(diag, qatorlar, hujjatlar):
    """/api javobi: nima olindi va qaysi ichki maydonlar bor (moslashtirish uchun)."""
    def p(x):
        return f"{int(round(x)):,}".replace(",", " ")
    s = [f"Sotuv hujjatlari: {diag.get('hujjat', 0)} (olingan {diag.get('olingan', 0)}), "
         f"qaytarish: {diag.get('qaytarish', 0)}",
         f"Tovarlar: {p(sum(q['sotilgan'] for q in qatorlar))} dona · "
         f"{p(sum(q['daromad'] for q in qatorlar))} so'm",
         f"To'landi: {p(sum(h['tolangan'] for h in hujjatlar))} · "
         f"qarzga: {p(sum(max(h['jami'] - h['tolangan'], 0) for h in hujjatlar))}",
         f"To'lov turi aniqlangan hujjatlar: {diag.get('tolov_turi', 0)}/{diag.get('hujjat', 0)}",
         f"Mijozlar: {diag.get('mijozlar', 0)} · qarz maydoni: "
         f"{diag.get('qarz_maydoni') or 'API bermayapti'}"]
    for o in diag.get("ogoh", []):
        s.append("⚠️ " + o)
    if diag.get("qiymat"):
        s.append("1-hujjat to'lovi: " + json.dumps(diag["qiymat"], ensure_ascii=False)[:400])
    if diag.get("namuna"):
        s.append("Ichki maydonlar: " + "; ".join(f"{k}={v}" for k, v in diag["namuna"].items()))
    return "\n".join(s)


# --- Kirim-chiqim lentasi: barcha hujjat turlari ----------------------------------------
# (kalit, API yo'li, qo'shimcha parametr)
HARAKAT_TURLARI = [
    ("kirim", "/documents/purchases", {}),               # yetkazib beruvchidan kirim
    ("qayt_mijoz", "/documents/return", {"type": "sales"}),        # mijozdan qaytarish (kirim)
    ("sotuv", "/documents/sales", {}),                   # sotuv (chiqim)
    ("qayt_yetk", "/documents/return", {"type": "purchases"}),     # yetkazib beruvchiga qaytarish
    ("tuzatish", "/documents/changes", {}),              # qoldiq tuzatish (+/−)
]


def harakatlar(bugun):
    """
    Oxirgi 3 kundagi barcha kirim/chiqim hujjatlari (o'chirilganlari bilan birga):
    [{id, tur, raqam, sana, vaqt, kontragent, xodim, qatorlar, dona, summa, tolangan, ochirilgan}]
    Sotuv ro'yxatida keladigan qaytarishlar sotuvdan chiqarib tashlanadi.
    """
    davr = {"time_start": f"{bugun - timedelta(days=2)} 00:00:00",
            "time_end": f"{bugun} 23:59:59", "deleted": 1}
    natija, qayt_idlar = [], set()
    for tur, yol, prm in HARAKAT_TURLARI:
        try:
            doclar = _hammasi(yol, dict(davr, **prm))
        except APIXato as e:
            if "403" in str(e):  # bu bo'limga ruxsat yo'q — qolganlari ishlayveradi
                continue
            raise
        for d in doclar:
            if tur.startswith("qayt"):
                qayt_idlar.add(d.get("id"))
            elif tur == "sotuv" and d.get("id") in qayt_idlar:
                continue
            v = _hujjat_vaqti(d)
            if not v:
                continue
            # Kontragent: sotuv/mijoz qaytarishi — mijoz; kirim — manba; yetkazib beruvchiga — manzil
            if tur == "kirim":
                kontr = _nom(d.get("source")) or _nom(d.get("customer"))
            elif tur == "qayt_yetk":
                kontr = _nom(d.get("destination")) or _nom(d.get("customer"))
            elif tur == "tuzatish":
                kontr = _nom(d.get("destination")) or _nom(d.get("source"))
            else:
                kontr = _mijoz(d, {})[1]
            qatorlar = []
            for i in d.get("line_items") or []:
                if not isinstance(i, dict):
                    continue
                soni = _son(i.get("quantity"))
                qatorlar.append({"nomi": re.sub(r"\s+", " ", str(i.get("title") or "?")).strip(),
                                 "soni": soni if tur == "tuzatish" else abs(soni),
                                 "narx": _son(i.get("price"))})
            jami = _son(d.get("total_price"))
            paid, _ = _tolov_holati(d, jami) if tur == "sotuv" else (0, {})
            natija.append({
                "id": d.get("id"), "tur": tur,
                "raqam": str(d.get("order_number") or d.get("name") or ""),
                "sana": v.date().isoformat(), "vaqt": v.strftime("%H:%M"),
                "kontragent": kontr, "xodim": _nom(d.get("actor")),
                "qatorlar": qatorlar,
                "dona": sum(abs(q["soni"]) for q in qatorlar) if tur != "tuzatish"
                else sum(q["soni"] for q in qatorlar),
                "summa": jami, "tolangan": paid, "izoh": str(d.get("note") or "").strip(),
                "ichki": tur == "sotuv" and (jami <= 0 or ichkimi(kontr)),
                "ochirilgan": bool((d.get("document_flags") or {}).get("deleted"))})
    return natija


# --- Yozish (POST) va katalog ------------------------------------------------------------
def _post(yol, data):
    """POST so'rov → (status, javob). Faqat mini app orqali sotuv yaratishda ishlatiladi."""
    if not token():
        raise APIXato("config.py da AINUR_TOKEN yo'q.")
    req = urllib.request.Request(
        BAZA + yol, data=json.dumps(data).encode("utf-8"), method="POST",
        headers={"X-AINUR-API-Access-Token": token(), "Content-Type": "application/json",
                 "Accept": "application/json", "User-Agent": "PromaxBot/2.0"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            matn = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(matn) if matn.strip() else {})
    except urllib.error.HTTPError as e:
        matn = e.read().decode("utf-8", "replace")
        try:
            javob = json.loads(matn)
        except ValueError:
            javob = {"error": matn[:300]}
        if e.code == 403:
            raise APIXato("Sotuv yaratishga ruxsat yo'q (403). AinurPOS → Connect API → "
                          "token ACCESS ni «RO + Orders» qilib Saqlang.")
        if e.code in (401, 404, 422):
            xato = javob.get("error") or javob.get("message") or matn[:200]
            raise APIXato(f"AinurPOS rad etdi ({e.code}): {xato}")
        raise APIXato(f"AinurPOS xatosi {e.code}: {matn[:200]}")
    except Exception as e:
        _uzildi["vaqt"] = datetime.now(TZ)
        raise APIXato(f"AinurPOS'ga ulanib bo'lmadi: {e}")


def _dokon_suz(royxat):
    """
    config.DOKONLAR da ko'rsatilgan do'konlargina qoladi (masalan Sklad va Magazin),
    o'sha tartibda. Ro'yxat bo'sh bo'lsa yoki hech biri topilmasa — hammasi qaytadi.
    """
    kerak = [str(x).strip().lower() for x in getattr(config, "DOKONLAR", []) if str(x).strip()]
    if not kerak:
        return royxat
    natija = []
    for nom in kerak:
        for d in royxat:
            if nom in d["nom"].lower() and d not in natija:
                natija.append(d)
    return natija or royxat


def dokonlar():
    """[{id, nom, manzil}] — AinurPOS do'konlari (sotuv qaysi do'kondan chiqishini bildiradi)."""
    d = _get("/stores", {"limit": 100})
    royxat = (d or {}).get("shops") if isinstance(d, dict) else d
    return [{"id": x.get("id"), "nom": _nom(x) or "Do'kon", "manzil": str(x.get("address") or "")}
            for x in (royxat or []) if isinstance(x, dict)]


def mahsulotlar(store_id):
    """Katalog + shu do'kondagi qoldiq: [{id, nom, sku, shtrix, narx, qoldiq, birlik}]."""
    natija = []
    for i in range(50):  # 1000 tadan, ko'pi bilan 50 000 pozitsiya
        d = _get("/product", {"store_id": store_id, "limit": 1000, "offset": i * 1000})
        r = d if isinstance(d, list) else ((d or {}).get("data") or [])
        for p in r:
            if not isinstance(p, dict):
                continue
            opt = p.get("options") if isinstance(p.get("options"), dict) else {}
            var = p.get("variation") if isinstance(p.get("variation"), dict) else {}
            nom = _nom(var) or _nom(opt) or _nom(p) or "?"
            stock = p.get("stock") if isinstance(p.get("stock"), dict) else {}
            narxlar = p.get("store_prices") if isinstance(p.get("store_prices"), dict) else {}
            natija.append({
                "id": p.get("id"), "nom": re.sub(r"\s+", " ", nom).strip(),
                "sku": str(p.get("sku") or ""), "shtrix": str(p.get("barcode") or ""),
                "narx": _son(narxlar.get(store_id, p.get("price"))),
                "qoldiq": _son(stock.get(store_id, 0)),
                "birlik": str(p.get("unit") or "pcs")})
        if len(r) < 1000:
            break
    return natija


def mijoz_yarat(nom, telefon=""):
    """AinurPOS'da yangi mijoz yaratish → mijoz ID si."""
    qism = nom.strip().split(" ", 1)
    data = {"first_name": qism[0], "last_name": qism[1] if len(qism) > 1 else ""}
    if telefon:
        data["phone"] = telefon
    _, javob = _post("/customers", data)
    return (javob.get("data") or javob).get("id") if isinstance(javob, dict) else None


def sotuv_yarat(store_id, mijoz_id, qatorlar, tolov=None, izoh="", sana=None):
    """
    AinurPOS'da sotuv yaratish (darhol o'tkaziladi).
      qatorlar: [{product_id, quantity, price, unit}]
      tolov:    {"summa": ..., "turi": "cash|debit|transfer"} yoki None (to'liq qarzga)
    """
    data = {
        "status": True, "store_id": store_id,
        "date": (sana or datetime.now(TZ)).strftime("%Y-%m-%d %H:%M:%S"),
        "discount_percent": 0, "discount_sum": 0,
        "products": [{"product_id": q["product_id"], "quantity": q["quantity"],
                      "price": q["price"], "discount_percent": 0,
                      "unit": q.get("unit") or "pcs"} for q in qatorlar]}
    if mijoz_id:
        data["customer_id"] = mijoz_id
    if izoh:
        data["comment"] = izoh[:200]
    if tolov and tolov.get("summa"):
        data["payment_details"] = {
            "sum": tolov["summa"], "type": tolov.get("turi", "cash"), "status": True,
            "date": data["date"]}
    kod, javob = _post("/sales", data)
    return kod, javob


# --- Mini app: do'konlar, tovarlar, sotuv yaratish ----------------------------------------
def _royxatdan(d, kalitlar=("shops", "stores", "data", "items", "results")):
    """Javob {shops:[…]} yoki to'g'ridan-to'g'ri ro'yxat bo'lishi mumkin."""
    if isinstance(d, list):
        return [x for x in d if isinstance(x, dict)]
    if isinstance(d, dict):
        for k in kalitlar:
            if isinstance(d.get(k), list):
                return [x for x in d[k] if isinstance(x, dict)]
    return []


def _dokon_suz(royxat):
    """
    config.DOKONLAR da ko'rsatilgan do'konlargina qoladi (masalan Sklad va Magazin),
    o'sha tartibda. Ro'yxat bo'sh bo'lsa yoki hech biri topilmasa — hammasi qaytadi.
    """
    kerak = [str(x).strip().lower() for x in getattr(config, "DOKONLAR", []) if str(x).strip()]
    if not kerak:
        return royxat
    natija = []
    for nom in kerak:
        for d in royxat:
            if nom in d["nom"].lower() and d not in natija:
                natija.append(d)
    return natija or royxat


def dokonlar():
    """
    [{id, nom, manzil}] — AinurPOS do'konlari.
    /stores bo'sh qaytsa yoki ruxsat bo'lmasa — do'kon ID lari tovarlar qoldig'idan olinadi.
    """
    natija, xato = [], ""
    try:
        for x in _royxatdan(_get("/stores", {"limit": 100})):
            if x.get("id"):
                natija.append({"id": x["id"], "nom": _nom(x) or "Do'kon",
                               "manzil": str(x.get("address") or "")})
    except APIXato as e:
        xato = str(e)
    if natija:
        return _dokon_suz(natija)
    # Zaxira: tovar kartochkasidagi stock kalitlari — do'kon ID lari
    idlar = []
    for p in _royxatdan(_get("/product", {"limit": 50})):
        for k in (p.get("stock") or {}):
            if k not in idlar:
                idlar.append(k)
    if idlar:
        return [{"id": k, "nom": f"Do'kon {i}" if len(idlar) > 1 else "Asosiy do'kon",
                 "manzil": ""} for i, k in enumerate(idlar, 1)]
    raise APIXato(xato or "AinurPOS do'kon bermadi: Connect API token ACCESS ni «RO + Orders» "
                          "qilib Saqlang yoki do'kon (Ombor) mavjudligini tekshiring.")


def _tovar(p, store_id):
    """API mahsulotini mini app uchun soddalashtirish."""
    op = p.get("options") if isinstance(p.get("options"), dict) else {}
    nom = _nom(op) or _nom(p) or "?"
    var = p.get("variation") if isinstance(p.get("variation"), dict) else None
    if var and _nom(var):
        nom = f"{nom} {_nom(var)}"
    stock = p.get("stock") if isinstance(p.get("stock"), dict) else {}
    # Narx: do'kon narxi → katalog narxi → variatsiya narxi (birinchi musbat qiymat)
    sp = p.get("store_prices") if isinstance(p.get("store_prices"), dict) else {}
    var_narx = var.get("price") if isinstance(var, dict) else None
    narx = 0.0
    for nomzod in (sp.get(store_id), p.get("price"), var_narx, op.get("price")):
        if _son(nomzod) > 0:
            narx = _son(nomzod)
            break
    qoldiqlar = {k: _son(v) for k, v in stock.items() if _son(v)}
    return {"id": p.get("id"), "nom": re.sub(r"\s+", " ", nom).strip(),
            "shtrix": str(p.get("barcode") or p.get("sku") or ""),
            "narx": narx,
            "qoldiq": _son(stock.get(store_id, 0)),
            "qoldiqlar": qoldiqlar,          # do'kon → qoldiq (qaysi omborda borligi)
            "jami_qoldiq": sum(qoldiqlar.values()),
            "birlik": str(p.get("unit") or "pcs")}


def tovarlar(store_id):
    """Do'kondagi barcha tovarlar: nomi, narx, qoldiq (mini app katalogi)."""
    natija, sahifa = [], 0
    while sahifa < 60:  # himoya: ko'pi bilan 30 000 tovar
        # store_id yuborilmaydi — javobdagi stock barcha do'konlar bo'yicha keladi
        r = _royxatdan(_get("/product", {"offset": sahifa * 500, "limit": 500}))
        natija += [_tovar(p, store_id) for p in r if isinstance(p, dict)]
        if len(r) < 500:
            break
        sahifa += 1
    return natija


def _post(yol, data):
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(BAZA + yol, data=body, method="POST", headers={
        "X-AINUR-API-Access-Token": token(), "Content-Type": "application/json",
        "Accept": "application/json", "User-Agent": "PromaxBot/2.0"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            matn = r.read().decode("utf-8", "replace")
        return json.loads(matn) if matn.strip() else {"status": True}
    except urllib.error.HTTPError as e:
        matn = e.read().decode("utf-8", "replace")
        try:
            xato = json.loads(matn).get("error") or json.loads(matn).get("message") or matn
        except ValueError:
            xato = matn
        if e.code == 403:
            raise APIXato("Ruxsat yo'q: AinurPOS → Connect API → token ACCESS ni «RO + Orders» "
                          "qilib Saqlang.")
        raise APIXato(f"AinurPOS {e.code}: {str(xato)[:200]}")
    except APIXato:
        raise
    except Exception as e:
        raise APIXato(f"AinurPOS'ga ulanib bo'lmadi: {e}")


def sotuv_yarat(store_id, mijoz_id, qatorlar, tolov=None, izoh="", vaqt=None):
    """
    AinurPOS'da yangi sotuv hujjati yaratish.
    qatorlar: [{id, soni, narx, birlik}]; tolov: {"summa": …, "turi": "Naqd"}.
    """
    data = {
        "status": True,  # darhol o'tkaziladi (qoldiq va qarz shu zahoti o'zgaradi)
        "store_id": store_id,
        "date": (vaqt or datetime.now(TZ)).strftime("%Y-%m-%d %H:%M:%S"),
        "discount_percent": 0, "discount_sum": 0,
        "products": [{"product_id": q["id"], "quantity": _son(q["soni"]),
                      "price": _son(q["narx"]), "discount_percent": 0,
                      "unit": q.get("birlik") or "pcs"} for q in qatorlar],
    }
    if mijoz_id:
        data["customer_id"] = mijoz_id
    if izoh:
        data["comment"] = izoh[:200]
    if tolov and _son(tolov.get("summa")) > 0:
        turlar = getattr(config, "TOLOV_API", {})
        data["payment_details"] = {
            "sum": _son(tolov["summa"]),
            "type": turlar.get(tolov.get("turi"), "cash"),
            "status": True,
            "date": data["date"]}
    return _post("/sales", data)


def mijoz_yarat(nom, telefon=""):
    """AinurPOS'da yangi mijoz."""
    qism = nom.strip().split(" ", 1)
    data = {"first_name": qism[0][:60], "last_name": (qism[1] if len(qism) > 1 else "")[:60]}
    if telefon:
        data["phone"] = telefon
    d = _post("/customers", data)
    if isinstance(d, dict):
        return d.get("id") or (d.get("data") or {}).get("id") or (d.get("customer") or {}).get("id")
    return None
