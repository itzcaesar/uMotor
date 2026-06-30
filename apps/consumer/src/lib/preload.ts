// Critical first-paint images (login → tab bar → Garasi/home). Preloaded during
// the splash hold so icons and tiles are already decoded on the first frame —
// no progressive pop-in. Illustrations are inline SVG (bundled in JS) so they
// don't need preloading; only the figma PNGs do.
//
// `require('…png')` resolves to a Metro asset module id (number), which is what
// `Asset.loadAsync` expects.
export const CRITICAL_IMAGES: number[] = [
  // Bottom tab bar
  require('../../assets/figma/nav-home.png') as number,
  require('../../assets/figma/nav-motorcycle.png') as number,
  require('../../assets/figma/ic-coins.png') as number,
  require('../../assets/figma/nav-notification.png') as number,
  require('../../assets/figma/nav-profile.png') as number,
  // Home action tiles
  require('../../assets/figma/ic-flat-tire.png') as number,
  require('../../assets/figma/ic-calendar.png') as number,
  require('../../assets/figma/ic-fuel.png') as number,
  require('../../assets/figma/ic-garage.png') as number,
  require('../../assets/figma/ic-speed.png') as number,
  require('../../assets/figma/ic-time.png') as number,
  require('../../assets/figma/ic-oil.png') as number,
  // Balance card
  require('../../assets/figma/astrapay-mark.png') as number,
  require('../../assets/figma/ic-plus.png') as number,
  require('../../assets/figma/ic-withdraw.png') as number,
  // Common header back chevron
  require('../../assets/figma/ic-back.png') as number,
];

