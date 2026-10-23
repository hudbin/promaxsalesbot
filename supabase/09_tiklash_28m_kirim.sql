-- ==============================================================================
-- 09. 28 800 000 UZS TRANZAKSIYASINI TIKLASH (23.10.2026 UCHUN)
-- ==============================================================================

DO $$
DECLARE
    v_hisob_id UUID;
    v_kirim_id UUID;
BEGIN
    -- 1. Asosiy Do'kon Kassasi (Naqd UZS) hisobini topish
    SELECT id INTO v_hisob_id 
    FROM hisoblar 
    WHERE nom ILIKE '%Asosiy Do%Naqd UZS%' 
       OR (turi = 'naqd' AND valyuta = 'UZS')
    ORDER BY tartib ASC NULLS LAST
    LIMIT 1;

    IF v_hisob_id IS NULL THEN
        v_hisob_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;

    -- 2. boshqa_kirimlar jadvalida allaqachon mavjudligini tekshirish
    SELECT id INTO v_kirim_id 
    FROM boshqa_kirimlar 
    WHERE summa = 28800000 
      AND kategoriya = 'Boshqa daromad'
      AND sana_vaqt >= '2026-10-23 00:00:00+05' 
      AND sana_vaqt <= '2026-10-23 23:59:59+05'
    LIMIT 1;

    IF v_kirim_id IS NULL THEN
        INSERT INTO boshqa_kirimlar (
            sana_vaqt,
            summa,
            valyuta,
            kategoriya,
            manba_nomi,
            hisob_id,
            izoh,
            xodim,
            holat
        ) VALUES (
            '2026-10-23 23:45:00+05',
            28800000,
            'UZS',
            'Boshqa daromad',
            'Chakan savdo',
            v_hisob_id,
            'Chakan savdo kirimi',
            'Qahramon Xalilov',
            'faol'
        ) RETURNING id INTO v_kirim_id;

        RAISE NOTICE 'boshqa_kirimlar jadvaliga 28 800 000 UZS qo''shildi (ID: %)', v_kirim_id;
    ELSE
        RAISE NOTICE 'boshqa_kirimlar jadvalida ushbu tranzaksiya allaqachon mavjud (ID: %)', v_kirim_id;
    END IF;

    -- 3. kassa_harakatlariga kirim yozish (agar mavjud bo'lmasa)
    IF NOT EXISTS (
        SELECT 1 FROM kassa_harakatlari 
        WHERE summa = 28800000 
          AND manba_turi = 'boshqa_kirim'
          AND sana_vaqt >= '2026-10-23 00:00:00+05'
    ) THEN
        INSERT INTO kassa_harakatlari (
            sana_vaqt,
            hisob_id,
            kassa_turi,
            amal,
            summa,
            valyuta,
            manba_turi,
            manba_id,
            izoh
        ) VALUES (
            '2026-10-23 23:45:00+05',
            v_hisob_id,
            'naqd',
            'kirim',
            28800000,
            'UZS',
            'boshqa_kirim',
            v_kirim_id,
            'Boshqa daromad (Chakan savdo): Chakan savdo kirimi'
        );
        RAISE NOTICE 'kassa_harakatlariga kirim yozildi.';
    ELSE
        UPDATE kassa_harakatlari 
        SET manba_id = v_kirim_id
        WHERE summa = 28800000 
          AND manba_turi = 'boshqa_kirim'
          AND sana_vaqt >= '2026-10-23 00:00:00+05'
          AND (manba_id IS NULL OR manba_id <> v_kirim_id);
        RAISE NOTICE 'kassa_harakatlari yangilandi.';
    END IF;

END $$;
