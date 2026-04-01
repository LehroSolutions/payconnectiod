import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  transactions: defineTable({
    idempotencyKey: v.string(),
    amount: v.number(),
    currency: v.string(),
    provider: v.string(),
    status: v.string(),
    riskScore: v.optional(v.number()),
    riskFactors: v.optional(v.array(v.string())),
    initiatedAt: v.number(),
    settledAt: v.optional(v.number()),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_status", ["status"])
    .index("by_initiatedAt", ["initiatedAt"]),

  riskAssessments: defineTable({
    transactionId: v.id("transactions"),
    riskScore: v.number(),
    riskLevel: v.string(),
    factors: v.array(v.object({
      factor: v.string(),
      weight: v.number(),
      description: v.string(),
    })),
    recommendation: v.string(),
    assessedAt: v.number(),
  }).index("by_transactionId", ["transactionId"]),

  providerWebhooks: defineTable({
    provider: v.string(),
    eventType: v.string(),
    transactionRef: v.optional(v.string()),
    verified: v.boolean(),
    receivedAt: v.number(),
  })
    .index("by_provider", ["provider"])
    .index("by_receivedAt", ["receivedAt"]),

  idempotencyStore: defineTable({
    key: v.string(),
    status: v.string(),
    result: v.optional(v.any()),
    expiresAt: v.number(),
    createdAt: v.number(),
  }).index("by_key", ["key"]),
});
