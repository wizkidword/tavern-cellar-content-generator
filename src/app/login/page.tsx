import { loginOperatorAction } from "@/app/login/actions";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function messageFor(code: string | undefined) {
  switch (code) {
    case "AUTH_INVALID":
      return "That operator credential was not accepted.";
    case "RATE_LIMITED":
      return "Too many sign-in attempts. Wait a few minutes, then try again.";
    case "AUTH_CONFIGURATION_INVALID":
      return "Foundry needs valid operator session configuration before it can sign you in.";
    case "SIGNED_OUT":
      return "You have been signed out.";
    default:
      return null;
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const error = firstValue(params?.error);
  const message = firstValue(params?.message);
  const notice = messageFor(error ?? message);
  const isError = Boolean(error);

  return (
    <main className="app-shell flex min-h-screen items-center justify-center px-5 py-8">
      <section className="panel panel-strong w-full max-w-lg rounded-[2rem] p-6 md:p-8">
        <p className="eyebrow mb-3">Operator Access</p>
        <h1 className="display text-4xl font-semibold text-[#fff1d7]">Tavern Cellar Foundry</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
          Sign in with the local operator credential configured for this Foundry workspace.
        </p>

        {notice ? (
          <p className={`message mt-5 ${isError ? "message-error" : "message-success"}`}>{notice}</p>
        ) : null}

        <form action={loginOperatorAction} className="mt-6 space-y-4">
          <input
            aria-hidden="true"
            autoComplete="username"
            className="sr-only"
            name="operatorUsername"
            readOnly
            tabIndex={-1}
            type="text"
            value="operator"
          />
          <div>
            <label className="label" htmlFor="operatorToken">
              Operator credential
            </label>
            <input
              autoComplete="current-password"
              className="field"
              id="operatorToken"
              name="operatorToken"
              required
              type="password"
            />
          </div>
          <button className="action-primary w-full" type="submit">
            Sign in to Foundry
          </button>
        </form>
      </section>
    </main>
  );
}
