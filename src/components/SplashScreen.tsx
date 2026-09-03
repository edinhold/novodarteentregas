import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import splashLogo from "@/assets/splash-logo.jpeg";

const SplashScreen = () => {
  const [visible, setVisible] = useState(() => {
    // Show splash only once per session
    if (sessionStorage.getItem("splashShown")) return false;
    return true;
  });

  useEffect(() => {
    if (!visible) return;
    sessionStorage.setItem("splashShown", "true");
    const timer = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
        >
          <motion.img
            src={splashLogo}
            alt="Duarte Delivery"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="w-64 h-auto max-w-[80vw]"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
