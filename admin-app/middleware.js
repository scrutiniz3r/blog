// Gates every request (the admin page and every /api/* route) behind HTTP
// Basic Auth, EXCEPT /api/comments — that one is called by anonymous blog
// readers to read and post comments, so it has to stay public. Its own
// spam guard (honeypot field) and validation live in lib/comments.js;
// moderation (listing/deleting) is the separate /api/comments-admin route,
// which is NOT exempted here and stays password-protected.
//
// Set ADMIN_USER and ADMIN_PASSWORD as Vercel environment variables —
// never commit real values here.

export const config = {
  matcher: "/:path*",
};

const PUBLIC_PATHS = ["/api/comments"];

export default function middleware(request) {
  const { pathname } = new URL(request.url);
  if (PUBLIC_PATHS.includes(pathname)) {
    return; // public, no auth
  }

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
