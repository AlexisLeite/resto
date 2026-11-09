"use client";
import { motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/restaurant/queries";
import type { Command } from "@/lib/restaurant/validation";
import { roles, roleWorkspaces, type Role } from "@/lib/restaurant/shared";
import { Button, ActionForm, Field, value } from "./ui/primitives";
import {
  Settings2,
  Menu,
  LayoutGrid,
  CookingPot,
  Wallet,
  BookOpen,
  ChartNoAxesCombined,
  Users,
  UserRound,
  LogOut,
  UtensilsCrossed,
} from "lucide-react";
import { OperationFeedback } from "./ui/operation-feedback";
import { AnimatePresence, FadeView, useMotionTokens } from "./ui/motion";
import { Feedback } from "./ui/feedback";
import { Dialog } from "./ui/dialog";
import { ThemeToggle } from "./theme-toggle";
import { Floor } from "./floor";
import { Kitchen } from "./kitchen";
import { Catalog } from "./catalog";
import { Cash } from "./cash";
import { Reports } from "./reports";
import { Team } from "./team";
import {
  homeTab,
  readDestination,
  destinationUrl,
  type Page as Tab,
  type Destination,
} from "@/lib/restaurant/navigation";
export type RunCommand = (
  command: Command,
  message?: string,
) => Promise<boolean>;
export type ModuleProps = { data: Snapshot; run: RunCommand };
export function Dashboard({ initial }: { initial: Snapshot }) {
  const router = useRouter();
  const navigationMotion = useMotionTokens();
  const [data, setData] = useState(initial);
  const searchParams = useSearchParams();
  const destination = readDestination(
    new URLSearchParams(searchParams.toString()),
    initial.user.role,
    data.user.roles,
  );
  const navigateTo = useCallback(
    (next: Destination, replace = false) => {
      router[replace ? "replace" : "push"](destinationUrl(next), {
        scroll: false,
      });
    },
    [router],
  );
  const tab =
    destination.role === data.user.role
      ? destination.page
      : homeTab(data.user.role);
  const floorSelection = { [data.user.role]: destination.table ?? null };
  const cashSection = destination.section ?? "accounts";
  const setTab = (page: Tab) => navigateTo({ role: data.user.role, page });
  const setCashSection = (section: string) =>
    navigateTo({ role: data.user.role, page: "cash", section });
  const selectTable = (table: string | null, view: "menu" | "ready" = "menu") =>
    navigateTo({
      role: data.user.role,
      page: "floor",
      table: table ?? undefined,
      view,
    });
  const [cashFocus, setCashFocus] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const activeRole = useRef(initial.user.role);
  const [notice, setNotice] = useState<{
    error?: boolean;
    message: string;
  } | null>(null);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timeout = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timeout);
  }, [notice]);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return;
      }
      if (!response.ok) throw new Error("No se pudo actualizar");
      const snapshot: Snapshot = await response.json();
      if (current === generation.current) {
        if (snapshot.user.role !== activeRole.current) {
          activeRole.current = snapshot.user.role;
          navigateTo(
            { role: snapshot.user.role, page: homeTab(snapshot.user.role) },
            true,
          );
          setCashFocus("");

          setNotice(null);
        }
        setData(snapshot);
        setOffline(false);
      }
    } catch {
      if (current === generation.current) setOffline(true);
    }
  }, [router, navigateTo, setCashFocus, setNotice]);
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden && !inFlight.current) void refresh();
    }, 5000);
    const onFocus = () => {
      if (!inFlight.current) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);
  const run: RunCommand = async (command, message = "Cambios guardados.") => {
    if (inFlight.current) return false;
    inFlight.current = true;
    generation.current++;
    setPending(true);
    if (message) setNotice(null);
    try {
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Resto-Role": activeRole.current,
        },
        body: JSON.stringify(command),
      });
      const body = await response.json();
      if (response.status === 401) {
        router.replace("/login");
        router.refresh();
        return false;
      }
      if (!response.ok) {
        setNotice({ error: true, message: body.error });
        await refresh();
        return false;
      }
      if (command.type === "password.change") {
        router.replace("/login");
        router.refresh();
        return true;
      }
      await refresh();
      if (message) setNotice({ message });
      return true;
    } catch {
      setNotice({
        error: true,
        message:
          "Se perdió la conexión. Revisá el estado antes de reintentar; los pedidos y cobros repetidos no se duplican.",
      });
      return false;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  function switchRole(role: Role) {
    if (inFlight.current) return;
    navigateTo({ role, page: homeTab(role) });
  }
  const destinationKey = JSON.stringify(destination);
  useEffect(() => {
    const target: Destination = JSON.parse(destinationKey);
    if (pending || inFlight.current || target.role === activeRole.current)
      return;
    inFlight.current = true;
    generation.current++;
    setPending(true);
    setNotice(null);
    void (async () => {
      try {
        const response = await fetch("/api/auth/role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: target.role }),
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "No se pudo cambiar de rol.");
        activeRole.current = body.user.role;
        setData(body);
        setCashFocus("");
      } catch (error) {
        setNotice({
          error: true,
          message:
            error instanceof Error
              ? error.message
              : "No se pudo cambiar de rol.",
        });
        navigateTo(
          { role: activeRole.current, page: homeTab(activeRole.current) },
          true,
        );
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    })();
  }, [destinationKey, pending, navigateTo]);
  const logout = async () => {
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error();
      router.replace("/login");
      router.refresh();
    } catch {
      setNotice({
        error: true,
        message: "No se pudo cerrar la sesión. Reintentá.",
      });
    }
  };
  const navByRole: Record<Role, [Tab, string][]> = {
    ADMIN: [
      ["reports", "Resumen"],
      ["floor", "Mesas"],
      ["catalog", "Carta"],
      ["team", "Equipo"],
      ["settings", "Configuración"],
    ],
    WAITER: [["floor", "Salón"]],
    KITCHEN: [
      ["kitchen", "Comandas"],
      ["catalog", "Disponibilidad"],
    ],
    CASHIER: [["cash", "Caja"]],
  };
  const nav = navByRole[data.user.role];
  const visibleNav = nav.filter(([id]) => nav.length > 1 || tab !== id);
  const titles = {
    settings: ["Configuración", "Permisos de operación del restaurante."],
    floor: ["El salón", "Mesas, pedidos y cuentas abiertas."],
    kitchen: ["Cocina y barra", "Las comandas del turno, en orden de llegada."],
    cash: ["Caja", "Cuentas, cobros y cierre de turno en un mismo lugar."],
    catalog: [
      "Carta",
      "Productos, precios y disponibilidad para todo el equipo.",
    ],
    reports: ["Resumen", "Ventas cobradas y actividad del restaurante."],
    team: ["Equipo", "Cada persona con el acceso que necesita."],
    account: ["Mi cuenta", "Administrá tu acceso al restaurante."],
  };
  const icons = {
    settings: Settings2,
    floor: LayoutGrid,
    kitchen: CookingPot,
    cash: Wallet,
    catalog: BookOpen,
    reports: ChartNoAxesCombined,
    team: Users,
    account: UserRound,
  };
  const roleControl =
    data.user.roles.length > 1 ? (
      <select
        className="control app-header__role"
        aria-label="Rol activo"
        value={data.user.role}
        disabled={pending}
        onChange={(event) => void switchRole(event.target.value as Role)}
      >
        {data.user.roles.map((role) => (
          <option key={role} value={role}>
            {roleWorkspaces[role]}
          </option>
        ))}
      </select>
    ) : (
      <span className="app-header__role-name">
        {roleWorkspaces[data.user.role]}
      </span>
    );
  return (
    <OperationFeedback.Provider
      value={{
        error: notice?.error ? notice.message : null,
        reset: () => setNotice(null),
      }}
    >
      <div
        className={`app-shell app-shell--application${tab === "floor" ? " app-shell--salon" : ""}`}
      >
        <header className="app-header">
          <Button
            variant="ghost"
            className="button--icon app-header__menu"
            aria-label="Menú de funcionalidades"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
          {roleControl}
          <div id="salon-header-context" className="app-header__context" />
          {offline && <span className="badge badge--error">Sin conexión</span>}
        </header>
        <AnimatePresence>
          {menuOpen && (
            <Dialog
              key="navigation"
              title="Funcionalidades"
              close={() => setMenuOpen(false)}
              className="app-drawer"
            >
              {visibleNav.length > 0 && (
                <nav
                  className="app-shell__nav"
                  aria-label="Navegación principal"
                >
                  {visibleNav.map(([id, label]) => {
                    const Icon = icons[id];
                    return (
                      <Link
                        href={destinationUrl({
                          role: data.user.role,
                          page: id,
                        })}
                        scroll={false}
                        key={id}
                        className={`app-shell__nav-item${tab === id ? " app-shell__nav-item--active" : ""}`}
                        aria-current={tab === id ? "page" : undefined}
                        onClick={() => {
                          setMenuOpen(false);
                          setNotice(null);
                        }}
                      >
                        <Icon aria-hidden="true" />
                        {label}
                      </Link>
                    );
                  })}
                </nav>
              )}
              <div className="app-shell__account">
                <div className="app-shell__account-name">
                  <strong>{data.user.name}</strong>
                  <p className="muted">{roles[data.user.role]}</p>
                </div>
                <Link
                  className="button button--ghost"
                  href={destinationUrl({
                    role: data.user.role,
                    page: "account",
                  })}
                  scroll={false}
                  onClick={() => setMenuOpen(false)}
                >
                  <UserRound aria-hidden="true" />
                  Mi cuenta
                </Link>
                <Button variant="ghost" onClick={logout}>
                  <LogOut aria-hidden="true" />
                  Salir
                </Button>
              </div>
              <ThemeToggle />
            </Dialog>
          )}
        </AnimatePresence>
        <aside className="desktop-navigation" aria-label="Secciones">
          <div className="desktop-navigation__brand">
            <UtensilsCrossed aria-hidden="true" />
            <strong>resto</strong>
          </div>
          <nav
            className="desktop-navigation__links"
            aria-label="Navegación de escritorio"
            inert={menuOpen}
          >
            {data.user.roles.map((role) => {
              const active = data.user.role === role;
              const options = navByRole[role];
              const Icon = icons[homeTab(role)];
              const primarySelected =
                active &&
                tab === homeTab(role) &&
                role === "WAITER" &&
                !floorSelection.WAITER;
              const subitems =
                role === "WAITER"
                  ? data.sessions
                      .filter((session) => session.tableId)
                      .sort((a, b) =>
                        a.tableName.localeCompare(b.tableName, "es", {
                          numeric: true,
                        }),
                      )
                      .map((session) => ({
                        id: session.id,
                        label: session.tableName,
                        selected:
                          tab === "floor" &&
                          floorSelection.WAITER === session.tableId,
                        href: destinationUrl({
                          role,
                          page: "floor",
                          table: session.tableId!,
                          view: "menu",
                        }),
                      }))
                  : role === "CASHIER"
                    ? [
                        ["accounts", "Cuentas"],
                        ["sale", "Venta"],
                        ["payments", "Cobros"],
                        ["history", "Cierres"],
                      ].map(([id, label]) => ({
                        id,
                        label,
                        selected: tab === "cash" && cashSection === id,
                        href: destinationUrl({
                          role,
                          page: "cash",
                          section: id,
                        }),
                      }))
                    : options.map(([id, label]) => ({
                        id,
                        label,
                        selected: tab === id,
                        href: destinationUrl({ role, page: id }),
                      }));
              return (
                <div className="desktop-navigation__group" key={role}>
                  <Link
                    href={destinationUrl({ role, page: homeTab(role) })}
                    scroll={false}
                    className="desktop-navigation__item"
                    aria-label={`Rol ${roleWorkspaces[role]}`}
                    aria-current={primarySelected ? "page" : undefined}
                    aria-expanded={subitems.length ? active : undefined}
                  >
                    {primarySelected && (
                      <motion.span
                        className="desktop-navigation__indicator"
                        layoutId="desktop-navigation-active"
                        transition={{
                          duration: navigationMotion.list / 1000,
                          ease: navigationMotion.ease,
                        }}
                        aria-hidden="true"
                      />
                    )}
                    <Icon aria-hidden="true" />
                    {roleWorkspaces[role]}
                  </Link>
                  {subitems.length > 0 && (
                    <motion.div
                      className="desktop-navigation__expansion"
                      initial={false}
                      animate={{
                        height: active ? "auto" : 0,
                        opacity: active ? 1 : 0,
                      }}
                      transition={{
                        duration: navigationMotion.dialog / 1000,
                        ease: navigationMotion.ease,
                      }}
                      inert={!active}
                    >
                      <div className="desktop-navigation__children">
                        {subitems.map((item) => (
                          <Link
                            href={item.href}
                            scroll={false}
                            key={item.id}
                            className="desktop-navigation__item"
                            aria-current={
                              active && item.selected ? "page" : undefined
                            }
                            onClick={() => {
                              setNotice(null);
                            }}
                          >
                            {active && item.selected && (
                              <motion.span
                                className="desktop-navigation__indicator"
                                layoutId="desktop-navigation-active"
                                transition={{
                                  duration: navigationMotion.list / 1000,
                                  ease: navigationMotion.ease,
                                }}
                                aria-hidden="true"
                              />
                            )}
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </nav>
          <div className="desktop-navigation__footer">
            <Link
              href={destinationUrl({ role: data.user.role, page: "account" })}
              scroll={false}
              className={`desktop-navigation__person${tab === "account" ? " desktop-navigation__person--active" : ""}`}
              aria-label="Mi cuenta"
              aria-current={tab === "account" ? "page" : undefined}
              onClick={() => {
                setNotice(null);
              }}
            >
              {tab === "account" && (
                <motion.span
                  className="desktop-navigation__indicator"
                  layoutId="desktop-navigation-active"
                  transition={{
                    duration: navigationMotion.list / 1000,
                    ease: navigationMotion.ease,
                  }}
                  aria-hidden="true"
                />
              )}
              <span className="desktop-navigation__avatar" aria-hidden="true">
                {data.user.name.slice(0, 1).toUpperCase()}
              </span>
              <strong>{data.user.name}</strong>
            </Link>
            <div className="desktop-navigation__actions">
              <ThemeToggle iconOnly />
              <Button variant="ghost" onClick={logout}>
                <LogOut aria-hidden="true" />
                Salir
              </Button>
            </div>
          </div>
        </aside>
        <div className="app-shell__content">
          <AnimatePresence initial={false}>
            {offline && (
              <Feedback
                key="offline"
                error
                message="No se pudo actualizar. Mostrando los últimos datos recibidos."
                action={{ label: "Reintentar", onClick: () => void refresh() }}
              />
            )}
          </AnimatePresence>
          <AnimatePresence initial={false} mode="wait">
            {notice && (
              <Feedback
                key={notice.message}
                message={notice.message}
                error={notice.error}
                close={() => setNotice(null)}
              />
            )}
          </AnimatePresence>
          <FadeView viewKey={`${data.user.role}:${tab}`}>
            <main
              aria-label={titles[tab][0]}
              className={`page${tab === "floor" ? " page--salon" : " page--management"}`}
            >
              {tab !== "floor" && (
                <header className="page__header">
                  <div>
                    <h1 className="page__title">{titles[tab][0]}</h1>
                  </div>
                  <span className="muted">{pending ? "Guardando…" : ""}</span>
                </header>
              )}
              <fieldset
                key={data.user.role}
                disabled={pending}
                className="stack workspace-transition"
              >
                {tab === "floor" &&
                  ["ADMIN", "WAITER"].includes(data.user.role) && (
                    <div
                      key={data.user.role}
                      className="stack"
                      hidden={tab !== "floor"}
                    >
                      <Floor
                        selectedId={floorSelection[data.user.role] ?? null}
                        selectTable={selectTable}
                        view={destination.view ?? "menu"}
                        changeView={(view) =>
                          navigateTo({ ...destination, view })
                        }
                        active={tab === "floor"}
                        data={data}
                        run={run}
                        checkout={(id) => {
                          setCashFocus(id);
                          setTab("cash");
                          setNotice(null);
                        }}
                      />
                    </div>
                  )}
                {tab !== "floor" && (
                  <div className="module-views">
                    <div className="module-content">
                      {tab === "kitchen" && <Kitchen data={data} run={run} />}
                      {tab === "catalog" && (
                        <Catalog
                          data={data}
                          run={run}
                          section={destination.section ?? "products"}
                          changeSection={(section) =>
                            navigateTo({
                              role: data.user.role,
                              page: "catalog",
                              section,
                            })
                          }
                        />
                      )}
                      {tab === "cash" && (
                        <Cash
                          key={cashFocus}
                          initialSessionId={cashFocus}
                          section={cashSection}
                          onSectionChange={setCashSection}
                          data={data}
                          run={run}
                        />
                      )}
                      {tab === "settings" && (
                        <section className="panel panel__body settings-form">
                          <ActionForm
                            key={String(data.restaurant.waitersCanCharge)}
                            submit={(form) =>
                              run(
                                {
                                  type: "restaurant.settings",
                                  waitersCanCharge:
                                    form.get("waitersCanCharge") === "on",
                                },
                                "Configuración guardada.",
                              )
                            }
                          >
                            <h2 className="panel__title">Cobros en el salón</h2>
                            <label className="check settings-form__option">
                              <input
                                type="checkbox"
                                name="waitersCanCharge"
                                className="check__input"
                                defaultChecked={
                                  data.restaurant.waitersCanCharge
                                }
                              />
                              Los mozos pueden cobrar
                            </label>
                            <p className="muted">
                              Permite cobrar desde la mesa cuando hay un turno
                              de caja abierto. El mozo resuelve los consumos
                              pendientes antes de cobrar. La apertura y el
                              cierre del turno siguen a cargo de Caja.
                            </p>
                            <Button type="submit">Guardar configuración</Button>
                          </ActionForm>
                        </section>
                      )}
                      {tab === "reports" && (
                        <Reports data={data} section={destination.section} />
                      )}
                      {tab === "team" && <Team data={data} run={run} />}
                      {tab === "account" && (
                        <section className="panel settings-form">
                          <div className="panel__body">
                            <ActionForm
                              submit={(form) =>
                                run({
                                  type: "password.change",
                                  currentPassword: value(
                                    form,
                                    "currentPassword",
                                  ),
                                  password: value(form, "password"),
                                })
                              }
                            >
                              <h2 className="panel__title">
                                Cambiar contraseña
                              </h2>
                              <Field label="Contraseña actual">
                                <input
                                  className="control"
                                  type="password"
                                  name="currentPassword"
                                  autoComplete="current-password"
                                  required
                                />
                              </Field>
                              <Field
                                label="Nueva contraseña"
                                hint="Al menos 10 caracteres. Se cerrarán tus sesiones al guardar."
                              >
                                <input
                                  className="control"
                                  type="password"
                                  name="password"
                                  autoComplete="new-password"
                                  minLength={10}
                                  maxLength={128}
                                  required
                                />
                              </Field>
                              <Button type="submit">
                                Actualizar contraseña
                              </Button>
                            </ActionForm>
                          </div>
                        </section>
                      )}
                    </div>
                  </div>
                )}
              </fieldset>
            </main>
          </FadeView>
        </div>
      </div>
    </OperationFeedback.Provider>
  );
}
