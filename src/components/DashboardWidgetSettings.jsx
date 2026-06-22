import { Settings2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTrigger, DrawerClose } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

export const DEFAULT_WIDGETS = {
  healthScore: true,
  watchlist: true,
  quickAccess: true,
  gasTracker: true,
  newsFeed: true,
};

const WIDGET_LABELS = {
  healthScore: "Portfolio Health Score",
  watchlist: "Watchlist",
  quickAccess: "Quick Access Grid",
  gasTracker: "Gas Tracker",
  newsFeed: "News Feed",
};

export default function DashboardWidgetSettings({ widgets, onChange }) {
  const isMobile = useIsMobile();

  const WidgetContent = () => (
    <div className="space-y-4 p-4">
      <p className="text-sm font-semibold">Customize Dashboard</p>
      <p className="text-xs text-muted-foreground">Show or hide dashboard sections</p>
      <div className="space-y-4">
        {Object.entries(WIDGET_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <Label htmlFor={`widget-${key}`} className="text-sm cursor-pointer flex-1">{label}</Label>
            <Switch
              id={`widget-${key}`}
              checked={widgets[key]}
              onCheckedChange={val => onChange({ ...widgets, [key]: val })}
            />
          </div>
        ))}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer>
        <DrawerTrigger asChild>
          <button aria-label="Customize dashboard" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Settings2 className="h-4 w-4" />
          </button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          {/* Close affordance only — WidgetContent already renders the title */}
          <div className="flex justify-end px-2 pt-1">
            <DrawerClose asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground">Close</Button>
            </DrawerClose>
          </div>
          <WidgetContent />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button aria-label="Customize dashboard" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <Settings2 className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4 space-y-3" align="end">
        <p className="text-sm font-semibold">Customize Dashboard</p>
        <p className="text-xs text-muted-foreground">Show or hide dashboard sections</p>
        <div className="space-y-3">
          {Object.entries(WIDGET_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <Label htmlFor={`widget-${key}`} className="text-sm cursor-pointer">{label}</Label>
              <Switch
                id={`widget-${key}`}
                checked={widgets[key]}
                onCheckedChange={val => onChange({ ...widgets, [key]: val })}
              />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}