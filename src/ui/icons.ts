import {
  AppWindowMac,
  Bookmark,
  Globe,
  History,
  Pin,
  Search,
  Sparkles,
  X,
  createElement
} from "lucide";

type IconFactory = typeof Search;

const ICONS = Object.freeze({
  search: Search,
  tab: AppWindowMac,
  pin: Pin,
  bookmark: Bookmark,
  history: History,
  globe: Globe,
  spark: Sparkles,
  x: X
}) satisfies Record<string, IconFactory>;

export function createIcon(name: string, attrs: Record<string, string> = {}) {
  const iconNode = name in ICONS ? ICONS[name as keyof typeof ICONS] : ICONS.globe;

  return createElement(iconNode, {
    "aria-hidden": "true",
    focusable: "false",
    ...attrs
  });
}
