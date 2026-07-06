import type { IconName } from "./navigation";

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "home") return <svg {...common}><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10.5V19h11v-8.5" /><path d="M10 19v-5h4v5" /></svg>;
  if (name === "decision") return <svg {...common}><path d="M6 6h12v12H6z" /><path d="m9 12 2 2 4-5" /></svg>;
  if (name === "scenario") return <svg {...common}><path d="M4 17c4-8 12-8 16 0" /><path d="M7 17v2" /><path d="M12 13v6" /><path d="M17 17v2" /></svg>;
  if (name === "analysis") return <svg {...common}><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15l3-4 3 2 4-6" /></svg>;
  if (name === "product") return <svg {...common}><path d="m12 3 7 4v10l-7 4-7-4V7z" /><path d="M5 7l7 4 7-4" /><path d="M12 11v10" /></svg>;
  if (name === "inventory") return <svg {...common}><path d="M5 5h14v14H5z" /><path d="M5 10h14" /><path d="M9 10v9" /></svg>;
  if (name === "sales") return <svg {...common}><path d="M5 18h14" /><path d="M7 15V9" /><path d="M12 15V5" /><path d="M17 15v-3" /></svg>;
  if (name === "data") return <svg {...common}><path d="M5 7c0 1.7 3.1 3 7 3s7-1.3 7-3-3.1-3-7-3-7 1.3-7 3Z" /><path d="M5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7" /><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg>;
  if (name === "report") return <svg {...common}><path d="M7 3h7l3 3v15H7z" /><path d="M14 3v4h4" /><path d="M9 13h6" /><path d="M9 17h5" /></svg>;
  if (name === "history") return <svg {...common}><path d="M4 12a8 8 0 1 0 2.3-5.7" /><path d="M4 5v5h5" /><path d="M12 8v5l3 2" /></svg>;
  if (name === "ai") return <svg {...common}><path d="M12 3v3" /><path d="M12 18v3" /><path d="M3 12h3" /><path d="M18 12h3" /><path d="m6.3 6.3 2.1 2.1" /><path d="m15.6 15.6 2.1 2.1" /><path d="m17.7 6.3-2.1 2.1" /><path d="m8.4 15.6-2.1 2.1" /><circle cx="12" cy="12" r="3" /></svg>;
  if (name === "settings") return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.1L12.2 3h-4l-.4 2.8a7.5 7.5 0 0 0-2 1.1l-2.4-1-2 3.4 2 1.5A7 7 0 0 0 3 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.1l.4 2.8h4l.4-2.8a7.5 7.5 0 0 0 2-1.1l2.4 1 2-3.4-2-1.5c.2-.4.3-.8.3-1.2Z" transform="translate(2)" /></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
  if (name === "upload") return <svg {...common}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></svg>;
  return <svg {...common}><path d="M12 4v16" /><path d="M4 12h16" /></svg>;
}
