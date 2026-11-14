import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/auth";

/** Better Auth endpoints: sign-in, sign-out, session, password reset. Sign-up is disabled in config. */
export const { GET, POST } = toNextJsHandler(auth);
