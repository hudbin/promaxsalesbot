-- ==============================================================================
-- 07. TANISHLAR BILAN QARZ OLDI-BERDISI VA MAOSH MIGRATSIYASI
-- ==============================================================================

-- 1. kassa_harakatlari manba_turi constraintini kengaytirish
ALTER TABLE kassa_harakatlari DROP CONSTRAINT IF EXISTS kassa_harakatlari_manba_turi_check;
ALTER TABLE kassa_harakatlari ADD CONSTRAINT kassa_harakatlari_manba_turi_check 
    CHECK (manba_turi IN (
        'savdo', 'rasxod', 'qarz_tolov', 'kassalar_aro', 'boshlangich', 'transfer', 'korrektirovka',
        'tashqi_qarz_olish', 'tashqi_qarz_qaytarish', 'tashqi_qarz_berish', 'tashqi_qarz_qaytishi'
    ));

-- 2. tashqi_qarzlar JADVALI (Ledger / Hodisalar daftari)
CREATE TABLE IF NOT EXISTS tashqi_qarzlar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sana_vaqt TIMESTAMPTZ NOT NULL DEFAULT now(),
    shaxs_nomi TEXT NOT NULL,                                     -- Masalan: "Ali aka", "Akmal"
    shaxs_nomi_norm TEXT NOT NULL,                                -- lower(trim(shaxs_nomi))
    amal TEXT NOT NULL CHECK (amal IN ('oldim', 'qaytardim', 'berdim', 'qaytdi')),
    summa NUMERIC(15, 2) NOT NULL CHECK (summa > 0),
    valyuta TEXT NOT NULL DEFAULT 'UZS' CHECK (valyuta IN ('UZS', 'USD')),
    maqsad TEXT,                                                  -- Masalan: "Oylik uchun", "Tovar uchun", "Shaxsiy"
    hisob_id UUID REFERENCES hisoblar(id) ON DELETE SET NULL,     -- Do'kon kassasi / kartasi
    kassaga_tasir BOOLEAN NOT NULL DEFAULT false,
    bevosita_rasxod_id UUID REFERENCES rasxodlar(id) ON DELETE SET NULL, -- To'g'ridan-to'g'ri oylikka ketgan bo'lsa
    izoh TEXT,
    xodim TEXT,
    telegram_user_id BIGINT,
    holat TEXT NOT NULL DEFAULT 'faol' CHECK (holat IN ('faol', 'bekor_qilindi')),
    yaratilgan TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tashqi_qarzlar_shaxs ON tashqi_qarzlar(shaxs_nomi_norm);
CREATE INDEX IF NOT EXISTS ix_tashqi_qarzlar_sana ON tashqi_qarzlar(sana_vaqt);
CREATE INDEX IF NOT EXISTS ix_tashqi_qarzlar_holat ON tashqi_qarzlar(holat);

-- RLS
ALTER TABLE tashqi_qarzlar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all for tashqi_qarzlar" ON tashqi_qarzlar FOR ALL USING (true) WITH CHECK (true);

-- 3. DINAMIK BALANS VIEW (view_tashqi_qarzlar_balans)
CREATE OR REPLACE VIEW view_tashqi_qarzlar_balans AS
SELECT
    shaxs_nomi_norm,
    max(shaxs_nomi) AS shaxs_nomi,
    valyuta,
    -- Biz qarz olgan tomon:
    SUM(CASE WHEN amal = 'oldim' THEN summa ELSE 0 END) AS jami_olingan,
    SUM(CASE WHEN amal = 'qaytardim' THEN summa ELSE 0 END) AS jami_qaytarilgan,
    -- Biz qarz bergan tomon:
    SUM(CASE WHEN amal = 'berdim' THEN summa ELSE 0 END) AS jami_berilgan,
    SUM(CASE WHEN amal = 'qaytdi' THEN summa ELSE 0 END) AS jami_qaytgan,
    -- Sof qoldiqlar:
    GREATEST(SUM(CASE WHEN amal = 'oldim' THEN summa WHEN amal = 'qaytardim' THEN -summa ELSE 0 END), 0) AS biz_berishimiz_kerak,
    GREATEST(SUM(CASE WHEN amal = 'berdim' THEN summa WHEN amal = 'qaytdi' THEN -summa ELSE 0 END), 0) AS biz_olishimiz_kerak,
    MAX(sana_vaqt) AS oxirgi_harakat
