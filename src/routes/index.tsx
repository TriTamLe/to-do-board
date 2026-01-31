import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/")({ component: App });

type Todo = {
	id: string;
	text: string;
	createdAt: number;
};

function App() {
	const [todos, setTodos] = useState<Todo[]>(() => [
		{ id: "seed-1", text: "Plan weeknight meals", createdAt: Date.now() },
		{
			id: "seed-2",
			text: "Refactor onboarding checklist",
			createdAt: Date.now() + 1,
		},
	]);
	const [newTask, setNewTask] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingText, setEditingText] = useState("");

	const remainingCount = useMemo(() => todos.length, [todos]);

	const handleAdd = () => {
		const trimmed = newTask.trim();
		if (!trimmed) return;
		const next: Todo = {
			id: crypto.randomUUID(),
			text: trimmed,
			createdAt: Date.now(),
		};
		setTodos((prev) => [next, ...prev]);
		setNewTask("");
	};

	const handleRemove = (id: string) => {
		setTodos((prev) => prev.filter((todo) => todo.id !== id));
		if (editingId === id) {
			setEditingId(null);
			setEditingText("");
		}
	};

	const handleEditStart = (todo: Todo) => {
		setEditingId(todo.id);
		setEditingText(todo.text);
	};

	const handleEditSave = () => {
		if (!editingId) return;
		const trimmed = editingText.trim();
		if (!trimmed) return;
		setTodos((prev) =>
			prev.map((todo) =>
				todo.id === editingId ? { ...todo, text: trimmed } : todo,
			),
		);
		setEditingId(null);
		setEditingText("");
	};

	const handleEditCancel = () => {
		setEditingId(null);
		setEditingText("");
	};

	return (
		<div
			className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-sky-100 text-slate-900"
			style={{
				fontFamily: "'Space Grotesk', 'IBM Plex Sans', 'Segoe UI', sans-serif",
			}}
		>
			<div className="relative overflow-hidden">
				<div className="absolute -top-32 -right-24 h-72 w-72 rounded-full bg-amber-200/60 blur-3xl" />
				<div className="absolute top-32 -left-24 h-80 w-80 rounded-full bg-sky-200/60 blur-3xl" />
				<main className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-16 pt-14">
					<header className="flex flex-col gap-4">
						<div className="inline-flex w-fit items-center gap-3 rounded-full border border-slate-200/80 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 shadow-sm">
							Focus Board
						</div>
						<div className="flex flex-col gap-2">
							<h1 className="text-4xl font-semibold leading-tight text-slate-900 md:text-5xl">
								A simple, fast todo list for the day.
							</h1>
							<p className="max-w-2xl text-base text-slate-600 md:text-lg">
								Add tasks, edit details inline, and clear what no longer
								matters. Stay light and intentional.
							</p>
						</div>
					</header>

					<section className="rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-xl shadow-slate-200/70">
						<form
							className="flex flex-col gap-3 md:flex-row"
							onSubmit={(event) => {
								event.preventDefault();
								handleAdd();
							}}
						>
							<input
								value={newTask}
								onChange={(event) => setNewTask(event.target.value)}
								placeholder="Add a task to your list"
								className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
							/>
							<button
								type="submit"
								className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-lg shadow-slate-400/40 transition hover:translate-y-[-1px] hover:bg-slate-800"
							>
								Add task
							</button>
						</form>

						<div className="mt-6 flex items-center justify-between text-xs uppercase tracking-[0.25em] text-slate-500">
							<span>{remainingCount} tasks</span>
							<span>Keep it doable</span>
						</div>

						<div className="mt-6 flex flex-col gap-4">
							{todos.length === 0 ? (
								<div className="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-slate-500">
									Your list is clear. Add a task to get moving.
								</div>
							) : (
								todos.map((todo) => (
									<div
										key={todo.id}
										className="group flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white px-5 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md md:flex-row md:items-center md:justify-between"
									>
										{editingId === todo.id ? (
											<div className="flex w-full flex-1 flex-col gap-3 md:flex-row md:items-center">
												<input
													value={editingText}
													onChange={(event) =>
														setEditingText(event.target.value)
													}
													onKeyDown={(event) => {
														if (event.key === "Enter") {
															event.preventDefault();
															handleEditSave();
														}
														if (event.key === "Escape") {
															handleEditCancel();
														}
													}}
													className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
												/>
												<div className="flex flex-wrap gap-2">
													<button
														type="button"
														onClick={handleEditSave}
														className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-emerald-500"
													>
														<Check className="h-4 w-4" />
														Save
													</button>
													<button
														type="button"
														onClick={handleEditCancel}
														className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
													>
														<X className="h-4 w-4" />
														Cancel
													</button>
												</div>
											</div>
										) : (
											<>
												<div className="flex flex-1 flex-col gap-1">
													<span className="text-lg font-medium text-slate-900">
														{todo.text}
													</span>
													<span className="text-xs uppercase tracking-[0.2em] text-slate-400">
														Created{" "}
														{new Date(todo.createdAt).toLocaleTimeString([], {
															hour: "2-digit",
															minute: "2-digit",
														})}
													</span>
												</div>
												<div className="flex flex-wrap gap-2">
													<button
														type="button"
														onClick={() => handleEditStart(todo)}
														className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
													>
														<Pencil className="h-4 w-4" />
														Edit
													</button>
													<button
														type="button"
														onClick={() => handleRemove(todo.id)}
														className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:bg-rose-400"
													>
														<Trash2 className="h-4 w-4" />
														Remove
													</button>
												</div>
											</>
										)}
									</div>
								))
							)}
						</div>
					</section>
				</main>
			</div>
		</div>
	);
}
