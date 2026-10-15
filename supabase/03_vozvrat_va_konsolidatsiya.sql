-- ==============================================================================
-- 03_vozvrat_va_konsolidatsiya.sql
-- 1. TOVAR QAYTARISH (VOZVRAT) STRUKTURASI VA ATOMIK FUNKSIYASI
-- 2. TOVARLARNING RANGLARINI MODEL (ARTIKUL) BO'YICHA BIRLASHTIRISH SKRIPTI
-- ==============================================================================

-- 1. Tovar Qaytarishlar (Vozvrat Hujjatlari) Jadvali
CREATE TABLE IF NOT EXISTS tovar_qaytarishlar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raqam SERIAL,
    sana_vaqt TIMESTAMPTZ NOT NULL DEFAULT now(),
    mijoz_id UUID REFERENCES mijozlar(id) ON DELETE SET NULL,
    valyuta TEXT NOT NULL DEFAULT 'UZS' CHECK (valyuta IN ('UZS', 'USD')),
    jami_summa NUMERIC(15, 2) NOT NULL CHECK (jami_summa >= 0),
    qarzdan_ayirildi NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (qarzdan_ayirildi >= 0),
    naqd_qaytarildi NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (naqd_qaytarildi >= 0),
    hisob_id UUID REFERENCES hisoblar(id),
    izoh TEXT,
    xodim TEXT,
    telegram_user_id BIGINT,
    holat TEXT NOT NULL DEFAULT 'faol' CHECK (holat IN ('faol', 'bekor_qilindi')),
    yaratilgan TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tovar_qaytarishlar_mijoz ON tovar_qaytarishlar(mijoz_id);
CREATE INDEX IF NOT EXISTS ix_tovar_qaytarishlar_sana ON tovar_qaytarishlar(sana_vaqt);

-- RLS yoqish
ALTER TABLE tovar_qaytarishlar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all for tovar_qaytarishlar" ON tovar_qaytarishlar FOR ALL USING (true) WITH CHECK (true);

-- 2. Tovar Qaytarish Qatorlari Jadvali
CREATE TABLE IF NOT EXISTS tovar_qaytarish_qatorlari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qaytarish_id UUID NOT NULL REFERENCES tovar_qaytarishlar(id) ON DELETE CASCADE,
    tovar_id UUID REFERENCES tovarlar(id) ON DELETE SET NULL,
    tovar_nomi TEXT NOT NULL,
    soni NUMERIC(12, 2) NOT NULL CHECK (soni > 0),
    narx NUMERIC(15, 2) NOT NULL CHECK (narx >= 0),
    summa NUMERIC(15, 2) NOT NULL CHECK (summa >= 0)
);

CREATE INDEX IF NOT EXISTS ix_tovar_qaytarish_qatorlari_doc ON tovar_qaytarish_qatorlari(qaytarish_id);

ALTER TABLE tovar_qaytarish_qatorlari ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all for tovar_qaytarish_qatorlari" ON tovar_qaytarish_qatorlari FOR ALL USING (true) WITH CHECK (true);

-- 3. Atomik Vozvrat Yaratish Protsedurasi
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
    v_kassa_nomi TEXT;
BEGIN
    -- 1. Asosiy vozvrat hujjatini kiritish
    INSERT INTO tovar_qaytarishlar (
        mijoz_id, valyuta, jami_summa, qarzdan_ayirildi, naqd_qaytarildi,
        hisob_id, izoh, xodim, telegram_user_id
    ) VALUES (
        p_mijoz_id, COALESCE(p_valyuta, 'UZS'), COALESCE(p_jami_summa, 0),
        v_qarz_ayir, v_naqd_qayt, p_hisob_id, p_izoh, p_xodim, p_telegram_user_id
    ) RETURNING id INTO v_vozvrat_id;

    -- 2. Tovar qatorlarini yozish va ombor qoldig'ini OSHIRISH (+)
    IF p_qatorlar IS NOT NULL AND jsonb_typeof(p_qatorlar) = 'array' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_qatorlar) LOOP
            BEGIN
                v_tovar_id := NULLIF(trim(COALESCE(v_item->>'tovar_id', '')), '')::UUID;
            EXCEPTION WHEN OTHERS THEN
                v_tovar_id := NULL;
            END;

            v_soni := COALESCE((v_item->>'soni')::NUMERIC, 0);
            v_narx := COALESCE((v_item->>'narx')::NUMERIC, 0);
            v_summa := COALESCE((v_item->>'summa')::NUMERIC, v_soni * v_narx);
            v_nom := COALESCE(v_item->>'tovar_nomi', v_item->>'nom', 'Qaytarilgan tovar');

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
            IF v_tovar_id IS NOT NULL AND v_soni > 0 THEN
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
        SELECT nom INTO v_kassa_nomi FROM hisoblar WHERE id = p_hisob_id;
        INSERT INTO kassa_harakatlari (
            hisob_id, kassa_turi, amal, summa, valyuta, manba_turi, manba_id, izoh
        ) VALUES (
            p_hisob_id, 'naqd_uzs', 'chiqim', v_naqd_qayt, COALESCE(p_valyuta, 'UZS'),
            'rasxod', v_vozvrat_id, 'Tovar qaytarildi (Vozvrat to''lovi): ' || COALESCE(p_izoh, '')
        );
    END IF;

    RETURN v_vozvrat_id;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 4. TOVARLARNI MODEL BO'YICHA BIRLASHTIRISH (KONSOLIDATSIYA) FUNKSIYASI
