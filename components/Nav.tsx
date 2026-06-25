"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "홈", icon: "◎" },
  { href: "/itinerary", label: "일정", icon: "▤" },
  { href: "/expenses", label: "가계부", icon: "¥" },
  { href: "/shopping", label: "쇼핑", icon: "✓" },
  { href: "/map", label: "길찾기", icon: "➤" },
  { href: "/translate", label: "번역", icon: "あ" },
  { href: "/assistant", label: "비서", icon: "✦" },
  { href: "/account", label: "내정보", icon: "◐" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-md border-t border-line bg-white/95 backdrop-blur">
      <ul className="grid grid-cols-8">
        {tabs.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[8px] font-medium transition ${
                  active ? "text-torii" : "text-muted"
                }`}
              >
                <span className={`text-sm leading-none ${active ? "scale-110" : ""}`}>
                  {t.icon}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
