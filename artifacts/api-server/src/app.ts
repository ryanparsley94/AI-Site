import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

// Extend Request type to carry the raw body buffer for webhook signature verification
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors((req, callback) => {
  const publicEmbed = /^\/api\/widget(?:\/|\.|$)/.test(req.path);
  if (publicEmbed) { callback(null, { origin: true, credentials: false }); return; }
  const origin = req.get("origin");
  // Dashboard cookies are only readable by this app's own origin. Embedded
  // widgets have their separate, cookie-free public route above.
  let sameOrigin = false;
  try { sameOrigin = !!origin && new URL(origin).host === req.get("host"); } catch { /* reject malformed Origin */ }
  callback(null, { origin: sameOrigin ? origin : false, credentials: sameOrigin });
}));
app.use(cookieParser());

// Capture raw body buffer before JSON parsing so webhook handlers can verify
// Resend (svix) signatures against the unmodified payload.
app.use(
  express.json({
    verify: (req: Request, _res: Response, buf: Buffer) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
