import {
  NotificationDeliveryNotFound,
  NotificationNotFound,
  NotificationRepoError,
  NotificationTemplateInvalid,
  NotificationTemplateNotFound,
  NotificationUndeliverable,
  RenderedTemplate,
  Unauthorized,
  type ChannelType,
} from "@repo/schema";
import { Context, Effect, Layer } from "effect";
import { timingSafeEqual } from "node:crypto";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { AppConfigLive, AppConfigService } from "../../config/config";
import { AssetsRepo } from "../assets/assets";
import { ExternalSystemsRepo } from "../external-systems/external-systems";
import { renderForChannel, validateTemplateFields } from "./notifications.render";
import { makeSqlNotificationRepo } from "./notifications.sql";
import type {
  NotificationRepoService as NotificationRepoServiceShape,
  NotificationsService,
} from "./notifications.types";

const invalid = (problems: ReadonlyArray<string>) =>
  new NotificationTemplateInvalid({
    message: problems.length === 1 ? problems[0]! : `Template has ${problems.length} problems`,
    issues:  [...problems],
  });

export class NotificationsRepo extends Context.Service<
  NotificationsRepo,
  NotificationRepoServiceShape
>()("app/domain/notifications/NotificationsRepo") {
  static readonly layer = Layer.effect(
    NotificationsRepo,
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      return makeSqlNotificationRepo(sql);
    }),
  );
}

export class Notifications extends Context.Service<
  Notifications,
  NotificationsService
