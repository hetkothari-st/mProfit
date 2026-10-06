/**
 * A Leaflet map on OpenStreetMap tiles with labelled property pins. Chosen
 * over Google Maps / Mapbox because it needs no API key or account; tiles
 * come from tile.openstreetmap.org with the required attribution.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './propertyMap.css';

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  approximate?: boolean;
}

const INDIA: L.LatLngTuple = [22.5, 79];
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function pinIcon(pin: MapPin, selected: boolean): L.DivIcon {
  const cls = `pos-pin${selected ? ' is-selected' : ''}${pin.approximate ? ' is-approx' : ''}`;
  return L.divIcon({
    className: 'pos-pin-wrap',
    html: `<span class="${cls}"><span class="pos-pin-label">${escapeHtml(pin.label)}</span><span class="pos-pin-dot"></span></span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function PropertyMap({
  pins,
  selectedId = null,
  onSelect,
  draggable = false,
  onMove,
  onPick,
  className = '',
  ariaLabel,
}: {
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Let the pin(s) be dragged; `onMove` gets the new position. */
  draggable?: boolean;
  onMove?: (lat: number, lng: number) => void;
  /** Clicks on the map itself (e.g. to place a pin). */
  onPick?: (lat: number, lng: number) => void;
  className?: string;
  ariaLabel: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const handlers = useRef({ onSelect, onMove, onPick });
  handlers.current = { onSelect, onMove, onPick };

  // Create the map once.
  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    map.setView(INDIA, 4);
    // Scroll-zoom only once the map has been clicked, so the page still scrolls past it.
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());
    map.on('click', (e: L.LeafletMouseEvent) => handlers.current.onPick?.(e.latlng.lat, e.latlng.lng));
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(el.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Draw the pins.
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const pin of pins) {
      const marker = L.marker([pin.lat, pin.lng], {
        icon: pinIcon(pin, pin.id === selectedId),
        draggable,
        keyboard: true,
        title: pin.label,
        riseOnHover: true,
      });
      marker.on('click', () => handlers.current.onSelect?.(pin.id));
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        handlers.current.onMove?.(p.lat, p.lng);
      });
      layer.addLayer(marker);
    }
  }, [pins, selectedId, draggable]);

  // Frame the pins whenever the set of pins (or where they are) changes.
  const frameKey = pins.map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || pins.length === 0) return;
    if (pins.length === 1) {
      const [pin] = pins;
      map.setView([pin!.lat, pin!.lng], pin!.approximate ? 13 : 16);
    } else {
      map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as L.LatLngTuple)), {
        padding: [56, 56],
        maxZoom: 15,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reframe only when the pins themselves move
  }, [frameKey]);

  return <div ref={el} role="region" aria-label={ariaLabel} className={`pos-map ${className}`} />;
}
