import React, { useState, useEffect } from "react";
import { SotuvTab } from "./components/SotuvTab";
import { ChiqimTab } from "./components/ChiqimTab";
import { QarzlarTab } from "./components/QarzlarTab";
import { KassaTab } from "./components/KassaTab";
import { OmborTab } from "./components/OmborTab";
import { HisobotlarTab } from "./components/HisobotlarTab";
import { XodimlarModal } from "./components/XodimlarModal";
import { ShoppingCart, TrendingDown, Users, Wallet, Package, Lock, BarChart } from "lucide-react";
import { supabase, haptic } from "./lib/supabase";

type TabTur = "sotuv" | "chiqim" | "qarzlar" | "kassa" | "ombor" | "hisobotlar";

export default function App() {
  const [faolTab, setFaolTab] = useState<TabTur>("sotuv");
  const [telegramFoydalanuvchi, setTelegramFoydalanuvchi] = useState<string>("Xodim");
  const [xodimModalOchiq, setXodimModalOchiq] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>("sotuvchi");
  const [currentUserTgId, setCurrentUserTgId] = useState<number | string | null>(null);
  const [foydalanuvchiRasm, setFoydalanuvchiRasm] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(true);
  const [blokSababi, setBlokSababi] = useState<string>("");
  const [tekshirilmoqda, setTekshirilmoqda] = useState(true);
  const [adminParolModal, setAdminParolModal] = useState(false);
  const [adminParolInput, setAdminParolInput] = useState("");
  const [adminParolXato, setAdminParolXato] = useState("");

  const tg = typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null;

  // Telegram Tungi / Kunduzgi rejimini avtomatik aniqlash va real vaqtda moslash
  useEffect(() => {
    function sinxronlashtirRejim() {
      const isDark =
        tg?.colorScheme === "dark" ||
        (!tg && typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);

      if (isDark) {
        document.documentElement.classList.add("dark");
        try {
          tg?.setHeaderColor?.("#0b1120");
          tg?.setBackgroundColor?.("#0b1120");
        } catch {}
      } else {
        document.documentElement.classList.remove("dark");
        try {
          tg?.setHeaderColor?.("#ffffff");
          tg?.setBackgroundColor?.("#f8fafc");
        } catch {}
      }
    }

    sinxronlashtirRejim();

    if (tg?.onEvent) {
      tg.onEvent("themeChanged", sinxronlashtirRejim);
      return () => {
        try {
          tg.offEvent("themeChanged", sinxronlashtirRejim);
        } catch {}
      };
    }
  }, [tg]);

  async function checkAuth() {
    setTekshirilmoqda(true);
    try {
      // 1. Localhost muhitida dasturlash uchun ruxsat
      const isLocal =
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1");

      if (isLocal) {
        setCurrentUserRole("admin");
        setTelegramFoydalanuvchi("Dasturchi (Local)");
        setIsBlocked(false);
        setTekshirilmoqda(false);
        return;
      }

      // 2. Telegram WebApp muhitini sozlash
      if (tg) {
        tg.ready();
        tg.expand();
        try {
          if (typeof tg.requestFullscreen === "function" && !tg.isFullscreen) {
            tg.requestFullscreen();
          }
          tg.enableClosingConfirmation?.();
        } catch {}

        const onFirstInteract = () => {
          if (tg && typeof tg.requestFullscreen === "function" && !tg.isFullscreen) {
            try {
              tg.requestFullscreen();
            } catch {}
          }
        };
        window.addEventListener("touchstart", onFirstInteract, { once: true });
        window.addEventListener("click", onFirstInteract, { once: true });

        const user = tg.initDataUnsafe?.user;
        if (!user || !user.id) {
          setIsBlocked(true);
          setBlokSababi(
            "Telegram foydalanuvchi ma'lumoti aniqlanmadi. Mini App faqat rasmiy Telegram orqali ochilishi kerak."
          );
          setTekshirilmoqda(false);
          return;
        }

        const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "Foydalanuvchi";
        setTelegramFoydalanuvchi(fullName);
        setCurrentUserTgId(user.id);
        if (user.photo_url) {
          setFoydalanuvchiRasm(user.photo_url);
        }

        const numId = Number(user.id);

        // 1. BOSH ADMINISTRATORNI DARHOL TASDIQLASH (Baza tekshiruvini kutmasdan)
        const adminIdList = [
          "580858047",
          ...(import.meta.env.VITE_ADMIN_TELEGRAM_ID || "").split(","),
        ].map((s) => s.trim()).filter(Boolean);

        const isEnvAdmin = adminIdList.includes(String(user.id));

        if (isEnvAdmin) {
          setCurrentUserRole("admin");
          setIsBlocked(false);
          setBlokSababi("");
          setTekshirilmoqda(false);

          // Bazada ham xodimlar ro'yxatiga admin sifatida kiritib qo'yamiz (orqa fonda)
          (async () => {
            try {
              await supabase
                .from("xodimlar")
                .upsert({
                  telegram_id: !isNaN(numId) ? numId : user.id,
                  ism: fullName,
                  rol: "admin",
                  faol: true,
                  telegram_username: user.username ? `@${user.username}` : null,
                }, { onConflict: "telegram_id" });
            } catch {}
          })();
          return;
        }

        // 2. Qolgan xodimlar uchun Supabase tekshiruvi
        const { data: xodim, error } = await supabase
          .from("xodimlar")
          .select("*")
          .eq("telegram_id", !isNaN(numId) ? numId : user.id)
          .maybeSingle();

        if (error) {
          console.error("Xodimlarni tekshirishda xatolik:", error);
          setIsBlocked(true);
          setBlokSababi("Baza bilan bog'lanishda xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
          setTekshirilmoqda(false);
          return;
        }

        if (xodim) {
          if (xodim.faol) {
            setCurrentUserRole(xodim.rol || "sotuvchi");
            if (xodim.ism) {
              setTelegramFoydalanuvchi(xodim.ism);
            }
            setIsBlocked(false);
          } else {
            setIsBlocked(true);
            setBlokSababi("Sizning profilingiz administrator tomonidan vaqtincha to'xtatilgan.");
          }
        } else {
          // Xodimlar ro'yxatida yo'q
          setIsBlocked(true);
          setBlokSababi("Siz PROMAX xodimlari ro'yxatida emassiz.");
        }
      } else {
        setIsBlocked(true);
        setBlokSababi("Ilova faqat Telegram orqali ishlaydi.");
      }
    } catch (err: any) {
      console.error("Auth xatosi:", err);
      setIsBlocked(true);
      setBlokSababi("Xavfsizlik tekshiruvida xatolik yuz berdi.");
    } finally {
      setTekshirilmoqda(false);
    }
  }

  useEffect(() => {
    checkAuth();
  }, []);

  async function adminParolBilanKirish() {
    if (!adminParolInput.trim()) return;
    if (adminParolInput.trim() !== "promax2026") {
      setAdminParolXato("Parol noto'g'ri!");
      return;
    }

    try {
      const user = tg?.initDataUnsafe?.user;
      const tgId = user?.id || currentUserTgId;
      const ism = user ? `${user.first_name || ""} ${user.last_name || ""}`.trim() : "Bosh Admin";
      const username = user?.username ? `@${user.username}` : null;

      if (tgId) {
        const numId = Number(tgId);
        const { data: mavjud } = await supabase
          .from("xodimlar")
          .select("id")
          .eq("telegram_id", !isNaN(numId) ? numId : tgId)
          .maybeSingle();

        if (mavjud) {
          await supabase
            .from("xodimlar")
            .update({
              rol: "admin",
              faol: true,
              ism: ism || "Bosh Admin",
              telegram_username: username,
            })
            .eq("id", mavjud.id);
        } else {
          await supabase.from("xodimlar").insert({
            telegram_id: !isNaN(numId) ? numId : tgId,
            ism: ism || "Bosh Admin",
            rol: "admin",
            faol: true,
            telegram_username: username,
          });
        }
      }

      setCurrentUserRole("admin");
      setTelegramFoydalanuvchi(ism || "Bosh Admin");
      setIsBlocked(false);
      setAdminParolModal(false);
      haptic("success");
    } catch (err: any) {
      setAdminParolXato("Xatolik: " + err.message);
    }
  }

  function tabOzgarti(tab: TabTur) {
    haptic("light");
    setFaolTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // 1. Yuklanmoqda holati (Splash Screen)
  if (tekshirilmoqda) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-base mb-3 shadow-md animate-pulse">
          PX
        </div>
        <p className="text-sm font-black text-slate-800">PROMAX STORE</p>
        <p className="text-xs text-slate-500 mt-1">Xavfsizlik va ruxsat tekshirilmoqda...</p>
      </div>
    );
  }

  // 2. Ruxsat yo'q holatidagi bloklash ekrani (Lock Screen)
  if (isBlocked) {
    return (
      <div
        className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-6 text-center transition-colors"
        style={{ paddingTop: "max(84px, calc(env(safe-area-inset-top, 0px) + 72px))" }}
      >
        <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 rounded-3xl flex items-center justify-center mb-4 shadow-sm">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1.5">Ruxsat Cheklangan</h2>
        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-xs mb-4">
          {blokSababi || "Ushbu do'kon tizimidan faqat ro'yxatdan o'tgan PROMAX xodimlari foydalana oladi."}
        </p>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full text-left space-y-2 text-xs mb-4 shadow-2xs">
          <p className="text-slate-400 dark:text-slate-500 font-semibold text-[11px] uppercase tracking-wider">Telegram profilingiz</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {foydalanuvchiRasm ? (
                <img
                  src={foydalanuvchiRasm}
                  alt={telegramFoydalanuvchi}
                  className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700 shadow-2xs"
                  onError={() => setFoydalanuvchiRasm(null)}
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center font-black text-xs shadow-2xs">
                  {telegramFoydalanuvchi ? telegramFoydalanuvchi.charAt(0).toUpperCase() : "U"}
                </div>
              )}
              <span className="font-bold text-slate-900 dark:text-white text-sm">{telegramFoydalanuvchi}</span>
            </div>
            {currentUserTgId && (
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md font-semibold">
                ID: {currentUserTgId}
              </span>
            )}
          </div>
        </div>

        {/* Yo'riqnoma */}
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-3.5 w-full text-left space-y-1.5 text-xs mb-5">
          <p className="font-bold text-amber-900 dark:text-amber-300">Qanday qilib ruxsat olish mumkin?</p>
          <ol className="list-decimal list-inside text-amber-800 dark:text-amber-400/90 space-y-1 text-[11px] leading-relaxed">
            <li>Telegram botga kiring: <b>@promax_sotuv_bot</b></li>
            <li><b>"📲 Telefon raqamimni yuborish"</b> tugmasini bosing</li>
            <li>Administrator tasdiqlashi bilanoq dastur ochiladi</li>
          </ol>
        </div>

        {/* Tugmalar */}
        <div className="w-full space-y-2">
          <button
            onClick={() => checkAuth()}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all active:scale-95 shadow-sm"
          >
            🔄 Qayta tekshirish
          </button>

          {tg && (
            <button
              onClick={() => {
                try {
                  tg.close();
                } catch {}
              }}
              className="w-full py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs transition-all active:scale-95"
            >
              Botga qaytish
            </button>
          )}

          {/* Bosh admin uchun maxfiy kalit orqali tezkor kirish */}
          <div className="pt-2">
            {!adminParolModal ? (
              <button
                onClick={() => setAdminParolModal(true)}
                className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-semibold underline underline-offset-2"
              >
                🔑 Bosh administrator paroli orqali kirish
              </button>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-sm text-left space-y-2 animate-fade-in">
                <p className="text-xs font-bold text-slate-900 dark:text-white">Bosh Administrator Paroli</p>
                <input
                  type="password"
                  placeholder="Maxfiy parolni kiriting..."
                  value={adminParolInput}
                  onChange={(e) => {
                    setAdminParolInput(e.target.value);
                    setAdminParolXato("");
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-indigo-500"
                />
                {adminParolXato && (
                  <p className="text-[11px] text-rose-600 font-medium">{adminParolXato}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={adminParolBilanKirish}
                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all"
                  >
                    Tasdiqlash & Kirish
                  </button>
                  <button
                    onClick={() => {
                      setAdminParolModal(false);
                      setAdminParolInput("");
                      setAdminParolXato("");
                    }}
                    className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold"
                  >
                    Bekor
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200"
      style={{ paddingTop: "max(84px, calc(env(safe-area-inset-top, 0px) + 72px))" }}
    >
      {/* Yuqori Profil & Boshqaruv Satri */}
      <header className="px-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {foydalanuvchiRasm ? (
            <img
              src={foydalanuvchiRasm}
              alt={telegramFoydalanuvchi}
              className="w-8 h-8 rounded-xl object-cover border border-slate-200 dark:border-slate-800 shadow-2xs"
              onError={() => setFoydalanuvchiRasm(null)}
            />
          ) : (
            <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center font-black text-xs shadow-2xs">
              {telegramFoydalanuvchi ? telegramFoydalanuvchi.charAt(0).toUpperCase() : "PX"}
            </div>
          )}
          <div>
            <h1 className="text-xs font-black text-slate-900 dark:text-white leading-tight">PROMAX STORE</h1>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
              <span className="truncate max-w-[130px]">{telegramFoydalanuvchi}</span>
              <span className={`px-1.5 py-0.2 rounded-full font-extrabold text-[9px] uppercase ${
                currentUserRole === "admin" 
                  ? "bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300" 
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
              }`}>
                {currentUserRole === "admin" ? "👑 Admin" : "💼 Sotuvchi"}
              </span>
            </div>
          </div>
        </div>

        {/* Admin uchun Xodimlar boshqaruvi tugmasi */}
        {currentUserRole === "admin" && (
          <button
            onClick={() => {
              setXodimModalOchiq(true);
              haptic("light");
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-600 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-400 shadow-2xs active:scale-95 transition-all"
          >
            <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Xodimlar</span>
          </button>
        )}
      </header>

      {/* Asosiy Kontent */}
      <main className="flex-1 px-3 py-2 pb-24">
        {faolTab === "sotuv" && (
          <SotuvTab
            xodimNomi={telegramFoydalanuvchi}
            telegramUserId={currentUserTgId}
          />
        )}
        {faolTab === "chiqim" && (
          <ChiqimTab
            xodimNomi={telegramFoydalanuvchi}
            telegramUserId={currentUserTgId}
          />
        )}
        {faolTab === "qarzlar" && (
          <QarzlarTab
            xodimNomi={telegramFoydalanuvchi}
            telegramUserId={currentUserTgId}
          />
        )}
        {faolTab === "kassa" && <KassaTab />}
        {faolTab === "ombor" && <OmborTab />}
        {faolTab === "hisobotlar" && (
          <HisobotlarTab
            telegramUserId={currentUserTgId}
            xodimNomi={telegramFoydalanuvchi}
          />
        )}
      </main>

      {/* Xodimlar boshqaruvi Modali */}
      {xodimModalOchiq && (
        <XodimlarModal
          currentUserTgId={currentUserTgId}
          onClose={() => setXodimModalOchiq(false)}
        />
      )}

      {/* Pastki Katta Navigatsiya Paneli (Ixcham va qulay) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-md overflow-x-auto">
        <div className="max-w-md mx-auto grid grid-cols-6 px-1 py-1 pb-[calc(4px+env(safe-area-inset-bottom,0px))] min-w-[320px]">
          {/* 1. Sotuv */}
          <button
            onClick={() => tabOzgarti("sotuv")}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
              faolTab === "sotuv"
                ? "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
            }`}
          >
            <ShoppingCart className={`w-5 h-5 ${faolTab === "sotuv" ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
            <span className="text-[10px] mt-0.5 tracking-tight">Sotuv</span>
          </button>

          {/* 2. Chiqim */}
          <button
            onClick={() => tabOzgarti("chiqim")}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
              faolTab === "chiqim"
                ? "bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
            }`}
          >
            <TrendingDown className={`w-5 h-5 ${faolTab === "chiqim" ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
            <span className="text-[10px] mt-0.5 tracking-tight">Chiqim</span>
          </button>

          {/* 3. Qarzlar */}
          <button
            onClick={() => tabOzgarti("qarzlar")}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
              faolTab === "qarzlar"
                ? "bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
            }`}
          >
            <Users className={`w-5 h-5 ${faolTab === "qarzlar" ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
            <span className="text-[10px] mt-0.5 tracking-tight">Qarzlar</span>
          </button>

          {/* 4. Kassa */}
          <button
            onClick={() => tabOzgarti("kassa")}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
              faolTab === "kassa"
                ? "bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
            }`}
          >
            <Wallet className={`w-5 h-5 ${faolTab === "kassa" ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
            <span className="text-[10px] mt-0.5 tracking-tight">Kassa</span>
          </button>

          {/* 5. Ombor */}
          <button
            onClick={() => tabOzgarti("ombor")}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
              faolTab === "ombor"
                ? "bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
            }`}
          >
            <Package className={`w-5 h-5 ${faolTab === "ombor" ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
            <span className="text-[10px] mt-0.5 tracking-tight">Ombor</span>
          </button>

          {/* 6. Hisobotlar */}
          <button
            onClick={() => tabOzgarti("hisobotlar")}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
              faolTab === "hisobotlar"
                ? "bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
            }`}
          >
            <BarChart className={`w-5 h-5 ${faolTab === "hisobotlar" ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
            <span className="text-[10px] mt-0.5 tracking-tight">Hisobot</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

