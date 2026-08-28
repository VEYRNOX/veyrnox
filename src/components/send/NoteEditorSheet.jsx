// NoteEditorSheet — bottom sheet with a textarea for the optional send note.
// Parent owns the value; sheet edits directly through onChange.
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export default function NoteEditorSheet({ open, onOpenChange, value = "", onChange, label = "Add a note", placeholder = "Optional note" }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-start">
          <SheetTitle>{label}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <textarea
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder}
            className="w-full min-h-28 rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
            aria-label={label}
            autoFocus
          />
          <SheetClose asChild>
            <Button className="w-full" type="button">Done</Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
