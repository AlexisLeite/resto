"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActionForm, Button, Field, value } from "./ui/primitives";
import { ThemeToggle } from "./theme-toggle";
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <main className="login">
      <section className="panel login__card">
        <div className="panel__body">
          <div className="login__intro">
            <div className="row row--between">
              <div className="brand">
                <span className="brand__mark">r.</span>resto
              </div>
              <ThemeToggle />
            </div>
            <h1 className="login__title">Ingresar a Resto</h1>
            <p className="muted">Usá tu cuenta para comenzar el turno.</p>
          </div>
          <ActionForm
            submit={async (form) => {
              setError("");
              try {
                const response = await fetch("/api/auth/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    username: value(form, "username"),
                    password: value(form, "password"),
                  }),
                });
                const body = await response.json();
                if (!response.ok) {
                  setError(body.error);
                  return false;
                }
                router.replace("/dashboard");
                router.refresh();
                return true;
              } catch {
                setError("No hay conexión. Intentá nuevamente.");
                return false;
              }
            }}
          >
            <Field label="Usuario">
              <input
                name="username"
                className="control"
                autoComplete="username"
                autoCapitalize="none"
                required
                maxLength={40}
              />
            </Field>
            <Field label="Contraseña">
              <input
                name="password"
                className="control"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </Field>
            {error && (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="button--wide">
              Ingresar
            </Button>
          </ActionForm>
        </div>
      </section>
    </main>
  );
}
