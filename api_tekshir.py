# -*- coding: utf-8 -*-
"""
AinurPOS Connect API tekshiruvi (bir martalik).

1) API tavsifini (Swagger/OpenAPI) yuklab oladi   → ainur_api.json
2) Oxirgi 3 kunlik savdo hujjatlarini oladi         → sotuv_namuna.json
3) Barcha urinishlar natijasi                       → api_natija.txt

Shu 3 faylni Claude'ga yuboring. Token fayllarga YOZILMAYDI.
Faqat standart Python kutubxonalari ishlatiladi.
"""
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

ASOS = "https://connect.ainur.app"
LOG = []


def yoz(s):
    """Ekranga va api_natija.txt ga yozish."""
    print(s)
    LOG.append(s)


def token_ol():
    """Token: config.py → AINUR_TOKEN; bo'lmasa so'raydi."""
    try:
        import config
        t = getattr(config, "AINUR_TOKEN", "")
    except Exception:
        t = ""
    if not t or "BU_YERGA" in t:
        t = input("AinurPOS tokenni qo'ying (sichqonchaning o'ng tugmasi) va Enter bosing: ")
    return t.strip()


def ol(url, sarlavha=None):
    """GET so'rov → (status, matn)."""
    h = {"Accept": "application/json, text/html;q=0.9", "User-Agent": "PromaxBot/1.0"}
    h.update(sarlavha or {})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=40) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, f"{type(e).__name__}: {e}"


def _toliq(u):
    u = u.replace("\\/", "/")
    if u.startswith("http"):
        return u
    return ASOS + (u if u.startswith("/") else "/" + u)


def spec_top():
    """Hujjat sahifasidan API tavsifi (JSON) manzilini topib yuklab olish."""
    kod, html = ol(ASOS + "/api/documentation")
    yoz(f"[1] Hujjat sahifasi: status {kod}, {len(html)} belgi")
    nomzod = []
    # Swagger UI sozlamasidagi url: "..." qiymatlari
    for m in re.finditer(r'["\']?url["\']?\s*[:=]\s*["\']([^"\']+)["\']', html):
        u = m.group(1)
        if any(k in u.lower() for k in ("json", "yaml", "docs", "openapi", "swagger")):
            nomzod.append(u)
    # Keng tarqalgan standart manzillar
    nomzod += ["/docs/api-docs.json", "/docs?api-docs.json", "/api-docs.json",
               "/api/documentation.json", "/api/docs.json", "/swagger.json",
               "/openapi.json", "/api/openapi.json", "/api/swagger.json"]
    for u in dict.fromkeys(nomzod):
        url = _toliq(u)
        kod, matn = ol(url)
        yoz(f"    tavsif urinish: {url} → {kod}")
        if kod == 200:
            try:
                d = json.loads(matn)
            except ValueError:
                continue
            if isinstance(d, dict) and "paths" in d:
                return url, d
    with open("hujjat_sahifa.html", "w", encoding="utf-8") as f:
        f.write(html)
    return None, None


def asos_url(spec):
    """So'rovlar yuboriladigan asosiy manzil (servers / host+basePath)."""
    if spec.get("servers"):
        u = spec["servers"][0].get("url", "")
    elif spec.get("host"):
        u = f"{(spec.get('schemes') or ['https'])[0]}://{spec['host']}{spec.get('basePath', '')}"
    else:
        u = ASOS + "/api"
    return _toliq(u).rstrip("/")


def auth_variantlar(spec, t):
    """Tavsifdagi xavfsizlik sxemasidan sarlavha variantlari; zaxira variantlar bilan."""
    var = []
    sxema = (spec.get("components", {}).get("securitySchemes")
             or spec.get("securityDefinitions") or {})
    for s in sxema.values():
        if s.get("type") == "http" and s.get("scheme", "").lower() == "bearer":
            var.append(({"Authorization": f"Bearer {t}"}, {}))
        elif s.get("type") == "apiKey":
            if s.get("in") == "header":
                var.append(({s["name"]: t}, {}))
            elif s.get("in") == "query":
                var.append(({}, {s["name"]: t}))
    var += [({"Authorization": f"Bearer {t}"}, {}), ({"X-API-KEY": t}, {}),
            ({"Authorization": t}, {}), ({"X-Auth-Token": t}, {})]
    return var


def parametrlar(spec, yol):
    """Savdo metodining query parametrlari — sana va limitni to'ldirish."""
    bugun, boshi = date.today(), date.today() - timedelta(days=3)
    p = {}
    for prm in (spec["paths"][yol].get("get", {}).get("parameters") or []):
        if "$ref" in prm:  # umumiy parametrga havola
            nom = prm["$ref"].split("/")[-1]
            prm = (spec.get("components", {}).get("parameters", {}).get(nom)
                   or spec.get("parameters", {}).get(nom) or {})
        if prm.get("in") != "query":
            continue
        n = prm.get("name", "")
        fmt = (prm.get("schema") or prm).get("format", "")
        nl = n.lower()
        if any(k in nl for k in ("from", "start", "begin", "since")):
            p[n] = f"{boshi}T00:00:00" if fmt == "date-time" else str(boshi)
        elif any(k in nl for k in ("to", "end", "till", "until")) and "total" not in nl:
            p[n] = f"{bugun}T23:59:59" if fmt == "date-time" else str(bugun)
        elif nl in ("limit", "per_page", "perpage", "size", "page_size"):
            p[n] = "50"
    return p


def main():
    t = token_ol()
    yoz(f"Token: {t[:6]}…{t[-4:]} ({len(t)} belgi)")
    url, spec = spec_top()
    if not spec:
        yoz("!! API tavsifi topilmadi. hujjat_sahifa.html faylini Claude'ga yuboring.")
        return
    with open("ainur_api.json", "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, indent=1)
    yoz(f"[2] Tavsif saqlandi: ainur_api.json ({url})")
    yoz("    Metodlar: " + ", ".join(sorted(spec["paths"])))

    baza = asos_url(spec)
    yol = next((y for y in spec["paths"] if y.rstrip("/").endswith("documents/sales")), None)
    if not yol:
        yoz("!! /documents/sales metodi tavsifda yo'q.")
        return
    prm = parametrlar(spec, yol)
    yoz(f"[3] Savdo so'rovi: {baza}{yol}  parametrlar: {prm}")
    for sarl, qprm in auth_variantlar(spec, t):
        q = urllib.parse.urlencode({**prm, **qprm})
        kod, matn = ol(f"{baza}{yol}" + (f"?{q}" if q else ""), sarl)
        usul = list(sarl) or list(qprm)
        yoz(f"    auth {usul} → status {kod}")
        if kod == 200:
            with open("sotuv_namuna.json", "w", encoding="utf-8") as f:
                f.write(matn)
            yoz("[4] ✅ Savdo ma'lumoti olindi: sotuv_namuna.json")
            return
        yoz("       javob: " + matn[:200].replace("\n", " "))
    yoz("!! Savdo ma'lumoti olinmadi. Token saqlanganini (Saqlash tugmasi) tekshiring.")


if __name__ == "__main__":
    try:
        main()
    finally:
        with open("api_natija.txt", "w", encoding="utf-8") as f:
            f.write("\n".join(LOG))
        print("\nTayyor. ainur_api.json, sotuv_namuna.json, api_natija.txt fayllarini yuboring.")
