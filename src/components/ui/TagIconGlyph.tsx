import {
  BowlSteam,
  Cake,
  Coffee,
  FishSimple,
  ForkKnife,
  Leaf,
  Lightning,
  Martini,
  TagSimple,
} from "@phosphor-icons/react";

export function TagIconGlyph({ tag, size = 14 }: { tag: string; size?: number }) {
  switch (tag) {
    case "Appetizer":
      return <ForkKnife size={size} weight="bold" />;
    case "Breakfast":
      return <Coffee size={size} weight="bold" />;
    case "Dessert":
      return <Cake size={size} weight="bold" />;
    case "Drink":
      return <Martini size={size} weight="bold" />;
    case "Fish":
      return <FishSimple size={size} weight="bold" />;
    case "Quick":
      return <Lightning size={size} weight="bold" />;
    case "Soup":
      return <BowlSteam size={size} weight="bold" />;
    case "Vegetarian":
      return <Leaf size={size} weight="bold" />;
    default:
      return <TagSimple size={size} weight="bold" style={{ transform: "rotate(-45deg)" }} />;
  }
}
