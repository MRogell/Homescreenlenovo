"use client";
import { useEffect } from "react";
import { htmlAttrs } from "@/lib/layout";
import { useLayout } from "@/lib/layout-store";

/** Skriver temat, tätheten, textstorleken och "fri layout" som attribut på <html> så att CSS kan använda dem. */
export function LayoutAttrs() {
  const layout = useLayout();
  useEffect(() => {
    const el = document.documentElement;
    for (const [k, v] of Object.entries(htmlAttrs(layout))) {
      if (v === undefined) el.removeAttribute(k);
      else el.setAttribute(k, v);
    }
  }, [layout]);
  return null;
}

/** Körs innan första ritningen (inline i <head>) så att temat inte blinkar. Samma regler som htmlAttrs/isFree i lib/layout. */
export const EARLY_SCRIPT = `(function(){try{var l=JSON.parse(localStorage.getItem("hs-layout-v1")||"null");if(!l)return;var e=document.documentElement,t=["nordljus","skog","solnedgang","neutral"],d=["compact","airy"],x=["s","l"];if(t.indexOf(l.theme)>=0)e.setAttribute("data-theme",l.theme);if(d.indexOf(l.density)>=0)e.setAttribute("data-density",l.density);if(x.indexOf(l.text)>=0)e.setAttribute("data-text",l.text);if((l.order&&l.order.length)||(l.sizes&&Object.keys(l.sizes).length)||l.density==="airy"||(l.text&&l.text!=="m"))e.setAttribute("data-free","")}catch(_){}})();`;
