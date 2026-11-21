"use client";

import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLearning } from "@/lib/learning-store";
import { cn } from "@/lib/utils";

export function FavoriteButton({ code, compact = false }: { code: string; compact?: boolean }) {
  const { state, toggleFavorite } = useLearning();
  const on = state.favorites.includes(code);
  return (
    <Button
      type="button"
      variant={compact ? "ghost" : "outline"}
      size={compact ? "icon" : "sm"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFavorite(code);
      }}
      aria-pressed={on}
      aria-label={on ? "お気に入りから外す" : "お気に入りに登録"}
    >
      <Star className={cn("size-4", on ? "fill-amber-400 text-amber-500" : "text-muted-foreground")} />
      {!compact && (on ? "お気に入り登録済み" : "お気に入り")}
    </Button>
  );
}
