import type { Session } from "@tts-pilot-app/auth";
import type { Database } from "@tts-pilot-app/db";

export type Context = {
  session: Session | null;
  db: Database;
};
