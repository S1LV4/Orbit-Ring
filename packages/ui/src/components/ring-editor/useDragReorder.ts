import { useCallback, useRef, useState, type DragEvent } from "react";

export function useDragReorder(length: number, onMove: (from: number, to: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);

  const end = useCallback(() => {
    dragRef.current = null;
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  const rowProps = useCallback(
    (index: number) => ({
      draggable: true,
      onDragStart: (e: DragEvent<HTMLElement>) => {
        dragRef.current = index;
        setDragIndex(index);
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", String(index));
        } catch {
        }
      },
      onDragEnd: end,
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (dragRef.current == null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const r = e.currentTarget.getBoundingClientRect();
        const gap = e.clientY < r.top + r.height / 2 ? index : index + 1;
        setDropIndex((d) => (d === gap ? d : gap));
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        const from = dragRef.current;
        if (from == null) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        const gap = e.clientY < r.top + r.height / 2 ? index : index + 1;
        const to = Math.max(0, Math.min(length - 1, gap > from ? gap - 1 : gap));
        end();
        if (to !== from) onMove(from, to);
      },
    }),
    [end, length, onMove],
  );

  const indicator =
    dragIndex != null && dropIndex != null && dropIndex !== dragIndex && dropIndex !== dragIndex + 1
      ? dropIndex
      : null;

  return { dragIndex, indicator, rowProps };
}
