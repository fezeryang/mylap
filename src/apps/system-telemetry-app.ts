import type { ScreenAppDefinition, ScreenAppHandle } from "../runtime/screen-app"
import { SYSTEM_TELEMETRY_APP_ID } from "./app-ids"
import { element } from "./dom"

type MetricRow = {
  readonly fill: HTMLElement
  readonly value: HTMLElement
}

export const systemTelemetryApp: ScreenAppDefinition = {
  appId: SYSTEM_TELEMETRY_APP_ID,
  mount: (host, context): ScreenAppHandle => {
    const root = element("section", "screen-app screen-app--telemetry")
    root.setAttribute("aria-label", "系统遥测演示应用")
    const header = element("header", "wing-header")
    header.append(
      element("strong", "screen-brand", "SYSTEM TELEMETRY"),
      element("span", "status-pip"),
    )
    const metrics = element("section", "telemetry-metrics")
    const rows = new Map<string, MetricRow>()
    ;["CPU", "GPU", "RAM", "NET"].forEach((name) => {
      const row = element("div", "metric-row")
      const label = element("span", "metric-label", name)
      const value = element("strong", "metric-value", "--")
      const track = element("span", "metric-track")
      const fill = element("span", "metric-fill")
      track.append(fill)
      row.append(label, value, track)
      rows.set(name, { fill, value })
      metrics.append(row)
    })
    const radar = element("div", "telemetry-radar")
    radar.append(element("span", "radar-core"), element("span", "radar-sweep"))
    const footer = element("footer", "wing-footer", "SATELLITE LINK · STABLE")
    const body = element("div", "telemetry-layout")
    body.append(metrics, radar)
    root.append(header, body, footer)
    host.append(root)

    const updateMetric = (name: string, value: string, percent: number): void => {
      const row = rows.get(name)
      if (row === undefined) return
      row.value.textContent = value
      row.fill.style.setProperty("--metric-fill", `${percent}%`)
    }

    return {
      dispose: () => undefined,
      setActive: (active) => {
        root.dataset["active"] = String(active)
      },
      update: (snapshot) => {
        updateMetric(
          "CPU",
          `${Math.min(99, Math.round(snapshot.drawCalls / 3))}%`,
          snapshot.drawCalls % 100,
        )
        updateMetric(
          "GPU",
          `${Math.min(99, Math.round(snapshot.triangles / 9000))}%`,
          snapshot.triangles % 100,
        )
        updateMetric("RAM", `${46 + (snapshot.drawCalls % 18)}%`, 46 + (snapshot.drawCalls % 18))
        updateMetric("NET", `${(snapshot.fps / 24).toFixed(1)}MB/s`, Math.min(92, snapshot.fps))
        footer.textContent = `${context.assetInstanceId.value.toUpperCase()} · SATELLITE LINK STABLE`
      },
    }
  },
}
