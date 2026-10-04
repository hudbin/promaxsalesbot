import React, { useState, useEffect } from "react";
import { SotuvTab } from "./components/SotuvTab";
import { ChiqimTab } from "./components/ChiqimTab";
import { QarzlarTab } from "./components/QarzlarTab";
import { KassaTab } from "./components/KassaTab";
import { OmborTab } from "./components/OmborTab";
import { ShoppingCart, TrendingDown, Users, Wallet, Package, RefreshCw, X } from "lucide-react";
import { haptic } from "./lib/supabase";

type TabTur = "sotuv" | "chiqim" | "qarzlar" | "kassa" | "ombor";

export default function App() {
  const [faolTab, setFaolTab] = useState<TabTur>("sotuv");
  const [telegramFoydalanuvchi, setTelegramFoydalanuvchi] = useState<string>("Boshqaruv");

  const tg = typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null;

  useEffect(() => {
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

        if (tg.initDataUnsafe?.user?.first_name) {
          setTelegramFoydalanuvchi(tg.initDataUnsafe.user.first_name);
        }
      }
    } catch {}
  }, []);

  function tabOzgarti(tab: TabTur) {
    haptic("light");
    setFaolTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div
      className="max-w-md mx-auto min-h-screen bg-slate-50 flex flex-col"
      style={{ paddingTop: "max(4px, env(safe-area-inset-top, 0px))" }}
    >
      {/* Telegram sarlavhasi ostidagi ixcham va toza xush kelibsiz qatori */}
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
          <p className="text-sm font-extrabold text-slate-800">
            Salom, {telegramFoydalanuvchi} 👋
          </p>
        </div>
        <button
          onClick={() => {
            haptic("light");
            window.location.reload();
          }}
          className="p-1.5 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-slate-800 transition-colors shadow-2xs"
          title="Yangilash"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Asosiy Kontent */}
      <main className="flex-1 p-4">
        {faolTab === "sotuv" && <SotuvTab />}
        {faolTab === "chiqim" && <ChiqimTab />}
        {faolTab === "qarzlar" && <QarzlarTab />}
        {faolTab === "kassa" && <KassaTab />}
        {faolTab === "ombor" && <OmborTab />}
      </main>

      {/* Pastki Katta Navigatsiya Paneli (40+ yoshdagilar uchun qulay) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-lg">
        <div className="max-w-md mx-auto grid grid-cols-5 px-1 py-1.5 pb-[calc(6px+env(safe-area-inset-bottom,0px))]">
          {/* 1. Sotuv */}
          <button
            onClick={() => tabOzgarti("sotuv")}
            className={`flex flex-col items-center justify-center py-2 rounded-2xl transition-all ${
              faolTab === "sotuv"
                ? "bg-emerald-50 text-emerald-700 font-extrabold"
                : "text-slate-500 hover:text-slate-800 font-medium"
            }`}
          >
            <ShoppingCart className={`w-6 h-6 ${faolTab === "sotuv" ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
            <span className="text-[11px] mt-1 tracking-tight">Sotuv</span>
          </button>

          {/* 2. Chiqim */}
          <button
            onClick={() => tabOzgarti("chiqim")}
            className={`flex flex-col items-center justify-center py-2 rounded-2xl transition-all ${
              faolTab === "chiqim"
                ? "bg-rose-50 text-rose-700 font-extrabold"
                : "text-slate-500 hover:text-slate-800 font-medium"
            }`}
          >
            <TrendingDown className={`w-6 h-6 ${faolTab === "chiqim" ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
            <span className="text-[11px] mt-1 tracking-tight">Chiqim</span>
          </button>

          {/* 3. Qarzlar */}
          <button
            onClick={() => tabOzgarti("qarzlar")}
            className={`flex flex-col items-center justify-center py-2 rounded-2xl transition-all ${
              faolTab === "qarzlar"
                ? "bg-amber-50 text-amber-700 font-extrabold"
                : "text-slate-500 hover:text-slate-800 font-medium"
            }`}
          >
            <Users className={`w-6 h-6 ${faolTab === "qarzlar" ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
            <span className="text-[11px] mt-1 tracking-tight">Qarzlar</span>
          </button>

          {/* 4. Kassa */}
          <button
            onClick={() => tabOzgarti("kassa")}
            className={`flex flex-col items-center justify-center py-2 rounded-2xl transition-all ${
              faolTab === "kassa"
                ? "bg-blue-50 text-blue-700 font-extrabold"
                : "text-slate-500 hover:text-slate-800 font-medium"
            }`}
          >
            <Wallet className={`w-6 h-6 ${faolTab === "kassa" ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
            <span className="text-[11px] mt-1 tracking-tight">Kassa</span>
          </button>

          {/* 5. Ombor */}
          <button
            onClick={() => tabOzgarti("ombor")}
            className={`flex flex-col items-center justify-center py-2 rounded-2xl transition-all ${
              faolTab === "ombor"
                ? "bg-purple-50 text-purple-700 font-extrabold"
                : "text-slate-500 hover:text-slate-800 font-medium"
            }`}
          >
            <Package className={`w-6 h-6 ${faolTab === "ombor" ? "stroke-[2.5]" : "stroke-[1.8]"}`} />
            <span className="text-[11px] mt-1 tracking-tight">Ombor</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
