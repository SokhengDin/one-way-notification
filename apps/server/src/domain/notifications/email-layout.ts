// Wraps a rendered email body in a minimal, client-safe HTML document:
// table layout, inline styles, 600px column, the sender's logo on top.
// Templates that already supply their own document (contain `<html`) are
// passed through untouched.

import { escapeHtml } from "./template-engine";

export interface EmailBranding {
  readonly systemName: string;
  readonly logoUrl:    string | null;
  readonly logoWidth:  number | null;
  readonly logoHeight: number | null;
}

const MAX_LOGO_WIDTH  = 200;
const MAX_LOGO_HEIGHT = 64;

/** Fit the logo inside the header box, preserving aspect ratio. */
export function logoDisplaySize(
  width:  number | null,
  height: number | null,
): { readonly width: number; readonly height: number | null } {
  if (!width || !height) {
    return { width: MAX_LOGO_WIDTH, height: null };
  }
  const scale = Math.min(1, MAX_LOGO_WIDTH / width, MAX_LOGO_HEIGHT / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function isFullDocument(html: string): boolean {
  return /<html[\s>]/i.test(html);
}

export function wrapEmail(input: {
  readonly subject:  string;
  readonly bodyHtml: string;
  readonly branding: EmailBranding;
}): string {
  if (isFullDocument(input.bodyHtml)) {
    return input.bodyHtml;
  }

  const { branding } = input;
  const name         = escapeHtml(branding.systemName);

  let header: string;
  if (branding.logoUrl) {
    const size = logoDisplaySize(branding.logoWidth, branding.logoHeight);
    header =
      `<img src="${escapeHtml(branding.logoUrl)}" alt="${name}" width="${size.width}"` +
      (size.height ? ` height="${size.height}"` : "") +
      ` style="display:block;border:0;outline:none;text-decoration:none;max-width:100%;height:auto;">`;
  } else {
    header = `<span style="font-size:20px;font-weight:600;color:#111827;">${name}</span>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f4f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:8px;">
<tr><td data-slot="header" style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">${header}</td></tr>
<tr><td data-slot="body" style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#111827;">
${input.bodyHtml}
</td></tr>
<tr><td data-slot="footer" style="padding:16px 32px;border-top:1px solid #e5e7eb;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#6b7280;">Sent by ${name}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
