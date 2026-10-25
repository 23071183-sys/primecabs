import { Prisma, PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export type Tx = Prisma.TransactionClient;

/** Unique-constraint violation from Prisma. */
export const isUniqueViolation = (e: unknown): boolean =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
