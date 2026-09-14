import type { ReactNode, SVGProps } from "react";

export type IconName = "arrow" | "boxes" | "chart" | "check" | "cloud" | "file" | "history" | "home" | "menu" | "plus" | "settings" | "sync" | "users";

const paths: Record<IconName, ReactNode> = {
  arrow: <path d="M5 12h13M13 6l6 6-6 6" />,
  boxes: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 12 8 4 8-4M4 17l8 4 8-4" /></>,
  chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /><path d="m4 7 5-3 5 2 6-4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  cloud: <><path d="M7 18h11a4 4 0 0 0 .7-7.94A6 6 0 0 0 7.2 8.7 4.7 4.7 0 0 0 7 18Z" /><path d="M12 11v7M9.5 13.5 12 11l2.5 2.5" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4M9 13h6M9 17h6" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5M12 7v5l3 2" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  settings: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" /><path d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.2a2 2 0 0 1-4 0v-.2a2 2 0 0 0-3.4-1.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A2 2 0 0 0 3.6 12a2 2 0 0 0-.1-.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A2 2 0 0 0 9.7 7V6.8a2 2 0 1 1 4 0V7a2 2 0 0 0 3.4 1.4l.1-.1A2 2 0 1 1 20 11.1l-.1.1a2 2 0 0 0 0 1.6l.1.1a2 2 0 0 1-.6 2.1Z" /></>,
  sync: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.3 9A7 7 0 0 1 20 12M4 12a7 7 0 0 0 13.7 3" /></>,
  users: <><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="8" r="3" /><path d="M16 4.5a3 3 0 0 1 0 5.8M19 20v-1.3a3.5 3.5 0 0 0-2.5-3.3" /></>,
};

export function Icon({ name, size = 20, strokeWidth = 1.8, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number; strokeWidth?: number }) {
  return <svg {...props} aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>{paths[name]}</svg>;
}
