const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const BRAND_ASSET_VERSION = "20261014-transparent";

export function BrandLogo({ className = "h-8 w-auto", mono = false }: { className?: string; mono?: boolean }) {
  return (
    <img
      src={`${BASE}/brand/${mono ? "crewon-wordmark-mono.png" : "crewon-wordmark-dark-transparent.png"}?v=${BRAND_ASSET_VERSION}`}
      alt="CREWON"
      className={className}
    />
  );
}
