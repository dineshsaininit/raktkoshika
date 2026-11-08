import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPoint {
  id: string; lat: number; lng: number; name: string; kind: 'network' | 'directory';
  /** Units of the searched blood on the shelf (network centres only). */
  units?: number; lines: string[]; requestUrl?: string; phone?: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const dir = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

function icon(p: MapPoint) {
  if (p.kind === 'network') {
    const has = (p.units ?? 0) > 0;
    return L.divIcon({
      className: '', iconSize: [38, 46], iconAnchor: [19, 44], popupAnchor: [0, -40],
      html: `<div class="pin net ${has ? '' : 'empty'}"><span>${has ? p.units : 0}</span></div>`,
    });
  }
  return L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -8], html: '<div class="pin dir"></div>' });
}

/**
 * Map of blood centres on OpenStreetMap: red pins are Raktkoshika centres with the number of units of the
 * searched blood; small pins are licensed centres from the directory (stock not on Raktkoshika).
 */
export function CentresMap({ points, here, height = 420 }: { points: MapPoint[]; here: { lat: number; lng: number } | null; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    map.current = L.map(el.current, { scrollWheelZoom: false, zoomControl: true }).setView([18.5, 75.5], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    if (here) {
      L.circleMarker([here.lat, here.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#1570B8', fillOpacity: 1 }).bindTooltip('You are here').addTo(g);
      bounds.push([here.lat, here.lng]);
    }
    // Directory first, so network pins sit on top.
    for (const p of [...points].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'directory' ? -1 : 1))) {
      const html = `<div class="map-pop"><b>${esc(p.name)}</b>${p.lines.map((l) => `<div>${esc(l)}</div>`).join('')}
        <div class="map-actions">${p.requestUrl ? `<a class="map-btn primary" href="${esc(p.requestUrl)}">Request</a>` : ''}
        <a class="map-btn" href="${dir(p.lat, p.lng)}" target="_blank" rel="noreferrer">Directions</a>
        ${p.phone ? `<a class="map-btn" href="tel:${esc(p.phone)}">Call</a>` : ''}</div></div>`;
      L.marker([p.lat, p.lng], { icon: icon(p), title: p.name, keyboard: true }).bindPopup(html).addTo(g);
    }
    // Frame the person and the closest centres (points arrive nearest first).
    for (const p of points.slice(0, here ? 6 : points.length)) bounds.push([p.lat, p.lng]);
    if (bounds.length > 1) m.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 13 });
    else if (bounds.length === 1) m.setView(bounds[0], 12);
  }, [points, here]);

  return <div ref={el} className="centres-map" style={{ height }} role="region" aria-label="Map of blood centres" />;
}
