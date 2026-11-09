"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="login">
      <section className="panel panel__body stack">
        <h1 className="page__title">No pudimos cargar la aplicación</h1>
        <p className="muted">Comprobá la conexión y volvé a intentar.</p>
        <button className="button" onClick={reset}>
          Reintentar
        </button>
      </section>
    </main>
  );
}
