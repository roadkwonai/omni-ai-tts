import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireOwner = o.middleware(async ({ context, next }) => {
	if (!context.ownerId) {
		throw new ORPCError("UNAUTHORIZED");
	}
	return next({ context: { ownerId: context.ownerId } });
});

export const protectedProcedure = publicProcedure.use(requireOwner);
