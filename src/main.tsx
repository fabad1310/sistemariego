import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Registro del Service Worker (solo en producción / fuera del preview de Lovable)
if ('serviceWorker' in navigator) {
  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const isPreviewHost =
    window.location.hostname.includes('id-preview--') ||
    window.location.hostname.includes('lovableproject.com') ||
    window.location.hostname.includes('lovable.dev');

  if (isPreviewHost || isInIframe) {
    // En preview/iframe: desregistrar cualquier SW para no interferir con HMR
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}
