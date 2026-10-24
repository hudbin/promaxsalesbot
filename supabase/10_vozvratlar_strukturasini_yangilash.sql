-- ==============================================================================
-- 10. TOVAR QAYTARISHLAR (VOZVRATLAR) VA AKT-SVERKA TO'LIQ INTEGRATSIYASI
-- ==============================================================================

-- 1. tovar_qaytarishlar JADVALI
CREATE TABLE IF NOT EXISTS tovar_qaytarishlar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raqam SERIAL,
    sana_vaqt TIMESTAMPTZ NOT NULL DEFAULT now(),
    mijoz_id UUID REFERENCES mijozlar(id) ON DELETE SET NULL,
    valyuta TEXT NOT NULL DEFAULT 'UZS' CHECK (valyuta IN ('UZS', 'USD')),
    jami_summa NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (jami_summa >= 0),
    qarzdan_ayirildi NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (qarzdan_ayirildi >= 0),
    naqd_qaytarildi NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (naqd_qaytarildi >= 0),
    hisob_id UUID REFERENCES hisoblar(id) ON DELETE SET NULL,
    izoh TEXT,
    xodim TEXT,
    telegram_user_id BIGINT,
    holat TEXT NOT NULL DEFAULT 'faol' CHECK (holat IN ('faol', 'bekor_qilindi')),
    yaratilgan TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tovar_qaytarishlar_mijoz ON tovar_qaytarishlar(mijoz_id);
CREATE INDEX IF NOT EXISTS ix_tovar_qaytarishlar_sana ON tovar_qaytarishlar(sana_vaqt);
CREATE INDEX IF NOT EXISTS ix_tovar_qaytarishlar_holat ON tovar_qaytarishlar(holat);

ALTER TABLE tovar_qaytarishlar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all for tovar_qaytarishlar" ON tovar_qaytarishlar;
CREATE POLICY "Allow public all for tovar_qaytarishlar" ON tovar_qaytarishlar FOR ALL USING (true) WITH CHECK (true);

-- 2. tovar_qaytarish_qatorlari JADVALI
CREATE TABLE IF NOT EXISTS tovar_qaytarish_qatorlari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qaytarish_id UUID NOT NULL REFERENCES tovar_qaytarishlar(id) ON DELETE CASCADE,
    tovar_id UUID REFERENCES tovarlar(id) ON DELETE SET NULL,
    tovar_nomi TEXT NOT NULL,
    soni NUMERIC(12, 2) NOT NULL DEFAULT 1 CHECK (soni > 0),
    narx NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (narx >= 0),
    summa NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (summa >= 0)
);

CREATE INDEX IF NOT EXISTS ix_tovar_qaytarish_qatorlari_doc ON tovar_qaytarish_qatorlari(qaytarish_id);

ALTER TABLE tovar_qaytarish_qatorlari ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all for tovar_qaytarish_qatorlari" ON tovar_qaytarish_qatorlari;
CREATE POLICY "Allow public all for tovar_qaytarish_qatorlari" ON tovar_qaytarish_qatorlari FOR ALL USING (true) WITH CHECK (true);

-- 3. ATOMIK VOZVRAT YARATISH FUNKSIYASI
CREATE OR REPLACE FUNCTION fn_tovar_vozvrat_yaratish(
    p_mijoz_id UUID,
    p_valyuta TEXT,
    p_jami_summa NUMERIC,
    p_qarzdan_ayirildi NUMERIC,
    p_naqd_qaytarildi NUMERIC,
    p_hisob_id UUID,
    p_izoh TEXT,
    p_xodim TEXT,
    p_telegram_user_id BIGINT,
    p_qatorlar JSONB -- [{tovar_id, tovar_nomi, soni, narx, summa}]
) RETURNS UUID AS $$
DECLARE
    v_vozvrat_id UUID;
    v_item JSONB;
    v_tovar_id UUID;
    v_soni NUMERIC;
    v_narx NUMERIC;
    v_summa NUMERIC;
    v_nom TEXT;
    v_qarz_ayir NUMERIC := COALESCE(p_qarzdan_ayirildi, 0);
    v_naqd_qayt NUMERIC := COALESCE(p_naqd_qaytarildi, 0);
    v_kassa_turi TEXT := 'naqd';
