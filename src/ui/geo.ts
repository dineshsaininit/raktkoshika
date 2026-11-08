/** Straight-line distance in km between two points (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export interface Here { lat: number; lng: number; accuracy: number; label?: string }

const ask = (opts: PositionOptions) => new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opts));

/**
 * Asks the browser for the person's location (needs their permission and HTTPS or localhost).
 * Tries a precise fix first; laptops without GPS often time out on that, so it then accepts a
 * Wi-Fi/network-based fix, which is usually accurate to a few hundred metres.
 */
export async function locate(): Promise<Here> {
  if (!('geolocation' in navigator)) throw new Error('This browser cannot share your location. Type your PIN code or city instead.');
  if (!window.isSecureContext) throw new Error('Location only works on a secure (https) page. Type your PIN code or city instead.');
  const done = (p: GeolocationPosition): Here => ({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
  try {
    return done(await ask({ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }));
  } catch (e) {
    const err = e as GeolocationPositionError;
    if (err.code === err.PERMISSION_DENIED) {
      throw new Error('Location permission is blocked. Click the lock icon next to the address bar, allow Location, and try again. Or type your PIN code or city.');
    }
    try {
      return done(await ask({ enableHighAccuracy: false, timeout: 20000, maximumAge: 10 * 60000 }));
    } catch {
      throw new Error('Your device could not find your location. On Windows, turn on Settings → Privacy → Location. Or type your PIN code or city below.');
    }
  }
}

export const directionsUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
export const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`);
