import {
	DndContext,
	DragOverlay,
	PointerSensor,
	closestCenter,
	type DragEndEvent,
	type DragStartEvent,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	horizontalListSortingStrategy,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/")({ component: App });

type Task = {
	id: string;
	text: string;
};

type Column = {
	id: string;
	title: string;
	tasks: Task[];
};

type ActiveItem =
	| { type: "column"; columnId: string }
	| { type: "task"; columnId: string; task: Task };

const createId = () =>
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const makeColumnDnDId = (columnId: string) => `column:${columnId}`;
const makeTaskDnDId = (taskId: string) => `task:${taskId}`;

function App() {
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 8 },
		}),
	);

	const board = useQuery(api.board.get);
	const ensureDefaultBoard = useMutation(api.board.ensureDefault);
	const saveColumns = useMutation(api.board.setColumns);

	const [columns, setColumns] = useState<Column[]>([]);
	const [editingColumn, setEditingColumn] = useState<{
		id: string;
		value: string;
	} | null>(null);
	const [editingTask, setEditingTask] = useState<{
		columnId: string;
		taskId: string;
		value: string;
	} | null>(null);
	const [insertingTask, setInsertingTask] = useState<{
		columnId: string;
		index: number;
		value: string;
	} | null>(null);
	const [activeItem, setActiveItem] = useState<ActiveItem | null>(null);

	const ensureRequestedRef = useRef(false);

	useEffect(() => {
		if (board === null && !ensureRequestedRef.current) {
			ensureRequestedRef.current = true;
			void ensureDefaultBoard();
		}
		if (board?._id) {
			ensureRequestedRef.current = false;
		}
	}, [board, ensureDefaultBoard]);

	useEffect(() => {
		if (!board) return;
		setColumns(board.columns as Column[]);
	}, [board]);

	const columnDnDIds = useMemo(
		() => columns.map((column) => makeColumnDnDId(column.id)),
		[columns],
	);

	const totalTasks = useMemo(
		() => columns.reduce((count, column) => count + column.tasks.length, 0),
		[columns],
	);

	const persistColumns = (next: Column[]) => {
		setColumns(next);
		if (!board?._id) return;
		void saveColumns({
			boardId: board._id,
			columns: next,
		});
	};

	const handleRemoveColumn = (columnId: string) => {
		const next = columns.filter((column) => column.id !== columnId);
		persistColumns(next);
	};

	const handleColumnRename = () => {
		if (!editingColumn) return;
		const title = editingColumn.value.trim();
		if (!title) {
			setEditingColumn(null);
			return;
		}
		const next = columns.map((column) =>
			column.id === editingColumn.id ? { ...column, title } : column,
		);
		persistColumns(next);
		setEditingColumn(null);
	};

	const handleRemoveTask = (columnId: string, taskId: string) => {
		const next = columns.map((column) =>
			column.id === columnId
				? {
						...column,
						tasks: column.tasks.filter((task) => task.id !== taskId),
					}
				: column,
		);
		persistColumns(next);
	};

	const handleTaskEditSave = () => {
		if (!editingTask) return;
		const text = editingTask.value.trim();
		if (!text) {
			setEditingTask(null);
			return;
		}
		const next = columns.map((column) =>
			column.id !== editingTask.columnId
				? column
				: {
						...column,
						tasks: column.tasks.map((task) =>
							task.id === editingTask.taskId ? { ...task, text } : task,
						),
					},
		);
		persistColumns(next);
		setEditingTask(null);
	};

	const handleInsertTaskStart = (columnId: string, index: number) => {
		setEditingTask(null);
		setInsertingTask({ columnId, index, value: "" });
	};

	const handleInsertTaskSave = () => {
		if (!insertingTask) return;
		const text = insertingTask.value.trim();
		if (!text) {
			setInsertingTask(null);
			return;
		}
		const next = columns.map((column) => {
			if (column.id !== insertingTask.columnId) return column;
			const tasks = [...column.tasks];
			tasks.splice(insertingTask.index, 0, { id: createId(), text });
			return { ...column, tasks };
		});
		persistColumns(next);
		setInsertingTask(null);
	};

	const handleInsertColumn = (index: number) => {
		setEditingColumn(null);
		setInsertingTask(null);
		const title = `Column ${columns.length + 1}`;
		const next = [...columns];
		next.splice(index, 0, { id: createId(), title, tasks: [] });
		persistColumns(next);
	};

	const handleDragStart = (event: DragStartEvent) => {
		setInsertingTask(null);
		const data = event.active.data.current;
		if (!data) return;

		if (data.type === "column") {
			setActiveItem({ type: "column", columnId: data.columnId });
			return;
		}
		if (data.type === "task") {
			setActiveItem({
				type: "task",
				columnId: data.columnId,
				task: data.task as Task,
			});
		}
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		setActiveItem(null);
		if (!over) return;
		const activeData = active.data.current;
		const overData = over.data.current;
		if (!activeData || !overData) return;

		if (activeData.type === "column" && overData.type === "column") {
			const activeColumnId = activeData.columnId as string;
			const overColumnId = overData.columnId as string;
			if (activeColumnId === overColumnId) return;
			const from = columns.findIndex((column) => column.id === activeColumnId);
			const to = columns.findIndex((column) => column.id === overColumnId);
			if (from < 0 || to < 0) return;
			persistColumns(arrayMove(columns, from, to));
			return;
		}

		if (activeData.type !== "task") return;

		const activeTaskId = String(active.id).replace("task:", "");
		const source = findTaskLocationInColumns(columns, activeTaskId);
		if (!source) return;

		if (overData.type === "task") {
			const overTaskId = String(over.id).replace("task:", "");
			const destination = findTaskLocationInColumns(columns, overTaskId);
			if (!destination) return;

			const next = columns.map((column) => ({ ...column, tasks: [...column.tasks] }));
			if (source.columnIndex === destination.columnIndex) {
				next[source.columnIndex].tasks = arrayMove(
					next[source.columnIndex].tasks,
					source.taskIndex,
					destination.taskIndex,
				);
				persistColumns(next);
				return;
			}

			const [movedTask] = next[source.columnIndex].tasks.splice(source.taskIndex, 1);
			next[destination.columnIndex].tasks.splice(destination.taskIndex, 0, movedTask);
			persistColumns(next);
			return;
		}

		if (overData.type === "column") {
			const targetColumnId = overData.columnId as string;
			const targetColumnIndex = columns.findIndex(
				(column) => column.id === targetColumnId,
			);
			if (targetColumnIndex < 0 || targetColumnIndex === source.columnIndex) return;

			const next = columns.map((column) => ({ ...column, tasks: [...column.tasks] }));
			const [movedTask] = next[source.columnIndex].tasks.splice(source.taskIndex, 1);
			next[targetColumnIndex].tasks.push(movedTask);
			persistColumns(next);
		}
	};

	if (board === undefined) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
				Loading board...
			</div>
		);
	}

	if (board === null) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
				Creating your board...
			</div>
		);
	}

	return (
		<div
			className="min-h-screen bg-linear-to-br from-amber-50 via-white to-cyan-100 text-slate-900"
			style={{
				fontFamily: "'Space Grotesk', 'IBM Plex Sans', 'Segoe UI', sans-serif",
			}}
		>
			<div className="relative overflow-hidden">
				<div className="-top-28 -right-20 absolute h-72 w-72 rounded-full bg-amber-200/60 blur-3xl" />
				<div className="-left-24 absolute top-32 h-80 w-80 rounded-full bg-cyan-200/60 blur-3xl" />
				<main className="relative mx-auto flex max-w-7xl flex-col gap-8 px-5 pt-12 pb-12">
					<header className="flex flex-col gap-3">
						<div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 font-semibold text-slate-600 text-xs uppercase tracking-[0.28em] shadow-sm">
							Board Flow
						</div>
						<h1 className="font-semibold text-4xl leading-tight md:text-5xl">
							Drag-and-drop task board with editable columns.
						</h1>
						<p className="max-w-3xl text-slate-600 md:text-lg">
							Reorder columns, reorder tasks, move tasks between columns, and
							manage everything inline.
						</p>
						<div className="text-slate-500 text-xs uppercase tracking-[0.2em]">
							{columns.length} columns • {totalTasks} tasks
						</div>
					</header>

					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
					>
						<SortableContext
							items={columnDnDIds}
							strategy={horizontalListSortingStrategy}
						>
							<div className="grid auto-cols-[320px] grid-flow-col gap-4 overflow-x-auto px-4 pb-2">
								{columns.map((column, index) => (
									<Fragment key={column.id}>
										<SortableColumn
											column={column}
											columnIndex={index}
											isEditing={editingColumn?.id === column.id}
											editingValue={editingColumn?.value ?? ""}
											editingTask={editingTask}
											insertingTask={insertingTask}
											onStartInsertTask={handleInsertTaskStart}
											onInsertTaskChange={(value) =>
												setInsertingTask((prev) =>
													prev && prev.columnId === column.id
														? { ...prev, value }
														: prev,
												)
											}
											onInsertTaskSave={handleInsertTaskSave}
											onInsertTaskCancel={() => setInsertingTask(null)}
											onInsertColumnLeft={() => handleInsertColumn(index)}
											onInsertColumnRight={() => handleInsertColumn(index + 1)}
											onRemoveColumn={() => handleRemoveColumn(column.id)}
											onStartEditingColumn={() =>
													setEditingColumn({ id: column.id, value: column.title })
											}
											onEditingColumnChange={(value) =>
													setEditingColumn((prev) =>
														prev && prev.id === column.id ? { ...prev, value } : prev,
													)
											}
											onSaveColumnEdit={handleColumnRename}
											onCancelColumnEdit={() => setEditingColumn(null)}
											onStartTaskEdit={(task) =>
													setEditingTask({
														columnId: column.id,
														taskId: task.id,
														value: task.text,
													})
											}
											onTaskEditChange={(value) =>
													setEditingTask((prev) =>
														prev &&
														prev.columnId === column.id &&
														column.tasks.some((task) => task.id === prev.taskId)
															? { ...prev, value }
															: prev,
													)
											}
											onTaskEditSave={handleTaskEditSave}
											onTaskEditCancel={() => setEditingTask(null)}
											onRemoveTask={handleRemoveTask}
										/>
									</Fragment>
								))}
								{columns.length === 0 ? (
									<button
										type="button"
										onClick={() => handleInsertColumn(0)}
										className="flex h-[460px] w-[320px] items-center justify-center rounded-2xl border border-slate-200 border-dashed bg-white/60 text-slate-500 transition hover:bg-white hover:text-slate-700"
									>
										<div className="flex flex-col items-center gap-1 text-sm">
											<Plus className="h-4 w-4" />
											Add first column
										</div>
									</button>
								) : null}
							</div>
						</SortableContext>
						<DragOverlay>
							{activeItem?.type === "column" ? (
								<div className="w-[320px] rounded-2xl border border-slate-300 bg-slate-100 p-4 shadow-xl">
									<div className="font-semibold text-slate-700">Moving column...</div>
								</div>
							) : null}
							{activeItem?.type === "task" ? (
								<div className="rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-xl">
									{activeItem.task.text}
								</div>
							) : null}
						</DragOverlay>
					</DndContext>
				</main>
			</div>
		</div>
	);
}

