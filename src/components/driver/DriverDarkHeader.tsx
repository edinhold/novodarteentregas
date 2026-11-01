import React from "react";
import { Menu, Signal, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DriverDarkHeaderProps {
  companyName?: string;
  isOnline?: boolean;
  statusText?: string;
  onOpenMenu?: () => void;
  onTestSound?: () => void;
  unreadCount?: number;
}

export const DriverDarkHeader: React.FC<DriverDarkHeaderProps> = ({
  companyName = "Duarte Entregas",
  isOnline = true,
  statusText,
  onOpenMenu,
  onTestSound,
}) => {
  const displayStatus = statusText || (isOnline ? "Disponível" : "Offline");
  const isAvailable = isOnline && (!statusText || statusText.toLowerCase().includes("dispon"));

  return (
    <header className="absolute top-0 inset-x-0 z-20 pointer-events-none">
      {/* Subtle top dark gradient for contrast over roads */}
      <div className="w-full bg-gradient-to-b from-[#0a0a0c]/95 via-[#0a0a0c]/70 to-transparent pt-4 pb-8 px-4">
        <div className="relative flex items-center justify-between max-w-lg mx-auto pointer-events-auto">
          {/* Left Action / Menu Trigger */}
          <div className="w-10 flex items-center justify-start">
            {onOpenMenu && (
              <button
                type="button"
                onClick={onOpenMenu}
                aria-label="Menu principal"
                className="w-9 h-9 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 flex items-center justify-center transition active:scale-95 shadow-lg backdrop-blur-md"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Centered Title & Status Badge */}
          <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
            <h1 className="text-white font-semibold text-base sm:text-lg tracking-tight select-none drop-shadow-md">
              {companyName} - Motorista
            </h1>

            {/* Pill de Status */}
            <div className="mt-1 flex items-center justify-center">
              {isAvailable ? (
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-medium text-[#22C55E] select-none shadow-sm backdrop-blur-md"
                  style={{
                    backgroundColor: "rgba(34, 197, 94, 0.15)",
                    border: "1px solid rgba(34, 197, 94, 0.35)",
                  }}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E]" />
                  </span>
                  <span>{displayStatus}</span>
                </div>
              ) : (
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-medium text-amber-400 select-none shadow-sm backdrop-blur-md"
                  style={{
                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                  }}
                >
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span>{displayStatus}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Action / Sound & Status Indicator */}
          <div className="w-10 flex items-center justify-end">
            {onTestSound && (
              <button
                type="button"
                onClick={onTestSound}
                aria-label="Testar sirene / som de alerta"
                title="Sirene de chamada"
                className="w-9 h-9 rounded-full bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 flex items-center justify-center transition active:scale-95 shadow-lg backdrop-blur-md"
              >
                <Signal className="w-4 h-4 text-emerald-400" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default DriverDarkHeader;
