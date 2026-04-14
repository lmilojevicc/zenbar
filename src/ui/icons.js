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

const ICONS = Object.freeze({
  search: Search,
  tab: AppWindowMac,
  pin: Pin,
  bookmark: Bookmark,
  history: History,
  globe: Globe,
  spark: Sparkles,
  x: X
});

export function createIcon(name, attrs = {}) {
  const iconNode = ICONS[name] || ICONS.globe;

  return createElement(iconNode, {
    "aria-hidden": "true",
    focusable: "false",
    ...attrs
  });
}
