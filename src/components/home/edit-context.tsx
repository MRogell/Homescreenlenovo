"use client";
import { createContext, useContext } from "react";
import type { CardId } from "@/lib/settings";
import type { CardSize } from "@/lib/layout";

export interface EditApi {
  editing: boolean;
  /** Synliga kort i ordning. */
  order: CardId[];
  move: (id: CardId, delta: -1 | 1) => void;
  dropOn: (id: CardId, target: CardId) => void;
  setSize: (id: CardId, size: CardSize) => void;
  sizeOf: (id: CardId) => CardSize;
}

const OFF: EditApi = { editing: false, order: [], move: () => {}, dropOn: () => {}, setSize: () => {}, sizeOf: () => "m" };
export const EditContext = createContext<EditApi>(OFF);
export const useEdit = () => useContext(EditContext);
