"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/aurora-chat/sw.js", { scope: "/aurora-chat/" })
        .catch(() => undefined);
    }
  }, []);
  return null;
}
