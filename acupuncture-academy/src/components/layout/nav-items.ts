import { BookOpen, ChartLine, Home, Map, Network, Search, Stethoscope, RotateCcw } from "lucide-react";

export const primaryNav = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/curriculum", label: "講義", icon: BookOpen },
  { href: "/meridians", label: "経絡", icon: Map },
  { href: "/points", label: "経穴", icon: Search },
  { href: "/progress", label: "記録", icon: ChartLine },
];

export const secondaryNav = [
  { href: "/eight-confluent", label: "八脈交会穴", icon: Network },
  { href: "/cases", label: "症例演習", icon: Stethoscope },
  { href: "/review", label: "復習", icon: RotateCcw },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
