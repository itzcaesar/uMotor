const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Stable YYYY-MM-DD key for the workshop's WIB business day. */
export function jakartaDateKey(value: Date | string | number = new Date()) {
  const shifted = new Date(new Date(value).getTime() + JAKARTA_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(
    shifted.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** Start of a WIB day as an absolute instant, optionally offset by days. */
export function jakartaDayStart(now = new Date(), dayOffset = 0) {
  const shifted = new Date(now.getTime() + JAKARTA_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() + dayOffset,
    ) - JAKARTA_OFFSET_MS,
  );
}

export function jakartaWeekday(value: Date | string | number = new Date()) {
  const shifted = new Date(new Date(value).getTime() + JAKARTA_OFFSET_MS);
  return shifted.getUTCDay();
}
