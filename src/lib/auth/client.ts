"use client";

import { createAuthClient } from "better-auth/react";

/** Browser auth client. Talks only to this app's /api/auth routes (same origin). */
export const authClient = createAuthClient();
