import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerHeader, DrawerTrigger, DrawerClose } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";

const CURRENCIES = ["BTC", "ETH", "USDT", "BNB", "SOL", "USDC", "XRP", "DOGE", "ADA", "TRX"];
const TYPES = ["send", "receive", "swap", "stake"];

export default function TransactionFilters({ filters, onChange }) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  const activeCount = [filters.asset, filters.type, filters.dateFrom, filters.dateTo].filter(Boolean).length;

  const clear = () => {
    onChange({ asset: "", type: "", dateFrom: "", dateTo: "" });
    setOpen(false);
  };

  const FilterContent = () => (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Filter Transactions</p>
        {activeCount > 0 && (
          <button onClick={clear} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
            <X className="h-3 w-3" /> Clear all
          </button>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Asset</Label>
        <Select value={filters.asset} onValueChange={v => onChange({ ...filters, asset: v === "all" ? "" : v })}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All assets" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assets</SelectItem>
            {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Type</Label>
        <Select value={filters.type} onValueChange={v => onChange({ ...filters, type: v === "all" ? "" : v })}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">From date</Label>
          <Input type="date" className="h-9 text-sm" value={filters.dateFrom}
            onChange={e => onChange({ ...filters, dateFrom: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To date</Label>
          <Input type="date" className="h-9 text-sm" value={filters.dateTo}
            onChange={e => onChange({ ...filters, dateTo: e.target.value })} />
        </div>
      </div>

      <Button size="sm" className="w-full" onClick={() => setOpen(false)}>Apply</Button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs relative">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center font-bold">
                {activeCount}
              </span>
            )}
          </Button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Filter Transactions</p>
              <DrawerClose asChild>
                <Button variant="ghost" size="sm"><X className="h-4 w-4" /></Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <FilterContent />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs relative">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center font-bold">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4 space-y-3" align="end">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Filter Transactions</p>
          {activeCount > 0 && (
            <button onClick={clear} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
              <X className="h-3 w-3" /> Clear all
            </button>
          )}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Asset</Label>
          <Select value={filters.asset} onValueChange={v => onChange({ ...filters, asset: v === "all" ? "" : v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All assets" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assets</SelectItem>
              {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={filters.type} onValueChange={v => onChange({ ...filters, type: v === "all" ? "" : v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">From date</Label>
            <Input type="date" className="h-8 text-xs" value={filters.dateFrom}
              onChange={e => onChange({ ...filters, dateFrom: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To date</Label>
            <Input type="date" className="h-8 text-xs" value={filters.dateTo}
              onChange={e => onChange({ ...filters, dateTo: e.target.value })} />
          </div>
        </div>

        <Button size="sm" className="w-full" onClick={() => setOpen(false)}>Apply</Button>
      </PopoverContent>
    </Popover>
  );
}