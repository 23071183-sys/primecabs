import { router, type Href } from "expo-router";

/** Go back, or to `fallback` when there's no history (a screen opened from a link or a web reload). */
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
