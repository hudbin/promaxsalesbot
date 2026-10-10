-- Qarz to'lovini bekor qilish (qarz_tolovlari jadvalidan)
CREATE OR REPLACE FUNCTION fn_qarz_tolov_bekor_qilish(
    p_tolov_id UUID,
    p_xodim TEXT
) RETURNS VOID AS $$
DECLARE
    v_tolov RECORD;
    v_harakat RECORD;
BEGIN
    SELECT * INTO v_tolov FROM qarz_tolovlari WHERE id = p_tolov_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'To''lov topilmadi.';
    END IF;

    -- 1. Pul harakatlarini (kassa_harakatlari dagi kirim) bekor qilish / o'chirish
    DELETE FROM kassa_harakatlari 
    WHERE manba_turi = 'qarz_tolov' AND manba_id = p_tolov_id;

    -- 2. Mijoz qarzini qaytarish (qarz to'langani bekor bo'lgani uchun qarz qayta ko'payadi)
    IF v_tolov.mijoz_id IS NOT NULL THEN
        IF v_tolov.valyuta = 'USD' THEN
            UPDATE mijozlar SET qarz_usd = qarz_usd + v_tolov.summa WHERE id = v_tolov.mijoz_id;
        ELSE
            UPDATE mijozlar SET qarz_uzs = qarz_uzs + v_tolov.summa WHERE id = v_tolov.mijoz_id;
        END IF;
    END IF;

    -- 3. Qarz to'lovlari yozuvini o'chirish
    DELETE FROM qarz_tolovlari WHERE id = p_tolov_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Savdoni bekor qilish funksiyasi
CREATE OR REPLACE FUNCTION fn_savdoni_bekor_qilish(
    p_savdo_id UUID,
    p_xodim TEXT
) RETURNS VOID AS $$
DECLARE
    v_savdo RECORD;
    v_qator RECORD;
BEGIN
    SELECT * INTO v_savdo FROM savdolar WHERE id = p_savdo_id AND holat = 'yakunlandi';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Savdo topilmadi yoki allaqachon bekor qilingan.';
    END IF;

    -- 1. Tovarlar qoldig'ini omborga qaytarish
    FOR v_qator IN SELECT * FROM savdo_qatorlari WHERE savdo_id = p_savdo_id
    LOOP
        IF v_qator.tovar_id IS NOT NULL THEN
            UPDATE tovarlar SET qoldiq = qoldiq + v_qator.soni WHERE id = v_qator.tovar_id;
        END IF;
    END LOOP;

    -- 2. Mijoz qarzini kamaytirish (savdo bekor bo'lgani sababli qarz ayirib tashlanadi)
    IF v_savdo.mijoz_id IS NOT NULL AND v_savdo.qarz_summa > 0 THEN
        IF v_savdo.valyuta = 'USD' THEN
            UPDATE mijozlar SET qarz_usd = GREATEST(qarz_usd - v_savdo.qarz_summa, 0) WHERE id = v_savdo.mijoz_id;
        ELSE
            UPDATE mijozlar SET qarz_uzs = GREATEST(qarz_uzs - v_savdo.qarz_summa, 0) WHERE id = v_savdo.mijoz_id;
        END IF;
    END IF;

    -- 3. Savdo tushumi bo'lgan kassa harakatlarini o'chirish (balans view orqali to'g'rilanadi)
    DELETE FROM kassa_harakatlari 
    WHERE manba_turi = 'savdo' AND manba_id = p_savdo_id;

    -- 4. Savdoning holatini o'zgartirish
    UPDATE savdolar 
    SET holat = 'bekor_qilindi', 
        izoh = COALESCE(izoh, '') || ' (BEKOR QILINDI: ' || p_xodim || ')'
    WHERE id = p_savdo_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
