"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const CHAVE_DISPENSADO = "cr1_instalar_dispensado";

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function rodandoInstalado(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // @ts-expect-error API específica do Safari/iOS
    window.navigator.standalone === true
  );
}

/** Registra o service worker e oferece "Instalar app" (Android/desktop) ou a dica do iOS. */
export function InstalarApp() {
  const [eventoPendente, setEventoPendente] = useState<EventoInstalacao | null>(null);
  const [mostrarDicaIOS, setMostrarDicaIOS] = useState(false);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    if (rodandoInstalado() || localStorage.getItem(CHAVE_DISPENSADO)) return;

    const aoPromptar = (e: Event) => {
      e.preventDefault();
      setEventoPendente(e as EventoInstalacao);
    };
    window.addEventListener("beforeinstallprompt", aoPromptar);

    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (iOS) setMostrarDicaIOS(true);

    return () => window.removeEventListener("beforeinstallprompt", aoPromptar);
  }, []);

  function dispensar() {
    localStorage.setItem(CHAVE_DISPENSADO, "1");
    setEventoPendente(null);
    setMostrarDicaIOS(false);
  }

  async function instalar() {
    if (!eventoPendente) return;
    setInstalando(true);
    try {
      await eventoPendente.prompt();
      await eventoPendente.userChoice;
    } finally {
      setEventoPendente(null);
      setInstalando(false);
    }
  }

  if (!eventoPendente && !mostrarDicaIOS) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 py-3 shadow-lg backdrop-blur sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-sm sm:rounded-xl sm:border">
      <div className="flex items-start gap-3">
        <div className="flex-1 text-sm">
          {eventoPendente ? (
            <>
              <p className="font-medium">Instalar o Contas a Receber</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Acesse como um app, direto da tela inicial do celular.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Adicione à tela de início</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                Toque em <Share className="inline h-3.5 w-3.5" /> Compartilhar e depois em
                “Adicionar à Tela de Início”.
              </p>
            </>
          )}
        </div>
        <button
          onClick={dispensar}
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Dispensar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {eventoPendente && (
        <Button size="sm" className="mt-2 w-full" disabled={instalando} onClick={instalar}>
          <Download /> Instalar
        </Button>
      )}
    </div>
  );
}
