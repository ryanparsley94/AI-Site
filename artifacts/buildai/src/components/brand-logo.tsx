const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const BRAND_ASSET_VERSION = "20261013-final-pack-v2";

export function BrandLogo({ className = "h-8 w-auto", mono = false }: { className?: string; mono?: boolean }) {
  return (
    <img
      src={`${BASE}/brand/${mono ? "crewon-wordmark-mono.png" : "crewon-wordmark-dark.png"}?v=${BRAND_ASSET_VERSION}`}
      alt="CREWON"
      className={className}
    />
  );
}