FROM tashqi_qarzlar
WHERE holat = 'faol'
GROUP BY shaxs_nomi_norm, valyuta;

-- 4. STORED PROCEDURE: fn_tashqi_qarz_yaratish
CREATE OR REPLACE FUNCTION fn_tashqi_qarz_yaratish(
    p_shaxs_nomi TEXT,
    p_amal TEXT,               -- 'oldim', 'qaytardim', 'berdim', 'qaytdi'
    p_summa NUMERIC,
    p_valyuta TEXT DEFAULT 'UZS',
    p_hisob_id UUID DEFAULT NULL,
    p_bevosita_oylik BOOLEAN DEFAULT false,
    p_maqsad TEXT DEFAULT NULL,
    p_izoh TEXT DEFAULT NULL,
    p_xodim TEXT DEFAULT NULL,
    p_telegram_user_id BIGINT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_norm TEXT := lower(trim(p_shaxs_nomi));
    v_qarz_id UUID := gen_random_uuid();
    v_rasxod_id UUID := NULL;
    v_kassa_amal TEXT;
    v_manba_turi TEXT;
    v_kassa_izoh TEXT;
    v_hisob_nomi TEXT := NULL;
    v_biz_berishimiz NUMERIC := 0;
    v_biz_olishimiz NUMERIC := 0;
BEGIN
    IF p_summa IS NULL OR p_summa <= 0 THEN
        RAISE EXCEPTION 'Qarz summasi musbat bo''lishi shart!';
    END IF;

    IF v_norm = '' THEN
        RAISE EXCEPTION 'Shaxs ismi kiritilishi shart!';
    END IF;

    IF p_amal NOT IN ('oldim', 'qaytardim', 'berdim', 'qaytdi') THEN
        RAISE EXCEPTION 'Noto''g''ri amal turi: %', p_amal;
    END IF;

    -- 1. Agar to'g'ridan-to'g'ri ishchiga oylik sifatida berilgan bo'lsa (amal = 'oldim' da)
    IF p_bevosita_oylik AND p_amal = 'oldim' THEN
        INSERT INTO rasxodlar (
            summa,
            valyuta,
            kategoriya,
            tolov_turi,
            hisob_id,
            izoh,
            xodim,
            telegram_user_id
        ) VALUES (
            p_summa,
            p_valyuta,
            'Oylik',
            'naqd',
            p_hisob_id,
            COALESCE(p_maqsad, 'Oylik') || ' (' || p_shaxs_nomi || 'dan to''g''ridan-to''g''ri)' || COALESCE(': ' || p_izoh, ''),
            p_xodim,
            p_telegram_user_id
        ) RETURNING id INTO v_rasxod_id;
    END IF;

    -- 2. tashqi_qarzlar jadvaliga yozish
    INSERT INTO tashqi_qarzlar (
        id,
        sana_vaqt,
        shaxs_nomi,
        shaxs_nomi_norm,
        amal,
        summa,
        valyuta,
        maqsad,
        hisob_id,
        kassaga_tasir,
        bevosita_rasxod_id,
        izoh,
        xodim,
        telegram_user_id,
        holat
    ) VALUES (
        v_qarz_id,
        now(),
        trim(p_shaxs_nomi),
        v_norm,
        p_amal,
        p_summa,
        p_valyuta,
        p_maqsad,
        p_hisob_id,
        (p_hisob_id IS NOT NULL),
        v_rasxod_id,
        p_izoh,
        p_xodim,
        p_telegram_user_id,
        'faol'
    );

    -- 3. Agar kassa/hisob ko'rsatilgan bo'lsa, kassa_harakatlariga kirim yoki chiqim yozish
    IF p_hisob_id IS NOT NULL THEN
        SELECT nom INTO v_hisob_nomi FROM hisoblar WHERE id = p_hisob_id;

        IF p_amal = 'oldim' THEN
            v_kassa_amal := 'kirim';
            v_manba_turi := 'tashqi_qarz_olish';
            v_kassa_izoh := 'Qarz olindi: ' || p_shaxs_nomi || COALESCE(' (' || p_izoh || ')', '');
        ELSIF p_amal = 'qaytardim' THEN
            v_kassa_amal := 'chiqim';
            v_manba_turi := 'tashqi_qarz_qaytarish';
            v_kassa_izoh := 'Qarz qaytarildi: ' || p_shaxs_nomi || COALESCE(' (' || p_izoh || ')', '');
        ELSIF p_amal = 'berdim' THEN
            v_kassa_amal := 'chiqim';
            v_manba_turi := 'tashqi_qarz_berish';
            v_kassa_izoh := 'Qarz berildi: ' || p_shaxs_nomi || COALESCE(' (' || p_izoh || ')', '');
        ELSIF p_amal = 'qaytdi' THEN
            v_kassa_amal := 'kirim';
            v_manba_turi := 'tashqi_qarz_qaytishi';
            v_kassa_izoh := 'Berilgan qarz qaytdi: ' || p_shaxs_nomi || COALESCE(' (' || p_izoh || ')', '');
        END IF;

        INSERT INTO kassa_harakatlari (
            id,
            sana_vaqt,
            kassa_turi,
            amal,
            summa,
            valyuta,
            manba_turi,
            manba_id,
            izoh,
            hisob_id
        ) VALUES (
            gen_random_uuid(),
            now(),
            NULL,
            v_kassa_amal,
            p_summa,
            p_valyuta,
            v_manba_turi,
            v_qarz_id,
            v_kassa_izoh,
            p_hisob_id
        );
    END IF;

    -- 4. Ushbu shaxs bo'yicha joriy qoldiqni hisoblash
    SELECT 
        biz_berishimiz_kerak,
        biz_olishimiz_kerak
    INTO v_biz_berishimiz, v_biz_olishimiz
    FROM view_tashqi_qarzlar_balans
    WHERE shaxs_nomi_norm = v_norm AND valyuta = p_valyuta;

    RETURN jsonb_build_object(
        'ok', true,
        'qarz_id', v_qarz_id,
        'shaxs_nomi', trim(p_shaxs_nomi),
        'amal', p_amal,
        'summa', p_summa,
        'valyuta', p_valyuta,
        'hisob_id', p_hisob_id,
        'hisob_nomi', v_hisob_nomi,
        'bevosita_rasxod_id', v_rasxod_id,
        'biz_berishimiz_kerak', COALESCE(v_biz_berishimiz, 0),
        'biz_olishimiz_kerak', COALESCE(v_biz_olishimiz, 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. STORED PROCEDURE: fn_tashqi_qarz_bekor_qilish
CREATE OR REPLACE FUNCTION fn_tashqi_qarz_bekor_qilish(
    p_qarz_id UUID,
    p_xodim TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_rec RECORD;
BEGIN
    SELECT * INTO v_rec FROM tashqi_qarzlar WHERE id = p_qarz_id AND holat = 'faol';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Qarz yozuvi topilmadi yoki allaqachon bekor qilingan.';
    END IF;

    -- 1. Agar kassa harakati bo'lsa, o'chiramiz
    DELETE FROM kassa_harakatlari WHERE manba_id = p_qarz_id;

    -- 2. Agar bevosita rasxod bo'lgan bo'lsa, bekor qilamiz
    IF v_rec.bevosita_rasxod_id IS NOT NULL THEN
        UPDATE rasxodlar 
        SET holat = 'bekor_qilindi',
            izoh = COALESCE(izoh, '') || ' (BEKOR QILINDI)'
        WHERE id = v_rec.bevosita_rasxod_id;
    END IF;

    -- 3. tashqi_qarzlar holatini bekor_qilindi ga o'zgartirish
    UPDATE tashqi_qarzlar
    SET holat = 'bekor_qilindi',
        izoh = COALESCE(izoh, '') || ' (BEKOR QILINDI: ' || COALESCE(p_xodim, 'Admin') || ')'
    WHERE id = p_qarz_id;

    RETURN jsonb_build_object(
        'ok', true,
        'qarz_id', p_qarz_id,
        'shaxs_nomi', v_rec.shaxs_nomi,
        'xabar', 'Qarz yozuvi muvaffaqiyatli bekor qilindi'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
