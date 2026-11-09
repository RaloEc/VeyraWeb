import React, { useState, useMemo } from 'react';
import { Plus, Search, Sparkles } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { ReminderCard } from './ReminderCard';
import { ReminderFilters } from './ReminderFilters';
import { ReminderModal } from './ReminderModal';
import { useReminders } from '../../hooks/useReminders';
import type { Reminder, ReminderFilterTab, ReminderPriority, ReminderControlLevel, Subtask } from '../../types/reminders';

export interface RemindersModuleProps {
  userId: string;
  remindersHook?: ReturnType<typeof useReminders>;
}

export const RemindersModule: React.FC<RemindersModuleProps> = ({ userId, remindersHook }) => {
  const localHook = useReminders(remindersHook ? undefined : userId);
  const {
    reminders,
    todayReminders,
    upcomingReminders,
    completedReminders,
    loading,
    toggleReminder,
    toggleSubtask,
    createReminder,
    updateReminder,
    deleteReminder,
  } = remindersHook || localHook;

  const [activeTab, setActiveTab] = useState<ReminderFilterTab>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [quickTitle, setQuickTitle] = useState('');

  const counts = useMemo(
    () => ({
      today: todayReminders.length,
      upcoming: upcomingReminders.length,
      completed: completedReminders.length,
      all: reminders.length,
    }),
    [todayReminders, upcomingReminders, completedReminders, reminders]
  );

  const displayedReminders = useMemo(() => {
    let list: Reminder[] = [];
    if (activeTab === 'today') list = todayReminders;
    else if (activeTab === 'upcoming') list = upcomingReminders;
    else if (activeTab === 'completed') list = completedReminders;
    else list = reminders;

    if (!searchQuery.trim()) return list;

    const query = searchQuery.toLowerCase();
    return list.filter(
      (r) =>
        r.title.toLowerCase().includes(query) ||
        (r.description && r.description.toLowerCase().includes(query))
    );
  }, [activeTab, todayReminders, upcomingReminders, completedReminders, reminders, searchQuery]);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;

    const now = new Date();
    now.setHours(now.getHours() + 1);

    await createReminder({
      title: quickTitle.trim(),
      due_date_ms: now.getTime(),
      control_level: 'normal',
      priority: 1,
    });
    setQuickTitle('');
  };

  const handleOpenCreateModal = () => {
    setEditingReminder(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setIsModalOpen(true);
  };

  const handleSaveModal = async (payload: {
    id?: string;
    title: string;
    description?: string;
    due_date_ms: number;
    priority?: ReminderPriority;
    control_level?: ReminderControlLevel;
    subtasks?: Subtask[];
  }) => {
    if (payload.id) {
      await updateReminder(payload.id, {
        title: payload.title,
        description: payload.description,
        due_date_ms: payload.due_date_ms,
        priority: payload.priority,
        control_level: payload.control_level,
        subtasks: payload.subtasks,
      });
    } else {
      await createReminder({
        title: payload.title,
        description: payload.description,
        due_date_ms: payload.due_date_ms,
        priority: payload.priority,
        control_level: payload.control_level,
        subtasks: payload.subtasks,
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-[720px] mx-auto w-full select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-veyra-text">
            Recordatorios
          </h1>
          <p className="text-xs text-veyra-muted mt-0.5">
            Sincronización en vivo con tu teléfono móvil.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Recordatorio</span>
        </button>
      </div>

      {/* Quick Add Form */}
      <form onSubmit={handleQuickAdd} className="mb-4 relative">
        <input
          type="text"
          placeholder="Escribe un recordatorio rápido..."
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          className="w-full bg-veyra-elevated text-veyra-text placeholder:text-veyra-subtle rounded-md px-3.5 py-2 text-xs border-0 outline-none focus:ring-0 transition-colors pr-20"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
          <button
            type="submit"
            disabled={!quickTitle.trim()}
            className="px-2 py-0.5 text-xs font-medium text-accent hover:opacity-80 disabled:opacity-30 disabled:pointer-events-none transition-opacity cursor-pointer"
          >
            Añadir
          </button>
        </div>
      </form>

      {/* Controls: Filters & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
        <ReminderFilters
          currentTab={activeTab}
          onTabChange={setActiveTab}
          counts={counts}
        />

        <div className="relative w-full sm:w-48">
          <Search className="w-3.5 h-3.5 text-veyra-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-veyra-elevated rounded-md pl-8 pr-2.5 py-1 text-xs text-veyra-text placeholder:text-veyra-subtle border-0 outline-none focus:ring-0 transition-colors"
          />
        </div>
      </div>

      {/* Reminders Flat List */}
      {loading && reminders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs text-veyra-muted">Sincronizando...</p>
        </div>
      ) : displayedReminders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center rounded-md border border-dashed border-veyra-border bg-white/[0.01]">
          <div className="w-8 h-8 rounded-full bg-veyra-elevated flex items-center justify-center mb-2.5 text-veyra-subtle">
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <h3 className="text-xs font-medium text-veyra-text">
            {searchQuery
              ? 'No se encontraron resultados'
              : activeTab === 'completed'
              ? 'No hay recordatorios completados'
              : 'Todo al día'}
          </h3>
          <p className="text-[11px] text-veyra-muted mt-0.5 max-w-xs">
            {searchQuery
              ? 'Prueba con otra palabra clave.'
              : 'No hay recordatorios pendientes en esta vista.'}
          </p>
          {!searchQuery && activeTab !== 'completed' && (
            <Button
              onClick={handleOpenCreateModal}
              variant="secondary"
              size="sm"
              className="mt-3 text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Nuevo recordatorio
            </Button>
          )}
        </div>
      ) : (
        <div className="flex-1 space-y-0 border-t border-veyra-border">
          {displayedReminders.map((reminder) => (
            <ReminderCard
              key={reminder.id}
              reminder={reminder}
              onToggle={toggleReminder}
              onToggleSubtask={toggleSubtask}
              onEdit={handleOpenEditModal}
              onDelete={deleteReminder}
            />
          ))}
        </div>
      )}

      {/* Modal for Create/Edit */}
      <ReminderModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        reminder={editingReminder}
        onSave={handleSaveModal}
      />
    </div>
  );
};
