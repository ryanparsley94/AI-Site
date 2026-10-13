import { useEffect, useMemo, useRef, useState } from "react";
import * as L from "leaflet";
import { Link } from "wouter";
import { endOfDay, isWithinInterval, startOfDay } from "date-fns";
import { MapPin, Navigation, RefreshCw } from "lucide-react";

type MapJob = {
  id: number;
  title: string;
  status: string;
  scheduledAt: string;
  contactName: string;
  assignedEngineer?: string | null;
  address?: string | null;
};
type Pin = { job: MapJob; lat: number; lon: number };
type DateFilter = "today" | "next7" | "all";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

function addressKey(address: string) {
  return address.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
}

function mapsDirections(address: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export function OperationsMap({ jobs }: { jobs: MapJob[] }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const geocodeCache = useRef<Record<string, { lat: number; lon: number } | null>>({});
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pins, setPins] = useState<Pin[]>([]);
  const [geocodeErrors, setGeocodeErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const statuses = useMemo(
    () => [...new Set(jobs.map((job) => job.status).filter((status) => status !== "cancelled"))].sort(),
    [jobs],
  );
  const filteredJobs = useMemo(() => {
    const now = new Date();
    return jobs.filter((job) => {
      if (job.status === "cancelled") return false;
      if (statusFilter !== "all" && job.status !== statusFilter) return false;
      if (dateFilter === "today") return isWithinInterval(new Date(job.scheduledAt), { start: startOfDay(now), end: endOfDay(now) });
      if (dateFilter === "next7") {
        const end = new Date(now);
        end.setDate(end.getDate() + 7);
        return isWithinInterval(new Date(job.scheduledAt), { start: startOfDay(now), end: endOfDay(end) });
      }
      return true;
    }).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [jobs, dateFilter, statusFilter]);
  const addressedJobs = filteredJobs.filter((job) => job.address?.trim());
  const missingAddressJobs = filteredJobs.filter((job) => !job.address?.trim());
  const visiblePins = useMemo(
    () => pins.filter((pin) => filteredJobs.some((job) => job.id === pin.job.id)),
    [pins, filteredJobs],
  );
  const pinIds = new Set(visiblePins.map((pin) => pin.job.id));
  const unresolved = addressedJobs.filter((job) => loaded && !pinIds.has(job.id));

  async function loadPins() {
    if (!addressedJobs.length || loading) return;
    setLoading(true);
    setGeocodeErrors([]);
    const cache = geocodeCache.current;
    if (loaded) {
      for (const job of addressedJobs) {
        const key = addressKey(job.address!);
        if (cache[key] === null) delete cache[key];
      }
    }
    const nextPins: Pin[] = [];
    const errors: string[] = [];
    let requestCount = 0;

    for (const job of addressedJobs) {
      const address = job.address!.trim();
      const key = addressKey(address);
      let coordinates = cache[key];
      if (!(key in cache)) {
        if (requestCount > 0) await new Promise((resolve) => setTimeout(resolve, 1100));
        requestCount += 1;
        try {
          const response = await fetch(`${NOMINATIM}?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(address)}`, {
            headers: { Accept: "application/json" },
          });
          if (!response.ok) throw new Error(response.status === 429 ? "OpenStreetMap rate limit reached; try again later." : `Geocoder returned HTTP ${response.status}.`);
          const results: Array<{ lat: string; lon: string }> = await response.json();
          coordinates = results[0] ? { lat: Number(results[0].lat), lon: Number(results[0].lon) } : null;
          if (coordinates && (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lon))) coordinates = null;
          cache[key] = coordinates;
        } catch (error) {
          errors.push(`${job.title}: ${error instanceof Error ? error.message : "Address lookup failed."}`);
          cache[key] = null;
          coordinates = null;
        }
      }
      if (coordinates) nextPins.push({ job, ...coordinates });
    }

    setPins((current) => {
      const byJob = new Map(current.map((pin) => [pin.job.id, pin]));
      for (const pin of nextPins) byJob.set(pin.job.id, pin);
      return [...byJob.values()];
    });
    setGeocodeErrors(errors);
    setLoaded(true);
    setLoading(false);
  }

  useEffect(() => {
    if (!mapElement.current || visiblePins.length === 0) return;
    mapInstance.current?.remove();
    const map = L.map(mapElement.current, { scrollWheelZoom: false }).setView(
      [visiblePins[0].lat, visiblePins[0].lon],
      visiblePins.length > 1 ? 10 : 14,
    );
    mapInstance.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    const markers = visiblePins.map((pin) => {
      const marker = L.marker([pin.lat, pin.lon], {
        title: `${pin.job.title} — ${pin.job.contactName}`,
        alt: `Job site: ${pin.job.title}, ${pin.job.address}`,
        keyboard: true,
      }).addTo(map);
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = pin.job.title;
      const details = document.createElement("p");
      details.textContent = `${pin.job.contactName} · ${pin.job.address}`;
      const status = document.createElement("p");
      status.textContent = `${pin.job.status.replaceAll("_", " ")} · ${pin.job.assignedEngineer || "Unassigned"}`;
      const link = document.createElement("a");
      link.href = `/jobs/${pin.job.id}`;
      link.textContent = "Open job";
      content.append(title, details, status, link);
      marker.bindPopup(content);
      marker.bindTooltip(`${pin.job.title} · ${pin.job.contactName}`);
      return marker;
    });
    if (markers.length > 1) {
      map.fitBounds(L.featureGroup(markers).getBounds().pad(0.18), { maxZoom: 14 });
    }
    requestAnimationFrame(() => map.invalidateSize());
    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [visiblePins]);

  return <section className="overflow-hidden border border-border bg-card" data-testid="operations-map">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-primary">Site dispatch</p>
        <h3 className="mt-1 text-sm font-semibold">Job locations</h3>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="map-date-filter">Filter job sites by date</label>
        <select id="map-date-filter" data-testid="map-date-filter" value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)} className="h-8 rounded-sm border border-border bg-background px-2 text-xs">
          <option value="today">Today</option><option value="next7">Next 7 days</option><option value="all">All dates</option>
        </select>
        <label className="sr-only" htmlFor="map-status-filter">Filter job sites by status</label>
        <select id="map-status-filter" data-testid="map-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-8 max-w-36 rounded-sm border border-border bg-background px-2 text-xs">
          <option value="all">All statuses</option>{statuses.map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}
        </select>
      </div>
    </div>

    <div className="border-b border-border/70 px-4 py-3">
      <p className="text-xs text-muted-foreground">
        Loading pins sends the selected job addresses to OpenStreetMap Nominatim for geocoding. Results stay in page memory only. OpenStreetMap tiles are shown with attribution.
      </p>
      <button type="button" onClick={() => void loadPins()} disabled={loading || addressedJobs.length === 0} data-testid="button-load-site-pins"
        className="mt-2 inline-flex h-8 items-center gap-2 rounded-sm bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">
        {loading ? <RefreshCw size={13} className="animate-spin" /> : <MapPin size={13} />}
        {loading ? "Finding site locations…" : loaded ? "Refresh site pins" : `Load ${addressedJobs.length} site${addressedJobs.length === 1 ? "" : "s"} on map`}
      </button>
      {geocodeErrors.length > 0 && <p role="status" className="mt-2 text-xs text-amber-300">{geocodeErrors[0]}{geocodeErrors.length > 1 ? ` (+${geocodeErrors.length - 1} more)` : ""}</p>}
    </div>

    {visiblePins.length > 0 ? <div ref={mapElement} className="h-[300px] w-full bg-muted sm:h-[360px]" aria-label="Interactive map of geocoded job sites" data-testid="map-canvas" /> :
      <div className="flex min-h-32 items-center justify-center px-5 py-6 text-center" data-testid="map-empty-state">
        <div><p className="text-sm font-medium">{addressedJobs.length ? "Job addresses are ready to map" : "No addressed jobs match these filters"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{addressedJobs.length ? "Load site pins to look up their real locations." : "Jobs without addresses are listed below so missing site details are visible."}</p></div>
      </div>}

    <div className="grid gap-0 divide-y divide-border lg:grid-cols-[minmax(0,1fr)_260px] lg:divide-x lg:divide-y-0">
      <div className="max-h-52 overflow-auto divide-y divide-border" aria-label="Filtered job site list">
        {filteredJobs.map((job) => <div key={job.id} className="flex items-center justify-between gap-3 px-4 py-2.5" data-testid={`map-site-${job.id}`}>
          <div className="min-w-0"><Link href={`/jobs/${job.id}`} className="block truncate text-xs font-medium hover:text-primary">{job.title} · {job.contactName}</Link>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{job.address || "Site address missing"} · {job.status.replaceAll("_", " ")} · {job.assignedEngineer || "Unassigned"}</p></div>
          {job.address && <a href={mapsDirections(job.address)} target="_blank" rel="noreferrer" aria-label={`Navigate to ${job.address}`} className="shrink-0 text-primary" title="Open directions"><Navigation size={15} /></a>}
        </div>)}
        {loaded && unresolved.length > 0 && <p className="px-4 py-2 text-xs text-amber-300">{unresolved.length} address{unresolved.length === 1 ? "" : "es"} could not be located. Check the site address and retry.</p>}
      </div>
      <aside className="px-4 py-3" aria-label="Engineer location tracking status">
        <p className="text-xs font-semibold">Engineer tracking</p>
        <p className="mt-1 text-xs text-muted-foreground">Unavailable: this app has no verified CREWON Mobile active-shift location feed. No engineer positions or last-seen times are shown or simulated.</p>
      </aside>
    </div>
  </section>;
}