>()("app/domain/notifications/Notifications") {
  static readonly layer = Layer.effect(
    Notifications,
    Effect.gen(function* () {
      const repo            = yield* NotificationsRepo;
      const externalSystems = yield* ExternalSystemsRepo;
      const assets          = yield* AssetsRepo;
      const config          = yield* AppConfigService;

      // The external system (for its name) and its current brand assets.
      // `null` when the system doesn't exist or is deleted.
      const loadBranding = Effect.fn("Notifications.loadBranding")(function* (
        externalSystemId: string,
      ) {
        const system = yield* externalSystems.findExternalSystemById(externalSystemId);
        if (system === null) return null;
        const systemAssets = yield* assets.listAssets(externalSystemId);
        return { systemName: system.name, assets: systemAssets };
      }, Effect.mapError((cause) =>
        new NotificationRepoError({
          message:   "Failed to load the external system's branding",
          operation: "loadTemplateBranding",
          cause,
        }),
      ));

      const render = Effect.fn("Notifications.render")(function* (input: {
        readonly external_system_id: string;
        readonly channel:            ChannelType;
        readonly template:           string;
        readonly subject:            string | null;
        readonly payload:            Record<string, unknown>;
      }) {
        const branding = yield* loadBranding(input.external_system_id);
        if (branding === null) {
          return yield* invalid([`external_system_id: no external system with id ${input.external_system_id}`]);
        }
        const result = renderForChannel({ ...input, ...branding, publicUrl: config.publicUrl });
        if ("problems" in result) {
          return yield* invalid(result.problems);
        }
        return new RenderedTemplate({
          ...result,
          variables: [...result.variables],
          missing:   [...result.missing],
          warnings:  [...result.warnings],
        });
      });

      // ---------- notification_templates ----------

      const addNotificationTemplate: NotificationsService["addNotificationTemplate"] =
        Effect.fn("Notifications.addNotificationTemplate")(function* (
          input,
        ) {
          const problems = validateTemplateFields(input);
          if (problems.length > 0) {
            return yield* invalid(problems);
          }
          const branding = yield* loadBranding(input.external_system_id);
          if (branding === null) {
            return yield* invalid([`external_system_id: no external system with id ${input.external_system_id}`]);
          }
          return yield* repo.addNotificationTemplate(input);
        });

      const getNotificationTemplateById: NotificationsService["getNotificationTemplateById"] =
        Effect.fn("Notifications.getNotificationTemplateById")(function* (
          id,
        ) {
          const template = yield* repo.findNotificationTemplateById(id);
          if (template === null) {
            return yield* new NotificationTemplateNotFound({ id });
          }
          return template;
        });

      const listNotificationTemplates: NotificationsService["listNotificationTemplates"] =
        Effect.fn("Notifications.listNotificationTemplates")(function* (
          input,
        ) {
          return yield* repo.listNotificationTemplates(input);
        });

      const updateNotificationTemplate: NotificationsService["updateNotificationTemplate"] =
        Effect.fn("Notifications.updateNotificationTemplate")(function* (
          id,
          input,
        ) {
          const current = yield* repo.findNotificationTemplateById(id);
          if (current === null) {
            return yield* new NotificationTemplateNotFound({ id });
          }
          // validate the template as it will be after the patch
          const problems = validateTemplateFields({
            channel:  current.channel,
            template: input.template ?? current.template,
            subject:  input.subject !== undefined ? input.subject : current.subject,
          });
          if (problems.length > 0) {
            return yield* invalid(problems);
          }
          const template = yield* repo.updateNotificationTemplate(id, input);
          if (template === null) {
            return yield* new NotificationTemplateNotFound({ id });
          }
          return template;
        });

      const renderNotificationTemplate: NotificationsService["renderNotificationTemplate"] =
        Effect.fn("Notifications.renderNotificationTemplate")(function* (
          id,
          payload,
        ) {
          const template = yield* repo.findNotificationTemplateById(id);
          if (template === null) {
            return yield* new NotificationTemplateNotFound({ id });
          }
          return yield* render({ ...template, payload });
        });

      const prepareRenderer: NotificationsService["prepareRenderer"] =
        Effect.fn("Notifications.prepareRenderer")(function* (id) {
          const template = yield* repo.findNotificationTemplateById(id);
          if (template === null) {
            return yield* new NotificationTemplateNotFound({ id });
          }
          const branding = yield* loadBranding(template.external_system_id);
          if (branding === null) {
            return yield* invalid([`external_system_id: no external system with id ${template.external_system_id}`]);
          }
          return (payload: Record<string, unknown>) => {
            const result = renderForChannel({ ...template, payload, ...branding, publicUrl: config.publicUrl });
            if ("problems" in result) return Effect.fail(invalid(result.problems));
            return Effect.succeed(new RenderedTemplate({
              ...result,
              variables: [...result.variables],
              missing:   [...result.missing],
              warnings:  [...result.warnings],
            }));
          };
        });

      const previewNotificationTemplate: NotificationsService["previewNotificationTemplate"] =
        Effect.fn("Notifications.previewNotificationTemplate")(function* (
          input,
        ) {
          return yield* render(input);
        });

      const deleteNotificationTemplate: NotificationsService["deleteNotificationTemplate"] =
        Effect.fn("Notifications.deleteNotificationTemplate")(function* (
          id,
        ) {
          const deleted = yield* repo.deleteNotificationTemplate(id);
          if (!deleted) {
            return yield* new NotificationTemplateNotFound({ id });
          }
        });

      // ---------- notifications ----------

      const addNotification: NotificationsService["addNotification"] =
        Effect.fn("Notifications.addNotification")(function* (input) {
          const result = yield* repo.addNotification({
            ...input,
            max_attempts: config.delivery.maxAttempts,
          });
          switch (result._tag) {
            case "Created":
            case "Replayed":
              return result.notification;
            case "UnknownUser":
              return yield* new NotificationUndeliverable({
                message: `user_id: no user with id ${input.user_id}`,
              });
            case "NoTemplates": {
              const scope = input.channels && input.channels.length > 0 ? ` on ${input.channels.join(", ")}` : "";
              return yield* new NotificationUndeliverable({
                message: `event_type: this system has no template for "${input.event_type}"${scope}, so nothing could be sent. Create one first.`,
              });
            }
          }
        });

      const verifySystemApiKey: NotificationsService["verifySystemApiKey"] =
        Effect.fn("Notifications.verifySystemApiKey")(function* (externalSystemId, apiKey) {
          const system = yield* externalSystems.findExternalSystemById(externalSystemId).pipe(
            Effect.mapError((cause) => new NotificationRepoError({
              message: "Failed to check the API key", operation: "addNotification", cause,
            })),
          );
          const expected = Buffer.from(system?.api_key ?? "", "utf8");
          const given    = Buffer.from(apiKey, "utf8");
          // constant-time compare; an unknown system fails the same way
          const valid = system !== null && expected.length === given.length && timingSafeEqual(expected, given);
          if (!valid) {
            return yield* new Unauthorized({ message: "X-Api-Key is not valid for this external system" });
          }
        });

      const getNotificationById: NotificationsService["getNotificationById"] =
        Effect.fn("Notifications.getNotificationById")(function* (id) {
          const notification = yield* repo.findNotificationById(id);
          if (notification === null) {
            return yield* new NotificationNotFound({ id });
          }
          return notification;
        });

      const listNotifications: NotificationsService["listNotifications"] =
        Effect.fn("Notifications.listNotifications")(function* (input) {
          return yield* repo.listNotifications(input);
        });

      // ---------- notification_deliveries ----------

      const listNotificationDeliveries: NotificationsService["listNotificationDeliveries"] =
        Effect.fn("Notifications.listNotificationDeliveries")(function* (
          notificationId,
          input,
        ) {
          return yield* repo.listNotificationDeliveries(
            notificationId,
            input,
          );
        });

      const updateNotificationDeliveryStatus: NotificationsService["updateNotificationDeliveryStatus"] =
        Effect.fn("Notifications.updateNotificationDeliveryStatus")(
          function* (id, input) {
            const delivery = yield* repo.updateNotificationDeliveryStatus(
              id,
              input,
            );
            if (delivery === null) {
              return yield* new NotificationDeliveryNotFound({ id });
            }
            return delivery;
          },
        );

      return {
        addNotificationTemplate,
        getNotificationTemplateById,
        listNotificationTemplates,
        updateNotificationTemplate,
        renderNotificationTemplate,
        prepareRenderer,
        previewNotificationTemplate,
        deleteNotificationTemplate,
        addNotification,
        verifySystemApiKey,
        getNotificationById,
        listNotifications,
        listNotificationDeliveries,
        updateNotificationDeliveryStatus,
      };
    }),
  ).pipe(
    Layer.provide([
      NotificationsRepo.layer,
      ExternalSystemsRepo.layer,
      AssetsRepo.layer,
      AppConfigLive,
    ]),
  );
}
