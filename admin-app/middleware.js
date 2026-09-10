// Gates every request (the admin page and every /api/* route) behind HTTP
// Basic Auth. This app writes directly to your GitHub repo on request, so
// nothing here should be reachable without a password.
//
// Set ADMIN_USER and ADMIN_PASSWORD as Vercel environment variables —
// never commit real values here.

export const config = {
  matcher: "/:path*",
};

export default function middleware(request) {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return new Response("Server misconfigured: ADMIN_USER / ADMIN_PASSWORD not set.", { status: 500 });
  }

  const auth = request.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const [user, pass] = atob(encoded).split(":");
      if (user === expectedUser && pass === expectedPass) {
        return; // authenticated, let the request through
      }
    }
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Field Notes Admin"' },
  });
}
