import { useState, useRef, useCallback, useEffect } from "react";
import { NavLink } from "@/components/NavLink";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  color: string;
}

interface Props {
  items: NavItem[];
  onReorder: (newOrder: string[]) => void;
  onItemClick: () => void;
}

const LONG_PRESS_MS = 300;
const MOVE_CANCEL_THRESHOLD = 8;

export default function DraggableNavGrid({ items, onReorder, onItemClick }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDragging = useRef(false);
  const dragSourceIndex = useRef<number | null>(null);
  const pressStartPoint = useRef<{ x: number; y: number } | null>(null);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const resetDragState = useCallback(() => {
    clearLongPressTimer();
    isDragging.current = false;
    dragSourceIndex.current = null;
    pressStartPoint.current = null;
    setDragIndex(null);
    setOverIndex(null);
  }, [clearLongPressTimer]);

  useEffect(() => {
    return () => clearLongPressTimer();
  }, [clearLongPressTimer]);

  const getIndexFromPoint = useCallback((x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const tile = el.closest("[data-nav-index]");
    if (!tile) return null;
    return parseInt(tile.getAttribute("data-nav-index") || "", 10);
  }, []);

  const handlePointerDown = useCallback((index: number, e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    clearLongPressTimer();
    pressStartPoint.current = { x: e.clientX, y: e.clientY };

    longPressTimer.current = setTimeout(() => {
      isDragging.current = true;
      dragSourceIndex.current = index;
      setDragIndex(index);
      setOverIndex(index);
      if (navigator.vibrate) navigator.vibrate(30);
    }, LONG_PRESS_MS);
  }, [clearLongPressTimer]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pressStartPoint.current) return;

    if (!isDragging.current) {
      const distance = Math.hypot(
        e.clientX - pressStartPoint.current.x,
        e.clientY - pressStartPoint.current.y,
      );

      if (distance > MOVE_CANCEL_THRESHOLD) {
        clearLongPressTimer();
      }
      return;
    }

    e.preventDefault();
    const idx = getIndexFromPoint(e.clientX, e.clientY);
    setOverIndex(idx);
  }, [clearLongPressTimer, getIndexFromPoint]);

  const handlePointerUp = useCallback(() => {
    clearLongPressTimer();

    if (
      isDragging.current &&
      dragSourceIndex.current !== null &&
      overIndex !== null &&
      dragSourceIndex.current !== overIndex
    ) {
      const newItems = [...items];
      const temp = newItems[dragSourceIndex.current];
      newItems[dragSourceIndex.current] = newItems[overIndex];
      newItems[overIndex] = temp;
      onReorder(newItems.map((i) => i.label));
    }

    resetDragState();
  }, [clearLongPressTimer, items, onReorder, overIndex, resetDragState]);

  const handlePointerCancel = useCallback(() => {
    resetDragState();
  }, [resetDragState]);

  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((item, index) => {
        const isBeingDragged = dragIndex === index;
        const isDropTarget = overIndex === index && dragIndex !== null && dragIndex !== index;

        return (
          <motion.div
            key={item.label}
            data-nav-index={index}
            animate={{
              scale: isBeingDragged ? 1.1 : isDropTarget ? 0.92 : 1,
              opacity: isBeingDragged ? 0.7 : 1,
              zIndex: isBeingDragged ? 10 : 0,
            }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={`relative ${dragIndex !== null ? "touch-none" : ""} ${isDropTarget ? "ring-2 ring-primary rounded-xl" : ""}`}
            onPointerDown={(e) => handlePointerDown(index, e)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {dragIndex !== null ? (
              <div className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors cursor-grab select-none">
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r ${item.color} shadow-md`}>
                  <item.icon className="h-5 w-5 text-white" />
                </div>
                <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
              </div>
            ) : (
              <NavLink
                to={item.href}
                onClick={onItemClick}
                className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r ${item.color} shadow-md`}>
                  <item.icon className="h-5 w-5 text-white" />
                </div>
                <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
              </NavLink>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
