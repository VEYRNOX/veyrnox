import { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { GripVertical, Eye, EyeOff, RotateCcw, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const DEFAULT_WIDGETS = [
  { id: "portfolio_value", label: "Portfolio Value", description: "Total balance with 24h change", emoji: "💰", enabled: true },
  { id: "asset_chart", label: "Asset Distribution Chart", description: "Pie chart of holdings", emoji: "📊", enabled: true },
  { id: "portfolio_chart", label: "Portfolio Performance Chart", description: "7-day line chart", emoji: "📈", enabled: true },
  { id: "transaction_list", label: "Recent Transactions", description: "Last 5 transactions", emoji: "📋", enabled: true },
  { id: "news_feed", label: "Crypto News Feed", description: "Latest headlines", emoji: "📰", enabled: true },
  { id: "gas_tracker", label: "Gas Tracker", description: "Current gas prices", emoji: "⛽", enabled: true },
  { id: "watchlist", label: "Watchlist", description: "Tracked assets with prices", emoji: "👁️", enabled: true },
  { id: "health_score", label: "Portfolio Health Score", description: "Risk and diversification score", emoji: "🏥", enabled: true },
  { id: "quick_actions", label: "Quick Actions", description: "Send, Receive, Swap buttons", emoji: "⚡", enabled: true },
  { id: "price_alerts", label: "Active Price Alerts", description: "Triggered alert banner", emoji: "🔔", enabled: true },
  { id: "kyc_banner", label: "KYC Status Banner", description: "Verification reminder", emoji: "🪪", enabled: false },
];

const STORAGE_KEY = "dashboard-widget-config";

export default function CustomDashboardWidgets() {
  const [widgets, setWidgets] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const savedParsed = JSON.parse(saved);
      // Merge with defaults to pick up new widgets
      const merged = DEFAULT_WIDGETS.map(dw => {
        const found = savedParsed.find(sw => sw.id === dw.id);
        return found ? { ...dw, enabled: found.enabled } : dw;
      });
      const savedOrder = savedParsed.map(sw => sw.id);
      return merged.sort((a, b) => { const ai = savedOrder.indexOf(a.id); const bi = savedOrder.indexOf(b.id); return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi); });
    }
    return DEFAULT_WIDGETS;
  });

  const [saved, setSaved] = useState(false);

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(widgets);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setWidgets(reordered);
  };

  const toggleWidget = (id) => setWidgets(ws => ws.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets.map(w => ({ id: w.id, enabled: w.enabled }))));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = () => { setWidgets(DEFAULT_WIDGETS); localStorage.removeItem(STORAGE_KEY); };

  const enabledCount = widgets.filter(w => w.enabled).length;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Dashboard Widgets</h1>
          <p className="text-sm text-muted-foreground">{enabledCount} of {widgets.length} widgets enabled</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reset} className="gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>
          <Button size="sm" onClick={save} className="gap-1.5">
            {saved ? <><Check className="h-3.5 w-3.5" /> Saved!</> : <><Save className="h-3.5 w-3.5" /> Save</>}
          </Button>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-secondary/50 border border-border">
        <p className="text-xs text-muted-foreground">Drag to reorder widgets on your dashboard. Toggle to show or hide each one.</p>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="widgets">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {widgets.map((widget, index) => (
                <Draggable key={widget.id} draggableId={widget.id} index={index}>
                  {(p, snapshot) => (
                    <div ref={p.innerRef} {...p.draggableProps}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border bg-card select-none transition-shadow ${snapshot.isDragging ? "shadow-xl border-primary" : "border-border"} ${!widget.enabled ? "opacity-50" : ""}`}>
                      <div {...p.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <span className="text-xl shrink-0">{widget.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${!widget.enabled ? "line-through text-muted-foreground" : ""}`}>{widget.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{widget.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {widget.enabled ? <Eye className="h-3.5 w-3.5 text-primary" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                        <Switch checked={widget.enabled} onCheckedChange={() => toggleWidget(widget.id)} />
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <div className="p-3 rounded-xl bg-secondary/50 border border-border">
        <p className="text-xs text-muted-foreground">💡 Changes are saved to your browser and apply to the Dashboard when you navigate there.</p>
      </div>
    </div>
  );
}