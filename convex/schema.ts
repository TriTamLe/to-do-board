import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const taskValidator = v.object({
	id: v.string(),
	text: v.string(),
	completed: v.optional(v.boolean()),
});

const columnValidator = v.object({
	id: v.string(),
	title: v.string(),
	tasks: v.array(taskValidator),
});

export default defineSchema({
	boards: defineTable({
		name: v.optional(v.string()),
		slug: v.optional(v.string()),
		columns: v.array(columnValidator),
	}),
	products: defineTable({
		title: v.string(),
		imageId: v.string(),
		price: v.number(),
	}),
});
