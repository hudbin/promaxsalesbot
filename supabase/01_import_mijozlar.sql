-- ==========================================================
-- DIQQAT: Barcha eski mijozlar o'chiriladi!
-- Bu holatda 'qarz_tolovlari' jadvalidagi eski to'lovlar ham o'chib ketadi (CASCADE).
-- 'savdolar' jadvalidagi eski hujjatlarning mijoz_id lari NULL bo'lib qoladi.
-- ==========================================================

-- 1. Mijozlar jadvaliga 'telegram' ustunini qo'shish (agar yo'q bo'lsa)
ALTER TABLE mijozlar ADD COLUMN IF NOT EXISTS telegram TEXT;

-- 2. Eski ma'lumotlarni tozalash
DELETE FROM mijozlar;

INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Akmal aka Namangan', 'akmal aka namangan', 35190000.0, 0.0, '+998333980101', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Akrom aka Namangan', 'akrom aka namangan', 3610000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Alisher aka Denov', 'alisher aka denov', 0.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Anvar aka Angor', 'anvar aka angor', 31690000.0, 0.0, '+998937993888', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Anvar aka Urgut', 'anvar aka urgut', 58624000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Bahodir aka Qo''qon', 'bahodir aka qoqon', 169829000.0, 0.0, NULL, '@Baxodir214');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Bahodir aka Urgut', 'bahodir aka urgut', 70000000.0, 0.0, NULL, '@Bahodir_906');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Bexruz Buxoro', 'bexruz buxoro', 7000000.0, 0.0, '+998914459989', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Bobojon og''a Xorazm', 'bobojon oga xorazm', 318289000.0, 0.0, '+998937431326', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Dilshoda opa Xorazm', 'dilshoda opa xorazm', 70362000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Orif aka Urgut', 'orif aka urgut', 45857000.0, 0.0, '+998992004250', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Qahramon aka Qo''qon', 'qahramon aka qoqon', 308761000.0, 0.0, NULL, '@Qahramon0555');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Roxila opa Xorazm', 'roxila opa xorazm', 40770000.0, 0.0, '+998974533380', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Rustam Urgut', 'rustam urgut', 101260000.0, 0.0, '+998933417772', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Sanjar aka Qo''qon', 'sanjar aka qoqon', 128787000.0, 0.0, NULL, '@Sanjarbek750');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Shaxlozbek aka Andijon', 'shaxlozbek aka andijon', 21770000.0, 0.0, '+998911731112', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Shaxzod Buxoro', 'shaxzod buxoro', 5200000.0, 0.0, NULL, '@shohimardon1');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Islomxon aka Qo''qon 5640', 'islomxon aka qoqon 5640', 139759000.0, 0.0, NULL, 'https://t.me/Islomxon210');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Islom aka Qo''qon 8844', 'islom aka qoqon 8844', 35579000.0, 0.0, NULL, '@Islombek_8844');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Shavkat aka Denov', 'shavkat aka denov', 87270000.0, 0.0, '+998975353253', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Adil aka KZ', 'adil aka kz', 0.0, 1540.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Gulnora opa Qo''qon', 'gulnora opa qoqon', 296000000.0, 0.0, '+998990473208', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('O''tkir aka Xorazm', 'otkir aka xorazm', 31598000.0, 0.0, '+998975116679', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Hamidjon aka Qo''qon', 'hamidjon aka qoqon', 13861000.0, 0.0, NULL, '@Abdulhamid8112');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Sodiqjon aka Qo''qon', 'sodiqjon aka qoqon', 177642000.0, 0.0, '+998333039333', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Sherzod hoji aka Qo''qon', 'sherzod hoji aka qoqon', 21846000.0, 0.0, '+998912019559', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Orifxo''ja aka Xorazm', 'orifxoja aka xorazm', 33025000.0, 0.0, '+998974000237', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Go''zal Buxoro', 'gozal buxoro', 42783000.0, 0.0, NULL, 'https://t.me/MOSCHINO_55');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('O''ktam aka Xorazm', 'oktam aka xorazm', 1865000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('O''g''iloy opa Urgut', 'ogiloy opa urgut', 24339000.0, 0.0, NULL, '@nomozovna_0');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Sherzod aka Qo''qon', 'sherzod aka qoqon', 40230000.0, 0.0, '+998975027775', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('G''olib Urgut', 'golib urgut', 13217000.0, 0.0, '+998972870515', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Elbek Buxoro', 'elbek buxoro', 44009000.0, 0.0, '+998977379007', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Orif aka Xorazm', 'orif aka xorazm', 0.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Dadaxon aka Qo''qon', 'dadaxon aka qoqon', 3778000.0, 0.0, NULL, '@Dadaxon_Olimov');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Mohir aka Qo''qon', 'mohir aka qoqon', 29960000.0, 0.0, '+998995107311', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Nozimxon aka Qo''qon', 'nozimxon aka qoqon', 97256000.0, 0.0, NULL, '@Nozimjon5587');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Omad hojiaka', 'omad hojiaka', 20960000.0, 0.0, NULL, '@erkinovbaxtiyorjon');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Jasur Urgut', 'jasur urgut', 15758000.0, 0.0, '+998904677707', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Dildoraxon Qo''qon', 'dildoraxon qoqon', 1055105000.0, 0.0, NULL, '@dildora0092');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Zavqiddin Angor', 'zavqiddin angor', 140555000.0, 0.0, '+998886518888', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Eldor aka Urgut', 'eldor aka urgut', 22975000.0, 0.0, NULL, '@Urgut16d65dukon');
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Nargiza opa Xorazm', 'nargiza opa xorazm', 49890000.0, 0.0, '+998974563663', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('O''ktam aka Buxoro', 'oktam aka buxoro', 13025000.0, 0.0, '+998914104080', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('O''g''iloy opa Xorazm', 'ogiloy opa xorazm', 29229000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Feruza opa Urgut', 'feruza opa urgut', 26210000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Mo''minhoji aka Namangan', 'mominhoji aka namangan', 31977000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Navro''z aka Urgut', 'navroz aka urgut', 2696000.0, 0.0, '+998933410090', NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Abduxalim aka Andijon', 'abduxalim aka andijon', 3685000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Fayoziddin aka Andijon', 'fayoziddin aka andijon', 11079000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Aziz aka Urgut', 'aziz aka urgut', 8100000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Ma''mur aka Xorazm', 'mamur aka xorazm', 111520000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('G''ayrat aka Urgut Qoriaka', 'gayrat aka urgut qoriaka', 25164000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Sherzod aka Denov', 'sherzod aka denov', 171867000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Inom aka Navoiy', 'inom aka navoiy', 1779000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Sherzod Qashqadaryo', 'sherzod qashqadaryo', 3775000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Ramziddin Koson', 'ramziddin koson', 3400000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Yunus aka Xorazm', 'yunus aka xorazm', 4320000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Sanobar opa Xorazm', 'sanobar opa xorazm', 90280000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Fahriddin Denov', 'fahriddin denov', 8522000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Timush KZ', 'timush kz', 0.0, 300.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Nodir aka Buxoro', 'nodir aka buxoro', 8204000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Murat KZ Polatuli', 'murat kz polatuli', 0.0, 1971.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Sardor Qo''qon', 'sardor qoqon', 2848000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Ismoil aka Urgut', 'ismoil aka urgut', 7100000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Muhammadali Andijon', 'muhammadali andijon', 11386000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Muhammadjon Xorazm', 'muhammadjon xorazm', 4790000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Inobat Urgut', 'inobat urgut', 14275000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Otabek aka Qo''qon', 'otabek aka qoqon', 29210000.0, 0.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Ixlos aka Turkmaniston', 'ixlos aka turkmaniston', 0.0, 37627.0, NULL, NULL);
INSERT INTO mijozlar (nom, nom_norm, qarz_uzs, qarz_usd, telefon, telegram) VALUES ('Abdusalom Dushanbe', 'abdusalom dushanbe', 0.0, 17081.0, NULL, NULL);