"use client";
import { destinationUrl } from "@/lib/restaurant/navigation";
import { SlideView } from "./ui/motion";
import { WorkspaceTabs } from "./ui/workspace-tabs";
import type { Snapshot } from "@/lib/restaurant/queries";
import {
  money,
  dateTime,
  methods,
  roles,
  statuses,
} from "@/lib/restaurant/shared";
import { Empty, Panel, Stat } from "./ui/primitives";
function eventDetail(event: Snapshot["events"][number]) {
  if (event.action === "role.switch") {
    return `Cambio de rol: ${event.detail
      .split(" → ")
      .map((role) => roles[role as keyof typeof roles] ?? role)
      .join(" → ")}`;
  }
  if (event.action === "item.advance") {
    return event.detail.replace(
      /(→ )([A-Z]+)$/,
      (_, arrow: string, status: string) =>
        `${arrow}${statuses[status as keyof typeof statuses] ?? status}`,
    );
  }
  return event.detail;
}
export function Reports({
  data,
  section = "sales",
}: {
  data: Snapshot;
  section?: string;
}) {
  const tab = section;
  const report = data.report;
  if (!report) return null;
  const currency = data.restaurant.currency;
  return (
    <>
      <WorkspaceTabs
        label="Resumen"
        value={tab}
        options={[
          { id: "sales", label: "Ventas del día" },
          { id: "activity", label: "Actividad" },
        ]}
        change={() => {}}
        href={(section) =>
          destinationUrl({ role: data.user.role, page: "reports", section })
        }
      />
      <SlideView
        viewKey={tab}
        direction={tab === "sales" ? -1 : 1}
        className="module-section-views"
      >
        <div className={tab === "sales" ? "stack reports-overview" : "stack"}>
          {tab === "sales" ? (
            <>
              <p className="management-count">
                Jornada {report.day} · Cuentas cobradas
              </p>
              <div className="stat-grid">
                <Stat
                  label="Ventas cobradas"
                  value={money(report.sales, currency)}
                />
                <Stat label="Cuentas cerradas" value={report.tickets} />
                <Stat
                  label="Ticket promedio"
                  value={money(report.average, currency)}
                />
              </div>
              <div className="report-methods">
                {report.methods.map((m) => (
                  <Stat
                    key={m.method}
                    label={methods[m.method]}
                    value={money(m.total, currency)}
                  />
                ))}
              </div>
              <Panel title="Productos vendidos hoy">
                {report.products.length ? (
                  <div className="data-table__wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th className="data-table__numeric">Unidades</th>
                          <th className="data-table__numeric">Venta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.products.map((p) => (
                          <tr key={p.name}>
                            <td>{p.name}</td>
                            <td className="data-table__numeric">
                              {p.quantity}
                            </td>
                            <td className="data-table__numeric">
                              {money(p.total, currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="Todavía no hay ventas">
                    Los productos aparecerán al cerrar las primeras cuentas.
                  </Empty>
                )}
              </Panel>
            </>
          ) : (
            <Panel title="Historial de actividad">
              <p className="muted">
                Últimos 100 movimientos. Las anulaciones conservan responsable y
                motivo.
              </p>
              <ol className="activity-log">
                {data.events.map((e) => (
                  <li className="activity-log__event" key={e.id}>
                    <div className="activity-log__meta">
                      <strong>{e.actorName}</strong>
                      <time>
                        {dateTime(e.createdAt, data.restaurant.timezone)}
                      </time>
                    </div>
                    <p>
                      {e.action === "item.cancel" && (
                        <span className="badge badge--error">Anulación</span>
                      )}{" "}
                      {eventDetail(e)}
                    </p>
                  </li>
                ))}
              </ol>
              {!data.events.length && (
                <Empty title="Sin actividad todavía">
                  Los movimientos del equipo aparecerán acá.
                </Empty>
              )}
            </Panel>
          )}
        </div>
      </SlideView>
    </>
  );
}
