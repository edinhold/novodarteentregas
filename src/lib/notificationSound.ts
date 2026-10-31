// Notification sound utility with volume control, custom delivery ringtone, and standby support
import { toast } from "sonner";

// Global volume setting (0-1)
let globalVolume = 1.0;
let standbyInterval: ReturnType<typeof setInterval> | null = null;
let standbyEnabled = false;
let standbyIntervalMs = 30000; // 30 seconds default
let noSleepInterval: ReturnType<typeof setInterval> | null = null;
let noSleepEnabled = false;

// Delivery Ringtone Continuous State
let ringtoneAudioElement: HTMLAudioElement | null = null;
let ringtoneLoopInterval: ReturnType<typeof setInterval> | null = null;
let ringtoneVibrateInterval: ReturnType<typeof setInterval> | null = null;
let activeRingtoneDeliveryId: string | null = null;
let isRingtoneActive = false;

// Singleton AudioContext to handle browser autoplay policies better
let sharedCtx: AudioContext | null = null;

const getAudioContext = () => {
  if (!sharedCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      sharedCtx = new AudioContextClass();
    }
  }
  return sharedCtx;
};

// This should be called on any user interaction (click, touch) to unlock audio
export const resumeAudioContext = async () => {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    try {
      await ctx.resume();
      console.log("[NotificationSound] AudioContext resumed successfully");
    } catch (err) {
      console.error("[NotificationSound] Failed to resume AudioContext:", err);
    }
  }
};

export const setNotificationVolume = (vol: number) => {
  globalVolume = Math.max(0, Math.min(1, vol));
  if (ringtoneAudioElement) {
    try {
      ringtoneAudioElement.volume = globalVolume;
    } catch {}
  }
};

export const getNotificationVolume = () => globalVolume;

const getRingtoneAudio = (): HTMLAudioElement | null => {
  if (typeof window === "undefined") return null;
  if (!ringtoneAudioElement) {
    ringtoneAudioElement = new Audio("/sounds/delivery_ringtone.wav");
    ringtoneAudioElement.loop = true;
    ringtoneAudioElement.preload = "auto";
  }
  return ringtoneAudioElement;
};

// Catchy message notification sound
export const playNotificationSound = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    
    if (ctx.state === "suspended") ctx.resume();

    const vol = globalVolume * 0.6;
    const startTime = ctx.currentTime;

    // A pleasant double-beep
    const frequencies = [523.25, 659.25]; // C5, E5
    
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      
      const time = startTime + i * 0.12;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.3 * vol, time + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.25);
      
      osc.start(time);
      osc.stop(time + 0.25);
    });
  } catch (e) {
    // Silently fail
  }
};

/**
 * Sintetizador Web Audio API de alta penetração acústica para o toque exclusivo de entrega.
 * Combina carrilhão harmônico de alta frequência, sirene em arpejo penetrante e varreduras
 * com detune para ser 100% audível mesmo no trânsito, bolsos e suportes de moto.
 */
export const playRingtoneBurst = () => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const vol = Math.max(0.7, globalVolume);

    // 1. Carrilhão harmônico de chamada (Duplo sino: 880Hz e 1318.5Hz)
    const playChime = (time: number, freq: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, time);

      const oscHarmonic = ctx.createOscillator();
      const gainHarmonic = ctx.createGain();
      oscHarmonic.type = "sine";
      oscHarmonic.frequency.setValueAtTime(freq * 2, time);

      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.6 * vol, time + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

      gainHarmonic.gain.setValueAtTime(0.001, time);
      gainHarmonic.gain.linearRampToValueAtTime(0.35 * vol, time + 0.015);
      gainHarmonic.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      oscHarmonic.connect(gainHarmonic);
      gainHarmonic.connect(ctx.destination);

      osc.start(time);
      osc.stop(time + duration + 0.05);
      oscHarmonic.start(time);
      oscHarmonic.stop(time + duration + 0.05);
    };

    // 2. Sirene em arpejo cortante (C6 1046Hz -> E6 1318Hz -> A6 1760Hz) com ondas sawtooth e square
    const playHorn = (time: number, freq: number, duration: number) => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sawtooth";
      osc2.type = "square";
      osc1.frequency.setValueAtTime(freq, time);
      osc2.frequency.setValueAtTime(freq * 1.015, time); // detune para efeito sirene de emergência

      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.55 * vol, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(time);
      osc1.stop(time + duration + 0.05);
      osc2.start(time);
      osc2.stop(time + duration + 0.05);
    };

    // 3. Pulsos de urgência com varredura de frequência
    const playSweep = (time: number, fStart: number, fEnd: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(fStart, time);
      osc.frequency.exponentialRampToValueAtTime(fEnd, time + duration);

      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.65 * vol, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + duration + 0.05);
    };

    // Sequência sincronizada com o arquivo de áudio
    playChime(now + 0.0, 880, 0.22);
    playChime(now + 0.22, 1318.5, 0.24);

    playHorn(now + 0.50, 1046.5, 0.18);
    playHorn(now + 0.70, 1318.5, 0.18);
    playHorn(now + 0.90, 1760.0, 0.28);

    playSweep(now + 1.25, 1568, 2093, 0.28);
    playSweep(now + 1.62, 1760, 2349, 0.35);
  } catch (err) {
    console.error("[NotificationSound] Error playing ringtone burst:", err);
  }
};

/**
 * Tocar toque urgente imediatamente (única rodada).
 */
export const playUrgentNotification = () => {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([500, 200, 500, 200, 500, 200, 800, 200, 800]);
    }
  } catch {}

  playRingtoneBurst();
};

/**
 * Iniciar o toque de entrega contínuo e incessante.
 * Toca o áudio em loop e vibra o celular continuamente até que
 * a entrega seja aceita por algum motorista ou cancelada.
 */
