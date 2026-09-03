import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, Download } from "lucide-react";

const REMIND_LATER_MS = 30 * 60 * 1000; // 30 minutes

const UpdatePrompt = () => {
  const [open, setOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const remindTimerRef = useRef<number | null>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      console.log("[UpdatePrompt] SW registered:", swUrl);

      const check = () => registration.update().catch(() => {});

      // Initial check, then poll frequently so new versions appear fast
      check();
      const interval = window.setInterval(check, 60 * 1000); // every 60s

      const onFocus = () => check();
      const onVisible = () => { if (document.visibilityState === "visible") check(); };
      const onOnline = () => check();
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("online", onOnline);

      // Cleanup is not strictly required (SW lives for app lifetime),
      // but expose for HMR safety.
      (window as any).__updatePromptCleanup = () => {
        window.clearInterval(interval);
        window.removeEventListener("focus", onFocus);
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("online", onOnline);
      };
    },
    onNeedRefresh() {
      console.log("[UpdatePrompt] new version available");
    },
  });

  useEffect(() => {
    if (needRefresh) setOpen(true);
  }, [needRefresh]);

  useEffect(() => {
    return () => {
      if (remindTimerRef.current) window.clearTimeout(remindTimerRef.current);
    };
  }, []);

  const handleUpdate = async () => {
    setReloading(true);
    try {
      await updateServiceWorker(true);
    } catch (err) {
      console.error("Update failed:", err);
      window.location.reload();
    }
  };

  const handleRemindLater = () => {
    setOpen(false);
    if (remindTimerRef.current) window.clearTimeout(remindTimerRef.current);
    remindTimerRef.current = window.setTimeout(() => {
      setOpen(true);
    }, REMIND_LATER_MS);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleRemindLater(); }}>
      <DialogContent className="sm:max-w-md">
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <DialogHeader>
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                <Download className="w-6 h-6 text-primary" />
              </div>
              <DialogTitle className="text-center">Nova atualização disponível</DialogTitle>
              <DialogDescription className="text-center">
                Uma nova versão do sistema foi disponibilizada com melhorias e correções. Atualize agora para utilizar a versão mais recente.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 mt-4">
              <Button variant="outline" className="rounded-xl" onClick={handleRemindLater} disabled={reloading}>
                Lembrar Depois
              </Button>
              <Button className="rounded-xl gap-2" onClick={handleUpdate} disabled={reloading}>
                <RefreshCw className={`w-4 h-4 ${reloading ? "animate-spin" : ""}`} />
                {reloading ? "Atualizando..." : "Atualizar Agora"}
              </Button>
            </DialogFooter>
          </motion.div>
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default UpdatePrompt;