type SortableColumnProps = {
	column: Column;
	columnIndex: number;
	isEditing: boolean;
	editingValue: string;
	editingTask: { columnId: string; taskId: string; value: string } | null;
	insertingTask: { columnId: string; index: number; value: string } | null;
	onStartInsertTask: (columnId: string, index: number) => void;
	onInsertTaskChange: (value: string) => void;
	onInsertTaskSave: () => void;
	onInsertTaskCancel: () => void;
	onInsertColumnLeft: () => void;
	onInsertColumnRight: () => void;
	onRemoveColumn: () => void;
	onStartEditingColumn: () => void;
	onEditingColumnChange: (value: string) => void;
	onSaveColumnEdit: () => void;
	onCancelColumnEdit: () => void;
	onStartTaskEdit: (task: Task) => void;
	onTaskEditChange: (value: string) => void;
	onTaskEditSave: () => void;
	onTaskEditCancel: () => void;
	onRemoveTask: (columnId: string, taskId: string) => void;
};

function SortableColumn(props: SortableColumnProps) {
	const {
		column,
		columnIndex,
		isEditing,
		editingValue,
		editingTask,
		insertingTask,
		onStartInsertTask,
		onInsertTaskChange,
		onInsertTaskSave,
		onInsertTaskCancel,
		onInsertColumnLeft,
		onInsertColumnRight,
		onRemoveColumn,
		onStartEditingColumn,
		onEditingColumnChange,
		onSaveColumnEdit,
		onCancelColumnEdit,
		onStartTaskEdit,
		onTaskEditChange,
		onTaskEditSave,
		onTaskEditCancel,
		onRemoveTask,
	} = props;

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: makeColumnDnDId(column.id),
		data: { type: "column", columnId: column.id },
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};
	const columnInputRef = useRef<HTMLInputElement>(null);
	const ignoreBlurRef = useRef(false);

	useEffect(() => {
		if (isEditing) {
			columnInputRef.current?.focus();
		}
	}, [isEditing]);

	return (
		<section
			ref={setNodeRef}
			style={style}
			className={`group/column relative flex h-full min-h-[460px] flex-col rounded-2xl border bg-slate-50 ${
				isDragging ? "border-slate-400 opacity-70" : "border-slate-200"
			}`}
		>
			<button
				type="button"
				onClick={onInsertColumnLeft}
				className="-left-3 -translate-y-1/2 absolute top-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 opacity-0 shadow-sm transition hover:bg-slate-50 hover:text-slate-800 group-hover/column:opacity-100"
			>
				<Plus className="h-4 w-4" />
			</button>
			<button
				type="button"
				onClick={onInsertColumnRight}
				className="-right-3 -translate-y-1/2 absolute top-1/2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 opacity-0 shadow-sm transition hover:bg-slate-50 hover:text-slate-800 group-hover/column:opacity-100"
			>
				<Plus className="h-4 w-4" />
			</button>
			<div className="flex items-center justify-between gap-2 border-slate-200 border-b px-3 py-3">
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="cursor-grab rounded-md p-1 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 active:cursor-grabbing"
						{...attributes}
						{...listeners}
					>
						<GripVertical className="h-4 w-4" />
					</button>
					{isEditing ? (
						<input
							ref={columnInputRef}
							value={editingValue}
							onChange={(event) => onEditingColumnChange(event.target.value)}
							onBlur={() => {
								if (ignoreBlurRef.current) {
									ignoreBlurRef.current = false;
									return;
								}
								onSaveColumnEdit();
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									onSaveColumnEdit();
								}
								if (event.key === "Escape") {
									ignoreBlurRef.current = true;
									onCancelColumnEdit();
								}
							}}
							className="rounded-md border border-slate-300 bg-white px-2 py-1 font-semibold text-sm outline-none focus:ring-2 focus:ring-slate-200"
						/>
					) : (
						<button
							type="button"
							onClick={onStartEditingColumn}
							className="rounded-md px-1 py-0.5 font-semibold text-slate-800 text-sm uppercase tracking-[0.14em] transition hover:bg-slate-200"
						>
							{column.title || `Column ${columnIndex + 1}`}
						</button>
					)}
				</div>
				<div className="flex items-center gap-1">
					{!isEditing && (
						<button
							type="button"
							onClick={onRemoveColumn}
							className="rounded-md border border-rose-200 p-1.5 text-rose-600 transition hover:border-rose-300 hover:text-rose-700"
						>
							<Trash2 className="h-3.5 w-3.5" />
						</button>
					)}
				</div>
			</div>

			<div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
				<SortableContext
					items={column.tasks.map((task) => makeTaskDnDId(task.id))}
					strategy={verticalListSortingStrategy}
				>
					{column.tasks.map((task, index) => (
						<Fragment key={task.id}>
							{insertingTask?.columnId === column.id &&
							insertingTask.index === index ? (
								<InsertTaskInput
									value={insertingTask.value}
									onChange={onInsertTaskChange}
									onSave={onInsertTaskSave}
									onCancel={onInsertTaskCancel}
								/>
							) : null}
							<SortableTaskCard
								columnId={column.id}
								task={task}
								editingTask={editingTask}
								onInsertAbove={() => onStartInsertTask(column.id, index)}
								onInsertBelow={() => onStartInsertTask(column.id, index + 1)}
								onStartTaskEdit={onStartTaskEdit}
								onTaskEditChange={onTaskEditChange}
								onTaskEditSave={onTaskEditSave}
								onTaskEditCancel={onTaskEditCancel}
								onRemoveTask={onRemoveTask}
							/>
						</Fragment>
					))}
				</SortableContext>
				{insertingTask?.columnId === column.id &&
				insertingTask.index === column.tasks.length ? (
					<InsertTaskInput
						value={insertingTask.value}
						onChange={onInsertTaskChange}
						onSave={onInsertTaskSave}
						onCancel={onInsertTaskCancel}
					/>
				) : null}
				{column.tasks.length === 0 && !insertingTask ? (
					<button
						type="button"
						onClick={() => onStartInsertTask(column.id, 0)}
						className="rounded-lg border border-slate-200 border-dashed bg-white/70 px-3 py-5 text-center text-slate-500 text-sm transition hover:bg-white hover:text-slate-700"
					>
						<Plus className="mx-auto mb-1 h-4 w-4" />
						Add first task
					</button>
				) : null}
			</div>
		</section>
	);
}

