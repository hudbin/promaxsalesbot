-- ==============================================================================
-- 1. YANGLIK: HISOBLAR JADVALI
-- ==============================================================================
CREATE TABLE IF NOT EXISTS hisoblar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom TEXT NOT NULL,
    turi TEXT NOT NULL DEFAULT 'naqd' CHECK (turi IN ('naqd', 'plastik', 'bank')),
    valyuta TEXT NOT NULL DEFAULT 'UZS' CHECK (valyuta IN ('UZS', 'USD', 'BARCHASI')),
    xodim_id UUID REFERENCES xodimlar(id) ON DELETE SET NULL,
    faol BOOLEAN NOT NULL DEFAULT true,
    yaratilgan TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS (Row Level Security) qo'shish
ALTER TABLE hisoblar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all for hisoblar" ON hisoblar FOR ALL USING (true) WITH CHECK (true);

-- Boshlang'ich (default) hisoblarni qo'shish (Eski kassa turlari uchun)
INSERT INTO hisoblar (id, nom, turi, valyuta) VALUES
('00000000-0000-0000-0000-000000000001', 'Asosiy Do''kon Kassasi (Naqd UZS)', 'naqd', 'UZS'),
('00000000-0000-0000-0000-000000000002', 'Asosiy Do''kon Kassasi (Naqd USD)', 'naqd', 'USD'),
('00000000-0000-0000-0000-000000000003', 'Asosiy Do''kon (Plastik UZS)', 'plastik', 'UZS'),
('00000000-0000-0000-0000-000000000004', 'Asosiy Do''kon (Bank UZS)', 'bank', 'UZS')
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 2. BOSHQA JADVALLARGA HISOB_ID QO'SHISH
-- ==============================================================================
ALTER TABLE savdolar ADD COLUMN IF NOT EXISTS hisob_id UUID REFERENCES hisoblar(id);
ALTER TABLE rasxodlar ADD COLUMN IF NOT EXISTS hisob_id UUID REFERENCES hisoblar(id);
ALTER TABLE qarz_tolovlari ADD COLUMN IF NOT EXISTS hisob_id UUID REFERENCES hisoblar(id);
ALTER TABLE kassa_harakatlari ADD COLUMN IF NOT EXISTS hisob_id UUID REFERENCES hisoblar(id);

-- O'tkazmalar uchun 'transfer' manba_turi ni yoqish
-- Postgres Enum emas CHECK constraint bo'lgani uchun CHECK ni yangilaymiz
ALTER TABLE kassa_harakatlari DROP CONSTRAINT kassa_harakatlari_manba_turi_check;
ALTER TABLE kassa_harakatlari ADD CONSTRAINT kassa_harakatlari_manba_turi_check 
    CHECK (manba_turi IN ('savdo', 'rasxod', 'qarz_tolov', 'kassalar_aro', 'boshlangich', 'transfer'));

-- ==============================================================================
-- 3. ESKI MA'LUMOTLARNI MIGRATSIYA QILISH (naqd_uzs -> 000000000001)
-- ==============================================================================
UPDATE savdolar SET hisob_id = '00000000-0000-0000-0000-000000000001' WHERE kassa_turi = 'naqd_uzs' AND hisob_id IS NULL;
UPDATE savdolar SET hisob_id = '00000000-0000-0000-0000-000000000002' WHERE kassa_turi = 'naqd_usd' AND hisob_id IS NULL;
UPDATE savdolar SET hisob_id = '00000000-0000-0000-0000-000000000003' WHERE kassa_turi = 'plastik_uzs' AND hisob_id IS NULL;
UPDATE savdolar SET hisob_id = '00000000-0000-0000-0000-000000000004' WHERE kassa_turi = 'bank_uzs' AND hisob_id IS NULL;

UPDATE rasxodlar SET hisob_id = '00000000-0000-0000-0000-000000000001' WHERE kassa_turi = 'naqd_uzs' AND hisob_id IS NULL;
UPDATE rasxodlar SET hisob_id = '00000000-0000-0000-0000-000000000002' WHERE kassa_turi = 'naqd_usd' AND hisob_id IS NULL;
UPDATE rasxodlar SET hisob_id = '00000000-0000-0000-0000-000000000003' WHERE kassa_turi = 'plastik_uzs' AND hisob_id IS NULL;
UPDATE rasxodlar SET hisob_id = '00000000-0000-0000-0000-000000000004' WHERE kassa_turi = 'bank_uzs' AND hisob_id IS NULL;

