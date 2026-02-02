import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const taskValidator = v.object({
	id: v.string(),
	text: v.string(),
});

const columnValidator = v.object({
	id: v.string(),
	title: v.string(),
	tasks: v.array(taskValidator),
});

export default defineSchema({
	boards: defineTable({
		slug: v.string(),
		columns: v.array(columnValidator),
	}).index("by_slug", ["slug"]),
	products: defineTable({
		title: v.string(),
		imageId: v.string(),
		price: v.number(),
	}),
	todos: defineTable({
		text: v.string(),
		completed: v.boolean(),
	}),
});
