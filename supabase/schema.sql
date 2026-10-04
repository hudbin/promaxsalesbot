-- ==============================================================================
-- PROMAX B2B STORE: SUPABASE (POSTGRESQL) SCHEMA
-- ==============================================================================

-- 1. UUID kengaytmasini yoqish
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- JADVALLAR (TABLES)
-- ==============================================================================

-- 1. Xodimlar va Rollar
CREATE TABLE IF NOT EXISTS xodimlar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE,
    ism TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'sotuvchi' CHECK (rol IN ('admin', 'sotuvchi')),
    faol BOOLEAN NOT NULL DEFAULT true,
    yaratilgan TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Mahsulotlar (Tovarlar va Ombor)
CREATE TABLE IF NOT EXISTS tovarlar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    model TEXT,                             -- masalan: "5017" yoki "Velikan"
    shtrixkod TEXT,
    rasm_url TEXT,                          -- Mahsulot rasmi (Supabase Storage / URL)
    birlik TEXT NOT NULL DEFAULT 'dona',    -- dona, metr, pachka, kg
    tannarx NUMERIC(15, 2) NOT NULL DEFAULT 0,
    narx_optom NUMERIC(15, 2) NOT NULL DEFAULT 0, -- Asosiy B2B ulgurji narxi
    narx_chakana NUMERIC(15, 2),
    valyuta TEXT NOT NULL DEFAULT 'UZS' CHECK (valyuta IN ('UZS', 'USD')),
    qoldiq NUMERIC(12, 2) NOT NULL DEFAULT 0,     -- Ombordagi qoldiq
    ogohlantirish_qoldiq NUMERIC(12, 2) DEFAULT 5, -- Kam qolganda signal
    faol BOOLEAN NOT NULL DEFAULT true,
    yaratilgan TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Mijozlar (B2B Kontragentlar va xaridorlar)
CREATE TABLE IF NOT EXISTS mijozlar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    nom_norm TEXT NOT NULL,                 -- Qidiruv uchun kichik harflar va tozalangan
    telefon TEXT,
    manzil TEXT,                            -- Shahar, bozor, qator, do'kon raqami
    qarz_uzs NUMERIC(15, 2) NOT NULL DEFAULT 0,
    qarz_usd NUMERIC(15, 2) NOT NULL DEFAULT 0,
    izoh TEXT,
    faol BOOLEAN NOT NULL DEFAULT true,
    yaratilgan TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_mijozlar_norm ON mijozlar(nom_norm);

