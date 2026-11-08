import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun, type LucideIcon } from "lucide-react";
import type { WxIcon } from "./weather-view";

const ICONS: Record<WxIcon, LucideIcon> = {
  sun: Sun, moon: Moon, "cloud-sun": CloudSun, "cloud-moon": CloudMoon, cloud: Cloud,
  fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, storm: CloudLightning,
};

/** Väderikon. Dekorativ: texten bredvid säger samma sak. */
export function WeatherIcon({ icon, className }: { icon: WxIcon; className?: string }) {
  const I = ICONS[icon];
  return <I aria-hidden="true" className={`wx-icon wx-${icon}${className ? ` ${className}` : ""}`} />;
}