-- Ushbu funksiya bir xil modeldagi barcha rangli tovarlarni bitta toza tovarga
-- jamlab, ularning qoldiqlarini qo'shadi va ortiqcha rangli dublikatlarni arxivlaydi.
-- ==============================================================================
CREATE OR REPLACE FUNCTION fn_tovarlarni_model_boyicha_birlashtirish()
RETURNS TABLE (
    model_nomi TEXT,
    birlashgan_ranglar_soni INT,
    jami_yangi_qoldiq NUMERIC
) AS $$
DECLARE
    r RECORD;
    v_asosiy_id UUID;
    v_jami_qoldiq NUMERIC;
    v_tannarx NUMERIC;
    v_narx_optom NUMERIC;
    v_narx_chakana NUMERIC;
    v_valyuta TEXT;
    v_birlik TEXT;
    v_count INT;
BEGIN
    -- Har bir model bo'yicha guruhlash (model NULL bo'lmagan va bo'sh bo'lmagan)
    FOR r IN 
        SELECT 
            trim(model) AS m_nom,
            COUNT(*) AS cnt,
            SUM(qoldiq) AS total_qoldiq,
            MAX(narx_optom) AS optom_max,
            MAX(tannarx) AS tan_max,
            MAX(narx_chakana) AS chak_max,
            MODE() WITHIN GROUP (ORDER BY valyuta) AS val,
            MODE() WITHIN GROUP (ORDER BY birlik) AS bir
        FROM tovarlar
        WHERE faol = true AND model IS NOT NULL AND trim(model) != ''
        GROUP BY trim(model)
        HAVING COUNT(*) > 1
    LOOP
        v_count := r.cnt;
        v_jami_qoldiq := r.total_qoldiq;

        -- 1. Ushbu model bo'yicha bitta asosiy tovar sifatida eng ko'p qoldiqqa ega tovarni tanlaymiz
        SELECT id INTO v_asosiy_id
        FROM tovarlar
        WHERE faol = true AND trim(model) = r.m_nom
        ORDER BY qoldiq DESC, yaratilgan ASC
        LIMIT 1;

        -- 2. Asosiy tovar nomini toza Model nomi qilib belgilaymiz va jami qoldiqni beramiz
        UPDATE tovarlar
        SET nom = r.m_nom,
            model = r.m_nom,
            qoldiq = v_jami_qoldiq,
            narx_optom = COALESCE(NULLIF(r.optom_max, 0), narx_optom),
            tannarx = COALESCE(NULLIF(r.tan_max, 0), tannarx),
            valyuta = COALESCE(r.val, 'UZS'),
            birlik = COALESCE(r.bir, 'dona'),
            faol = true
        WHERE id = v_asosiy_id;

        -- 3. Qolgan boshqa rangli tovarlarni nofaol (arxiv) qilamiz va qoldiqlarini 0 qilamiz
        UPDATE tovarlar
        SET faol = false,
            qoldiq = 0,
            izoh = COALESCE(izoh, '') || ' [Modelga birlashtirildi: ' || r.m_nom || ']'
        WHERE faol = true AND trim(model) = r.m_nom AND id != v_asosiy_id;

        model_nomi := r.m_nom;
        birlashgan_ranglar_soni := v_count;
        jami_yangi_qoldiq := v_jami_qoldiq;
        RETURN NEXT;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
