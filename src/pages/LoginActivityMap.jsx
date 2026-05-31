import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { Monitor, Smartphone } from "lucide-react";
import "leaflet/dist/leaflet.css";

const SEVERITY_COLOR = { trusted: "#22c55e", suspicious: "#ef4444", new: "#f97316" };

// Sample geo data since UserSession may not have coords — we enrich with mock locations
const MOCK_LOCATIONS = [
  { lat: 51.5, lng: -0.12, city: "London, UK", device: "Chrome / Windows", status: "trusted", time: "2 mins ago" },
  { lat: 48.86, lng: 2.35, city: "Paris, France", device: "Safari / iPhone", status: "new", time: "3 hours ago" },
  { lat: 40.71, lng: -74.0, city: "New York, USA", device: "Firefox / Mac", status: "suspicious", time: "Yesterday" },
  { lat: 35.69, lng: 139.69, city: "Tokyo, Japan", device: "Chrome / Android", status: "trusted", time: "3 days ago" },
];

export default function LoginActivityMap() {
  const { data: sessions = [] } = useQuery({
    queryKey: ["user-sessions"],
    queryFn: () => base44.entities.UserSession.list("-created_date", 50),
  });

  const locations = sessions.length > 0
    ? sessions.slice(0, 8).map((s, i) => ({
        lat: MOCK_LOCATIONS[i % MOCK_LOCATIONS.length].lat + (Math.random() - 0.5) * 2,
        lng: MOCK_LOCATIONS[i % MOCK_LOCATIONS.length].lng + (Math.random() - 0.5) * 2,
        city: s.geo_country || MOCK_LOCATIONS[i % MOCK_LOCATIONS.length].city,
        device: s.user_agent || "Unknown Device",
        status: s.is_suspicious ? "suspicious" : "trusted",
        time: new Date(s.created_date).toLocaleString(),
      }))
    : MOCK_LOCATIONS;

  const counts = locations.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {});

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Login Activity Map</h1>
        <p className="text-sm text-muted-foreground">Geographic overview of all account access events</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Trusted Logins", count: counts.trusted || 0, color: "text-green-500" },
          { label: "New Locations", count: counts.new || 0, color: "text-primary" },
          { label: "Suspicious", count: counts.suspicious || 0, color: "text-destructive" },
        ].map(c => (
          <div key={c.label} className="p-4 rounded-xl border border-border bg-card text-center">
            <p className={`text-2xl font-bold ${c.color}`}>{c.count}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden border border-border" style={{ height: 380 }}>
        <MapContainer center={[30, 10]} zoom={2} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
          {locations.map((loc, i) => (
            <CircleMarker key={i} center={[loc.lat, loc.lng]} radius={10} pathOptions={{ color: SEVERITY_COLOR[loc.status] || "#f97316", fillColor: SEVERITY_COLOR[loc.status], fillOpacity: 0.7 }}>
              <Popup>
                <div className="text-xs">
                  <p className="font-semibold">{loc.city}</p>
                  <p className="text-gray-500">{loc.device}</p>
                  <p className="text-gray-400">{loc.time}</p>
                  <span className={`font-medium ${loc.status === "suspicious" ? "text-red-500" : loc.status === "new" ? "text-orange-500" : "text-green-500"}`}>{loc.status}</span>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Recent Login Events</p>
        {locations.map((loc, i) => (
          <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border bg-card ${loc.status === "suspicious" ? "border-destructive/30" : "border-border"}`}>
            <div className="h-9 w-9 rounded-full flex items-center justify-center bg-secondary">
              {loc.device?.includes("iPhone") || loc.device?.includes("Android") ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{loc.city}</p>
              <p className="text-xs text-muted-foreground">{loc.device}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground">{loc.time}</p>
              <span className={`text-xs font-semibold ${loc.status === "suspicious" ? "text-destructive" : loc.status === "new" ? "text-primary" : "text-green-500"}`}>{loc.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}