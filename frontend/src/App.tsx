import React, { useState, useEffect } from "react";
import { SotuvTab } from "./components/SotuvTab";
import { ChiqimTab } from "./components/ChiqimTab";
import { QarzlarTab } from "./components/QarzlarTab";
import { KassaTab } from "./components/KassaTab";
import { OmborTab } from "./components/OmborTab";
import { XodimlarModal } from "./components/XodimlarModal";
import { ShoppingCart, TrendingDown, Users, Wallet, Package, Lock } from "lucide-react";
import { supabase, haptic } from "./lib/supabase";

type TabTur = "sotuv" | "chiqim" | "qarzlar" | "kassa" | "ombor";

export default function App() {
  const [faolTab, setFaolTab] = useState<TabTur>("sotuv");
  const [telegramFoydalanuvchi, setTelegramFoydalanuvchi] = useState<string>("Boshqaruv");
  const [xodimModalOchiq, setXodimModalOchiq] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>("admin");
  const [currentUserTgId, setCurrentUserTgId] = useState<number | string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [tekshirilmoqda, setTekshirilmoqda] = useState(true);

  const tg = typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null;

  useEffect(() => {
    async function checkAuth() {
      try {
        if (tg) {
          tg.ready();
          tg.expand();
          try {
            if (typeof tg.requestFullscreen === "function" && !tg.isFullscreen) {
              tg.requestFullscreen();
            }
            tg.setHeaderColor?.("#ffffff");
            tg.setBackgroundColor?.("#f8fafc");
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
          if (user) {
            if (user.first_name) {
              setTelegramFoydalanuvchi(user.first_name);
            }
            setCurrentUserTgId(user.id);

            // Supabase'dan xodimlarni tekshirish
            const { data: xodimlar } = await supabase
              .from("xodimlar")
              .select("*");

            // Agar bazada umuman xodimlar kiritilmagan bo'lsa (boshlang'ich holat)
            if (!xodimlar || xodimlar.length === 0) {
              setCurrentUserRole("admin");
              setIsBlocked(false);
            } else {
              const current = xodimlar.find((x: any) => String(x.telegram_id) === String(user.id));
              if (current) {
                if (current.faol) {
                  setCurrentUserRole(current.rol || "sotuvchi");
                  setIsBlocked(false);
                } else {
                  setIsBlocked(true); // Ruxsati to'xtatilgan
                }
              } else {
                // Notanish shaxs
                setIsBlocked(true);
              }
            }
          }
        }
      } catch (err) {
        console.error("Auth xatosi:", err);
      } finally {
        setTekshirilmoqda(false);
      }
    }

    checkAuth();
  }, []);

  function tabOzgarti(tab: TabTur) {
    haptic("light");
    setFaolTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Ruxsat yo'q holatidagi bloklash ekrani
  if (!tekshirilmoqda && isBlocked) {
    return (
      <div
        className="max-w-md mx-auto min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center"
        style={{ paddingTop: "max(84px, calc(env(safe-area-inset-top, 0px) + 72px))" }}
      >
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center mb-4 shadow-sm">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-black text-slate-900 mb-1.5">Ruxsat Cheklangan</h2>
        <p className="text-xs text-slate-600 leading-relaxed max-w-xs mb-4">
          Ushbu do'kon tizimidan faqat ro'yxatdan o'tgan PROMAX xodimlari foydalana oladi.
        </p>
        <div className="bg-white border border-slate-200 rounded-xl p-3 w-full text-left space-y-1.5 text-xs mb-4 shadow-2xs">
          <p className="text-slate-500 font-medium">Sizning Telegram profilingiz:</p>
          <p className="font-bold text-slate-900">{telegramFoydalanuvchi}</p>
          {currentUserTgId && (
            <p className="font-mono text-slate-600">ID: <span className="font-bold text-indigo-700">{currentUserTgId}</span></p>
          )}
        </div>
        <p className="text-[11px] text-slate-400">
          Botga o'tib (/start) telefon raqamingizni tasdiqlang yoki administratorga murojaat qiling.
        </p>
      </div>
    );
  }

  return (
    <div
      className="max-w-md mx-auto min-h-screen bg-slate-50 flex flex-col"
      style={{ paddingTop: "max(84px, calc(env(safe-area-inset-top, 0px) + 72px))" }}
    >
      {/* Yuqori Profil & Boshqaruv Satri */}
      <header className="px-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-xs shadow-2xs">
            PX
          </div>
          <div>
            <h1 className="text-xs font-black text-slate-900 leading-tight">PROMAX STORE</h1>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold">
              <span>{telegramFoydalanuvchi}</span>
              <span className={`px-1.5 py-0.2 rounded-full font-extrabold text-[9px] uppercase ${
                currentUserRole === "admin" ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800"
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
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl text-xs font-bold text-indigo-700 shadow-2xs active:scale-95 transition-all"
          >
            <Users className="w-3.5 h-3.5 text-indigo-600" />
            <span>Xodimlar</span>
          </button>
        )}
      </header>

      {/* Asosiy Kontent */}
      <main className="flex-1 px-3 py-2 pb-24">
        {faolTab === "sotuv" && <SotuvTab telegramFoydalanuvchi={telegramFoydalanuvchi} />}
        {faolTab === "chiqim" && <ChiqimTab />}
        {faolTab === "qarzlar" && <QarzlarTab />}
        {faolTab === "kassa" && <KassaTab />}
        {faolTab === "ombor" && <OmborTab />}
      </main>

      {/* Xodimlar boshqaruvi Modali */}
      {xodimModalOchiq && (
        <XodimlarModal
          currentUserTgId={currentUserTgId}
          onClose={() => setXodimModalOchiq(false)}
        />
      )}

      {/* Pastki Katta Navigatsiya Paneli (Ixcham va qulay) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-md">
        <div className="max-w-md mx-auto grid grid-cols-5 px-1 py-1 pb-[calc(4px+env(safe-area-inset-bottom,0px))]">
          {/* 1. Sotuv */}
          <button
            onClick={() => tabOzgarti("sotuv")}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
              faolTab === "sotuv"
                ? "bg-emerald-50 text-emerald-700 font-bold"
                : "text-slate-500 hover:text-slate-800 font-medium"
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
                ? "bg-rose-50 text-rose-700 font-bold"
                : "text-slate-500 hover:text-slate-800 font-medium"
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
                ? "bg-amber-50 text-amber-700 font-bold"
                : "text-slate-500 hover:text-slate-800 font-medium"
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
                ? "bg-blue-50 text-blue-700 font-bold"
                : "text-slate-500 hover:text-slate-800 font-medium"
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
                ? "bg-purple-50 text-purple-700 font-bold"
                : "text-slate-500 hover:text-slate-800 font-medium"
            }`}
          >
            <Package className={`w-5 h-5 ${faolTab === "ombor" ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
            <span className="text-[10px] mt-0.5 tracking-tight">Ombor</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

