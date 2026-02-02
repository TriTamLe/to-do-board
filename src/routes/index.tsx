import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { CheckSquare, ChevronDown, Plus, Square, Trash2 } from "lucide-react";
import {
  Fragment,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export const Route = createFileRoute("/")({ component: App });

type Task = {
  id: string;
  text: string;
  completed: boolean;
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

const normalizeTasks = (tasks: Task[]) => {
  const withDefaults = tasks.map((task) => ({
    ...task,
    completed: task.completed ?? false,
  }));
  const active = withDefaults.filter((task) => !task.completed);
  const done = withDefaults.filter((task) => task.completed);
  return [...active, ...done];
};

function App() {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const boards = useQuery(api.board.listBoards);
  const [selectedBoardId, setSelectedBoardId] = useState<Id<"boards"> | null>(
    null,
  );
  const board = useQuery(api.board.getBoard, {
    boardId: selectedBoardId ?? undefined,
  });
  const ensureBoard = useMutation(api.board.ensureBoard);
  const createBoard = useMutation(api.board.createBoard);
  const renameBoard = useMutation(api.board.renameBoard);
  const deleteBoard = useMutation(api.board.deleteBoard);
  const saveColumns = useMutation(api.board.setColumns);
  const toggleTaskCompleted = useMutation(api.board.toggleTaskCompleted);

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
  const [editingBoard, setEditingBoard] = useState<{
    id: Id<"boards">;
    value: string;
  } | null>(null);
  const [doneOpenByColumn, setDoneOpenByColumn] = useState<
    Record<string, boolean>
  >({});
  const [activeItem, setActiveItem] = useState<ActiveItem | null>(null);

  const ensureRequestedRef = useRef(false);

  useEffect(() => {
    if (boards === undefined) return;
    if (boards.length === 0 && !ensureRequestedRef.current) {
      ensureRequestedRef.current = true;
      void ensureBoard();
      return;
    }
    if (boards.length > 0) {
      ensureRequestedRef.current = false;
      if (
        !selectedBoardId ||
        !boards.some((item) => item._id === selectedBoardId)
      ) {
        setSelectedBoardId(boards[0]._id);
      }
    }
  }, [boards, ensureBoard, selectedBoardId]);

  useEffect(() => {
    if (!board) return;
    const normalized = (board.columns as Column[]).map((column) => ({
      ...column,
      tasks: normalizeTasks(column.tasks),
    }));
    setColumns(normalized);
    setDoneOpenByColumn({});
  }, [board]);

  const columnDnDIds = useMemo(
    () => columns.map((column) => makeColumnDnDId(column.id)),
    [columns],
  );

  const totalTasks = useMemo(
    () => columns.reduce((count, column) => count + column.tasks.length, 0),
    [columns],
  );
  const activeColumn = useMemo(() => {
    if (activeItem?.type !== "column") return null;
    return columns.find((column) => column.id === activeItem.columnId) ?? null;
  }, [activeItem, columns]);

  const persistColumns = (next: Column[]) => {
    const normalized = next.map((column) => ({
      ...column,
      tasks: normalizeTasks(column.tasks),
    }));
    setColumns(normalized);
    if (!board?._id) return;
    void saveColumns({
      boardId: board._id,
      columns: normalized,
    });
  };

  const handleCreateBoard = async () => {
    const boardId = await createBoard({});
    setSelectedBoardId(boardId);
    setEditingBoard(null);
  };

  const handleRenameBoardSave = async () => {
    if (!editingBoard) return;
    const name = editingBoard.value.trim();
    if (!name) {
      setEditingBoard(null);
      return;
    }
    await renameBoard({
      boardId: editingBoard.id,
      name,
    });
    setEditingBoard(null);
  };

  const handleDeleteBoard = async (boardId: Id<"boards">) => {
    const nextBoardId = await deleteBoard({ boardId });
    setSelectedBoardId(nextBoardId);
    setEditingBoard((prev) => (prev?.id === boardId ? null : prev));
  };

  const handleRemoveColumn = (columnId: string) => {
    const next = columns.filter((column) => column.id !== columnId);
    persistColumns(next);
    setDoneOpenByColumn((prev) => {
      const cloned = { ...prev };
      delete cloned[columnId];
      return cloned;
    });
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
        ? (() => {
            const tasks = column.tasks.filter((task) => task.id !== taskId);
            return {
              ...column,
              tasks:
                tasks.length > 0
                  ? tasks
                  : [{ id: createId(), text: "New task", completed: false }],
            };
          })()
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

  const handleTaskEditSaveAndAddBelow = () => {
    if (!editingTask) return;
    const text = editingTask.value.trim();
    if (!text) {
      setEditingTask(null);
      return;
    }
    let nextEditing: {
      columnId: string;
      taskId: string;
      value: string;
    } | null = null;
    const next = columns.map((column) => {
      if (column.id !== editingTask.columnId) return column;
      const tasks = [...column.tasks];
      const taskIndex = tasks.findIndex(
        (task) => task.id === editingTask.taskId,
      );
      if (taskIndex < 0) return column;
      tasks[taskIndex] = { ...tasks[taskIndex], text };
      const newTask = {
        id: createId(),
        text: "",
        completed: tasks[taskIndex].completed,
      };
      tasks.splice(taskIndex + 1, 0, newTask);
      nextEditing = {
        columnId: column.id,
        taskId: newTask.id,
        value: "",
      };
      return { ...column, tasks: normalizeTasks(tasks) };
    });
    persistColumns(next);
    setEditingTask(nextEditing);
  };

  const handleToggleTask = (columnId: string, taskId: string) => {
    let nextCompleted = false;
    const next = columns.map((column) => {
      if (column.id !== columnId) return column;
      const updated = column.tasks.map((task) =>
        task.id === taskId
          ? (() => {
              nextCompleted = !task.completed;
              return { ...task, completed: nextCompleted };
            })()
          : task,
      );
      return { ...column, tasks: normalizeTasks(updated) };
    });
    persistColumns(next);
    if (!board?._id) return;
    void toggleTaskCompleted({
      boardId: board._id,
      columnId,
      taskId,
      completed: nextCompleted,
    });
  };

  const handleInsertColumn = (index: number) => {
    setEditingColumn(null);
    const title = `Column ${columns.length + 1}`;
    const next = [...columns];
    next.splice(index, 0, {
      id: createId(),
      title,
      tasks: [{ id: createId(), text: "New task", completed: false }],
    });
    persistColumns(next);
  };

  const handleDragStart = (event: DragStartEvent) => {
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

      const next = columns.map((column) => ({
        ...column,
        tasks: [...column.tasks],
      }));
      if (source.columnIndex === destination.columnIndex) {
        next[source.columnIndex].tasks = arrayMove(
          next[source.columnIndex].tasks,
          source.taskIndex,
          destination.taskIndex,
        );
        persistColumns(next);
        return;
      }

      const [movedTask] = next[source.columnIndex].tasks.splice(
        source.taskIndex,
        1,
      );
      next[destination.columnIndex].tasks.splice(
        destination.taskIndex,
        0,
        movedTask,
      );
      persistColumns(next);
      return;
    }

    if (overData.type === "column") {
      const targetColumnId = overData.columnId as string;
      const targetColumnIndex = columns.findIndex(
        (column) => column.id === targetColumnId,
      );
      if (targetColumnIndex < 0 || targetColumnIndex === source.columnIndex)
        return;

      const next = columns.map((column) => ({
        ...column,
        tasks: [...column.tasks],
      }));
      const [movedTask] = next[source.columnIndex].tasks.splice(
        source.taskIndex,
        1,
      );
      const targetActiveCount = next[targetColumnIndex].tasks.filter(
        (task) => !task.completed,
      ).length;
      next[targetColumnIndex].tasks.splice(targetActiveCount, 0, movedTask);
      persistColumns(next);
    }
  };

  if (boards === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Loading boards...
      </div>
    );
  }

  const activeBoardId = selectedBoardId ?? board?._id ?? null;
  const isBoardContentLoading = board === undefined || board === null;

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
        <main className="relative mx-auto flex w-full max-w-[1300px] gap-6 px-5 pt-12 pb-12">
          <aside className="w-72 shrink-0 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-lg shadow-slate-200/70">
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold text-slate-800 text-sm uppercase tracking-[0.16em]">
                Boards
              </div>
              <button
                type="button"
                onClick={() => {
                  void handleCreateBoard();
                }}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-slate-600 text-xs uppercase tracking-[0.08em] transition hover:bg-slate-100"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            </div>
            <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
              {boards.map((item) => {
                const isActive = item._id === activeBoardId;
                const isEditingBoard = editingBoard?.id === item._id;
                return (
                  <div
                    key={item._id}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-2 ${
                      isActive
                        ? "border-slate-300 bg-slate-100"
                        : "border-transparent bg-transparent hover:bg-slate-50"
                    }`}
                  >
                    {isEditingBoard ? (
                      <input
                        value={editingBoard.value}
                        onChange={(event) =>
                          setEditingBoard((prev) =>
                            prev ? { ...prev, value: event.target.value } : prev,
                          )
                        }
                        onBlur={() => {
                          void handleRenameBoardSave();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleRenameBoardSave();
                          }
                          if (event.key === "Escape") {
                            setEditingBoard(null);
                          }
                        }}
                        className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedBoardId(item._id)}
                        onDoubleClick={() =>
                          setEditingBoard({ id: item._id, value: item.name })
                        }
                        className="min-w-0 flex-1 truncate rounded-md px-1 py-1 text-left text-slate-700 text-sm transition hover:bg-slate-200/70"
                      >
                        {item.name}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteBoard(item._id);
                      }}
                      className="rounded-md border border-rose-200 p-1 text-rose-600 transition hover:border-rose-300 hover:text-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <header className="mb-8 flex flex-col gap-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 font-semibold text-slate-600 text-xs uppercase tracking-[0.28em] shadow-sm">
                Board Flow
              </div>
              <h1 className="font-semibold text-4xl leading-tight md:text-5xl">
                {board?.name ?? "Loading board..."}
              </h1>
              <p className="max-w-3xl text-slate-600 md:text-lg">
                Reorder columns, reorder tasks, move tasks between columns, and
                manage everything inline.
              </p>
              <div className="text-slate-500 text-xs uppercase tracking-[0.2em]">
                {columns.length} columns • {totalTasks} tasks
              </div>
            </header>

            {isBoardContentLoading ? (
              <div className="flex h-[500px] items-center justify-center rounded-2xl border border-slate-200 bg-white/70 text-slate-500">
                Loading board content...
              </div>
            ) : (
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
                          doneOpen={doneOpenByColumn[column.id] ?? false}
                          onToggleDoneOpen={() =>
                            setDoneOpenByColumn((prev) => ({
                              ...prev,
                              [column.id]: !prev[column.id],
                            }))
                          }
                          onInsertColumnLeft={() => handleInsertColumn(index)}
                          onInsertColumnRight={() => handleInsertColumn(index + 1)}
                          onRemoveColumn={() => handleRemoveColumn(column.id)}
                          onStartEditingColumn={() =>
                            setEditingColumn({ id: column.id, value: column.title })
                          }
                          onEditingColumnChange={(value) =>
                            setEditingColumn((prev) =>
                              prev && prev.id === column.id
                                ? { ...prev, value }
                                : prev,
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
                          onTaskEditSaveAndAddBelow={handleTaskEditSaveAndAddBelow}
                          onTaskEditCancel={() => setEditingTask(null)}
                          onToggleTask={handleToggleTask}
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
                    <ColumnDragPreview column={activeColumn} />
                  ) : null}
                  {activeItem?.type === "task" ? (
                    <div className="rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-xl">
                      {activeItem.task.text}
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function ColumnDragPreview(props: { column: Column | null }) {
  const { column } = props;
  if (!column) {
    return (
      <div className="h-[460px] w-[320px] rounded-2xl border border-slate-300 bg-slate-50/90 shadow-xl" />
    );
  }

  return (
    <section className="flex h-full min-h-[460px] w-[320px] flex-col rounded-2xl border border-slate-300 bg-slate-50 shadow-xl">
      <div className="flex items-center justify-between px-3 py-3">
        <div className="rounded-md px-1 py-0.5 font-semibold text-slate-800 text-sm uppercase tracking-[0.14em]">
          {column.title}
        </div>
        <div className="rounded-md border border-rose-200 p-1.5 text-rose-600">
          <Trash2 className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-hidden px-3 py-3">
        {column.tasks.slice(0, 6).map((task) => (
          <div
            key={task.id}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <p className="text-slate-800 text-sm leading-relaxed">
              {task.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

type SortableColumnProps = {
  column: Column;
  columnIndex: number;
  isEditing: boolean;
  editingValue: string;
  editingTask: { columnId: string; taskId: string; value: string } | null;
  doneOpen: boolean;
  onToggleDoneOpen: () => void;
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
  onTaskEditSaveAndAddBelow: () => void;
  onTaskEditCancel: () => void;
  onToggleTask: (columnId: string, taskId: string) => void;
  onRemoveTask: (columnId: string, taskId: string) => void;
};

function SortableColumn(props: SortableColumnProps) {
  const {
    column,
    columnIndex,
    isEditing,
    editingValue,
    editingTask,
    doneOpen,
    onToggleDoneOpen,
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
    onTaskEditSaveAndAddBelow,
    onTaskEditCancel,
    onToggleTask,
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

  const activeTasks = column.tasks.filter((task) => !task.completed);
  const doneTasks = column.tasks.filter((task) => task.completed);

  if (isDragging) {
    return (
      <section
        ref={setNodeRef}
        style={style}
        className="flex h-full min-h-[460px] flex-col rounded-2xl border border-slate-300 border-dashed bg-slate-100/60"
      />
    );
  }

  return (
    <section
      ref={setNodeRef}
      style={style}
      className="group/column relative flex h-full min-h-[460px] flex-col rounded-2xl border border-slate-200 bg-slate-50"
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
      <div
        className="flex items-center justify-between px-3 py-3"
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-2">
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
              className="rounded-md px-1 py-0.5 text-center font-semibold text-slate-800 text-sm uppercase tracking-[0.14em] transition hover:bg-slate-200"
            >
              {column.title || `Column ${columnIndex + 1}`}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onRemoveColumn}
          className="rounded-md border border-rose-200 p-1.5 text-rose-600 transition hover:border-rose-300 hover:text-rose-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col px-3 py-3">
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto overscroll-y-auto">
          <SortableContext
            items={activeTasks.map((task) => makeTaskDnDId(task.id))}
            strategy={verticalListSortingStrategy}
          >
            {activeTasks.map((task) => (
              <Fragment key={task.id}>
                <SortableTaskCard
                  columnId={column.id}
                  task={task}
                  editingTask={editingTask}
                  onStartTaskEdit={onStartTaskEdit}
                  onTaskEditChange={onTaskEditChange}
                  onTaskEditSave={onTaskEditSave}
                  onTaskEditSaveAndAddBelow={onTaskEditSaveAndAddBelow}
                  onTaskEditCancel={onTaskEditCancel}
                  onToggleTask={onToggleTask}
                  onRemoveTask={onRemoveTask}
                />
              </Fragment>
            ))}
          </SortableContext>
        </div>
        {doneTasks.length > 0 ? (
          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-100/70 p-2">
            <button
              type="button"
              onClick={onToggleDoneOpen}
              className="flex w-full items-center justify-between rounded-md px-2 py-1 text-slate-600 text-xs uppercase tracking-[0.1em] transition hover:bg-slate-200/70"
            >
              <span>{doneTasks.length} completed</span>
              <ChevronDown
                className={`h-4 w-4 transition ${doneOpen ? "rotate-180" : ""}`}
              />
            </button>
            {doneOpen ? (
              <div className="mt-2 flex flex-col gap-2">
                {doneTasks.map((task) => (
                  <CompletedTaskCard
                    key={task.id}
                    columnId={column.id}
                    task={task}
                    editingTask={editingTask}
                    onStartTaskEdit={onStartTaskEdit}
                    onTaskEditChange={onTaskEditChange}
                    onTaskEditSave={onTaskEditSave}
                    onTaskEditCancel={onTaskEditCancel}
                    onToggleTask={onToggleTask}
                    onRemoveTask={onRemoveTask}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

type SortableTaskCardProps = {
  columnId: string;
  task: Task;
  editingTask: { columnId: string; taskId: string; value: string } | null;
  onStartTaskEdit: (task: Task) => void;
  onTaskEditChange: (value: string) => void;
  onTaskEditSave: () => void;
  onTaskEditSaveAndAddBelow: () => void;
  onTaskEditCancel: () => void;
  onToggleTask: (columnId: string, taskId: string) => void;
  onRemoveTask: (columnId: string, taskId: string) => void;
};

function SortableTaskCard(props: SortableTaskCardProps) {
  const {
    columnId,
    task,
    editingTask,
    onStartTaskEdit,
    onTaskEditChange,
    onTaskEditSave,
    onTaskEditSaveAndAddBelow,
    onTaskEditCancel,
    onToggleTask,
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

  const handleTaskTabNavigation = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Tab") return;
    const taskButtons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-task-focus='true']"),
    );
    const currentIndex = taskButtons.indexOf(event.currentTarget);
    if (currentIndex < 0) return;
    const nextIndex = event.shiftKey ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= taskButtons.length) return;
    event.preventDefault();
    taskButtons[nextIndex]?.focus();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/task relative cursor-grab rounded-xl border bg-white p-3 shadow-sm active:cursor-grabbing ${
        isDragging ? "border-slate-400 opacity-70" : "border-slate-200"
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleTask(columnId, task.id);
          }}
          className="mt-0.5 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          {task.completed ? (
            <CheckSquare className="h-4 w-4 text-emerald-600" />
          ) : (
            <Square className="h-4 w-4" />
          )}
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
                  onTaskEditSaveAndAddBelow();
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
              onKeyDown={handleTaskTabNavigation}
              data-task-focus="true"
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
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onRemoveTask(columnId, task.id);
              }}
              className="rounded-md border border-rose-200 p-1 text-rose-600 opacity-0 transition hover:border-rose-300 hover:text-rose-700 focus-visible:opacity-100 group-hover/task:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type CompletedTaskCardProps = {
  columnId: string;
  task: Task;
  editingTask: { columnId: string; taskId: string; value: string } | null;
  onStartTaskEdit: (task: Task) => void;
  onTaskEditChange: (value: string) => void;
  onTaskEditSave: () => void;
  onTaskEditCancel: () => void;
  onToggleTask: (columnId: string, taskId: string) => void;
  onRemoveTask: (columnId: string, taskId: string) => void;
};

function CompletedTaskCard(props: CompletedTaskCardProps) {
  const {
    columnId,
    task,
    editingTask,
    onStartTaskEdit,
    onTaskEditChange,
    onTaskEditSave,
    onTaskEditCancel,
    onToggleTask,
    onRemoveTask,
  } = props;
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
    <div className="group/task rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onToggleTask(columnId, task.id)}
          className="mt-0.5 rounded-md p-1 text-emerald-600 transition hover:bg-emerald-50"
        >
          <CheckSquare className="h-4 w-4" />
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
              onKeyDown={(event) => {
                if (event.key !== "Tab") return;
                const taskButtons = Array.from(
                  document.querySelectorAll<HTMLButtonElement>(
                    "[data-task-focus='true']",
                  ),
                );
                const currentIndex = taskButtons.indexOf(event.currentTarget);
                if (currentIndex < 0) return;
                const nextIndex = event.shiftKey
                  ? currentIndex - 1
                  : currentIndex + 1;
                if (nextIndex < 0 || nextIndex >= taskButtons.length) return;
                event.preventDefault();
                taskButtons[nextIndex]?.focus();
              }}
              data-task-focus="true"
              className="w-full rounded-md px-1 py-0.5 text-left text-slate-500 text-sm leading-relaxed line-through transition hover:bg-slate-100"
            >
              {task.text}
            </button>
          )}
        </div>
        {!isEditing ? (
          <button
            type="button"
            onClick={() => onRemoveTask(columnId, task.id)}
            className="rounded-md border border-rose-200 p-1 text-rose-600 opacity-0 transition hover:border-rose-300 hover:text-rose-700 group-hover/task:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
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
