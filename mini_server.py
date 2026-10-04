# -*- coding: utf-8 -*-
"""
Telegram Mini App serveri (sotuv, qarz to'lovi, ombor).

  • Sahifani beradi: webapp/index.html
  • JSON API: /api/boshlash, /api/tovarlar, /api/sotuv, /api/mijoz, /api/qarz
  • Har bir so'rov Telegram initData imzosi bilan tekshiriladi (bot tokeni orqali),
    shuning uchun havolani bilgan begona odam ma'lumotni ololmaydi.
  • AinurPOS tokeni faqat shu serverda qoladi, brauzerga berilmaydi.
"""
import hashlib
import hmac
import json
import logging
import time
import urllib.parse
from datetime import datetime

from aiohttp import web

import ainur_api
import config
import daftar
import db

log = logging.getLogger("promax.mini")
PAPKA = "webapp"
KESH = {"tovar": {}, "vaqt": {}}          # do'kon → tovarlar ro'yxati
TOVAR_KESH_DAQIQA = 3                      # AinurPOS katalogni 3 daqiqada yangilaydi


# --- Telegram initData tekshiruvi ---------------------------------------------------------
def _tekshir(init_data, bot_token, umr_soat=24):
    """Telegram WebApp initData imzosini tekshirish → foydalanuvchi, yoki sabab (str)."""
    if not (init_data or "").strip():
        return "bo'sh"
    try:
        juft = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
        imzo = juft.pop("hash", "")
        satr = "\n".join(f"{k}={juft[k]}" for k in sorted(juft))
        kalit = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        kutilgan = hmac.new(kalit, satr.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(kutilgan, imzo):
            return "imzo"
        if time.time() - int(juft.get("auth_date", 0)) > umr_soat * 3600:
            return "eski"
        return json.loads(juft.get("user", "{}")) or "user"
    except Exception:
        return "xato"


def _son(v):
    """Qiymatni songa aylantirish (noto'g'ri bo'lsa 0)."""
    try:
        return float(str(v).replace(" ", "").replace(",", ".") or 0)
    except (TypeError, ValueError):
        return 0.0


def _xato(matn, kod=400):
    return web.json_response({"xato": matn}, status=kod)


@web.middleware
async def xato_ushla(req, handler):
    """Har qanday xatoni JSON qilib qaytarish — ilova tushunarli xabar ko'rsatadi."""
    try:
        return await handler(req)
    except web.HTTPException:
        raise
    except Exception as e:
        log.exception("Mini app xatosi (%s %s)", req.method, req.path)
        return web.json_response({"xato": f"Server xatosi: {type(e).__name__}: {e}"}, status=500)


def yaratish(bot_token, ruxsat_tekshir, hozir):
    """
    aiohttp ilovasini yasash.
      ruxsat_tekshir(user_id) -> bool  (hisobot guruhi a'zosimi)
      hozir() -> datetime              (Toshkent vaqti)
    """
    app = web.Application(middlewares=[xato_ushla])

    async def _user(req):
        """
        Foydalanuvchini aniqlash. Birinchi navbatda Telegram imzosi (initData).
        Ba'zi mijozlar (Telegram Desktop, brauzer) imzo bermaydi — u holda havoladagi
        maxfiy kalit (?k=…) ishlatiladi: bu havolani faqat bot menyusi beradi.
        """
        u = _tekshir(req.headers.get("X-Init-Data") or "", bot_token)
        if isinstance(u, dict) and u.get("id"):
            if not await ruxsat_tekshir(int(u["id"])):
                return None, _xato("Ruxsat yo'q: siz hisobot guruhi a'zosi emassiz.", 403)
            return u, None
        kalit = req.app.get("kalit")
        berilgan = req.headers.get("X-App-Key") or req.query.get("k") or ""
        if kalit and hmac.compare_digest(kalit, berilgan):
            log.info("Mini app: imzosiz kirish (sabab: %s) — havola kaliti bilan", u)
            return {"id": 0, "first_name": req.app.get("egasi") or "Mini app"}, None
        log.warning("Mini app: kirish rad etildi (imzo: %s, kalit: %s)", u, "bor" if berilgan else "yo'q")
        return None, _xato(
            "Telegram imzosi kelmadi. Mini app'ni bot menyusidagi «🛒 Sotuv» tugmasi orqali "
            "oching (telefondagi Telegram ilovasida ishonchliroq).", 401)

    async def index(req):
        return web.FileResponse(f"{PAPKA}/index.html")

    async def boshlash(req):
        """Ilova ochilganda: do'konlar, mijozlar, to'lov turlari."""
        u, x = await _user(req)
        if x:
            return x
        try:
            dokonlar = await _fon(ainur_api.dokonlar)
        except ainur_api.APIXato as e:
            log.error("Do'konlar olinmadi: %s", e)
            return _xato(str(e), 503)
        req.app["dokon_nomlari"] = {x["id"]: x["nom"] for x in dokonlar}
        log.info("Mini app ochildi: %s · do'kon %d", u.get("first_name"), len(dokonlar))
        daftarda = bool(daftar.kochirildimi())
        mij = ([{"id": m["id"], "nom": m["nom"], "qarz": m["qarz"] or 0}
                for m in daftar.mijozlar(limit=300)] if daftarda else
               [{"id": m["id"], "nom": m["nom"], "qarz": m["qarz"] or 0}
                for m in db.mijozlar_qarzi()])
        return web.json_response({
            "ism": u.get("first_name", ""),
            "daftar": daftarda,
            "dokonlar": dokonlar,
            "dokon_id": (db.sozlama_ol("mini_dokon")
                         if any(x["id"] == db.sozlama_ol("mini_dokon") for x in dokonlar)
                         else (dokonlar[0]["id"] if dokonlar else "")),
            "mijozlar": mij,
            "turlar": list(config.TOLOV_TURLARI),
            "valyuta": config.VALYUTA})

    async def mijoz_qidir(req):
        """Mijozlarni qidirish (nom, telefon; kirill/lotin va apostroflar hisobga olinmaydi)."""
        u, x = await _user(req)
        if x:
            return x
        q = (req.query.get("q") or "").strip()
        if daftar.kochirildimi():
            r = daftar.mijozlar(q, limit=40)
            return web.json_response({"mijozlar": [
                {"id": m["id"], "nom": m["nom"], "telefon": m["telefon"] or "",
                 "qarz": m["qarz"] or 0, "savdo": m["savdo_soni"]} for m in r]})
        hamma = db.mijozlar_qarzi()
        if q:
            idlar = {x["id"] for x in db.mijoz_qidir_ainur(q, 40)}
            hamma = [m for m in hamma if m["id"] in idlar]
        return web.json_response({"mijozlar": [
            {"id": m["id"], "nom": m["nom"], "telefon": m.get("telefon", ""),
             "qarz": m["qarz"] or 0, "savdo": m.get("hujjat", 0)} for m in hamma[:40]]})


    async def tovarlar(req):
        """Do'kon katalogi (qoldiq va narx bilan), 3 daqiqalik kesh."""
        u, x = await _user(req)
        if x:
            return x
        dokon = req.query.get("dokon") or ""
        if not dokon:
            return _xato("Do'kon tanlanmagan")
        db.sozlama_yoz("mini_dokon", dokon)
        yangi = req.query.get("yangi") == "1"
        oxirgi = KESH["vaqt"].get(dokon, 0)
        if yangi or time.time() - oxirgi > TOVAR_KESH_DAQIQA * 60:
            try:
                KESH["tovar"][dokon] = await _fon(ainur_api.tovarlar, dokon)
                KESH["vaqt"][dokon] = time.time()
                db.sozlama_yoz("mini_dokon", dokon)
            except ainur_api.APIXato as e:
                log.error("Katalog olinmadi (%s): %s", dokon, e)
                if dokon not in KESH["tovar"]:
                    return _xato(str(e), 503)
                log.warning("Katalog yangilanmadi: %s", e)
        t = KESH["tovar"].get(dokon, [])
        if not t:
            log.warning("Katalog bo'sh: do'kon %s da tovar yo'q", dokon)
        return web.json_response({"tovarlar": t, "dokon_nomlari": req.app.get("dokon_nomlari", {}),
                                  "vaqt": datetime.fromtimestamp(
                                      KESH["vaqt"].get(dokon, 0), ainur_api.TZ).strftime("%H:%M")})

    async def sotuv(req):
        """Yangi sotuv → AinurPOS."""
        u, x = await _user(req)
        if x:
            return x
        d = await req.json()
        qatorlar = []
        for q in (d.get("qatorlar") or []):
            soni, narx = _son(q.get("soni")), _son(q.get("narx"))
            if q.get("id") and soni > 0:
                qatorlar.append(dict(q, soni=soni, narx=narx))
        if not qatorlar:
            return _xato("Savat bo'sh yoki dona noto'g'ri")
        if not d.get("dokon"):
            return _xato("Do'kon tanlanmagan")
        if any(q["narx"] <= 0 for q in qatorlar):
            return _xato("Narxi ko'rsatilmagan tovar bor — narxni yozing")
        jami = sum(q["soni"] * q["narx"] for q in qatorlar)
        tolov = d.get("tolov") or {}
        if _son(tolov.get("summa")) > jami + 0.5:
            return _xato("To'lov summasi jamidan katta")
        izoh = (d.get("izoh") or "").strip()
        kim = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip() or "mini app"
        now = hozir()
        tolangan = _son(tolov.get("summa"))
        if daftar.kochirildimi():
            # Daftar asosiy hisob: savdo darhol yoziladi, AinurPOS'ga keyin navbat bilan ketadi
            mid = d.get("mijoz_id")
            mid = int(mid) if str(mid).isdigit() else None
            mijoz_nom = d.get("mijoz_nom") or (daftar.mijoz_ol(mid) or {}).get("nom", "") if mid else ""
            sid = await _fon(daftar.savdo_qosh, now.date().isoformat(), now.strftime("%H:%M"),
                             mid, mijoz_nom, qatorlar, tolangan, tolov.get("turi") or "",
                             izoh, kim, int(u.get("id") or 0), d["dokon"],
                             now.strftime("%Y-%m-%d %H:%M:%S"))
            log.info("Savdo #%s daftarga yozildi (%s) — AinurPOS navbatida", sid, kim)
        else:
            try:
                await _fon(ainur_api.sotuv_yarat, d["dokon"], d.get("mijoz_id") or None, qatorlar,
                           tolov, (izoh + f" · {kim} (bot)").strip(" ·"), now)
            except ainur_api.APIXato as e:
                return _xato(str(e), 502)
        KESH["vaqt"][d["dokon"]] = 0  # qoldiq o'zgardi — katalog qayta olinsin
        natija = {"jami": jami, "dona": sum(q["soni"] for q in qatorlar),
                  "tolangan": tolangan,
                  "mijoz": d.get("mijoz_nom") or "", "turi": tolov.get("turi") or "",
                  "kim": kim, "qatorlar": qatorlar}
        await _xabar(req, "sotuv", natija)
        return web.json_response({"ok": True, **natija})

    async def mijoz(req):
        """Yangi mijoz → AinurPOS."""
        u, x = await _user(req)
        if x:
            return x
        d = await req.json()
        nom = (d.get("nom") or "").strip()
        if len(nom) < 2:
            return _xato("Mijoz ismini yozing")
        tel = (d.get("telefon") or "").strip()
        if daftar.kochirildimi():
            m, yangimi = daftar.mijoz_qosh(nom, tel, yaratilgan=hozir().strftime("%Y-%m-%d %H:%M"))
            return web.json_response({"ok": True, "id": m["id"], "nom": m["nom"],
                                      "yangi": yangimi})
        try:
            mid = await _fon(ainur_api.mijoz_yarat, nom, tel)
        except ainur_api.APIXato as e:
            return _xato(str(e), 502)
        if mid:
            db.ainur_mijozlar_saqla([{"id": mid, "nom": nom, "telefon": tel}])
        return web.json_response({"ok": True, "id": mid or "", "nom": nom})

    async def qarz(req):
        """
        Eski qarz to'lovi — botda qayd qilinadi (AinurPOS API bunga metod bermaydi).
        AinurPOS'ga qo'lda kiritilishi uchun guruhga eslatma bilan tushadi.
        """
        u, x = await _user(req)
        if x:
            return x
        d = await req.json()
        summa = _son(d.get("summa"))
        if summa <= 0:
            return _xato("Summani yozing")
        if not d.get("mijoz_id"):
            return _xato("Mijozni tanlang")
        kim = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip() or "mini app"
        now = hozir()
        turi = d.get("turi") or "Naqd"
        nom = d.get("mijoz_nom") or ""
        if daftar.kochirildimi():
            mid = int(d["mijoz_id"]) if str(d["mijoz_id"]).isdigit() else None
            nom = nom or (daftar.mijoz_ol(mid) or {}).get("nom", "")
            tid = daftar.tolov_qosh(now.date().isoformat(), now.strftime("%H:%M"), mid, nom,
                                    summa, turi, (d.get("izoh") or "").strip(), kim,
                                    int(u.get("id") or 0), now.strftime("%Y-%m-%d %H:%M:%S"))
            qarz = daftar.mijoz_qarzi(mid) if mid else 0
        else:
            tid = db.qol_tolov_qosh(now.date().isoformat(), now.strftime("%H:%M"),
                                    d["mijoz_id"], nom, summa, turi, kim)
            qarz = 0
        natija = {"id": tid, "mijoz": nom, "summa": summa, "turi": turi, "kim": kim,
                  "qarz": qarz, "daftar": bool(daftar.kochirildimi())}
        await _xabar(req, "qarz", natija)
        return web.json_response({"ok": True, **natija})

    async def _fon(fn, *args):
        import asyncio
        return await asyncio.to_thread(fn, *args)

    async def _xabar(req, tur, data):
        """Natijani guruhga yuborish (bot tomonidan o'rnatilgan funksiya orqali)."""
        yuboruvchi = req.app.get("xabar")
        if yuboruvchi:
            try:
                await yuboruvchi(tur, data)
            except Exception as e:
                log.error("Guruhga xabar yuborilmadi: %s", e)

    app.router.add_get("/", index)
    app.router.add_get("/api/boshlash", boshlash)
    app.router.add_get("/api/tovarlar", tovarlar)
    app.router.add_get("/api/mijozlar", mijoz_qidir)
    app.router.add_post("/api/sotuv", sotuv)
    app.router.add_post("/api/mijoz", mijoz)
    app.router.add_post("/api/qarz", qarz)
    app.router.add_static("/static/", PAPKA)
    return app
