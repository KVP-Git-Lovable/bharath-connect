import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  getPhoneBrand,
  openAutoStartSettings,
  openAppSettings,
  type PhoneBrand,
} from "@/utils/nativePermissions";

/**
 * Per-brand autostart / battery steps, modelled on the "Don't kill my app"
 * guidance. The button opens the closest matching settings screen; on brands
 * we don't recognise it falls back to the app's battery/app-info screen.
 */
const GUIDES: Record<PhoneBrand, { name: string; steps: string[] }> = {
  xiaomi: {
    name: "Xiaomi / Redmi / POCO",
    steps: [
      "Tap “Open settings” — the Security app's Autostart list opens.",
      "Find JOVO and switch Autostart ON.",
      "Go back, open App info → Battery saver and choose “No restrictions”.",
      "In Recents, pull JOVO down and tap the lock icon so it isn't cleared.",
    ],
  },
  oppo: {
    name: "Oppo / Realme / OnePlus",
    steps: [
      "Tap “Open settings” — Startup Manager opens.",
      "Allow JOVO to auto-launch and to run in the background.",
      "In App info → Battery usage, allow background activity.",
      "In Recents, lock JOVO so it isn't cleared.",
    ],
  },
  vivo: {
    name: "Vivo / iQOO",
    steps: [
      "Tap “Open settings” — iManager's Autostart / background list opens.",
      "Switch JOVO ON for Autostart.",
      "In Settings → Battery → Background power consumption, allow JOVO.",
      "In Recents, lock JOVO so it isn't cleared.",
    ],
  },
  samsung: {
    name: "Samsung",
    steps: [
      "Tap “Open settings” — Device care → Battery opens.",
      "Open Background usage limits → Never sleeping apps and add JOVO.",
      "Make sure JOVO is not in Sleeping or Deep sleeping apps.",
      "In App info → Battery, choose “Unrestricted”.",
    ],
  },
  other: {
    name: "your phone",
    steps: [
      "Tap “Open settings” — the app's settings screen opens.",
      "Open Battery and choose “Unrestricted” / “No restrictions”.",
      "If your phone has an Autostart or Startup list, allow JOVO there too.",
    ],
  },
};

export default function AutostartGuide({
  open,
  onOpenChange,
  onReturn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the user comes back from settings. */
  onReturn: () => void;
}) {
  const [brand, setBrand] = useState<PhoneBrand>("other");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getPhoneBrand().then((b) => {
      if (!cancelled) setBrand(b.brand);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const guide = GUIDES[brand];

  const openSettings = async () => {
    const res = brand === "other" ? await openAppSettings() : await openAutoStartSettings();
    if (!res) await openAppSettings();
    onOpenChange(false);
    onReturn();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keep tracking running on {guide.name}</DialogTitle>
          <DialogDescription>
            Some phones stop background apps to save battery. These steps keep
            your day's route recording.
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal pl-5 space-y-2 text-sm">
          {guide.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <Button onClick={() => void openSettings()}>Open settings</Button>
      </DialogContent>
    </Dialog>
  );
}
