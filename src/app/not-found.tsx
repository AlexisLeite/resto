import Link from "next/link";
export default function NotFound() {
  return (
    <main className="login">
      <section className="panel panel__body stack">
        <h1 className="page__title">No encontramos esta página</h1>
        <Link className="button" href="/">
          Ir al inicio
        </Link>
      </section>
    </main>
  );
}
