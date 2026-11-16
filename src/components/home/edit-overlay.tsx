"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { CARD_SIZES, SIZE_LABEL } from "@/lib/layout";
import type { CardId } from "@/lib/settings";
import { useEdit } from "./edit-context";

const DRAG_TYPE = "text/hs-card";

/** Läggs över ett kort i redigera-läget: dra kortet, flytta med pilarna eller välj storlek. Kortets egna knappar är avstängda under tiden. */
export function useCardEdit(id: CardId | null) {
  const edit = useEdit();
  const [over, setOver] = useState(false);
  if (!edit.editing || !id) return { props: {} as Record<string, unknown>, overlay: null };
  const i = edit.order.indexOf(id);
  return {
    props: {
      draggable: true,
      "data-edit": "",
      "data-drop": over ? "" : undefined,
      onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(DRAG_TYPE, id); e.dataTransfer.effectAllowed = "move"; },
      onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setOver(true); } },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(false); const from = e.dataTransfer.getData(DRAG_TYPE) as CardId; if (from) edit.dropOn(from, id); },
    } as Record<string, unknown>,
    overlay: (
      <div className="edit-ov">
        <span className="edit-grip"><GripVertical aria-hidden="true" />Dra kortet</span>
        <div className="edit-row">
          <button type="button" className="edit-btn" aria-label="Flytta tidigare" disabled={i <= 0} onClick={() => edit.move(id, -1)}><ChevronLeft aria-hidden="true" /></button>
          <div className="edit-seg" role="group" aria-label="Storlek">
            {CARD_SIZES.map((s) => <button key={s} type="button" aria-pressed={edit.sizeOf(id) === s} onClick={() => edit.setSize(id, s)}>{SIZE_LABEL[s]}</button>)}
          </div>
          <button type="button" className="edit-btn" aria-label="Flytta senare" disabled={i < 0 || i >= edit.order.length - 1} onClick={() => edit.move(id, 1)}><ChevronRight aria-hidden="true" /></button>
        </div>
      </div>
    ),
  };
}
