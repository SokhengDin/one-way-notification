// Minimal AWS Signature Version 4 for a single JSON request — enough for
// SES v2, without pulling in the AWS SDK.
// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html

import { createHash, createHmac } from "node:crypto";

export interface AwsRequest {
  readonly method:          string;
  readonly url:             string;
  readonly region:          string;
  readonly service:         string;
  readonly body:            string;
  readonly headers:         Readonly<Record<string, string>>;
  readonly accessKeyId:     string;
  readonly secretAccessKey: string;
  /** for tests; defaults to now */
  readonly now?:            Date;
}

const sha256 = (data: string) => createHash("sha256").update(data, "utf8").digest("hex");
const hmac   = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data, "utf8").digest();

// RFC 3986 encoding, as SigV4 requires (encodeURIComponent leaves !'()* alone)
const encode = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Returns the headers to send, including Authorization and X-Amz-Date. */
export function signAwsRequest(request: AwsRequest): Record<string, string> {
  const url       = new URL(request.url);
  const now       = request.now ?? new Date();
  const amzDate   = now.toISOString().replace(/[:-]|\.\d{3}/g, "");   // 20260108T101500Z
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers)) headers[key.toLowerCase()] = value.trim();
  headers.host         = url.host;
  headers["x-amz-date"] = amzDate;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders  = signedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join("");
  const signedHeaders     = signedHeaderNames.join(";");

  const canonicalPath = url.pathname
    .split("/")
    .map((segment) => encode(decodeURIComponent(segment)))
    .join("/") || "/";
  const canonicalQuery = [...url.searchParams.entries()]
    .map(([key, value]) => [encode(key), encode(value)] as const)
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const canonicalRequest = [
    request.method.toUpperCase(),
    canonicalPath,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    sha256(request.body),
  ].join("\n");

  const scope        = `${dateStamp}/${request.region}/${request.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${request.secretAccessKey}`, dateStamp), request.region), request.service),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  // host is signed but not sent: fetch sets it, to the same value
  const { host: _host, ...sendHeaders } = headers;
  return {
    ...sendHeaders,
    authorization: `AWS4-HMAC-SHA256 Credential=${request.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
