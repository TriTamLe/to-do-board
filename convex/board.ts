import { mutation, query } from "./_generated/server";
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

const createId = () =>
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const DEFAULT_SLUG = "default";

const defaultColumns = () => [
	{
		id: createId(),
		title: "Backlog",
		tasks: [
			{ id: createId(), text: "Write landing page copy" },
			{ id: createId(), text: "Create project board" },
		],
	},
	{
		id: createId(),
		title: "In Progress",
		tasks: [{ id: createId(), text: "Build drag-and-drop interactions" }],
	},
	{
		id: createId(),
		title: "Done",
		tasks: [{ id: createId(), text: "Setup TanStack Start app" }],
	},
];

export const get = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query("boards")
			.withIndex("by_slug", (q) => q.eq("slug", DEFAULT_SLUG))
			.unique();
	},
});

export const ensureDefault = mutation({
	args: {},
	handler: async (ctx) => {
		const existing = await ctx.db
			.query("boards")
			.withIndex("by_slug", (q) => q.eq("slug", DEFAULT_SLUG))
			.unique();
		if (existing) return existing._id;
		return await ctx.db.insert("boards", {
			slug: DEFAULT_SLUG,
			columns: defaultColumns(),
		});
	},
});

export const setColumns = mutation({
	args: {
		boardId: v.id("boards"),
		columns: v.array(columnValidator),
	},
	handler: async (ctx, args) => {
		const board = await ctx.db.get(args.boardId);
		if (!board) {
			throw new Error("Board not found");
		}
		await ctx.db.patch(args.boardId, { columns: args.columns });
	},
});
