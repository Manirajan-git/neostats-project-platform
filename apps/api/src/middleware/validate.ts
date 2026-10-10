import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";
import { AppError, type FieldIssue } from "../utils/errors";

type Source = "body" | "query" | "params";

/** Validates and replaces the given request part with the parsed (sanitised) value. */
export function validate(schema: ZodSchema, source: Source = "body"): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details: FieldIssue[] = result.error.issues.map((issue) => ({
        path: issue.path.join(".") || source,
        message: issue.message,
      }));
      return next(
        new AppError(400, "VALIDATION_ERROR", "The request contains invalid fields.", details),
      );
    }
    if (source === "body") req.body = result.data;
    else if (source === "query") (req.query as unknown) = result.data;
    else (req.params as unknown) = result.data;
    next();
  };
}
