import React, { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { haptic } from "../../lib/supabase";

export interface ComboboxOption {
  value: string;
  label: string;
  subLabel?: string;
  icon?: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Tanlang...",
  searchPlaceholder = "Qidirish...",
  emptyText = "Natija topilmadi.",
  disabled = false,
  className = "",
  title = "Tanlang",
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(q)) ||
        (opt.badge && opt.badge.toLowerCase().includes(q))
    );
  }, [options, query]);

  function handleSelect(val: string) {
    haptic("light");
    onChange(val);
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      {/* Shadcn UI Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            haptic("light");
            setOpen(true);
          }
        }}
        className={`w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:pointer-events-none text-left shadow-2xs ${className}`}
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
          {selectedOption?.icon && (
            <span className="flex-shrink-0">{selectedOption.icon}</span>
          )}
          <span className={`truncate ${selectedOption ? "text-slate-900 dark:text-white font-bold" : "text-slate-400 dark:text-slate-500"}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${
                selectedOption.badgeColor || "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300"
              }`}
            >
              {selectedOption.badge}
            </span>
          )}
        </div>
        <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0 ml-1.5" />
      </button>

      {/* Shadcn Searchable Popover / Modal (Mobile-first sheet) */}
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-3.5 space-y-2.5 shadow-2xl max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
              <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">{title}</h3>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                }}
                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Qidiruv Input */}
            <div className="relative flex-shrink-0">
              <Search className="absolute left-2.5 top-2.5 text-slate-400 dark:text-slate-500 w-3.5 h-3.5" />
              <input
                type="text"
                autoFocus
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-8 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Variantlar Ro'yxati */}
            <div className="flex-1 overflow-y-auto space-y-1 py-1 max-h-60 pr-0.5">
              {filteredOptions.length === 0 ? (
                <div className="py-6 text-center text-slate-400 dark:text-slate-500 text-xs font-medium">
                  {emptyText}
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelect(opt.value)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all text-left ${
                        isSelected
                          ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-700/80"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                        {opt.icon && <span className="flex-shrink-0 text-sm">{opt.icon}</span>}
                        <div className="truncate">
                          <p className={`truncate leading-snug ${isSelected ? "font-bold text-emerald-950 dark:text-emerald-200" : "font-medium text-slate-900 dark:text-white"}`}>
                            {opt.label}
                          </p>
                          {opt.subLabel && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                              {opt.subLabel}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {opt.badge && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              opt.badgeColor || "bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300"
                            }`}
                          >
                            {opt.badge}
                          </span>
                        )}
                        {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
