"use client";
import { Pencil, Plus, UserRound } from "lucide-react";
import { Dialog } from "./ui/dialog";
import { AnimatePresence, AnimatedList } from "./ui/motion";
import { useState } from "react";
import type { ModuleProps } from "./dashboard";
import type { Snapshot } from "@/lib/restaurant/queries";
import { roles, type Role } from "@/lib/restaurant/shared";
import {
  ActionForm,
  Button,
  Field,
  Empty,
  checked,
  value,
} from "./ui/primitives";
export function Team({ data, run }: ModuleProps) {
  const [editor, setEditor] = useState<
    Snapshot["users"][number] | "new" | null
  >(null);
  const [search, setSearch] = useState("");
  const filtered = data.users.filter((u) =>
    `${u.name} ${u.username}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const user = editor === "new" ? null : editor;
  return (
    <>
      <div className="toolbar">
        <p className="muted">
          {data.users.filter((u) => u.active).length}{" "}
          {data.users.filter((u) => u.active).length === 1
            ? "persona con acceso habilitado."
            : "personas con acceso habilitado."}
        </p>
        <Button onClick={() => setEditor("new")}>
          <Plus aria-hidden="true" /> Nueva persona
        </Button>
      </div>
      <AnimatePresence>
        {editor && (
          <Dialog
            title={user ? `Editar ${user.name}` : "Nueva persona"}
            close={() => setEditor(null)}
            className="management-editor"
          >
            <ActionForm
              key={user?.id ?? "new"}
              submit={async (form) => {
                const password = value(form, "password");
                const ok = await run({
                  type: "user.save",
                  ...(user ? { id: user.id } : {}),
                  name: value(form, "name"),
                  username: value(form, "username"),
                  role: value(form, "role") as Role,
                  roles: [
                    ...new Set([
                      value(form, "role"),
                      ...form.getAll("roles").map(String),
                    ]),
                  ] as Role[],
                  active: checked(form, "active"),
                  ...(password ? { password } : {}),
                });
                if (ok) setEditor(null);
                return ok;
              }}
            >
              <div className="management-editor__scroll">
                <div className="form-grid">
                  <Field label="Nombre">
                    <input
                      className="control"
                      name="name"
                      defaultValue={user?.name}
                      required
                      maxLength={100}
                    />
                  </Field>
                  <Field label="Usuario">
                    <input
                      className="control"
                      name="username"
                      autoComplete="off"
                      autoCapitalize="none"
                      defaultValue={user?.username}
                      pattern="[a-z0-9._\-]{3,40}"
                      required
                    />
                  </Field>
                  <Field label="Rol inicial">
                    <select
                      className="control"
                      name="role"
                      defaultValue={user?.role ?? "WAITER"}
                    >
                      {Object.entries(roles).map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={
                      user
                        ? "Nueva contraseña (opcional)"
                        : "Contraseña inicial"
                    }
                    hint="Mínimo 10 caracteres. Cambiarla cierra las sesiones de esa persona."
                  >
                    <input
                      className="control"
                      type="password"
                      name="password"
                      autoComplete="new-password"
                      minLength={10}
                      maxLength={128}
                      required={!user}
                    />
                  </Field>
                </div>
                <fieldset className="stack stack--compact">
                  <legend className="field">Otros roles habilitados</legend>
                  <p className="muted">
                    El rol inicial siempre queda incluido. Con más de un rol
                    aparece el selector para cambiar de espacio.
                  </p>
                  <div className="row">
                    {Object.entries(roles).map(([id, name]) => (
                      <label className="check" key={id}>
                        <input
                          type="checkbox"
                          className="check__input"
                          name="roles"
                          value={id}
                          defaultChecked={
                            user?.roles.includes(id as Role) ?? false
                          }
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="check">
                  <input
                    className="check__input"
                    type="checkbox"
                    name="active"
                    defaultChecked={user?.active ?? true}
                  />
                  Acceso habilitado
                </label>
              </div>
              <footer className="management-editor__footer">
                <Button type="submit">Guardar persona</Button>
                <Button variant="ghost" onClick={() => setEditor(null)}>
                  Cancelar
                </Button>
              </footer>
            </ActionForm>
          </Dialog>
        )}
      </AnimatePresence>
      <Field label="Buscar persona">
        <input
          className="control"
          type="search"
          placeholder="Nombre o usuario"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Field>
      <AnimatedList className="management-list" animateSize={false}>
        {filtered.map((u) => (
          <article className="team-row" key={u.id}>
            <span className="team-row__avatar">
              <UserRound aria-hidden="true" />
            </span>
            <div className="team-row__identity">
              <strong>{u.name}</strong>
              <span>@{u.username}</span>
              <p>{u.roles.map((role) => roles[role]).join(" · ")}</p>
            </div>
            <span className={`badge badge--${u.active ? "success" : "error"}`}>
              {u.active ? "Activo" : "Inactivo"}
            </span>
            <Button
              variant="secondary"
              className="button--icon"
              aria-label={`Editar ${u.name}`}
              title={`Editar ${u.name}`}
              onClick={() => setEditor(u)}
            >
              <Pencil aria-hidden="true" />
            </Button>
          </article>
        ))}
      </AnimatedList>
      {!filtered.length && (
        <Empty title="Sin coincidencias">Probá otro nombre o usuario.</Empty>
      )}
    </>
  );
}