type SortableTaskCardProps = {
	columnId: string;
	task: Task;
	editingTask: { columnId: string; taskId: string; value: string } | null;
	onInsertAbove: () => void;
	onInsertBelow: () => void;
	onStartTaskEdit: (task: Task) => void;
	onTaskEditChange: (value: string) => void;
	onTaskEditSave: () => void;
	onTaskEditCancel: () => void;
	onRemoveTask: (columnId: string, taskId: string) => void;
};

function SortableTaskCard(props: SortableTaskCardProps) {
	const {
		columnId,
		task,
		editingTask,
		onInsertAbove,
		onInsertBelow,
		onStartTaskEdit,
		onTaskEditChange,
		onTaskEditSave,
		onTaskEditCancel,
		onRemoveTask,
	} = props;

	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable({
			id: makeTaskDnDId(task.id),
			data: { type: "task", columnId, task },
		});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const isEditing =
		editingTask?.columnId === columnId && editingTask.taskId === task.id;
	const taskInputRef = useRef<HTMLInputElement>(null);
	const ignoreBlurRef = useRef(false);

	useEffect(() => {
		if (isEditing) {
			taskInputRef.current?.focus();
		}
	}, [isEditing]);

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`group/task relative rounded-xl border bg-white p-3 shadow-sm ${
				isDragging ? "border-slate-400 opacity-70" : "border-slate-200"
			}`}
		>
			<button
				type="button"
				onClick={onInsertAbove}
				className="-top-3 -translate-x-1/2 absolute left-1/2 flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 opacity-0 shadow-sm transition hover:bg-slate-50 hover:text-slate-800 group-hover/task:opacity-100"
			>
				<Plus className="h-3.5 w-3.5" />
			</button>
			<div className="flex items-start gap-2">
				<button
					type="button"
					className="mt-0.5 cursor-grab rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
					{...attributes}
					{...listeners}
				>
					<GripVertical className="h-4 w-4" />
				</button>
				<div className="min-w-0 flex-1">
					{isEditing ? (
						<input
							ref={taskInputRef}
							value={editingTask.value}
							onChange={(event) => onTaskEditChange(event.target.value)}
							onBlur={() => {
								if (ignoreBlurRef.current) {
									ignoreBlurRef.current = false;
									return;
								}
								onTaskEditSave();
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									onTaskEditSave();
								}
								if (event.key === "Escape") {
									ignoreBlurRef.current = true;
									onTaskEditCancel();
								}
							}}
							className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-200"
						/>
					) : (
						<button
							type="button"
							onClick={() => onStartTaskEdit(task)}
							className="w-full rounded-md px-1 py-0.5 text-left text-slate-800 text-sm leading-relaxed transition hover:bg-slate-100"
						>
							{task.text}
						</button>
					)}
				</div>
				<div className="flex gap-1">
					{!isEditing && (
						<button
							type="button"
							onClick={() => onRemoveTask(columnId, task.id)}
							className="rounded-md border border-rose-200 p-1 text-rose-600 transition hover:border-rose-300 hover:text-rose-700"
						>
							<Trash2 className="h-3.5 w-3.5" />
						</button>
					)}
				</div>
			</div>
			<button
				type="button"
				onClick={onInsertBelow}
				className="-bottom-3 -translate-x-1/2 absolute left-1/2 flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 opacity-0 shadow-sm transition hover:bg-slate-50 hover:text-slate-800 group-hover/task:opacity-100"
			>
				<Plus className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}

type InsertTaskInputProps = {
	value: string;
	onChange: (value: string) => void;
	onSave: () => void;
	onCancel: () => void;
};

function InsertTaskInput(props: InsertTaskInputProps) {
	const { value, onChange, onSave, onCancel } = props;
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	return (
		<div className="rounded-xl border border-slate-300 bg-white p-3 shadow-sm">
			<input
				ref={inputRef}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onBlur={onCancel}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						onSave();
					}
					if (event.key === "Escape") {
						onCancel();
					}
				}}
				placeholder="Type a task and press Enter"
				className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-200"
			/>
		</div>
	);
}

function findTaskLocationInColumns(columns: Column[], taskId: string) {
	for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
		const taskIndex = columns[columnIndex].tasks.findIndex(
			(task) => task.id === taskId,
		);
		if (taskIndex >= 0) {
			return { columnIndex, taskIndex };
		}
	}
	return null;
}
