-- ==============================================================================
-- 08. BOSHQA KIRIMLAR (XIZMAT, DAROMAD VA BOSHQA TUSHUMLAR) MIGRATSIYASI
-- ==============================================================================

-- 1. kassa_harakatlari manba_turi CHECK constraintini kengaytirish
ALTER TABLE kassa_harakatlari DROP CONSTRAINT IF EXISTS kassa_harakatlari_manba_turi_check;
ALTER TABLE kassa_harakatlari ADD CONSTRAINT kassa_harakatlari_manba_turi_check 
    CHECK (manba_turi IN (
        'savdo', 'rasxod', 'qarz_tolov', 'kassalar_aro', 'boshlangich', 'transfer', 'korrektirovka',
        'tashqi_qarz_olish', 'tashqi_qarz_qaytarish', 'tashqi_qarz_berish', 'tashqi_qarz_qaytishi',
        'boshqa_kirim'
    ));

-- 2. boshqa_kirimlar JADVALI (Xizmatlar, beg'araz tushumlar, boshqa daromadlar daftari)
CREATE TABLE IF NOT EXISTS boshqa_kirimlar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sana_vaqt TIMESTAMPTZ NOT NULL DEFAULT now(),
    summa NUMERIC(15, 2) NOT NULL CHECK (summa > 0),
    valyuta TEXT NOT NULL DEFAULT 'UZS' CHECK (valyuta IN ('UZS', 'USD')),
    kategoriya TEXT NOT NULL DEFAULT 'Boshqa daromad',            -- Masalan: "Xizmat ko'rsatish", "Tanishdan tushum", "Investitsiya", "Ijara", "Boshqa"
    manba_nomi TEXT,                                              -- Kimdan yoki qayerdan kelgani (masalan: "Tanishim", "Akrom", "Payme")
    hisob_id UUID REFERENCES hisoblar(id) ON DELETE SET NULL,     -- Pul tushgan kassa / hisob
    izoh TEXT,
    xodim TEXT,
    telegram_user_id BIGINT,
    holat TEXT NOT NULL DEFAULT 'faol' CHECK (holat IN ('faol', 'bekor_qilindi')),
    yaratilgan TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_boshqa_kirimlar_sana ON boshqa_kirimlar(sana_vaqt);
CREATE INDEX IF NOT EXISTS ix_boshqa_kirimlar_holat ON boshqa_kirimlar(holat);
CREATE INDEX IF NOT EXISTS ix_boshqa_kirimlar_kategoriya ON boshqa_kirimlar(kategoriya);

-- RLS
ALTER TABLE boshqa_kirimlar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all for boshqa_kirimlar" ON boshqa_kirimlar FOR ALL USING (true) WITH CHECK (true);

-- 3. STORED PROCEDURE: fn_boshqa_kirim_yaratish
CREATE OR REPLACE FUNCTION fn_boshqa_kirim_yaratish(
    p_summa NUMERIC,
    p_valyuta TEXT,
    p_kategoriya TEXT,
    p_manba_nomi TEXT,
    p_hisob_id UUID,
    p_izoh TEXT,
    p_xodim TEXT,
    p_telegram_user_id BIGINT
) RETURNS UUID AS $$
DECLARE
    v_kirim_id UUID;
    v_kassa_nomi TEXT := 'Kassa';
    v_kassa_turi TEXT := 'naqd';
    v_izoh_matn TEXT;
BEGIN
    IF p_summa IS NULL OR p_summa <= 0 THEN
        RAISE EXCEPTION 'Kirim summasi 0 dan katta bo''lishi shart!';
    END IF;

    -- Hisob ma'lumotlarini olish
    IF p_hisob_id IS NOT NULL THEN
        SELECT nom, turi INTO v_kassa_nomi, v_kassa_turi
        FROM hisoblar
        WHERE id = p_hisob_id;
    END IF;

    -- 1. boshqa_kirimlar jadvaliga yozish
    INSERT INTO boshqa_kirimlar (
        summa, valyuta, kategoriya, manba_nomi, hisob_id,
        izoh, xodim, telegram_user_id
    ) VALUES (
        p_summa,
        COALESCE(p_valyuta, 'UZS'),
        COALESCE(NULLIF(trim(p_kategoriya), ''), 'Boshqa daromad'),
        NULLIF(trim(p_manba_nomi), ''),
        p_hisob_id,
        p_izoh,
        p_xodim,
        p_telegram_user_id
    ) RETURNING id INTO v_kirim_id;

    -- Izoh matnini shakllantirish
    v_izoh_matn := COALESCE(NULLIF(trim(p_kategoriya), ''), 'Boshqa kirim');
    IF p_manba_nomi IS NOT NULL AND trim(p_manba_nomi) <> '' THEN
        v_izoh_matn := v_izoh_matn || ' (' || trim(p_manba_nomi) || ')';
    END IF;
    IF p_izoh IS NOT NULL AND trim(p_izoh) <> '' THEN
        v_izoh_matn := v_izoh_matn || ': ' || trim(p_izoh);
    END IF;

    -- 2. kassa_harakatlariga kirim yozish (Balans oshadi)
    INSERT INTO kassa_harakatlari (
        hisob_id,
        kassa_turi,
        amal,
        summa,
        valyuta,
        manba_turi,
        manba_id,
        izoh
    ) VALUES (
        p_hisob_id,
        v_kassa_turi,
        'kirim',
        p_summa,
        COALESCE(p_valyuta, 'UZS'),
        'boshqa_kirim',
        v_kirim_id,
        v_izoh_matn
    );

    RETURN v_kirim_id;
END;
$$ LANGUAGE plpgsql;
