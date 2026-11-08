// What a valid recipient looks like per channel. Used for provider tests;
// fan-out trusts the stored contact, which was validated when saved.

import type { ChannelType } from "@repo/schema";

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const E164  = /^\+[1-9]\d{6,14}$/;
// numeric chat id (groups are negative) or @channelusername
const CHAT  = /^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/;

/** null when valid, otherwise a human-readable problem. */
export function validateRecipient(channel: ChannelType, to: string): string | null {
  if (to.length === 0) return "is required";
  switch (channel) {
    case "email":
      return EMAIL.test(to) ? null : "must be an email address";
    case "sms":
      return E164.test(to) ? null : "must be a phone number in E.164 format, e.g. +33612345678";
    case "telegram":
      return CHAT.test(to) ? null : "must be a Telegram chat id (e.g. 123456789) or @channelname";
  }
}
