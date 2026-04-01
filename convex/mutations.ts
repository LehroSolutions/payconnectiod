import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const addTransaction = mutation({
  args: {
    idempotencyKey: v.string(),
    amount: v.number(),
    currency: v.string(),
    provider: v.string(),
    status: v.string(),
    riskScore: v.number(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("transactions")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("transactions", {
      ...args,
      initiatedAt: Date.now(),
    });
  },
});

export const updateTransactionStatus = mutation({
  args: { id: v.id("transactions"), status: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: args.status });
  },
});

export const addRiskAssessment = mutation({
  args: {
    transactionId: v.id("transactions"),
    riskScore: v.number(),
    riskLevel: v.string(),
    factors: v.array(v.string()),
    recommendation: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("riskAssessments", {
      ...args,
      assessedAt: Date.now(),
    });
  },
});

export const recordProviderWebhook = mutation({
  args: {
    provider: v.string(),
    eventType: v.string(),
    payload: v.string(),
    verified: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("providerWebhooks", {
      ...args,
      receivedAt: Date.now(),
    });
  },
});
