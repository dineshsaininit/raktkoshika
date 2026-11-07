/** Straight-line distance in km between two points (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export interface Here { lat: number; lng: number; accuracy: number }

/** Asks the browser for the person's location. Needs their permission and HTTPS (or localhost). */
export function locate(): Promise<Here> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('This browser cannot share your location. Pick a centre from the list instead.')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(
        e.code === e.PERMISSION_DENIED ? 'Location permission was refused. Allow it in your browser settings, or pick a centre from the list.'
          : e.code === e.TIMEOUT ? 'Finding your location took too long. Try again outdoors or with Wi-Fi on.'
            : 'Your location is not available right now.',
      )),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 120000 },
    );
  });
}

export const directionsUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
export const fmtKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`);
