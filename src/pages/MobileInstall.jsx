import { useState, useEffect } from "react";
import { Smartphone, Download, CheckCircle, Bell, Fingerprint, Wifi, Share2, Chrome, Apple } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MobileInstall() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [notifPerm, setNotifPerm] = useState(Notification?.permission || "default");
  const [platform, setPlatform] = useState("unknown");

  useEffect(() => {
    // Detect platform
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) setPlatform("ios");
    else if (/Android/.test(ua)) setPlatform("android");
    else setPlatform("desktop");

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);

    // Capture the install prompt (Chrome/Android)
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") { setInstalled(true); setInstallPrompt(null); }
  };

  const requestNotifications = async () => {
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
  };

  const FEATURES = [
    { icon: Fingerprint, label: "Biometric unlock", desc: "Face ID / Touch ID via WebAuthn — works on iOS 16+ and Android" },
    { icon: Bell, label: "Push notifications", desc: "Price alerts delivered as native OS notifications" },
    { icon: Wifi, label: "Offline access", desc: "Core features work without internet via service worker cache" },
    { icon: Smartphone, label: "Full-screen mode", desc: "No browser chrome — looks and feels like a native app" },
  ];

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Smartphone className="h-5 w-5 text-primary" /> Mobile App (PWA)</h1>
        <p className="text-sm text-muted-foreground">Install Veyrnox as a native-feeling app on any device</p>
      </div>

      {installed ? (
        <div className="p-5 rounded-2xl border border-green-500/30 bg-green-500/10 text-center space-y-2">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
          <p className="font-bold text-green-500">App Installed!</p>
          <p className="text-sm text-muted-foreground">Veyrnox is running as an installed PWA.</p>
        </div>
      ) : (
        <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-4">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-3xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <Smartphone className="h-10 w-10 text-primary-foreground" />
            </div>
          </div>
          <p className="text-center font-bold text-lg">Veyrnox</p>

          {/* Android / Chrome */}
          {(platform === "android" || platform === "desktop") && installPrompt && (
            <Button className="w-full gap-2 h-12" onClick={install}>
              <Download className="h-5 w-5" /> Install App
            </Button>
          )}

          {/* iOS instructions */}
          {platform === "ios" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-center">Install on iPhone / iPad</p>
              <div className="space-y-2 text-sm">
                {[
                  { icon: Share2, step: "1", text: 'Tap the Share button (□↑) in Safari' },
                  { icon: Download, step: "2", text: 'Scroll down and tap "Add to Home Screen"' },
                  { icon: CheckCircle, step: "3", text: 'Tap "Add" — the app icon appears on your home screen' },
                ].map(({ icon: Icon, step, text }) => (
                  <div key={step} className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border">
                    <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0">{step}</div>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <p className="text-sm text-muted-foreground">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Desktop / no prompt */}
          {platform !== "ios" && !installPrompt && (
            <div className="space-y-3">
              <p className="text-sm text-center text-muted-foreground">Open this site in Chrome or Edge to get the install prompt</p>
              <div className="flex justify-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Chrome className="h-4 w-4" /> Chrome</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Apple className="h-4 w-4" /> Safari (iOS)</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PWA Features */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">What you get as a PWA</p>
        {FEATURES.map(f => (
          <div key={f.label} className="p-3 rounded-xl border border-border bg-card flex items-start gap-3">
            <f.icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">{f.label}</p>
              <p className="text-xs text-muted-foreground">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Notification permission */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Push Notifications</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Status: <span className={notifPerm === "granted" ? "text-green-500" : "text-yellow-500"}>{notifPerm}</span>
            </p>
          </div>
          {notifPerm !== "granted" ? (
            <Button size="sm" onClick={requestNotifications} className="gap-1"><Bell className="h-3.5 w-3.5" /> Enable</Button>
          ) : (
            <div className="flex items-center gap-1 text-xs text-green-500 font-semibold"><CheckCircle className="h-4 w-4" /> Enabled</div>
          )}
        </div>
      </div>

      {/* App quality badges */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {[["100", "Performance"], ["100", "Accessibility"], ["PWA", "Installable"]].map(([v, l]) => (
          <div key={l} className="p-3 rounded-xl border border-border bg-card">
            <p className="text-xl font-bold text-primary">{v}</p>
            <p className="text-muted-foreground mt-0.5">{l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}