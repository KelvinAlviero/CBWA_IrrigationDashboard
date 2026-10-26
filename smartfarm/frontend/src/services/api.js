export async function getReadings() {
  const response = await fetch("/api/readings", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const readings = await response.json();
  if (!Array.isArray(readings)) {
    throw new Error("The sensor feed must be a JSON array");
  }
  return readings;
}
