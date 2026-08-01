import { Layer } from "effect";
import { AppConfigLive } from "./config/config";
import { PgLive } from "./pg";
import { UserRepoService } from "./domain/users/users";

const UserRepoLive = UserRepoService.layer.pipe(Layer.provide(PgLive));

export const AppLayer = Layer.mergeAll(AppConfigLive, PgLive, UserRepoLive);
