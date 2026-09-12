export const validRow = {
  stationuuid: "station-b",
  name: " Beta ",
  url_resolved: "https://stream.example/beta.mp3",
  url: "https://fallback.example/beta.mp3",
  homepage: " https://station.example/home ",
  favicon: "https://station.example/icon.png",
  codec: " mp3 ",
  bitrate: " 128.9 ",
  hls: "0",
  lastcheckok: 1,
}

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status,
  })
}

export function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError")
}
