// @ts-nocheck
// FeeSheet — wraps FeeSelector in a bottom sheet. The step-3 fee row opens
// this on tap so the wizard doesn't dedicate a whole card to fee picking on
// the confirm screen. FeeSelector still owns the choice via onChange.
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import FeeSelector from "@/components/FeeSelector";

export default function FeeSheet({ open, onOpenChange, ...feeProps }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-start">
          <SheetTitle>Network fee</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <FeeSelector {...feeProps} />
          <SheetClose asChild>
            <Button className="w-full" type="button">Done</Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
