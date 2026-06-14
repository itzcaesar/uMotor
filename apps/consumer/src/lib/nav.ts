import { router, type Href } from 'expo-router';

/**
 * Pop the current screen if there is history, otherwise navigate to a safe
 * fallback. Prevents the "GO_BACK was not handled by any navigator" warning
 * when a screen is reached via deep link, a web refresh, or after a replace/
 * dismissAll left nothing on the stack.
 */
export function safeBack(fallback: Href = '/(tabs)') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
