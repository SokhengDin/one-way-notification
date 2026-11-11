// One door for every toast in the dashboard, so they behave the same way:
//   * errors stay longer (8 s) than confirmations (4.5 s), as in file-vault
//   * the same message shown again replaces the one on screen instead of
//     stacking (polling queries, double clicks)
// Import `toast` from here, not from "sonner".

import { toast as sonner, type ExternalToast } from "sonner";

const SHORT = 4_500;
const LONG  = 8_000;

type Message = string;

const show =
  (kind: "success" | "error" | "warning" | "info", duration: number) =>
  (message: Message, options: ExternalToast = {}) =>
    sonner[kind](message, {
      id: `${kind}:${message}:${typeof options.description === "string" ? options.description : ""}`,
      duration,
      ...options,
    });

export const toast = {
  success: show("success", SHORT),
  info:    show("info", SHORT),
  warning: show("warning", LONG),
  error:   show("error", LONG),
  dismiss: sonner.dismiss,
};
