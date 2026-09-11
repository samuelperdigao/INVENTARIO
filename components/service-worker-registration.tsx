"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Em desenvolvimento o worker é desabilitado; a operação não pode bloquear o lançamento local.
    });
  }, []);

  return null;
}
