import { useEffect, useRef, useState } from 'react';
import { Lock, MessageCircle, Plus, RefreshCw, Search, Trash2, Edit2 } from 'lucide-react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Customer {
  id: number;
  name: string;
}

interface Barber {
  id: number;
  name: string;
}

interface Appointment {
  id: number;
  customer_id: number | null;
  barber_id: number | null;
  service_type: string;
  appointment_date: string;
  appointment_end?: string | null;
  status: string;
  notes?: string | null;
  sync_origin?: 'local' | 'google';
  google_event_id?: string | null;
  customer_name?: string;
  customer_phone?: string;
  barber_name?: string;
}

export default function AppointmentsManagerMonthly() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [editing, setEditing] = useState<Partial<Appointment> | null>(null);
  const [blocking, setBlocking] = useState<{ barber_id: string; date: string; time: string; duration_minutes: string; notes: string } | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [syncingGoogle, setSyncingGoogle] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [appointmentsSyncInfo, setAppointmentsSyncInfo] = useState<{ ready: boolean; message?: string | null; supabaseHost?: string | null } | null>(null);
  const syncRequestInFlight = useRef(false);

  const localDateKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatInputDateTime = (iso?: string | null) => {
    if (!iso) return '';
    const dt = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };

  const getAppointmentEndDate = (appointment: Partial<Appointment>) => {
    if (appointment.appointment_end) return new Date(appointment.appointment_end);
    return new Date(new Date(appointment.appointment_date || new Date().toISOString()).getTime() + 60 * 60000);
  };

  const getAppointmentDurationMinutes = (appointment: Partial<Appointment>) => {
    if (!appointment.appointment_date) return 60;
    const start = new Date(appointment.appointment_date);
    const end = getAppointmentEndDate(appointment);
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);
    return duration > 0 ? duration : 60;
  };

  const applyDurationToAppointment = (appointment: Partial<Appointment>, durationMinutes: number, nextStartIso?: string) => {
    const appointmentDate = nextStartIso || appointment.appointment_date || new Date().toISOString();
    const start = new Date(appointmentDate);
    const safeDuration = Math.max(15, durationMinutes || 60);
    return {
      ...appointment,
      appointment_date: start.toISOString(),
      appointment_end: new Date(start.getTime() + safeDuration * 60000).toISOString(),
    };
  };

  const isBlockedAppointment = (appointment: Partial<Appointment>) => {
    const service = String(appointment.service_type || '').toLowerCase();
    return !appointment.customer_id && (service.includes('bloque') || service.includes('indispon'));
  };

  const isImportedGoogleCommitment = (appointment: Partial<Appointment>) => {
    return appointment.sync_origin === 'google' && !appointment.customer_id;
  };

  const isGenericGoogleImportNote = (notes?: string | null) => {
    return String(notes || '').trim().toLowerCase() === 'importado do google calendar.';
  };

  const getImportedGoogleCommitmentTitle = (appointment: Partial<Appointment>) => {
    if (!isImportedGoogleCommitment(appointment)) return null;

    const fromService = String(appointment.service_type || '').replace(/^bloqueado\s*-\s*/i, '').trim();
    if (fromService) return fromService;

    const fromNotes = String(appointment.notes || '').trim();
    if (fromNotes && !isGenericGoogleImportNote(fromNotes)) return fromNotes;

    return 'Compromisso do Google';
  };

  const getAppointmentPrimaryText = (appointment: Partial<Appointment>) => {
    const googleTitle = getImportedGoogleCommitmentTitle(appointment);
    if (googleTitle) return googleTitle;
    if (isBlockedAppointment(appointment)) return 'Horario bloqueado';
    return appointment.customer_name || appointment.service_type || 'Agendamento';
  };

  const getAppointmentSecondaryText = (appointment: Partial<Appointment>) => {
    const googleTitle = getImportedGoogleCommitmentTitle(appointment);
    if (googleTitle) {
      const note = String(appointment.notes || '').trim();
      const sourceLabel = appointment.barber_name ? `Google Calendar • ${appointment.barber_name}` : 'Google Calendar';
      return note && !isGenericGoogleImportNote(note) ? `${note}${appointment.barber_name ? ` • ${appointment.barber_name}` : ''}` : sourceLabel;
    }

    if (isBlockedAppointment(appointment)) return appointment.notes || appointment.service_type || 'Indisponivel';
    return `${appointment.service_type || 'Servico'}${appointment.barber_name ? ` • ${appointment.barber_name}` : ''}`;
  };

  const getAppointmentEntityLabel = (appointment: Partial<Appointment>) => {
    const googleTitle = getImportedGoogleCommitmentTitle(appointment);
    if (googleTitle) return googleTitle;
    if (isBlockedAppointment(appointment)) return 'BLOQUEADO';
    return appointment.customer_name || 'Sem cliente';
  };

  const getAppointmentDetailHeading = (appointment: Partial<Appointment>) => {
    const googleTitle = getImportedGoogleCommitmentTitle(appointment);
    if (googleTitle) return googleTitle;
    if (isBlockedAppointment(appointment)) return 'Horario bloqueado';
    return appointment.service_type || 'Sem servico';
  };

  const isGoogleAppointment = (appointment: Partial<Appointment>) => {
    return appointment.sync_origin === 'google' || Boolean(appointment.google_event_id);
  };

  const getSourceLabel = (appointment: Partial<Appointment>) => {
    if (appointment.sync_origin === 'google') return 'Google';
    if (appointment.google_event_id) return 'Sincronizado';
    return 'Local';
  };

  const getStatusLabel = (appointment: Partial<Appointment>) => {
    if (isBlockedAppointment(appointment)) return 'Bloqueado';
    if (appointment.status === 'completed') return 'Concluido';
    if (appointment.status === 'cancelled') return 'Cancelado';
    if (appointment.status === 'confirmed') return 'Confirmado';
    return 'Pendente';
  };

  const getStatusClassName = (appointment: Partial<Appointment>) => {
    if (isBlockedAppointment(appointment)) return 'bg-slate-500/20 text-slate-200';
    if (appointment.status === 'completed') return 'bg-emerald-500/10 text-emerald-400';
    if (appointment.status === 'cancelled') return 'bg-red-500/10 text-red-400';
    if (appointment.status === 'confirmed') return 'bg-blue-500/10 text-blue-400';
    return 'bg-amber-500/10 text-amber-300';
  };

  const getCardClassName = (appointment: Partial<Appointment>) => {
    if (isBlockedAppointment(appointment)) return 'border-slate-400/30 bg-slate-500/10';
    if (appointment.status === 'completed') return 'border-emerald-500/20 bg-emerald-500/10';
    if (appointment.status === 'cancelled') return 'border-red-500/20 bg-red-500/10';
    if (appointment.status === 'confirmed') return 'border-blue-500/20 bg-blue-500/10';
    return 'border-amber-500/20 bg-amber-500/10';
  };

  const formatTimeRange = (appointment: Partial<Appointment>) => {
    if (!appointment.appointment_date) return '--:--';
    const start = new Date(appointment.appointment_date);
    const end = getAppointmentEndDate(appointment);
    const startLabel = start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const endLabel = end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${startLabel} - ${endLabel}`;
  };

  const getMonthGridDays = (month: Date) => {
    const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
    firstDay.setHours(0, 0, 0, 0);
    const startOffset = (firstDay.getDay() + 6) % 7;
    const gridStart = new Date(firstDay);
    gridStart.setDate(firstDay.getDate() - startOffset);

    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      return day;
    });
  };

  const monthGridDays = getMonthGridDays(monthCursor);
  const monthGridStart = new Date(monthGridDays[0]);
  monthGridStart.setHours(0, 0, 0, 0);
  const monthGridEnd = new Date(monthGridDays[monthGridDays.length - 1]);
  monthGridEnd.setHours(23, 59, 59, 999);
  const monthRangeKey = `${monthGridStart.toISOString()}::${monthGridEnd.toISOString()}`;
  const lastSyncLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null;

  const parseJsonResponse = async <T,>(res: Response, fallbackMessage: string) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any)?.error || fallbackMessage);
    return data as T;
  };

  const handleActionError = (fallbackMessage: string, error: any) => {
    const message = String(error?.message || fallbackMessage);
    setCalendarMessage({ type: 'error', message });
    window.alert(message);
  };

  const buildRangeSearchParams = () => {
    const params = new URLSearchParams();
    params.set('start', monthGridStart.toISOString());
    params.set('end', monthGridEnd.toISOString());
    return params.toString();
  };

  const formatSyncMessage = (data: any) => {
    const pushCreated = Number(data?.push?.created || 0);
    const pushUpdated = Number(data?.push?.updated || 0);
    const pushDeleted = Number(data?.push?.deleted || 0);
    const pullCreated = Number(data?.pull?.created || 0);
    const pullUpdated = Number(data?.pull?.updated || 0);
    const pullCancelled = Number(data?.pull?.cancelled || 0);
    const skipped = Number(data?.pull?.skipped || 0);
    const failed = Number(data?.failed || 0);
    const systemToGoogle = pushCreated + pushUpdated + pushDeleted;
    const googleToSystem = pullCreated + pullUpdated + pullCancelled;
    const firstIssue = Array.isArray(data?.issues) ? String(data.issues[0] || '').trim() : '';
    const previewEntry = Array.isArray(data?.preview) ? data.preview[0] : null;
    const previewSummary = String(previewEntry?.summary || '').trim();
    const previewStart = previewEntry?.start
      ? new Date(previewEntry.start).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : '';

    if (!systemToGoogle && !googleToSystem && !failed) {
      return `Nenhuma alteracao pendente neste periodo. Google leu ${Number(data?.total || 0)} evento(s) do calendario ${String(data?.calendarId || 'primary')}.${skipped ? ` Ignorados: ${skipped}.` : ''}${previewSummary ? ` Exemplo: ${previewSummary}${previewStart ? ` em ${previewStart}` : ''}.` : ''}`;
    }

    return `Sync concluida. Sistema -> Google: ${systemToGoogle}. Google -> Sistema: ${googleToSystem}. Google leu ${Number(data?.total || 0)} evento(s) do calendario ${String(data?.calendarId || 'primary')}.${skipped ? ` Ignorados: ${skipped}.` : ''}${failed ? ` Falhas: ${failed}.` : ''}${failed && firstIssue ? ` ${firstIssue}` : ''}${previewSummary ? ` Exemplo: ${previewSummary}${previewStart ? ` em ${previewStart}` : ''}.` : ''}`;
  };

  const fetchReferenceData = async () => {
    const [customersRes, barbersRes, integrationRes] = await Promise.all([
      fetch('/api/customers'),
      fetch('/api/barbers'),
      fetch('/api/integrations/status')
    ]);

    const [customersData, barbersData, integrationData] = await Promise.all([
      parseJsonResponse<Customer[]>(customersRes, 'Falha ao carregar clientes.'),
      parseJsonResponse<Barber[]>(barbersRes, 'Falha ao carregar barbeiros.'),
      parseJsonResponse<any>(integrationRes, 'Falha ao validar a integracao do Google.')
    ]);

    setCustomers(Array.isArray(customersData) ? customersData : []);
    setBarbers(Array.isArray(barbersData) ? barbersData : []);
    const connected = Boolean(integrationData?.google?.connected);
    setGoogleConnected(connected);
    setAppointmentsSyncInfo(integrationData?.appointmentsSync || null);
    return connected;
  };

  const fetchAppointmentsForVisibleMonth = async () => {
    const res = await fetch(`/api/appointments?${buildRangeSearchParams()}`);
    const aptsData = await parseJsonResponse<Appointment[]>(res, 'Falha ao carregar a agenda do mes.');

    const sortedAppointments = Array.isArray(aptsData)
      ? [...aptsData].sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())
      : [];

    setAppointments(sortedAppointments);
    return sortedAppointments;
  };

  const reconcileGoogleRange = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!googleConnected || syncRequestInFlight.current) return null;

    syncRequestInFlight.current = true;
    if (!silent) {
      setSyncingGoogle(true);
      setCalendarMessage({ type: 'info', message: 'Reconciliando a agenda com o Google Calendar...' });
    }

    try {
      const res = await fetch('/api/calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: monthGridStart.toISOString(),
          end: monthGridEnd.toISOString(),
        }),
      });
      const data = await parseJsonResponse<any>(res, 'Falha ao sincronizar com o Google Calendar.');
      setLastSyncedAt(new Date().toISOString());

      if (data?.failed) {
        setCalendarMessage({
          type: 'error',
          message: formatSyncMessage(data),
        });
      } else if (!silent) {
        setCalendarMessage({
          type: 'success',
          message: formatSyncMessage(data),
        });
      }

      return data;
    } catch (error: any) {
      if (String(error?.message || '').includes('Google Calendar nao conectado')) {
        setGoogleConnected(false);
      }
      if (!silent) {
        setCalendarMessage({ type: 'error', message: `Falha ao sincronizar agenda: ${error.message}` });
      } else {
        console.error('Falha ao reconciliar agenda mensal com o Google Calendar:', error);
      }
      return null;
    } finally {
      if (!silent) {
        setSyncingGoogle(false);
      }
      syncRequestInFlight.current = false;
    }
  };

  useEffect(() => {
    void fetchReferenceData().catch((error) => {
      console.error('Falha ao carregar dados auxiliares da agenda:', error);
      setCalendarMessage({ type: 'error', message: `Falha ao iniciar a agenda: ${error.message}` });
    });
  }, []);

  useEffect(() => {
    let active = true;

    const loadMonth = async () => {
      try {
        await fetchAppointmentsForVisibleMonth();

        if (!googleConnected) return;

        const syncData = await reconcileGoogleRange({ silent: true });
        if (active && syncData) {
          await fetchAppointmentsForVisibleMonth();
        }
      } catch (error: any) {
        if (!active) return;
        console.error('Falha ao carregar agenda mensal:', error);
        setCalendarMessage({ type: 'error', message: `Falha ao carregar agenda: ${error.message}` });
      }
    };

    void loadMonth();

    return () => {
      active = false;
    };
  }, [monthRangeKey, googleConnected]);

  useEffect(() => {
    if (!googleConnected) return;

    const intervalId = window.setInterval(async () => {
      const syncData = await reconcileGoogleRange({ silent: true });
      if (syncData) {
        await fetchAppointmentsForVisibleMonth();
      }
    }, 90 * 1000);

    return () => window.clearInterval(intervalId);
  }, [googleConnected, monthRangeKey]);

  useEffect(() => {
    if (!calendarMessage) return;
    const timeout = window.setTimeout(() => setCalendarMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [calendarMessage]);

  const appointmentsByDay = appointments.reduce<Record<string, Appointment[]>>((acc, appointment) => {
    const key = localDateKey(new Date(appointment.appointment_date));
    acc[key] = acc[key] || [];
    acc[key].push(appointment);
    return acc;
  }, {});

  const selectedDayAppointments = selectedDay
    ? [...(appointmentsByDay[localDateKey(selectedDay)] || [])].sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())
    : [];

  const monthAppointments = appointments.filter((appointment) => {
    const date = new Date(appointment.appointment_date);
    return date.getMonth() === monthCursor.getMonth() && date.getFullYear() === monthCursor.getFullYear();
  });

  const monthStats = {
    total: monthAppointments.length,
    blocked: monthAppointments.filter((appointment) => isBlockedAppointment(appointment)).length,
    pending: monthAppointments.filter((appointment) => appointment.status === 'pending').length,
    google: monthAppointments.filter((appointment) => isGoogleAppointment(appointment)).length,
    occupiedDays: new Set(monthAppointments.map((appointment) => localDateKey(new Date(appointment.appointment_date)))).size,
  };

  const handleSave = async () => {
    if (!editing?.appointment_date) {
      alert('Defina a data e hora do agendamento.');
      return;
    }

    try {
      const payload = applyDurationToAppointment(editing, getAppointmentDurationMinutes(editing));
      const method = editing.id ? 'PUT' : 'POST';
      const url = editing.id ? `/api/appointments/${editing.id}` : '/api/appointments';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await parseJsonResponse(res, 'Falha ao salvar agendamento.');

      setEditing(null);
      setSelectedAppointment(null);
      await fetchAppointmentsForVisibleMonth();
    } catch (error: any) {
      handleActionError('Falha ao salvar agendamento.', error);
    }
  };

  const updateAppointment = async (id: number, payload: Partial<Appointment>) => {
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await parseJsonResponse(res, 'Falha ao atualizar agendamento.');
      setSelectedAppointment(null);
      await fetchAppointmentsForVisibleMonth();
    } catch (error: any) {
      handleActionError('Falha ao atualizar agendamento.', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja realmente cancelar este agendamento?')) return;
    try {
      const res = await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
      await parseJsonResponse(res, 'Falha ao remover agendamento.');
      setSelectedAppointment(null);
      await fetchAppointmentsForVisibleMonth();
    } catch (error: any) {
      handleActionError('Falha ao remover agendamento.', error);
    }
  };

  const handleUnblock = async (id: number) => {
    if (!confirm('Deseja desbloquear este horario?')) return;
    try {
      const res = await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
      await parseJsonResponse(res, 'Falha ao desbloquear horario.');
      setSelectedAppointment(null);
      await fetchAppointmentsForVisibleMonth();
    } catch (error: any) {
      handleActionError('Falha ao desbloquear horario.', error);
    }
  };

  const handleCreateBlock = async () => {
    if (!blocking?.barber_id || !blocking.date || !blocking.time) {
      alert('Preencha barbeiro, data e horario para bloquear.');
      return;
    }

    const start = new Date(`${blocking.date}T${blocking.time}:00`);
    const durationMinutes = Math.max(15, Number(blocking.duration_minutes || '60'));
    const end = new Date(start.getTime() + durationMinutes * 60000);

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: null,
          barber_id: Number(blocking.barber_id),
          service_type: 'BLOQUEADO',
          appointment_date: start.toISOString(),
          appointment_end: end.toISOString(),
          notes: blocking.notes || 'Bloqueio manual de agenda.',
          status: 'confirmed'
        })
      });
      await parseJsonResponse(res, 'Falha ao criar bloqueio de agenda.');

      setBlocking(null);
      await fetchAppointmentsForVisibleMonth();
    } catch (error: any) {
      handleActionError('Falha ao criar bloqueio de agenda.', error);
    }
  };

  const moveAppointment = async (appointment: Appointment, deltaMinutes: number) => {
    const start = new Date(appointment.appointment_date);
    const durationMinutes = getAppointmentDurationMinutes(appointment);
    const movedStart = new Date(start.getTime() + deltaMinutes * 60000);
    const movedEnd = new Date(movedStart.getTime() + durationMinutes * 60000);

    await updateAppointment(appointment.id, {
      appointment_date: movedStart.toISOString(),
      appointment_end: movedEnd.toISOString(),
    });
  };

  const sendWhatsAppReminder = (appointment: Appointment) => {
    if (!appointment.customer_phone) {
      alert('Cliente sem telefone cadastrado.');
      return;
    }
    const dateStr = new Date(appointment.appointment_date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const text = `Ola ${appointment.customer_name}! Passando para lembrar do seu agendamento na MA BEARD STYLE.\n\nServico: ${appointment.service_type}\nBarbeiro: ${appointment.barber_name}\nData/Hora: ${dateStr}\n\nTe esperamos la!`;
    const url = `https://wa.me/55${appointment.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const openNewAppointmentForDay = (day: Date) => {
    const slot = new Date(day);
    slot.setHours(9, 0, 0, 0);
    setEditing({
      customer_id: null,
      barber_id: null,
      service_type: '',
      appointment_date: slot.toISOString(),
      appointment_end: new Date(slot.getTime() + 60 * 60000).toISOString(),
      notes: '',
      status: 'pending',
      sync_origin: 'local',
    });
  };

  const handleGoogleReconcile = async () => {
    const syncData = await reconcileGoogleRange();
    if (syncData) {
      await fetchAppointmentsForVisibleMonth();
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h3 className="text-xl font-medium mb-1">Agenda de Alto Nivel</h3>
          <p className="text-sm text-gray-500">Visualize o mes inteiro, abra um dia para detalhar e deixe a conciliacao com o Google Calendar rodando em segundo plano.</p>
          <p className="mt-2 text-xs text-gray-400">
            {googleConnected
              ? `Google conectado. Sincronizacao automatica ativa${lastSyncLabel ? `. Ultima conciliacao: ${lastSyncLabel}` : '.'}`
              : 'Google desconectado. A agenda segue local ate a integracao ser conectada.'}
          </p>
          {appointmentsSyncInfo?.supabaseHost && (
            <p className="mt-1 text-xs text-gray-500">
              Banco ativo no backend: {appointmentsSyncInfo.supabaseHost}
            </p>
          )}
          {googleConnected && (
            <p className="mt-1 text-xs text-gray-500">
              A conciliacao atual le apenas o calendario principal (`primary`) da conta conectada.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleGoogleReconcile}
            disabled={syncingGoogle || !googleConnected}
            className="bg-white/10 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-white/20 transition-all border border-white/15 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <RefreshCw className={cn('w-4 h-4', syncingGoogle && 'animate-spin')} /> Reconciliar Google
          </button>
          <button
            onClick={() => setBlocking({ barber_id: '', date: localDateKey(new Date()), time: '12:00', duration_minutes: '60', notes: '' })}
            className="bg-white/10 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-white/20 transition-all border border-white/15"
          >
            <Lock className="w-4 h-4" /> Bloquear Horario
          </button>
          <button
            onClick={() => openNewAppointmentForDay(new Date())}
            className="bg-white text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-200 transition-all"
          >
            <Plus className="w-4 h-4" /> Novo Agendamento
          </button>
        </div>
      </div>

      {calendarMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'rounded-2xl border px-5 py-4 text-sm',
            calendarMessage.type === 'success' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100',
            calendarMessage.type === 'error' && 'border-red-500/20 bg-red-500/10 text-red-100',
            calendarMessage.type === 'info' && 'border-blue-500/20 bg-blue-500/10 text-blue-100',
          )}
        >
          {calendarMessage.message}
        </motion.div>
      )}

      {appointmentsSyncInfo && !appointmentsSyncInfo.ready && appointmentsSyncInfo.message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-100"
        >
          {appointmentsSyncInfo.message}
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="rounded-[2rem] border border-white/10 bg-zinc-900/50 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-gray-500">Mes</p>
          <p className="mt-3 text-2xl font-semibold text-white">{monthCursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-zinc-900/50 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-gray-500">Agendamentos</p>
          <p className="mt-3 text-3xl font-semibold text-white">{monthStats.total}</p>
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-zinc-900/50 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-gray-500">Dias Ocupados</p>
          <p className="mt-3 text-3xl font-semibold text-white">{monthStats.occupiedDays}</p>
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-zinc-900/50 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-gray-500">Pendentes</p>
          <p className="mt-3 text-3xl font-semibold text-amber-300">{monthStats.pending}</p>
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-zinc-900/50 p-5">
          <p className="text-[10px] uppercase tracking-[0.24em] text-gray-500">Google / Bloqueios</p>
          <p className="mt-3 text-3xl font-semibold text-white">{monthStats.google} <span className="text-sm text-gray-500">/ {monthStats.blocked}</span></p>
        </div>
      </div>

      <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div>
            <h4 className="text-lg font-medium text-white">Visao Mensal</h4>
            <p className="text-sm text-gray-500">Clique em um dia para abrir a agenda detalhada ou use o botao + para criar rapido.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              className="px-4 py-2 rounded-xl bg-white/10 text-sm font-bold hover:bg-white/20 transition-colors"
            >
              Mes Anterior
            </button>
            <button
              onClick={() => {
                const now = new Date();
                now.setDate(1);
                now.setHours(0, 0, 0, 0);
                setMonthCursor(now);
              }}
              className="px-4 py-2 rounded-xl bg-white text-black text-sm font-bold hover:bg-gray-200 transition-colors"
            >
              Mes Atual
            </button>
            <button
              onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              className="px-4 py-2 rounded-xl bg-white/10 text-sm font-bold hover:bg-white/20 transition-colors"
            >
              Proximo Mes
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-3 mb-3">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map((label) => (
            <div key={label} className="px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-gray-500">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
          {monthGridDays.map((day) => {
            const dayKey = localDateKey(day);
            const dayAppointments = (appointmentsByDay[dayKey] || []).slice().sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime());
            const isToday = day.toDateString() === new Date().toDateString();
            const isCurrentMonth = day.getMonth() === monthCursor.getMonth();
            const previewAppointments = dayAppointments.slice(0, 3);
            const hiddenCount = Math.max(0, dayAppointments.length - previewAppointments.length);
            const dayGoogleCount = dayAppointments.filter((appointment) => isGoogleAppointment(appointment)).length;

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'rounded-[1.75rem] border min-h-[220px] p-3 transition-colors',
                  isToday ? 'border-white/30 bg-white/[0.06]' : 'border-white/10 bg-black/30',
                  !isCurrentMonth && 'opacity-45'
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <button
                    onClick={() => setSelectedDay(day)}
                    className="text-left hover:opacity-80 transition-opacity"
                  >
                    <p className="text-[10px] uppercase tracking-[0.24em] text-gray-500">
                      {day.toLocaleDateString('pt-BR', { weekday: 'short' })}
                    </p>
                    <p className="text-lg font-semibold text-white">
                      {day.toLocaleDateString('pt-BR', { day: '2-digit' })}
                    </p>
                  </button>
                  <button
                    onClick={() => openNewAppointmentForDay(day)}
                    className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                    title="Novo agendamento"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                  <span className="px-2 py-1 rounded-full bg-white/10 text-[10px] font-bold uppercase tracking-wide text-white">
                    {dayAppointments.length} item(ns)
                  </span>
                  {dayGoogleCount > 0 && (
                    <span className="px-2 py-1 rounded-full bg-blue-500/10 text-[10px] font-bold uppercase tracking-wide text-blue-300">
                      {dayGoogleCount} Google
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {previewAppointments.map((appointment) => (
                    <button
                      key={appointment.id}
                      onClick={() => setSelectedAppointment(appointment)}
                      className={cn('w-full text-left p-3 rounded-2xl border transition-colors', getCardClassName(appointment))}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-white">{formatTimeRange(appointment)}</p>
                          <p className="mt-1 text-xs text-gray-200 truncate">
                            {getAppointmentPrimaryText(appointment)}
                          </p>
                          <p className="text-[11px] text-gray-500 truncate">
                            {getAppointmentSecondaryText(appointment)}
                          </p>
                        </div>
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">{getSourceLabel(appointment)}</span>
                      </div>
                    </button>
                  ))}

                  {hiddenCount > 0 && (
                    <button
                      onClick={() => setSelectedDay(day)}
                      className="w-full py-2 rounded-xl border border-dashed border-white/10 text-[11px] text-gray-400 hover:text-white hover:border-white/20 transition-colors"
                    >
                      +{hiddenCount} item(ns)
                    </button>
                  )}

                  {dayAppointments.length === 0 && (
                    <button
                      onClick={() => setSelectedDay(day)}
                      className="w-full py-6 rounded-2xl border border-dashed border-white/10 text-[11px] text-gray-500 hover:text-white hover:border-white/20 transition-colors"
                    >
                      Dia livre. Abrir agenda.
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] overflow-hidden">
        <div className="px-8 py-6 border-b border-white/5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h4 className="text-lg font-medium text-white">Lista do Mes</h4>
            <p className="text-sm text-gray-500">Tudo o que esta previsto para {monthCursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}.</p>
          </div>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-gray-500 border-b border-white/5">
              <th className="px-8 py-6 font-medium">Data / Janela</th>
              <th className="px-8 py-6 font-medium">Cliente / Evento</th>
              <th className="px-8 py-6 font-medium">Barbeiro</th>
              <th className="px-8 py-6 font-medium">Origem</th>
              <th className="px-8 py-6 font-medium">Status</th>
              <th className="px-8 py-6 font-medium text-right">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {monthAppointments.map((appointment) => (
              <tr key={appointment.id} className="text-sm text-gray-300 hover:bg-white/5 transition-colors group">
                <td className="px-8 py-6">
                  <p className="font-medium text-white">{new Date(appointment.appointment_date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</p>
                  <p className="text-xs text-gray-500">{formatTimeRange(appointment)}</p>
                </td>
                <td className="px-8 py-6">
                  <p className="text-white">{getAppointmentEntityLabel(appointment)}</p>
                  <p className="text-xs text-gray-500">{getAppointmentSecondaryText(appointment)}</p>
                </td>
                <td className="px-8 py-6">{appointment.barber_name || 'Nao vinculado'}</td>
                <td className="px-8 py-6">
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold uppercase', isGoogleAppointment(appointment) ? 'bg-blue-500/10 text-blue-300' : 'bg-white/10 text-gray-300')}>
                    {getSourceLabel(appointment)}
                  </span>
                </td>
                <td className="px-8 py-6">
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold uppercase', getStatusClassName(appointment))}>
                    {getStatusLabel(appointment)}
                  </span>
                </td>
                <td className="px-8 py-6 text-right">
                  <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    {!isBlockedAppointment(appointment) && (
                      <button onClick={() => sendWhatsAppReminder(appointment)} className="p-2 hover:bg-emerald-500/10 rounded-lg text-gray-400 hover:text-emerald-500 transition-colors" title="Lembrete WhatsApp">
                        <MessageCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => setSelectedAppointment(appointment)} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors" title="Detalhes">
                      <Search className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditing(appointment)} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors" title="Editar">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => isBlockedAppointment(appointment) ? handleUnblock(appointment.id) : handleDelete(appointment.id)} className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500 transition-colors" title={isBlockedAppointment(appointment) ? 'Desbloquear' : 'Excluir'}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {monthAppointments.length === 0 && (
              <tr><td colSpan={6} className="px-8 py-12 text-center text-gray-500">Nenhum agendamento encontrado neste mes.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-xl shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xl font-medium text-white">Detalhes do Agendamento</h3>
                <p className="text-sm text-gray-500">Reveja horario, origem e sincronizacao.</p>
              </div>
              <span className={cn('text-[10px] px-3 py-1 rounded-full font-bold uppercase', getStatusClassName(selectedAppointment))}>
                {getStatusLabel(selectedAppointment)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-6">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-gray-500 mb-1">Cliente / Evento</p>
                <p className="text-white">{getAppointmentEntityLabel(selectedAppointment)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-gray-500 mb-1">Barbeiro</p>
                <p className="text-white">{selectedAppointment.barber_name || 'Nao vinculado'}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-gray-500 mb-1">Janela</p>
                <p className="text-white">{new Date(selectedAppointment.appointment_date).toLocaleDateString('pt-BR', { dateStyle: 'short' })}</p>
                <p className="text-xs text-gray-500 mt-1">{formatTimeRange(selectedAppointment)}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-gray-500 mb-1">Origem</p>
                <p className="text-white">{getSourceLabel(selectedAppointment)}</p>
                {selectedAppointment.google_event_id && <p className="text-xs text-gray-500 mt-1">Event ID: {selectedAppointment.google_event_id}</p>}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4 mb-6">
              <p className="text-gray-500 mb-1">Servico / Observacoes</p>
              <p className="text-white">{getAppointmentDetailHeading(selectedAppointment)}</p>
              {selectedAppointment.notes && !isGenericGoogleImportNote(selectedAppointment.notes) && (
                <p className="text-sm text-gray-400 mt-2">{selectedAppointment.notes}</p>
              )}
            </div>

            {!isBlockedAppointment(selectedAppointment) && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button onClick={() => moveAppointment(selectedAppointment, -30)} className="py-3 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold transition-colors">Antecipar 30 min</button>
                <button onClick={() => moveAppointment(selectedAppointment, 30)} className="py-3 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold transition-colors">Adiar 30 min</button>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button onClick={() => { setEditing(selectedAppointment); setSelectedAppointment(null); }} className="flex-1 py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-200 transition-colors">Editar</button>
              <button onClick={() => isBlockedAppointment(selectedAppointment) ? handleUnblock(selectedAppointment.id) : updateAppointment(selectedAppointment.id, { status: 'cancelled' })} className="flex-1 py-3 rounded-xl bg-red-500/90 text-white font-bold hover:bg-red-500 transition-colors">
                {isBlockedAppointment(selectedAppointment) ? 'Desbloquear' : 'Cancelar Agendamento'}
              </button>
              <button onClick={() => setSelectedAppointment(null)} className="px-4 py-3 rounded-xl bg-white/10 font-bold hover:bg-white/20 transition-colors">Fechar</button>
            </div>
          </motion.div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-xl shadow-2xl">
            <h3 className="text-xl font-medium mb-6">{editing.id ? 'Editar Agendamento' : 'Novo Agendamento'}</h3>
            <div className="space-y-4">
              {!isBlockedAppointment(editing) && (
                <select
                  value={editing.customer_id ?? ''}
                  onChange={(e) => setEditing({ ...editing, customer_id: e.target.value ? Number(e.target.value) : null })}
                  className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm"
                >
                  <option value="">Selecione o Cliente</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              )}
              <select
                value={editing.barber_id ?? ''}
                onChange={(e) => setEditing({ ...editing, barber_id: e.target.value ? Number(e.target.value) : null })}
                className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm"
              >
                <option value="">Selecione o Barbeiro</option>
                {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
              </select>
              <input
                placeholder={isBlockedAppointment(editing) ? 'Descricao do bloqueio' : 'Tipo de Servico (ex: Corte e Barba)'}
                value={editing.service_type || ''}
                onChange={(e) => setEditing({ ...editing, service_type: e.target.value })}
                className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="datetime-local"
                  value={formatInputDateTime(editing.appointment_date)}
                  onChange={(e) => setEditing(applyDurationToAppointment(editing, getAppointmentDurationMinutes(editing), new Date(e.target.value).toISOString()))}
                  className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm"
                />
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={getAppointmentDurationMinutes(editing)}
                  onChange={(e) => setEditing(applyDurationToAppointment(editing, Number(e.target.value) || 60))}
                  className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm"
                  placeholder="Duracao (min)"
                />
              </div>
              <textarea
                placeholder="Observacoes internas"
                value={editing.notes || ''}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                className="w-full min-h-[110px] bg-black border border-white/10 rounded-xl p-4 text-sm resize-none"
              />
              {editing.id && (
                <select value={editing.status || 'pending'} onChange={(e) => setEditing({ ...editing, status: e.target.value })} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm">
                  <option value="pending">Pendente</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="completed">Concluido</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              )}
              <div className="flex gap-4 pt-4">
                <button onClick={() => setEditing(null)} className="flex-1 py-4 rounded-xl bg-white/5 font-bold">Cancelar</button>
                <button onClick={handleSave} className="flex-1 py-4 rounded-xl bg-white text-black font-bold">Salvar</button>
              </div>
              {editing.id && (
                <button
                  onClick={async () => {
                    if (isBlockedAppointment(editing)) await handleUnblock(Number(editing.id));
                    else await handleDelete(Number(editing.id));
                    setEditing(null);
                  }}
                  className="w-full py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 font-bold hover:bg-red-500/30 transition-colors"
                >
                  {isBlockedAppointment(editing) ? 'Desbloquear Horario' : 'Deletar / Cancelar Agendamento'}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {blocking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-medium mb-6 flex items-center gap-2"><Lock className="w-5 h-5" /> Bloquear Horario</h3>
            <div className="space-y-4">
              <select value={blocking.barber_id} onChange={(e) => setBlocking({ ...blocking, barber_id: e.target.value })} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm">
                <option value="">Selecione o Barbeiro</option>
                {barbers.map((barber) => <option key={barber.id} value={barber.id}>{barber.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-4">
                <input type="date" value={blocking.date} onChange={(e) => setBlocking({ ...blocking, date: e.target.value })} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
                <input type="time" value={blocking.time} onChange={(e) => setBlocking({ ...blocking, time: e.target.value })} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
              </div>
              <input
                type="number"
                min={15}
                step={15}
                value={blocking.duration_minutes}
                onChange={(e) => setBlocking({ ...blocking, duration_minutes: e.target.value })}
                className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm"
                placeholder="Duracao do bloqueio (min)"
              />
              <textarea
                value={blocking.notes}
                onChange={(e) => setBlocking({ ...blocking, notes: e.target.value })}
                className="w-full min-h-[110px] bg-black border border-white/10 rounded-xl p-4 text-sm resize-none"
                placeholder="Motivo do bloqueio"
              />
              <div className="flex gap-4 pt-2">
                <button onClick={() => setBlocking(null)} className="flex-1 py-4 rounded-xl bg-white/5 font-bold">Cancelar</button>
                <button onClick={handleCreateBlock} className="flex-1 py-4 rounded-xl bg-white text-black font-bold">Salvar Bloqueio</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-3xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xl font-medium">Agenda do Dia</h3>
                <p className="text-sm text-gray-400">
                  {selectedDay.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    openNewAppointmentForDay(selectedDay);
                    setSelectedDay(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-white text-black text-sm font-bold hover:bg-gray-200 transition-colors"
                >
                  <span className="inline-flex items-center gap-2"><Plus className="w-4 h-4" />Novo</span>
                </button>
                <button onClick={() => setSelectedDay(null)} className="px-4 py-2 rounded-xl bg-white/10 text-sm font-bold hover:bg-white/20 transition-colors">Fechar</button>
              </div>
            </div>

            <div className="space-y-3">
              {selectedDayAppointments.map((appointment) => (
                <button
                  key={appointment.id}
                  onClick={() => {
                    setSelectedAppointment(appointment);
                    setSelectedDay(null);
                  }}
                  className={cn('w-full text-left p-4 rounded-2xl border transition-colors', getCardClassName(appointment))}
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-white">{formatTimeRange(appointment)}</p>
                      <p className="mt-1 text-sm text-gray-200">{getAppointmentPrimaryText(appointment)}</p>
                      <p className="text-xs text-gray-500">{getAppointmentSecondaryText(appointment)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold uppercase', getStatusClassName(appointment))}>{getStatusLabel(appointment)}</span>
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold uppercase', isGoogleAppointment(appointment) ? 'bg-blue-500/10 text-blue-300' : 'bg-white/10 text-gray-300')}>{getSourceLabel(appointment)}</span>
                    </div>
                  </div>
                </button>
              ))}

              {selectedDayAppointments.length === 0 && (
                <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
                  <p className="text-gray-500 mb-3">Nenhum agendamento neste dia.</p>
                  <button
                    onClick={() => {
                      openNewAppointmentForDay(selectedDay);
                      setSelectedDay(null);
                    }}
                    className="px-5 py-2 rounded-xl bg-white text-black text-sm font-bold hover:bg-gray-200 transition-colors"
                  >
                    Criar Agendamento
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
