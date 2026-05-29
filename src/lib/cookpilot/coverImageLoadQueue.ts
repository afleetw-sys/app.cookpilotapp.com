const MAX_CONCURRENT_COVER_LOADS = 4;

let activeCoverLoads = 0;
const coverLoadWaiters: Array<() => void> = [];

/** Limits how many grid cover images start loading at once (browser + /api/recipe-cover). */
export async function acquireCoverImageLoadSlot(): Promise<() => void> {
  if (activeCoverLoads < MAX_CONCURRENT_COVER_LOADS) {
    activeCoverLoads += 1;
    return releaseCoverImageLoadSlot;
  }

  await new Promise<void>((resolve) => {
    coverLoadWaiters.push(resolve);
  });
  activeCoverLoads += 1;
  return releaseCoverImageLoadSlot;
}

function releaseCoverImageLoadSlot() {
  activeCoverLoads = Math.max(0, activeCoverLoads - 1);
  const next = coverLoadWaiters.shift();
  next?.();
}
