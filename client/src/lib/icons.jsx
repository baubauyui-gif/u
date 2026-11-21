import {
  Sparkles,
  Hammer,
  Trees,
  Truck,
  PawPrint,
  Wrench,
  PartyPopper,
  Package,
  GraduationCap,
  LayoutGrid,
  Paintbrush,
  Plug,
  Scissors,
  Camera,
  PenTool,
  Store,
  HardHat,
  Dog,
  Brush,
  Leaf,
  Zap,
  Boxes,
  Megaphone,
  HandHeart,
  Bike,
} from 'lucide-react';

const MAP = {
  Sparkles,
  Hammer,
  Trees,
  Truck,
  PawPrint,
  Wrench,
  PartyPopper,
  Package,
  GraduationCap,
  LayoutGrid,
  Paintbrush,
  Plug,
  Scissors,
  Camera,
  PenTool,
  Store,
  HardHat,
  Dog,
  Brush,
  Leaf,
  Zap,
  Boxes,
  Megaphone,
  HandHeart,
  Bike,
};

export function CategoryIcon({ name, size = 22, ...rest }) {
  const Icon = MAP[name] || LayoutGrid;
  return <Icon size={size} {...rest} />;
}

export const CATEGORY_ICON_OPTIONS = Object.keys(MAP);