-- 4. Savdolar (B2B Sotuv Hujjatlari)
CREATE TABLE IF NOT EXISTS savdolar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raqam SERIAL,                           -- Odamlar uchun qulay chek raqami (#1001, #1002...)
    sana_vaqt TIMESTAMPTZ NOT NULL DEFAULT now(),
    mijoz_id UUID REFERENCES mijozlar(id) ON DELETE SET NULL,
    valyuta TEXT NOT NULL DEFAULT 'UZS' CHECK (valyuta IN ('UZS', 'USD')),
    jami_summa NUMERIC(15, 2) NOT NULL CHECK (jami_summa >= 0),
    tolangan_summa NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (tolangan_summa >= 0),
    qarz_summa NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (qarz_summa >= 0),
    tolov_turi TEXT CHECK (tolov_turi IN ('naqd', 'plastik', 'perechisleniya', 'aralash', 'qarz')),
    kassa_turi TEXT CHECK (kassa_turi IN ('naqd_uzs', 'naqd_usd', 'plastik_uzs', 'bank_uzs', NULL)),
    holat TEXT NOT NULL DEFAULT 'yakunlandi' CHECK (holat IN ('yakunlandi', 'bekor_qilindi')),
    izoh TEXT,
    xodim TEXT,
    telegram_user_id BIGINT,
    yaratilgan TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_savdolar_sana ON savdolar(sana_vaqt);
CREATE INDEX IF NOT EXISTS ix_savdolar_mijoz ON savdolar(mijoz_id);

-- 5. Savdo Qatorlari (Chekdagi tovarlar ro'yxati)
CREATE TABLE IF NOT EXISTS savdo_qatorlari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    savdo_id UUID NOT NULL REFERENCES savdolar(id) ON DELETE CASCADE,
    tovar_id UUID REFERENCES tovarlar(id) ON DELETE SET NULL,
    tovar_nomi TEXT NOT NULL,               -- Tarix o'zgarmasligi uchun saqlanadi
    soni NUMERIC(12, 2) NOT NULL CHECK (soni > 0),
    narx NUMERIC(15, 2) NOT NULL CHECK (narx >= 0),
    tannarx NUMERIC(15, 2) NOT NULL DEFAULT 0,
    summa NUMERIC(15, 2) NOT NULL CHECK (summa >= 0)
);
CREATE INDEX IF NOT EXISTS ix_savdo_qatorlari_savdo ON savdo_qatorlari(savdo_id);

-- 6. Rasxodlar (Kunlik Xarajatlar)
CREATE TABLE IF NOT EXISTS rasxodlar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sana_vaqt TIMESTAMPTZ NOT NULL DEFAULT now(),
    summa NUMERIC(15, 2) NOT NULL CHECK (summa > 0),
    valyuta TEXT NOT NULL DEFAULT 'UZS' CHECK (valyuta IN ('UZS', 'USD')),
    kategoriya TEXT NOT NULL,               -- Obed, Taksi, Elektr, Ijara, Oylik, Boshqa
    tolov_turi TEXT NOT NULL DEFAULT 'naqd' CHECK (tolov_turi IN ('naqd', 'plastik', 'perechisleniya')),
    kassa_turi TEXT NOT NULL CHECK (kassa_turi IN ('naqd_uzs', 'naqd_usd', 'plastik_uzs', 'bank_uzs')),
    izoh TEXT,
    xodim TEXT,
    telegram_user_id BIGINT,
    holat TEXT NOT NULL DEFAULT 'faol' CHECK (holat IN ('faol', 'bekor_qilindi')),
    yaratilgan TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_rasxodlar_sana ON rasxodlar(sana_vaqt);

-- 7. Qarz To'lovlari (Eski qarzni qaytarish kvitansiyalari)
CREATE TABLE IF NOT EXISTS qarz_tolovlari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sana_vaqt TIMESTAMPTZ NOT NULL DEFAULT now(),
    mijoz_id UUID NOT NULL REFERENCES mijozlar(id) ON DELETE CASCADE,
    summa NUMERIC(15, 2) NOT NULL CHECK (summa > 0),
    valyuta TEXT NOT NULL DEFAULT 'UZS' CHECK (valyuta IN ('UZS', 'USD')),
    tolov_turi TEXT NOT NULL DEFAULT 'naqd' CHECK (tolov_turi IN ('naqd', 'plastik', 'perechisleniya')),
    kassa_turi TEXT NOT NULL CHECK (kassa_turi IN ('naqd_uzs', 'naqd_usd', 'plastik_uzs', 'bank_uzs')),
    izoh TEXT,
    xodim TEXT,
    telegram_user_id BIGINT,
    yaratilgan TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_qarz_tolov_mijoz ON qarz_tolovlari(mijoz_id);

-- 8. Kassa Harakatlari (Money Flow Ledgeri / Pul oqimi)
CREATE TABLE IF NOT EXISTS kassa_harakatlari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sana_vaqt TIMESTAMPTZ NOT NULL DEFAULT now(),
    kassa_turi TEXT NOT NULL CHECK (kassa_turi IN ('naqd_uzs', 'naqd_usd', 'plastik_uzs', 'bank_uzs')),
    amal TEXT NOT NULL CHECK (amal IN ('kirim', 'chiqim')),
    summa NUMERIC(15, 2) NOT NULL CHECK (summa > 0),
    valyuta TEXT NOT NULL CHECK (valyuta IN ('UZS', 'USD')),
    manba_turi TEXT NOT NULL CHECK (manba_turi IN ('savdo', 'rasxod', 'qarz_tolov', 'kassalar_aro', 'boshlangich')),
    manba_id UUID,
    izoh TEXT,
    yaratilgan TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_kassa_sana ON kassa_harakatlari(sana_vaqt);
CREATE INDEX IF NOT EXISTS ix_kassa_turi ON kassa_harakatlari(kassa_turi);

-- 9. Vaqtinchalik Qoralamalar (Telegram 1-Tap Tasdiqlash uchun)
CREATE TABLE IF NOT EXISTS tranzaksiya_qoralama (
    id TEXT PRIMARY KEY,
    malumot JSONB NOT NULL,
    yaratildi TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- STORED PROCEDURES / TRANZAKSIYALAR (ATOMIC FUNCTIONS)
-- ==============================================================================

-- 1. Savdoni Tasdiqlash va Baza Boyicha Atomik Yozish
CREATE OR REPLACE FUNCTION fn_savdo_yaratish(
    p_mijoz_id UUID,
    p_valyuta TEXT,
    p_tolangan NUMERIC,
    p_tolov_turi TEXT,
    p_kassa_turi TEXT,
    p_izoh TEXT,
    p_xodim TEXT,
    p_telegram_user_id BIGINT,
    p_qatorlar JSONB -- [{tovar_id, soni, narx, tannarx}]
) RETURNS UUID AS $$
DECLARE
    v_savdo_id UUID;
    v_jami NUMERIC := 0;
    v_qarz NUMERIC := 0;
    v_item JSONB;
    v_tovar_id UUID;
    v_soni NUMERIC;
    v_narx NUMERIC;
    v_tannarx NUMERIC;
    v_tovar_nomi TEXT;
BEGIN
    -- 1. Jami summani hisoblash
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_qatorlar) LOOP
        v_soni := (v_item->>'soni')::NUMERIC;
        v_narx := (v_item->>'narx')::NUMERIC;
        v_jami := v_jami + (v_soni * v_narx);
    END LOOP;

    v_qarz := GREATEST(v_jami - COALESCE(p_tolangan, 0), 0);

    -- 2. Savdolar jadvaliga kiritish
    INSERT INTO savdolar (
        mijoz_id, valyuta, jami_summa, tolangan_summa, qarz_summa,
        tolov_turi, kassa_turi, izoh, xodim, telegram_user_id
    ) VALUES (
        p_mijoz_id, p_valyuta, v_jami, COALESCE(p_tolangan, 0), v_qarz,
        p_tolov_turi, p_kassa_turi, p_izoh, p_xodim, p_telegram_user_id
    ) RETURNING id INTO v_savdo_id;

    -- 3. Savdo qatorlarini yozish va ombordan ayirish
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_qatorlar) LOOP
        v_tovar_id := (v_item->>'tovar_id')::UUID;
        v_soni := (v_item->>'soni')::NUMERIC;
        v_narx := (v_item->>'narx')::NUMERIC;
        v_tannarx := COALESCE((v_item->>'tannarx')::NUMERIC, 0);

        SELECT nom INTO v_tovar_nomi FROM tovarlar WHERE id = v_tovar_id;
        IF v_tovar_nomi IS NULL THEN
            v_tovar_nomi := COALESCE(v_item->>'nom', 'Noma''lum tovar');
        END IF;

        INSERT INTO savdo_qatorlari (
            savdo_id, tovar_id, tovar_nomi, soni, narx, tannarx, summa
        ) VALUES (
            v_savdo_id, v_tovar_id, v_tovar_nomi, v_soni, v_narx, v_tannarx, (v_soni * v_narx)
        );

        -- Ombordan ayirish
        IF v_tovar_id IS NOT NULL THEN
            UPDATE tovarlar
            SET qoldiq = qoldiq - v_soni
            WHERE id = v_tovar_id;
        END IF;
    END LOOP;

    -- 4. Mijoz qarzini oshirish (agar qarz bo'lsa)
    IF p_mijoz_id IS NOT NULL AND v_qarz > 0 THEN
        IF p_valyuta = 'USD' THEN
            UPDATE mijozlar SET qarz_usd = qarz_usd + v_qarz WHERE id = p_mijoz_id;
        ELSE
            UPDATE mijozlar SET qarz_uzs = qarz_uzs + v_qarz WHERE id = p_mijoz_id;
        END IF;
    END IF;

    -- 5. Kassaga pul tushgan bo'lsa, kassa_harakatlariga kirim qilish
    IF COALESCE(p_tolangan, 0) > 0 AND p_kassa_turi IS NOT NULL THEN
        INSERT INTO kassa_harakatlari (
            kassa_turi, amal, summa, valyuta, manba_turi, manba_id, izoh
        ) VALUES (
            p_kassa_turi, 'kirim', p_tolangan, p_valyuta, 'savdo', v_savdo_id,
            COALESCE(p_izoh, 'Savdo tushumi')
        );
    END IF;

    RETURN v_savdo_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Rasxod Kiritish va Kassadan Ayirish
CREATE OR REPLACE FUNCTION fn_rasxod_yaratish(
    p_summa NUMERIC,
    p_valyuta TEXT,
    p_kategoriya TEXT,
    p_tolov_turi TEXT,
    p_kassa_turi TEXT,
    p_izoh TEXT,
    p_xodim TEXT,
    p_telegram_user_id BIGINT
) RETURNS UUID AS $$
DECLARE
    v_rasxod_id UUID;
BEGIN
    INSERT INTO rasxodlar (
        summa, valyuta, kategoriya, tolov_turi, kassa_turi,
        izoh, xodim, telegram_user_id
    ) VALUES (
        p_summa, p_valyuta, p_kategoriya, p_tolov_turi, p_kassa_turi,
        p_izoh, p_xodim, p_telegram_user_id
    ) RETURNING id INTO v_rasxod_id;

    -- Kassadan chiqim qilish
    INSERT INTO kassa_harakatlari (
        kassa_turi, amal, summa, valyuta, manba_turi, manba_id, izoh
    ) VALUES (
        p_kassa_turi, 'chiqim', p_summa, p_valyuta, 'rasxod', v_rasxod_id,
        p_kategoriya || ': ' || COALESCE(p_izoh, '')
    );

    RETURN v_rasxod_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Qarz To'lovini Qabul Qilish va Kassaga Qo'shish
CREATE OR REPLACE FUNCTION fn_qarz_tolov_yaratish(
    p_mijoz_id UUID,
    p_summa NUMERIC,
    p_valyuta TEXT,
    p_tolov_turi TEXT,
    p_kassa_turi TEXT,
    p_izoh TEXT,
    p_xodim TEXT,
    p_telegram_user_id BIGINT
) RETURNS UUID AS $$
DECLARE
    v_tolov_id UUID;
BEGIN
    INSERT INTO qarz_tolovlari (
        mijoz_id, summa, valyuta, tolov_turi, kassa_turi,
        izoh, xodim, telegram_user_id
    ) VALUES (
        p_mijoz_id, p_summa, p_valyuta, p_tolov_turi, p_kassa_turi,
        p_izoh, p_xodim, p_telegram_user_id
    ) RETURNING id INTO v_tolov_id;

    -- Mijoz qarzini kamaytirish
    IF p_valyuta = 'USD' THEN
        UPDATE mijozlar SET qarz_usd = GREATEST(qarz_usd - p_summa, 0) WHERE id = p_mijoz_id;
    ELSE
        UPDATE mijozlar SET qarz_uzs = GREATEST(qarz_uzs - p_summa, 0) WHERE id = p_mijoz_id;
    END IF;

    -- Kassaga kirim qilish
    INSERT INTO kassa_harakatlari (
        kassa_turi, amal, summa, valyuta, manba_turi, manba_id, izoh
    ) VALUES (
        p_kassa_turi, 'kirim', p_summa, p_valyuta, 'qarz_tolov', v_tolov_id,
        'Qarz to''lovi: ' || COALESCE(p_izoh, '')
    );

    RETURN v_tolov_id;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- REAL-TIME KO'RINISHLAR (VIEWS)
-- ==============================================================================

-- 1. Kassa Balanslari (Jonli hisob)
CREATE OR REPLACE VIEW view_kassa_balans AS
SELECT
    kassa_turi,
    valyuta,
    SUM(CASE WHEN amal = 'kirim' THEN summa ELSE -summa END) AS joriy_balans
FROM kassa_harakatlari
GROUP BY kassa_turi, valyuta;

-- 2. Bugungi Xulosa (Today's Executive Dashboard)
CREATE OR REPLACE VIEW view_bugungi_hisobot AS
SELECT
    CURRENT_DATE AS sana,
    COALESCE((SELECT SUM(jami_summa) FROM savdolar WHERE sana_vaqt::date = CURRENT_DATE AND holat = 'yakunlandi' AND valyuta = 'UZS'), 0) AS savdo_uzs,
    COALESCE((SELECT SUM(jami_summa) FROM savdolar WHERE sana_vaqt::date = CURRENT_DATE AND holat = 'yakunlandi' AND valyuta = 'USD'), 0) AS savdo_usd,
    COALESCE((SELECT SUM(summa) FROM rasxodlar WHERE sana_vaqt::date = CURRENT_DATE AND holat = 'faol' AND valyuta = 'UZS'), 0) AS rasxod_uzs,
    COALESCE((SELECT SUM(summa) FROM rasxodlar WHERE sana_vaqt::date = CURRENT_DATE AND holat = 'faol' AND valyuta = 'USD'), 0) AS rasxod_usd,
    COALESCE((SELECT SUM(summa) FROM qarz_tolovlari WHERE sana_vaqt::date = CURRENT_DATE AND valyuta = 'UZS'), 0) AS qarz_tolov_uzs,
    COALESCE((SELECT SUM(summa) FROM qarz_tolovlari WHERE sana_vaqt::date = CURRENT_DATE AND valyuta = 'USD'), 0) AS qarz_tolov_usd;