UPDATE qarz_tolovlari SET hisob_id = '00000000-0000-0000-0000-000000000001' WHERE kassa_turi = 'naqd_uzs' AND hisob_id IS NULL;
UPDATE qarz_tolovlari SET hisob_id = '00000000-0000-0000-0000-000000000002' WHERE kassa_turi = 'naqd_usd' AND hisob_id IS NULL;
UPDATE qarz_tolovlari SET hisob_id = '00000000-0000-0000-0000-000000000003' WHERE kassa_turi = 'plastik_uzs' AND hisob_id IS NULL;
UPDATE qarz_tolovlari SET hisob_id = '00000000-0000-0000-0000-000000000004' WHERE kassa_turi = 'bank_uzs' AND hisob_id IS NULL;

UPDATE kassa_harakatlari SET hisob_id = '00000000-0000-0000-0000-000000000001' WHERE kassa_turi = 'naqd_uzs' AND hisob_id IS NULL;
UPDATE kassa_harakatlari SET hisob_id = '00000000-0000-0000-0000-000000000002' WHERE kassa_turi = 'naqd_usd' AND hisob_id IS NULL;
UPDATE kassa_harakatlari SET hisob_id = '00000000-0000-0000-0000-000000000003' WHERE kassa_turi = 'plastik_uzs' AND hisob_id IS NULL;
UPDATE kassa_harakatlari SET hisob_id = '00000000-0000-0000-0000-000000000004' WHERE kassa_turi = 'bank_uzs' AND hisob_id IS NULL;

-- Kassa_turi majburiyligini olib tashlash (chunki endi hisob_id bor)
ALTER TABLE savdolar ALTER COLUMN kassa_turi DROP NOT NULL;
ALTER TABLE rasxodlar ALTER COLUMN kassa_turi DROP NOT NULL;
ALTER TABLE qarz_tolovlari ALTER COLUMN kassa_turi DROP NOT NULL;
ALTER TABLE kassa_harakatlari ALTER COLUMN kassa_turi DROP NOT NULL;
ALTER TABLE savdolar DROP CONSTRAINT IF EXISTS savdolar_kassa_turi_check;
ALTER TABLE rasxodlar DROP CONSTRAINT IF EXISTS rasxodlar_kassa_turi_check;
ALTER TABLE qarz_tolovlari DROP CONSTRAINT IF EXISTS qarz_tolovlari_kassa_turi_check;
ALTER TABLE kassa_harakatlari DROP CONSTRAINT IF EXISTS kassa_harakatlari_kassa_turi_check;

-- ==============================================================================
-- 4. VIEW Larni YANGILASH
-- ==============================================================================
DROP VIEW IF EXISTS view_kassa_balans;
CREATE OR REPLACE VIEW view_kassa_balans AS
SELECT
    h.id AS hisob_id,
    h.nom AS kassa_nomi,
    h.turi AS kassa_turi,
    COALESCE(kh.valyuta, h.valyuta) AS valyuta,
    COALESCE(SUM(CASE WHEN kh.amal = 'kirim' THEN kh.summa ELSE -kh.summa END), 0) AS joriy_balans
FROM hisoblar h
LEFT JOIN kassa_harakatlari kh ON h.id = kh.hisob_id
GROUP BY h.id, h.nom, h.turi, COALESCE(kh.valyuta, h.valyuta);

-- ==============================================================================
-- 5. YANGI STORED PROCEDURE LAR (Transfer)
-- ==============================================================================
CREATE OR REPLACE FUNCTION fn_pul_otkazish(
    p_chiqim_hisob_id UUID,
    p_kirim_hisob_id UUID,
    p_summa NUMERIC,
    p_valyuta TEXT,
    p_izoh TEXT,
    p_xodim TEXT,
    p_telegram_user_id BIGINT
) RETURNS UUID AS $$
DECLARE
    v_otkazma_id UUID := gen_random_uuid();
