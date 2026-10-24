-- ==============================================================================
-- 11. VOZVRAT JADVALLARI VA RUSTAM URGUTNING 670 000 UZS VOZVRATINI TIKLASH
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

-- 3. RUSTAM URGUTNING 670 000 UZS VOZVRATINI TIKLASH
DO $$
DECLARE
    v_mijoz_id UUID;
    v_vozvrat_id UUID;
BEGIN
    SELECT id INTO v_mijoz_id 
    FROM mijozlar 
    WHERE nom ILIKE '%Rustam%Urgut%' OR nom_norm ILIKE '%rustam%urgut%'
    LIMIT 1;

    IF v_mijoz_id IS NULL THEN
        RAISE EXCEPTION 'Rustam Urgut mijozlar ro''yxatidan topilmadi!';
    END IF;

    SELECT id INTO v_vozvrat_id
    FROM tovar_qaytarishlar
    WHERE mijoz_id = v_mijoz_id 
      AND jami_summa = 670000 
      AND sana_vaqt >= (now() - interval '2 days');

    IF v_vozvrat_id IS NULL THEN
        INSERT INTO tovar_qaytarishlar (
            sana_vaqt,
            mijoz_id,
            valyuta,
            jami_summa,
            qarzdan_ayirildi,
            naqd_qaytarildi,
            izoh,
            xodim,
            holat
        ) VALUES (
            now(),
            v_mijoz_id,
            'UZS',
            670000,
            670000,
            0,
            'Tovar qaytarildi',
            'Qahramon Xalilov',
            'faol'
        ) RETURNING id INTO v_vozvrat_id;

        INSERT INTO tovar_qaytarish_qatorlari (
            qaytarish_id,
            tovar_nomi,
            soni,
            narx,
            summa
        ) VALUES (
            v_vozvrat_id,
            'Tovar (qaytarilgan)',
            10,
            67000,
            670000
        );

        RAISE NOTICE 'Rustam Urgut uchun 670 000 UZS vozvrat muvaffaqiyatli tiklandi! ID: %', v_vozvrat_id;
    ELSE
        RAISE NOTICE 'Ushbu vozvrat bazada allaqachon mavjud! ID: %', v_vozvrat_id;
    END IF;
END $$;
