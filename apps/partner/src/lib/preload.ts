import { figAssets } from '@/components/ui';

// Critical first-paint images. `figAssets` is the single source of truth for the
// partner app's figma PNGs (login landscape, nav/action icons, reminder art),
// so preloading all of them during the splash hold guarantees no icon pop-in on
// the first screens. They're small local PNGs, so this is cheap.
//
// Values are Metro asset module ids (numbers), which is what `Asset.loadAsync`
// expects.
export const CRITICAL_IMAGES = Object.values(figAssets) as number[];