BEGIN
    -- Chiqim hisobidan yechish
    INSERT INTO kassa_harakatlari (
        id, amal, summa, valyuta, manba_turi, manba_id, izoh, hisob_id
    ) VALUES (
        v_otkazma_id, 'chiqim', p_summa, p_valyuta, 'transfer', v_otkazma_id,
        'O''tkazma: ' || COALESCE(p_izoh, ''), p_chiqim_hisob_id
    );

    -- Kirim hisobiga qo'shish
    INSERT INTO kassa_harakatlari (
        id, amal, summa, valyuta, manba_turi, manba_id, izoh, hisob_id
    ) VALUES (
        gen_random_uuid(), 'kirim', p_summa, p_valyuta, 'transfer', v_otkazma_id,
        'O''tkazma: ' || COALESCE(p_izoh, ''), p_kirim_hisob_id
    );

    RETURN v_otkazma_id;
END;
$$ LANGUAGE plpgsql;

-- ESKI FUNKSIYALARNI YANGILASH (kassa_turi -> hisob_id ni ham qabul qilish)
CREATE OR REPLACE FUNCTION fn_savdo_yaratish_v2(
    p_mijoz_id UUID,
    p_valyuta TEXT,
    p_tolangan NUMERIC,
    p_tolov_turi TEXT,
    p_hisob_id UUID,
    p_izoh TEXT,
    p_xodim TEXT,
    p_telegram_user_id BIGINT,
    p_qatorlar JSONB
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
    IF p_qatorlar IS NOT NULL AND jsonb_typeof(p_qatorlar) = 'array' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_qatorlar) LOOP
            v_soni := COALESCE((v_item->>'soni')::NUMERIC, 0);
            v_narx := COALESCE((v_item->>'narx')::NUMERIC, 0);
            v_jami := v_jami + (v_soni * v_narx);
        END LOOP;
    END IF;

    v_qarz := GREATEST(v_jami - COALESCE(p_tolangan, 0), 0);

    -- 2. Savdolar jadvaliga kiritish
    INSERT INTO savdolar (
        mijoz_id, valyuta, jami_summa, tolangan_summa, qarz_summa,
        tolov_turi, hisob_id, izoh, xodim, telegram_user_id
    ) VALUES (
        p_mijoz_id, p_valyuta, v_jami, COALESCE(p_tolangan, 0), v_qarz,
        p_tolov_turi, p_hisob_id, p_izoh, p_xodim, p_telegram_user_id
    ) RETURNING id INTO v_savdo_id;

    -- 3. Savdo qatorlarini yozish va ombordan ayirish
    IF p_qatorlar IS NOT NULL AND jsonb_typeof(p_qatorlar) = 'array' THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_qatorlar) LOOP
            BEGIN
                v_tovar_id := NULLIF(trim(COALESCE(v_item->>'tovar_id', '')), '')::UUID;
            EXCEPTION WHEN OTHERS THEN
                v_tovar_id := NULL;
            END;

            v_soni := COALESCE((v_item->>'soni')::NUMERIC, 0);
            v_narx := COALESCE((v_item->>'narx')::NUMERIC, 0);
            v_tannarx := COALESCE((v_item->>'tannarx')::NUMERIC, 0);

            v_tovar_nomi := NULL;
            IF v_tovar_id IS NOT NULL THEN
                SELECT nom INTO v_tovar_nomi FROM tovarlar WHERE id = v_tovar_id;
            END IF;

            IF v_tovar_nomi IS NULL THEN
                v_tovar_nomi := COALESCE(v_item->>'nom', 'Noma''lum tovar');
                IF v_tovar_id IS NULL AND v_tovar_nomi != 'Noma''lum tovar' THEN
                    SELECT id INTO v_tovar_id FROM tovarlar
                    WHERE faol = true AND (lower(nom) = lower(v_tovar_nomi) OR lower(COALESCE(model, '')) = lower(v_tovar_nomi))
                    LIMIT 1;
                END IF;
            END IF;

            INSERT INTO savdo_qatorlari (
                savdo_id, tovar_id, tovar_nomi, soni, narx, tannarx, summa
            ) VALUES (
                v_savdo_id, v_tovar_id, v_tovar_nomi, v_soni, v_narx, v_tannarx, (v_soni * v_narx)
            );

            IF v_tovar_id IS NOT NULL AND v_soni > 0 THEN
                UPDATE tovarlar SET qoldiq = qoldiq - v_soni WHERE id = v_tovar_id;
            END IF;
        END LOOP;
    END IF;

    -- 4. Mijoz qarzini oshirish (agar qarz bo'lsa)
    IF p_mijoz_id IS NOT NULL AND v_qarz > 0 THEN
        IF p_valyuta = 'USD' THEN
            UPDATE mijozlar SET qarz_usd = qarz_usd + v_qarz WHERE id = p_mijoz_id;
        ELSE
            UPDATE mijozlar SET qarz_uzs = qarz_uzs + v_qarz WHERE id = p_mijoz_id;
        END IF;
    END IF;

    -- 5. Kassaga pul tushgan bo'lsa
    IF COALESCE(p_tolangan, 0) > 0 AND p_hisob_id IS NOT NULL THEN
        INSERT INTO kassa_harakatlari (
            hisob_id, amal, summa, valyuta, manba_turi, manba_id, izoh
        ) VALUES (
            p_hisob_id, 'kirim', p_tolangan, p_valyuta, 'savdo', v_savdo_id,
            COALESCE(p_izoh, 'Savdo tushumi')
        );
    END IF;

    RETURN v_savdo_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_rasxod_yaratish_v2(
    p_summa NUMERIC,
    p_valyuta TEXT,
    p_kategoriya TEXT,
    p_tolov_turi TEXT,
    p_hisob_id UUID,
    p_izoh TEXT,
    p_xodim TEXT,
    p_telegram_user_id BIGINT
) RETURNS UUID AS $$
DECLARE
    v_rasxod_id UUID;
BEGIN
    INSERT INTO rasxodlar (
        summa, valyuta, kategoriya, tolov_turi, hisob_id,
        izoh, xodim, telegram_user_id
    ) VALUES (
        p_summa, p_valyuta, p_kategoriya, p_tolov_turi, p_hisob_id,
        p_izoh, p_xodim, p_telegram_user_id
    ) RETURNING id INTO v_rasxod_id;

    INSERT INTO kassa_harakatlari (
        hisob_id, amal, summa, valyuta, manba_turi, manba_id, izoh
    ) VALUES (
        p_hisob_id, 'chiqim', p_summa, p_valyuta, 'rasxod', v_rasxod_id,
        p_kategoriya || ': ' || COALESCE(p_izoh, '')
    );

    RETURN v_rasxod_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_qarz_tolov_yaratish_v2(
    p_mijoz_id UUID,
    p_summa NUMERIC,
    p_valyuta TEXT,
    p_tolov_turi TEXT,
    p_hisob_id UUID,
    p_izoh TEXT,
    p_xodim TEXT,
    p_telegram_user_id BIGINT
) RETURNS UUID AS $$
DECLARE
    v_tolov_id UUID;
BEGIN
    INSERT INTO qarz_tolovlari (
        mijoz_id, summa, valyuta, tolov_turi, hisob_id,
        izoh, xodim, telegram_user_id
    ) VALUES (
        p_mijoz_id, p_summa, p_valyuta, p_tolov_turi, p_hisob_id,
        p_izoh, p_xodim, p_telegram_user_id
    ) RETURNING id INTO v_tolov_id;

    IF p_valyuta = 'USD' THEN
        UPDATE mijozlar SET qarz_usd = GREATEST(qarz_usd - p_summa, 0) WHERE id = p_mijoz_id;
    ELSE
        UPDATE mijozlar SET qarz_uzs = GREATEST(qarz_uzs - p_summa, 0) WHERE id = p_mijoz_id;
    END IF;

    INSERT INTO kassa_harakatlari (
        hisob_id, amal, summa, valyuta, manba_turi, manba_id, izoh
    ) VALUES (
        p_hisob_id, 'kirim', p_summa, p_valyuta, 'qarz_tolov', v_tolov_id,
        'Qarz to''lovi: ' || COALESCE(p_izoh, '')
    );

    RETURN v_tolov_id;
END;
$$ LANGUAGE plpgsql;