export const startDeliveryRingtone = (deliveryId?: string) => {
  if (isRingtoneActive && activeRingtoneDeliveryId === (deliveryId || "general")) {
    return; // Já está tocando para esta entrega
  }

  // Se já houver outro toque ativo, reseta e atualiza
  stopDeliveryRingtone();

  isRingtoneActive = true;
  activeRingtoneDeliveryId = deliveryId || "general";
  console.log("[NotificationSound:startDeliveryRingtone]", { deliveryId: activeRingtoneDeliveryId });

  // 1. Tentar executar o áudio WAV com loop contínuo nativo
  try {
    const audio = getRingtoneAudio();
    if (audio && typeof audio.play === "function") {
      audio.volume = globalVolume;
      try { audio.currentTime = 0; } catch {}
      const playPromise = audio.play();
      if (playPromise !== undefined && typeof playPromise.catch === "function") {
        playPromise.catch((err) => {
          console.warn("[NotificationSound] Autoplay do elemento de áudio travado pelo navegador, usando sintetizador:", err?.message || err);
        });
      }
    }
  } catch {}

  // 2. Garantir execução no sintetizador Web Audio API (imediata e em loop de 2.4s)
  resumeAudioContext();
  playRingtoneBurst();

  ringtoneLoopInterval = setInterval(() => {
    if (!isRingtoneActive) return;
    playRingtoneBurst();
  }, 2400);

  // 3. Padrão contínuo de vibração no dispositivo (vibra repetidamente a cada 2.8s)
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([600, 200, 600, 200, 800, 400]);
      ringtoneVibrateInterval = setInterval(() => {
        if (!isRingtoneActive) return;
        navigator.vibrate?.([600, 200, 600, 200, 800, 400]);
      }, 2800);
    }
  } catch {}
};

/**
 * Parar imediatamente o toque de entrega.
 * Chamado assim que o motorista aceita a corrida, outro motorista aceita,
 * a corrida é cancelada ou o motorista a dispensa.
 */
export const stopDeliveryRingtone = (deliveryId?: string) => {
  if (deliveryId && activeRingtoneDeliveryId && deliveryId !== activeRingtoneDeliveryId && deliveryId !== "all") {
    return; // Não para se a chamada for direcionada a outra entrega diferente
  }

  isRingtoneActive = false;
  activeRingtoneDeliveryId = null;

  if (ringtoneAudioElement) {
    try {
      ringtoneAudioElement.pause();
      ringtoneAudioElement.currentTime = 0;
    } catch {}
  }

  if (ringtoneLoopInterval) {
    clearInterval(ringtoneLoopInterval);
    ringtoneLoopInterval = null;
  }

  if (ringtoneVibrateInterval) {
    clearInterval(ringtoneVibrateInterval);
    ringtoneVibrateInterval = null;
  }

  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(0);
    }
  } catch {}

  console.log("[NotificationSound:stopDeliveryRingtone] Toque de entrega interrompido com sucesso.");
};

export const isDeliveryRingtonePlaying = () => isRingtoneActive;

// Standby alert: loud two-tone whistle (fiu-fiu) + vibration
export const playStandbyAlert = () => {
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate([250, 120, 350]);
    }
  } catch {}

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const vol = Math.max(0.6, globalVolume) * 0.9;
    const now = ctx.currentTime;

    const whistle = (startOffset: number, freqStart: number, freqEnd: number, duration: number) => {
      const t0 = now + startOffset;
      const t1 = t0 + duration;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freqStart, t0);
      osc.frequency.exponentialRampToValueAtTime(freqEnd, t1);

      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.9 * vol, t0 + 0.04);
      gain.gain.setValueAtTime(0.9 * vol, t1 - 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t1 + 0.02);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freqStart * 2, t0);
      osc2.frequency.exponentialRampToValueAtTime(freqEnd * 2, t1);

      gain2.gain.setValueAtTime(0.0001, t0);
      gain2.gain.exponentialRampToValueAtTime(0.25 * vol, t0 + 0.04);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t1);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t0);
      osc2.stop(t1 + 0.02);
    };

    whistle(0.0, 900, 1800, 0.28);
    whistle(0.35, 1800, 900, 0.32);
  } catch {}
};

let standbyGate: (() => boolean) | null = null;

export const setStandbyGate = (fn: (() => boolean) | null) => {
  standbyGate = fn;
};

export const startStandbyMode = (intervalMs?: number) => {
  stopStandbyMode();
  standbyEnabled = true;
  standbyIntervalMs = intervalMs || standbyIntervalMs;
  standbyInterval = setInterval(() => {
    if (!standbyEnabled) return;
    if (standbyGate && !standbyGate()) return;
    playStandbyAlert();
  }, standbyIntervalMs);
};

export const stopStandbyMode = () => {
  standbyEnabled = false;
  if (standbyInterval) {
    clearInterval(standbyInterval);
    standbyInterval = null;
  }
};

export const isStandbyActive = () => standbyEnabled;

export const setStandbyInterval = (ms: number) => {
  standbyIntervalMs = Math.max(10000, ms);
  if (standbyEnabled) {
    startStandbyMode(standbyIntervalMs);
  }
};

export const getStandbyInterval = () => standbyIntervalMs;

// No-sleep loop: plays a silent sound to keep the tab alive
export const startNoSleepLoop = () => {
  if (noSleepEnabled) return;
  noSleepEnabled = true;
  
  const playSilent = () => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 100;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch {}
  };

  playSilent();
  noSleepInterval = setInterval(playSilent, 5000);
};

export const stopNoSleepLoop = () => {
  noSleepEnabled = false;
  if (noSleepInterval) {
    clearInterval(noSleepInterval);
    noSleepInterval = null;
  }
};
