"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap } from "leaflet";

export type MapWorkshop = {
  id: string;
  name: string;
  type: string;
  rating: number;
  lat: number | null;
  lng: number | null;
  bookings: { count: number }[];
};

/**
 * Real slippy map (Leaflet + OpenStreetMap tiles — no API key) of partner
 * workshops over Bandung. Vector `circleMarker`s (no marker-image assets, so no
 * broken-icon issue), sized by booking volume, AHASS red / independent blue,
 * with a popup per shop. Leaflet touches `window`, so it's imported lazily
 * inside an effect and the map is created once, then markers repaint on data.
 */
export function WorkshopMap({ rows }: { rows: MapWorkshop[] }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);

  // Create the map exactly once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current, { scrollWheelZoom: false }).setView([-6.9147, 107.6098], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      LRef.current = null;
    };
  }, []);

  // Repaint markers whenever the workshop rows change (realtime/poll).
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;
    layer.clearLayers();
    const pts = rows.filter((w) => w.lat != null && w.lng != null);
    if (!pts.length) return;
    const maxBookings = Math.max(1, ...pts.map((w) => w.bookings[0]?.count ?? 0));
    const latlngs: [number, number][] = [];
    for (const w of pts) {
      const lat = Number(w.lat);
      const lng = Number(w.lng);
      latlngs.push([lat, lng]);
      const n = w.bookings[0]?.count ?? 0;
      const color = w.type === "ahass" ? "#dc2626" : "#0E4DA4";
      L.circleMarker([lat, lng], {
        radius: 5 + (n / maxBookings) * 12,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.55,
      })
        .bindPopup(
          `<strong>${w.name}</strong><br/>★ ${Number(w.rating).toFixed(1)} · ${n} booking · ${
            w.type === "ahass" ? "AHASS" : "Independen"
          }`,
        )
        .addTo(layer);
    }
    map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 14 });
  }, [rows, ready]);

  return (
    <div
      ref={elRef}
      className="z-0 h-[400px] w-full overflow-hidden rounded-xl border border-border bg-[#aadaff]"
      role="img"
      aria-label="Peta sebaran bengkel mitra di Bandung"
    />
  );
}
