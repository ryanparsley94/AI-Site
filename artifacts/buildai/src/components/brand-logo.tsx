const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function BrandLogo({ className = "h-8 w-auto", mono = false }: { className?: string; mono?: boolean }) {
  return (
    <img
      src={`${BASE}/brand/${mono ? "crewon-wordmark-mono.svg" : "crewon-wordmark.svg"}`}
      alt="CREWON"
      className={className}
    />
  );
}