BEGIN
    -- 1. Asosiy vozvrat hujjatini kiritish
    INSERT INTO tovar_qaytarishlar (
        mijoz_id, valyuta, jami_summa, qarzdan_ayirildi, naqd_qaytarildi,
        hisob_id, izoh, xodim, telegram_user_id, holat
    ) VALUES (
        p_mijoz_id, COALESCE(p_valyuta, 'UZS'), COALESCE(p_jami_summa, 0),
        v_qarz_ayir, v_naqd_qayt, p_hisob_id, p_izoh, p_xodim, p_telegram_user_id, 'faol'
    ) RETURNING id INTO v_vozvrat_id;

    -- 2. Tovar qatorlarini yozish va ombor qoldig'ini OSHIRISH (+)
    IF p_qatorlar IS NOT NULL AND jsonb_typeof(p_qatorlar) = 'array' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_qatorlar) LOOP
            BEGIN
                v_tovar_id := NULLIF(trim(COALESCE(v_item->>'tovar_id', '')), '')::UUID;
            EXCEPTION WHEN OTHERS THEN
                v_tovar_id := NULL;
            END;

            v_soni := GREATEST(COALESCE((v_item->>'soni')::NUMERIC, 1), 1);
            v_narx := GREATEST(COALESCE((v_item->>'narx')::NUMERIC, 0), 0);
            v_summa := COALESCE((v_item->>'summa')::NUMERIC, v_soni * v_narx);
            v_nom := COALESCE(NULLIF(trim(v_item->>'tovar_nomi'), ''), NULLIF(trim(v_item->>'nom'), ''), 'Qaytarilgan tovar');

            -- Agar tovar_id berilmagan bo'lsa, nom yoki model bo'yicha qidirib ko'rish
            IF v_tovar_id IS NULL THEN
                SELECT id INTO v_tovar_id 
                FROM tovarlar 
                WHERE faol = true AND (lower(nom) = lower(v_nom) OR lower(COALESCE(model, '')) = lower(v_nom))
                LIMIT 1;
            END IF;

            INSERT INTO tovar_qaytarish_qatorlari (
                qaytarish_id, tovar_id, tovar_nomi, soni, narx, summa
            ) VALUES (
                v_vozvrat_id, v_tovar_id, v_nom, v_soni, v_narx, v_summa
            );

            -- Tovarni ombor qoldig'iga qo'shish (+)
            IF v_tovar_id IS NOT NULL THEN
                UPDATE tovarlar 
                SET qoldiq = qoldiq + v_soni 
                WHERE id = v_tovar_id;
            END IF;
        END LOOP;
    END IF;

    -- 3. Mijoz qarzini kamaytirish (-)
    IF p_mijoz_id IS NOT NULL AND v_qarz_ayir > 0 THEN
        IF p_valyuta = 'USD' THEN
            UPDATE mijozlar 
            SET qarz_usd = GREATEST(qarz_usd - v_qarz_ayir, 0) 
            WHERE id = p_mijoz_id;
        ELSE
            UPDATE mijozlar 
            SET qarz_uzs = GREATEST(qarz_uzs - v_qarz_ayir, 0) 
            WHERE id = p_mijoz_id;
        END IF;
    END IF;

    -- 4. Agar mijozga kassadan naqd pul qaytarilgan bo'lsa, kassa_harakatlariga chiqim yozish (-)
    IF v_naqd_qayt > 0 AND p_hisob_id IS NOT NULL THEN
        SELECT COALESCE(turi, 'naqd') INTO v_kassa_turi FROM hisoblar WHERE id = p_hisob_id;
        INSERT INTO kassa_harakatlari (
            hisob_id, kassa_turi, amal, summa, valyuta, manba_turi, manba_id, izoh
        ) VALUES (
            p_hisob_id, v_kassa_turi, 'chiqim', v_naqd_qayt, COALESCE(p_valyuta, 'UZS'),
            'rasxod', v_vozvrat_id, 'Tovar qaytarildi (Vozvrat to''lovi): ' || COALESCE(p_izoh, '')
        );
    END IF;

    RETURN v_vozvrat_id;
END;
$$ LANGUAGE plpgsql;
