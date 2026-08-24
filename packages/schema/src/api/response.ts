import { Schema } from "effect";

export const ApiResponse = <S extends Schema.Top>(data: S) =>
  Schema.Struct({
    status: Schema.Int,
    message: Schema.String,
    data,
  });

export const ok = <A>(data: A, status = 200, message = "OK") => ({
  status,
  message,
  data,
});
