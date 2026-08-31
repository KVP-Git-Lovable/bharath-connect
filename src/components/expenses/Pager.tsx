import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
}

export default function Pager({ page, pageCount, onPageChange }: Props) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <span className="text-xs text-muted-foreground">Page {page + 1} of {pageCount}</span>
      <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= pageCount - 1} onClick={() => onPageChange(page + 1)}>
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
