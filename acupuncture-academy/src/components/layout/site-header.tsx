"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose, SheetDescription } from "@/components/ui/sheet";
import { isActive, primaryNav, secondaryNav } from "./nav-items";

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-primary">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-sm text-white" aria-hidden>
            経
          </span>
          <span className="text-[15px] tracking-wide">鍼灸臨床アカデミー</span>
        </Link>
        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="メインメニュー">
          {[...primaryNav, ...secondaryNav].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-primary",
                isActive(pathname, item.href) && "bg-accent font-medium text-primary",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="ml-auto lg:hidden" aria-label="メニューを開く">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>メニュー</SheetTitle>
              <SheetDescription>学習したい項目を選んでください</SheetDescription>
            </SheetHeader>
            <nav className="grid gap-1 px-3" aria-label="すべてのメニュー">
              {[...primaryNav, ...secondaryNav].map((item) => (
                <SheetClose asChild key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-[15px] hover:bg-accent",
                      isActive(pathname, item.href) && "bg-accent font-medium text-primary",
                    )}
                  >
                    <item.icon className="size-5 text-primary" />
                    {item.label}
                  </Link>
                </SheetClose>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
