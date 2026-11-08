// The demo templates are inserted straight into the database, bypassing the
// API's validation, so check them here: each one parses, and renders its
// sample payload with no missing variables.
import { describe, expect, test } from "bun:test";
import { channelsOf, SYSTEMS } from "../db/seed-catalog";
import { renderForChannel } from "../src/domain/notifications/notifications.render";

const rand = { pick: <T,>(items: ReadonlyArray<T>) => items[0]!, between: (min: number) => min, first: "Dara" };

describe("demo template catalogue", () => {
  for (const system of SYSTEMS) {
    for (const spec of system.events) {
      for (const channel of channelsOf(spec)) {
        test(`${system.name} · ${spec.event} · ${channel}`, () => {
          const result = renderForChannel({
            channel,
            template:   channel === "email" ? spec.email!.body : channel === "sms" ? spec.sms! : spec.telegram!,
            subject:    channel === "email" ? spec.email!.subject : null,
            payload:    spec.payload(rand),
            systemName: system.name,
            assets:     [],
            publicUrl:  "https://notify.test",
          });
          if ("problems" in result) throw new Error(result.problems.join("; "));
          expect(result.missing).toEqual([]);
          expect(result.body).toContain(channel === "email" ? "<" : "");
        });
      }
    }
  }

  test("event names are unique within a system", () => {
    for (const system of SYSTEMS) {
      const names = system.events.map((spec) => spec.event);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});
