import { query } from "./_generated/server";
import { v } from "convex/values";

export const listTransactions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transactions")
      .withIndex("by_initiatedAt")
      .order("desc")
      .take(args.limit ?? 30);
  },
});

export const getSettlementAnalytics = query({
  args: {},
  handler: async (ctx) => {
    const txns = await ctx.db.query("transactions").collect();
    const settled = txns.filter((t) => t.status === "settled");
    const failed = txns.filter((t) => t.status === "failed");
    const totalVolume = settled.reduce((s, t) => s + t.amount, 0);
    return {
      total: txns.length,
      settled: settled.length,
      failed: failed.length,
      totalVolume,
      avgAmount: settled.length ? Math.round(totalVolume / settled.length) : 0,
    };
  },
});

export const getRiskAssessment = query({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("riskAssessments")
      .withIndex("by_transactionId", (q) => q.eq("transactionId", args.transactionId))
      .first();
  },
});

export const listHighRiskTransactions = query({
  args: {},
  handler: async (ctx) => {
    const assessments = await ctx.db.query("riskAssessments").collect();
    return assessments.filter((a) => a.riskScore >= 70);
  },
});
