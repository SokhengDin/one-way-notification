// RFC 9116 security.txt: where to report a vulnerability.
// SECURITY_CONTACT can be a mailto: or https: URL; defaults to private
// vulnerability reporting on the GitHub repository.

const CONTACT = process.env.SECURITY_CONTACT ?? "https://github.com/SokhengDin/one-way-notification/security/advisories/new";

export function GET(req: Request) {
  const origin  = new URL(req.url).origin;
  // must be renewed; regenerated on every request, so always a year ahead
  const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const body = [
    `Contact: ${CONTACT}`,
    `Expires: ${expires}`,
    "Preferred-Languages: en, fr, km",
    `Canonical: ${origin}/.well-known/security.txt`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
}
