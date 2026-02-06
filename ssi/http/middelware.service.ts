import { Context } from "@oak/oak/context";
import { HTTPError } from "@norskhelsenett/zeniki";

export const authz = async (ctx: Context, next: () => Promise<unknown>) => {
  try {
    if (!ctx.request.headers.has("Authorization")) {
      console.log("Missing authorization error", ctx.request.headers);
      throw new HTTPError(
        "Wrong username or password!",
        401,
        undefined,
        "UNAUTHORIZED",
      );
    }
    console.log(ctx.request.headers.get("Authorization"));

    await next();
    return;
  } catch (error: unknown) {
    const err: HTTPError = error as HTTPError;
    if (err && err.message) {
      ctx.response.status = err.code;
      ctx.response.body = { message: err.message };
      ctx.response.type = "json";
    } else {
      ctx.response.status = 500;
      ctx.response.body = { message: "Unknown error!" };
      ctx.response.type = "json";
    }
  }
};
