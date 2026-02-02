import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const taskValidator = v.object({
	id: v.string(),
	text: v.string(),
	completed: v.boolean(),
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

const normalizeColumns = (
	columns: Array<{
		id: string;
		title: string;
		tasks: Array<{ id: string; text: string; completed?: boolean }>;
	}>,
) =>
	columns.map((column) => {
		const tasks = column.tasks.map((task) => ({
			id: task.id,
			text: task.text,
			completed: task.completed ?? false,
		}));
		const active = tasks.filter((task) => !task.completed);
		const done = tasks.filter((task) => task.completed);
		return {
			id: column.id,
			title: column.title,
			tasks: [...active, ...done],
		};
	});

const defaultColumns = () => [
	{
		id: createId(),
		title: "Backlog",
		tasks: [
			{ id: createId(), text: "Write landing page copy", completed: false },
			{ id: createId(), text: "Create project board", completed: false },
		],
	},
	{
		id: createId(),
		title: "In Progress",
		tasks: [
			{ id: createId(), text: "Build drag-and-drop interactions", completed: false },
		],
	},
	{
		id: createId(),
		title: "Done",
		tasks: [{ id: createId(), text: "Setup TanStack Start app", completed: true }],
	},
];

const boardName = (name: string | undefined, index: number) => {
	const trimmed = name?.trim() ?? "";
	return trimmed || `Board ${index}`;
};

export const listBoards = query({
	args: {},
	handler: async (ctx) => {
		const boards = await ctx.db.query("boards").order("asc").collect();
		return boards.map((board, index) => ({
			_id: board._id,
			name: boardName(board.name, index + 1),
		}));
	},
});

export const getBoard = query({
	args: {
		boardId: v.optional(v.id("boards")),
	},
	handler: async (ctx, args) => {
		const boards = await ctx.db.query("boards").order("asc").collect();
		if (boards.length === 0) return null;

		const selected =
			(args.boardId
				? boards.find((board) => board._id === args.boardId)
				: null) ?? boards[0];
		const index = boards.findIndex((board) => board._id === selected._id);

		return {
			...selected,
			name: boardName(selected.name, index + 1),
			columns: normalizeColumns(selected.columns),
		};
	},
});

export const ensureBoard = mutation({
	args: {},
	handler: async (ctx) => {
		const boards = await ctx.db.query("boards").order("asc").collect();
		if (boards.length > 0) return boards[0]._id;
		return await ctx.db.insert("boards", {
			name: "Board 1",
			slug: "default",
			columns: defaultColumns(),
		});
	},
});

export const createBoard = mutation({
	args: {
		name: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const boards = await ctx.db.query("boards").order("asc").collect();
		const index = boards.length + 1;
		return await ctx.db.insert("boards", {
			name: boardName(args.name, index),
			slug: `board-${Date.now()}`,
			columns: defaultColumns(),
		});
	},
});

export const renameBoard = mutation({
	args: {
		boardId: v.id("boards"),
		name: v.string(),
	},
	handler: async (ctx, args) => {
		const board = await ctx.db.get(args.boardId);
		if (!board) {
			throw new Error("Board not found");
		}
		const name = args.name.trim();
		if (!name) {
			throw new Error("Board name is required");
		}
		await ctx.db.patch(args.boardId, { name });
	},
});

export const deleteBoard = mutation({
	args: {
		boardId: v.id("boards"),
	},
	handler: async (ctx, args) => {
		const board = await ctx.db.get(args.boardId);
		if (!board) {
			throw new Error("Board not found");
		}

		await ctx.db.delete(args.boardId);
		const remaining = await ctx.db.query("boards").order("asc").collect();
		if (remaining.length > 0) {
			return remaining[0]._id;
		}

		return await ctx.db.insert("boards", {
			name: "Board 1",
			slug: "default",
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
		await ctx.db.patch(args.boardId, { columns: normalizeColumns(args.columns) });
	},
});

export const toggleTaskCompleted = mutation({
	args: {
		boardId: v.id("boards"),
		columnId: v.string(),
		taskId: v.string(),
		completed: v.boolean(),
	},
	handler: async (ctx, args) => {
		const board = await ctx.db.get(args.boardId);
		if (!board) {
			throw new Error("Board not found");
		}
		const columns = normalizeColumns(board.columns).map((column) => {
			if (column.id !== args.columnId) return column;
			const tasks = column.tasks.map((task) =>
				task.id === args.taskId ? { ...task, completed: args.completed } : task,
			);
			const active = tasks.filter((task) => !task.completed);
			const done = tasks.filter((task) => task.completed);
			return { ...column, tasks: [...active, ...done] };
		});
		await ctx.db.patch(args.boardId, { columns });
	},
});
