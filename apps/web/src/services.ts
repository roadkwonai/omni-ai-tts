import { createAuth } from "@tts-pilot-app/auth";
import { createDb } from "@tts-pilot-app/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
