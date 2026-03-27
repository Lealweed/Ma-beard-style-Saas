import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import dotenv from "dotenv";
import { google } from "googleapis";
import path from "path";

dotenv.config();

const getEnvValue = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return "";
};

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2025-01-27.acacia" as any,
    })
  : null;

if (!stripe) {
  console.warn("AVISO: STRIPE_SECRET_KEY não encontrada. Checkout Stripe desabilitado até configurar a chave.");
} else {
  stripe.balance.retrieve()
    .then(() => console.log("Stripe conectada e validada com sucesso."))
    .catch((err) => console.error("ERRO: STRIPE_SECRET_KEY parece inválida ou expirada:", err.message));
}

const GOOGLE_TOKEN_CONFIG_KEY = "google_calendar_tokens";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";

const getGoogleRedirectUriValue = () =>
  process.env.GOOGLE_REDIRECT_URI || (process.env.APP_URL ? `${process.env.APP_URL}/api/auth/google/callback` : "");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  getGoogleRedirectUriValue() || undefined
);

const hasGoogleCalendarSecrets = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && getGoogleRedirectUriValue());

// Helper to get redirect URI for display
const getGoogleRedirectUri = () => {
  return process.env.GOOGLE_REDIRECT_URI || (process.env.APP_URL ? `${process.env.APP_URL}/api/auth/google/callback` : "URL não configurada (defina APP_URL)");
};

const supabaseUrl = getEnvValue("SUPABASE_URL", "VITE_SUPABASE_URL");
const supabaseKey = getEnvValue("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;

if (!isSupabaseConfigured) {
  console.warn("AVISO: SUPABASE_URL/SUPABASE_ANON_KEY não encontrados. APIs que dependem do Supabase falharão até configurar os secrets.");
}

const isGoogleNotFoundError = (error: any) => {
  const status = error?.code || error?.response?.status;
  const message = String(error?.message || "");
  return status === 404 || message.includes("Not Found");
};

const getStoredGoogleTokens = async (): Promise<Record<string, any> | null> => {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("config")
    .select("value")
    .eq("key", GOOGLE_TOKEN_CONFIG_KEY)
    .maybeSingle();

  if (error) throw error;
  if (!data?.value) return null;

  try {
    return JSON.parse(data.value);
  } catch (_error) {
    throw new Error("Os tokens armazenados do Google Calendar estao invalidos.");
  }
};

const saveGoogleTokens = async (tokens: Record<string, any>) => {
  if (!supabase || !tokens || Object.keys(tokens).length === 0) return null;

  const currentTokens = (await getStoredGoogleTokens()) || {};
  const mergedTokens = { ...currentTokens, ...tokens };

  if (currentTokens.refresh_token && !mergedTokens.refresh_token) {
    mergedTokens.refresh_token = currentTokens.refresh_token;
  }

  const { error } = await supabase
    .from("config")
    .upsert({ key: GOOGLE_TOKEN_CONFIG_KEY, value: JSON.stringify(mergedTokens) }, { onConflict: "key" });

  if (error) throw error;
  return mergedTokens;
};

const clearStoredGoogleTokens = async () => {
  if (!supabase) return;

  const { error } = await supabase
    .from("config")
    .delete()
    .eq("key", GOOGLE_TOKEN_CONFIG_KEY);

  if (error) throw error;
};

oauth2Client.on("tokens", (tokens) => {
  saveGoogleTokens(tokens as Record<string, any>).catch((error) => {
    console.error("Erro ao persistir refresh/access token do Google Calendar:", error);
  });
});

const getGoogleCalendarClient = async ({ validateConnection = false }: { validateConnection?: boolean } = {}) => {
  if (!hasGoogleCalendarSecrets()) {
    throw new Error("Credenciais do Google Calendar nao configuradas no servidor.");
  }

  const tokens = await getStoredGoogleTokens();
  if (!tokens) return null;

  oauth2Client.setCredentials(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  if (validateConnection) {
    await calendar.events.list({
      calendarId: "primary",
      maxResults: 1,
      singleEvents: true,
      timeMin: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  return { calendar, tokens };
};

const getAppointmentDurationMinutes = async () => {
  if (!supabase) return 60;

  const { data } = await supabase
    .from("config")
    .select("value")
    .eq("key", "booking_slot_minutes")
    .maybeSingle();

  const duration = Number(data?.value || DEFAULT_SYSTEM_SETTINGS.booking_slot_minutes);
  if (!Number.isFinite(duration)) return 60;
  return Math.max(15, duration);
};

const isBlockedAppointment = (appointment: any) => {
  const serviceType = String(appointment?.service_type || "").toLowerCase();
  return !appointment?.customer_id && (serviceType.includes("bloque") || serviceType.includes("indispon"));
};

const GOOGLE_CALENDAR_ID = "primary";
const GOOGLE_SYNC_SOURCE = "ma-beard-style";
const GOOGLE_SYNC_TOLERANCE_MS = 5000;
const GOOGLE_SYNC_LOOKBACK_DAYS = 45;
const GOOGLE_SYNC_LOOKAHEAD_DAYS = 120;
const GOOGLE_BACKGROUND_SYNC_INTERVAL_MS = 2 * 60 * 1000;
const REQUIRED_APPOINTMENT_SYNC_COLUMNS = [
  "appointment_end",
  "notes",
  "sync_origin",
  "google_calendar_id",
  "google_last_modified",
  "sync_last_synced_at",
] as const;

const getSupabaseHostLabel = () => {
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).host;
  } catch (_error) {
    return supabaseUrl;
  }
};

let googleBackgroundSyncTimer: NodeJS.Timeout | null = null;
let googleBackgroundSyncRunning = false;

const toValidDate = (value: any) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60 * 1000);

const appointmentColumnExistsCache = new Map<string, boolean>();

const hasAppointmentColumn = async (column: string) => {
  if (!supabase) return false;

  const cached = appointmentColumnExistsCache.get(column);
  if (cached !== undefined) return cached;

  const { error } = await supabase
    .from("appointments")
    .select(column)
    .limit(1);

  if (!error) {
    appointmentColumnExistsCache.set(column, true);
    return true;
  }

  const message = String(error?.message || "").toLowerCase();
  if (
    message.includes(column.toLowerCase()) &&
    (
      message.includes("does not exist") ||
      message.includes("could not find the") ||
      message.includes("schema cache")
    )
  ) {
    appointmentColumnExistsCache.set(column, false);
    return false;
  }

  throw error;
};

const withLegacyAppointmentTimeColumns = async (payload: Record<string, any>) => {
  if (!payload) return payload;

  const hasAppointmentDate = Object.prototype.hasOwnProperty.call(payload, "appointment_date");
  const hasAppointmentEnd = Object.prototype.hasOwnProperty.call(payload, "appointment_end");

  if (!hasAppointmentDate && !hasAppointmentEnd) {
    return payload;
  }

  const [hasStartsAt, hasEndsAt] = await Promise.all([
    hasAppointmentDate ? hasAppointmentColumn("starts_at") : Promise.resolve(false),
    hasAppointmentEnd ? hasAppointmentColumn("ends_at") : Promise.resolve(false),
  ]);

  return {
    ...payload,
    ...(hasStartsAt ? { starts_at: payload.appointment_date } : {}),
    ...(hasEndsAt ? { ends_at: payload.appointment_end } : {}),
  };
};

const normalizeLegacyNumericId = (value: any) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
};

const getAppointmentCustomerLookupId = (appointment: any) =>
  normalizeLegacyNumericId(appointment?.customer_id ?? appointment?.client_id);

const getAppointmentBarberLookupId = (appointment: any) =>
  normalizeLegacyNumericId(appointment?.barber_id ?? appointment?.professional_id);

const hydrateAppointmentsDisplayRelations = async (appointments: any[]) => {
  if (!supabase || !appointments?.length) return appointments || [];

  const customerIds = Array.from(
    new Set(
      appointments
        .map((appointment) => getAppointmentCustomerLookupId(appointment))
        .filter((id): id is number => id !== null)
    )
  );

  const barberIds = Array.from(
    new Set(
      appointments
        .map((appointment) => getAppointmentBarberLookupId(appointment))
        .filter((id): id is number => id !== null)
    )
  );

  const [customersResult, barbersResult] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name, phone").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    barberIds.length
      ? supabase.from("barbers").select("id, name").in("id", barberIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (customersResult.error) throw customersResult.error;
  if (barbersResult.error) throw barbersResult.error;

  const customersById = new Map((customersResult.data || []).map((customer: any) => [Number(customer.id), customer]));
  const barbersById = new Map((barbersResult.data || []).map((barber: any) => [Number(barber.id), barber]));

  return appointments.map((appointment) => {
    const customer = customersById.get(getAppointmentCustomerLookupId(appointment) || -1) || null;
    const barber = barbersById.get(getAppointmentBarberLookupId(appointment) || -1) || null;

    return {
      ...appointment,
      customers: customer
        ? { ...(appointment?.customers || {}), name: customer.name, phone: customer.phone }
        : appointment?.customers || null,
      barbers: barber
        ? { ...(appointment?.barbers || {}), name: barber.name }
        : appointment?.barbers || null,
      customer_name: appointment?.customer_name || customer?.name || null,
      customer_phone: appointment?.customer_phone || customer?.phone || null,
      barber_name: appointment?.barber_name || barber?.name || null,
    };
  });
};

const normalizeAppointmentsWriteError = (error: any) => {
  const message = String(error?.message || error || "");

  if (
    message.includes('null value in column "client_id"') &&
    message.includes('relation "appointments"') &&
    message.includes("not-null constraint")
  ) {
    return new Error(
      "A base ativa ainda exige client_id na tabela appointments. Execute a migration 20260327_appointments_legacy_client_id_compat.sql no Supabase e tente novamente."
    );
  }

  if (
    message.includes('null value in column "professional_id"') &&
    message.includes('relation "appointments"') &&
    message.includes("not-null constraint")
  ) {
    return new Error(
      "A base ativa ainda exige professional_id na tabela appointments. Execute a migration 20260327_appointments_legacy_professional_id_compat.sql no Supabase e tente novamente."
    );
  }

  if (
    message.includes('null value in column "service_id"') &&
    message.includes('relation "appointments"') &&
    message.includes("not-null constraint")
  ) {
    return new Error(
      "A base ativa ainda exige service_id na tabela appointments. Execute a migration 20260327_appointments_legacy_service_id_compat.sql no Supabase e tente novamente."
    );
  }

  if (
    message.includes('null value in column "starts_at"') &&
    message.includes('relation "appointments"') &&
    message.includes("not-null constraint")
  ) {
    return new Error(
      "A base ativa ainda exige starts_at na tabela appointments. Execute a migration 20260327_appointments_legacy_time_columns_compat.sql no Supabase e tente novamente."
    );
  }

  if (
    message.includes('null value in column "ends_at"') &&
    message.includes('relation "appointments"') &&
    message.includes("not-null constraint")
  ) {
    return new Error(
      "A base ativa ainda exige ends_at na tabela appointments. Execute a migration 20260327_appointments_legacy_time_columns_compat.sql no Supabase e tente novamente."
    );
  }

  return error instanceof Error ? error : new Error(message || "Falha ao gravar appointments.");
};

const getAppointmentEndDate = async (appointment: any) => {
  const start = toValidDate(appointment?.appointment_date);
  if (!start) return null;

  const explicitEnd = toValidDate(appointment?.appointment_end);
  if (explicitEnd && explicitEnd.getTime() > start.getTime()) {
    return explicitEnd;
  }

  const durationMinutes = await getAppointmentDurationMinutes();
  return addMinutes(start, durationMinutes);
};

const getGoogleEventPrivateMetadata = (appointment: any) => {
  const metadata: Record<string, string> = {
    source: GOOGLE_SYNC_SOURCE,
    blocked: String(isBlockedAppointment(appointment)),
  };

  if (appointment?.id) metadata.appointmentId = String(appointment.id);
  if (appointment?.barber_id) metadata.barberId = String(appointment.barber_id);
  if (appointment?.customer_id) metadata.customerId = String(appointment.customer_id);
  if (appointment?.sync_origin) metadata.syncOrigin = String(appointment.sync_origin);

  return metadata;
};

const getGoogleEventRequestBody = async (appointment: any) => {
  const start = new Date(appointment.appointment_date);
  const end = (await getAppointmentEndDate(appointment)) || addMinutes(start, await getAppointmentDurationMinutes());
  const blocked = isBlockedAppointment(appointment);
  const barberName = appointment?.barbers?.name || appointment?.barber_name || "Barbeiro";
  const customerName = appointment?.customers?.name || appointment?.customer_name || "Cliente";
  const customerPhone = appointment?.customers?.phone || appointment?.customer_phone;
  const summary = blocked
    ? `Horario bloqueado - ${barberName}`
    : `Corte: ${customerName} com ${barberName}`;

  const descriptionLines = blocked
    ? [
        "Bloqueio manual de agenda.",
        `Barbeiro: ${barberName}`,
      ]
    : [
        `Servico: ${appointment.service_type || "Nao informado"}`,
        `Cliente: ${customerName}`,
        `Barbeiro: ${barberName}`,
        customerPhone ? `Telefone: ${customerPhone}` : null,
        `Status: ${appointment.status || "pending"}`,
        appointment?.notes ? `Observacoes: ${appointment.notes}` : null,
      ];

  return {
    summary,
    description: descriptionLines.filter(Boolean).join("\n"),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    extendedProperties: {
      private: getGoogleEventPrivateMetadata(appointment),
    },
  };
};

const getGoogleEventUpdatedIso = (event: any) => {
  return toValidDate(event?.updated)?.toISOString() || new Date().toISOString();
};

const updateAppointmentSyncFields = async (
  appointmentId: number | string,
  payload: Record<string, any>
) => {
  if (!supabase) return;

  const syncLastSyncedAt =
    payload.sync_last_synced_at || new Date(Date.now() + GOOGLE_SYNC_TOLERANCE_MS).toISOString();
  const persistedPayload = await withLegacyAppointmentTimeColumns({
    ...payload,
    sync_last_synced_at: syncLastSyncedAt,
  });

  const { error } = await supabase
    .from("appointments")
    .update(persistedPayload)
    .eq("id", appointmentId);

  if (error) throw error;
};

const getGoogleEventDateTime = (value: any) => {
  if (!value) return null;

  if (value.dateTime) {
    return toValidDate(value.dateTime)?.toISOString() || null;
  }

  if (value.date) {
    return toValidDate(`${value.date}T00:00:00`)?.toISOString() || null;
  }

  return null;
};

const getGoogleEventPrivateField = (event: any, key: string) => {
  return String(event?.extendedProperties?.private?.[key] || "").trim();
};

const parseGoogleEventDetails = (event: any) => {
  const summary = String(event?.summary || "").trim();
  const description = String(event?.description || "");
  const normalizedDescription = description.replace(/\r\n/g, "\n");

  const serviceTypeMatch = normalizedDescription.match(/(?:^|\n)Servico:\s*(.+)/i);
  const notesMatch = normalizedDescription.match(/(?:^|\n)Observacoes:\s*(.+)/i);

  return {
    summary,
    description: normalizedDescription.trim(),
    serviceType: serviceTypeMatch?.[1]?.trim() || null,
    notes: notesMatch?.[1]?.trim() || null,
  };
};

const getDefaultImportedBarberId = async () => {
  if (!supabase) return null;

  const { data, error } = await supabase.from("barbers").select("id").order("id", { ascending: true });
  if (error) throw error;
  if (!data || data.length !== 1) return null;
  return data[0].id;
};

const buildImportedAppointmentFromGoogleEvent = async (event: any) => {
  const startIso = getGoogleEventDateTime(event.start);
  const endIso = getGoogleEventDateTime(event.end);
  if (!startIso || !endIso) return null;

  const barberIdRaw = Number(getGoogleEventPrivateField(event, "barberId"));
  const customerIdRaw = Number(getGoogleEventPrivateField(event, "customerId"));
  const inferredBarberId = Number.isFinite(barberIdRaw) && barberIdRaw > 0
    ? barberIdRaw
    : await getDefaultImportedBarberId();
  const inferredCustomerId = Number.isFinite(customerIdRaw) && customerIdRaw > 0
    ? customerIdRaw
    : null;
  const googleDetails = parseGoogleEventDetails(event);
  const summary = googleDetails.summary || "Evento do Google";
  const description = googleDetails.description;
  const blockedLabel = summary ? `Bloqueado - ${summary}` : "Bloqueado - Evento do Google";

  return await withLegacyAppointmentTimeColumns({
    customer_id: inferredCustomerId,
    barber_id: inferredBarberId,
    service_type: googleDetails.serviceType || (inferredCustomerId ? summary : blockedLabel),
    appointment_date: startIso,
    appointment_end: endIso,
    status: event?.status === "cancelled" ? "cancelled" : "confirmed",
    notes: googleDetails.notes || description || "Importado do Google Calendar.",
    google_event_id: event.id || null,
    google_calendar_id: GOOGLE_CALENDAR_ID,
    google_last_modified: getGoogleEventUpdatedIso(event),
    sync_last_synced_at: new Date(Date.now() + GOOGLE_SYNC_TOLERANCE_MS).toISOString(),
    sync_origin: "google",
  });
};

const applyGoogleEventToExistingAppointment = async (appointment: any, event: any) => {
  if (!supabase) return;

  const startIso = getGoogleEventDateTime(event.start);
  const endIso = getGoogleEventDateTime(event.end);
  if (!startIso || !endIso) return;

  const payload: Record<string, any> = {
    appointment_date: startIso,
    appointment_end: endIso,
    google_event_id: event.id || appointment.google_event_id || null,
    google_calendar_id: GOOGLE_CALENDAR_ID,
    google_last_modified: getGoogleEventUpdatedIso(event),
    sync_last_synced_at: new Date(Date.now() + GOOGLE_SYNC_TOLERANCE_MS).toISOString(),
  };
  const googleDetails = parseGoogleEventDetails(event);

  if (event?.status === "cancelled") {
    payload.status = "cancelled";
  } else if (appointment?.status !== "completed") {
    payload.status = "confirmed";
  }

  if (googleDetails.serviceType && appointment?.status !== "completed") {
    payload.service_type = googleDetails.serviceType;
  }

  if (googleDetails.notes) {
    payload.notes = googleDetails.notes;
  }

  if (appointment?.sync_origin === "google" || !appointment?.customer_id) {
    const imported = await buildImportedAppointmentFromGoogleEvent(event);
    if (imported) {
      payload.service_type = imported.service_type;
      payload.notes = imported.notes;
      payload.customer_id = imported.customer_id;
      payload.sync_origin = "google";
      if (imported.barber_id) payload.barber_id = imported.barber_id;
    }
  }

  const persistedPayload = await withLegacyAppointmentTimeColumns(payload);

  const { error } = await supabase
    .from("appointments")
    .update(persistedPayload)
    .eq("id", appointment.id);
  if (error) throw normalizeAppointmentsWriteError(error);
};

const listGoogleCalendarEventsInRange = async (
  calendar: any,
  timeMin: string,
  timeMax: string
) => {
  const events: any[] = [];
  let pageToken: string | undefined;

  do {
    const response = await calendar.events.list({
      calendarId: GOOGLE_CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      showDeleted: true,
      maxResults: 250,
      pageToken,
    });

    events.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return events;
};

const buildGoogleEventPreview = (events: any[]) => {
  return (events || [])
    .filter((event) => event?.status !== "cancelled")
    .slice(0, 5)
    .map((event) => {
      const startIso = getGoogleEventDateTime(event?.start);
      return {
        summary: String(event?.summary || "(Sem titulo)").trim() || "(Sem titulo)",
        start: startIso,
      };
    });
};

const getGoogleSyncRange = (payload?: { start?: string; end?: string }) => {
  const start = toValidDate(payload?.start);
  const end = toValidDate(payload?.end);

  if (start && end && end.getTime() > start.getTime()) {
    return {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
    };
  }

  const now = new Date();
  const timeMin = new Date(now);
  const timeMax = new Date(now);
  timeMin.setDate(now.getDate() - GOOGLE_SYNC_LOOKBACK_DAYS);
  timeMin.setHours(0, 0, 0, 0);
  timeMax.setDate(now.getDate() + GOOGLE_SYNC_LOOKAHEAD_DAYS);
  timeMax.setHours(23, 59, 59, 999);

  return {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  };
};

const hasPendingLocalSync = (appointment: any) => {
  const updatedAt = toValidDate(appointment?.updated_at)?.getTime() || 0;
  const syncedAt = toValidDate(appointment?.sync_last_synced_at)?.getTime() || 0;
  const pendingWindow = updatedAt - syncedAt > GOOGLE_SYNC_TOLERANCE_MS;

  if (appointment?.sync_origin === "google" && appointment?.google_event_id && !appointment?.sync_last_synced_at) {
    return false;
  }

  if (!appointment?.google_event_id && appointment?.status !== "cancelled") {
    return true;
  }

  if (appointment?.status === "cancelled" && appointment?.google_event_id) {
    return pendingWindow;
  }

  return pendingWindow;
};

const getAppointmentsGoogleSyncSchemaStatus = async () => {
  const supabaseHost = getSupabaseHostLabel();
  if (!supabase) {
    return {
      ready: false,
      supabaseHost,
      message: "Supabase nao configurado.",
      missingColumn: null,
    };
  }

  const { error } = await supabase
    .from("appointments")
    .select(`id, appointment_date, ${REQUIRED_APPOINTMENT_SYNC_COLUMNS.join(", ")}`)
    .limit(1);

  if (!error) {
    return {
      ready: true,
      supabaseHost,
      message: null,
      missingColumn: null,
    };
  }

  const message = String(error?.message || "").toLowerCase();
  const missingSyncColumn = REQUIRED_APPOINTMENT_SYNC_COLUMNS.find((column) => message.includes(column));

  if (missingSyncColumn) {
    return {
      ready: false,
      supabaseHost,
      message: `A migration 20260326_appointments_monthly_google_sync.sql ainda nao foi aplicada na base ativa (${supabaseHost || "Supabase"}). Coluna ausente: ${missingSyncColumn}.`,
      missingColumn: missingSyncColumn,
    };
  }

  return {
    ready: false,
    supabaseHost,
    message: String(error?.message || "Falha ao validar o schema da agenda."),
    missingColumn: null,
  };
};

const ensureAppointmentsGoogleSyncSchema = async () => {
  const status = await getAppointmentsGoogleSyncSchemaStatus();
  if (status.ready) return;
  throw new Error(String(status.message || "Schema da agenda mensal indisponivel."));
};

const syncGoogleCalendarToLocalAppointments = async (payload?: { start?: string; end?: string }) => {
  if (!supabase) {
    throw new Error("Supabase nao configurado.");
  }

  await ensureAppointmentsGoogleSyncSchema();

  const googleClient = await getGoogleCalendarClient({ validateConnection: true });
  if (!googleClient) {
    throw new Error("Google Calendar nao conectado.");
  }

  const { timeMin, timeMax } = getGoogleSyncRange(payload);
  const issues: string[] = [];
  const registerIssue = (context: string, error: any) => {
    const message = String(error?.message || error || "Erro desconhecido.");
    if (issues.length < 6) {
      issues.push(`${context}: ${message}`);
    }
  };

  const { data: initialAppointments, error: initialError } = await supabase
    .from("appointments")
    .select("*")
    .gte("appointment_date", timeMin)
    .lte("appointment_date", timeMax)
    .order("appointment_date", { ascending: true });

  if (initialError) throw initialError;

  const push = { created: 0, updated: 0, deleted: 0, failed: 0 };

  for (const appointment of initialAppointments || []) {
    if (!hasPendingLocalSync(appointment)) continue;

    try {
      const result = await syncAppointmentToGoogleCalendar(appointment.id);
      if (!result.synced) continue;

      if (result.action === "created") push.created++;
      else if (result.action === "updated") push.updated++;
      else if (result.action === "deleted") push.deleted++;
    } catch (error) {
      push.failed++;
      registerIssue(`Envio do agendamento ${appointment.id}`, error);
      console.error(`Erro ao enviar agendamento ${appointment.id} para o Google Calendar:`, error);
    }
  }

  const { data: localAppointments, error: localError } = await supabase
    .from("appointments")
    .select("*")
    .gte("appointment_date", timeMin)
    .lte("appointment_date", timeMax)
    .order("appointment_date", { ascending: true });

  if (localError) throw localError;

  const localByGoogleEventId = new Map(
    (localAppointments || [])
      .filter((appointment: any) => appointment.google_event_id)
      .map((appointment: any) => [String(appointment.google_event_id), appointment])
  );
  const localByAppointmentId = new Map(
    (localAppointments || []).map((appointment: any) => [String(appointment.id), appointment])
  );

  const remoteEvents = await listGoogleCalendarEventsInRange(googleClient.calendar, timeMin, timeMax);
  const remoteEventIds = new Set<string>();
  const pull = { created: 0, updated: 0, cancelled: 0, failed: 0, skipped: 0 };

  for (const event of remoteEvents) {
    const eventId = String(event?.id || "");
    if (!eventId) continue;

    remoteEventIds.add(eventId);
    const metadataAppointmentId = getGoogleEventPrivateField(event, "appointmentId");
    const localAppointment =
      localByGoogleEventId.get(eventId) ||
      (metadataAppointmentId ? localByAppointmentId.get(metadataAppointmentId) : undefined);
    const remoteUpdatedAt = toValidDate(event?.updated)?.getTime() || 0;

    try {
      if (event?.status === "cancelled") {
        if (localAppointment && localAppointment.status !== "cancelled") {
          await updateAppointmentSyncFields(localAppointment.id, {
            status: "cancelled",
            google_last_modified: getGoogleEventUpdatedIso(event),
          });
          pull.cancelled++;
        } else {
          pull.skipped++;
        }
        continue;
      }

      if (!localAppointment) {
        const imported = await buildImportedAppointmentFromGoogleEvent(event);
        if (!imported) {
          pull.skipped++;
          continue;
        }

        const { error } = await supabase
          .from("appointments")
          .insert([imported]);
        if (error) throw normalizeAppointmentsWriteError(error);
        pull.created++;
        continue;
      }

      const localGoogleUpdatedAt = toValidDate(localAppointment.google_last_modified)?.getTime() || 0;
      if (remoteUpdatedAt - localGoogleUpdatedAt <= GOOGLE_SYNC_TOLERANCE_MS) {
        pull.skipped++;
        continue;
      }

      await applyGoogleEventToExistingAppointment(localAppointment, event);
      pull.updated++;
    } catch (error) {
      pull.failed++;
      const eventLabel = String(event?.summary || eventId).trim() || eventId;
      registerIssue(`Importacao do evento ${eventLabel}`, error);
      console.error(`Erro ao reconciliar evento ${eventId} do Google Calendar:`, error);
    }
  }

  for (const appointment of localAppointments || []) {
    if (!appointment.google_event_id) continue;
    if (remoteEventIds.has(String(appointment.google_event_id))) continue;
    if (appointment.status === "cancelled") continue;

    try {
      await updateAppointmentSyncFields(appointment.id, {
        status: "cancelled",
        google_event_id: null,
      });
      pull.cancelled++;
    } catch (error) {
      pull.failed++;
      registerIssue(`Cancelamento local do agendamento ${appointment.id}`, error);
      console.error(`Erro ao cancelar agendamento local ${appointment.id} apos remocao no Google Calendar:`, error);
    }
  }

  const count = push.created + push.updated + push.deleted + pull.created + pull.updated + pull.cancelled;
  const failed = push.failed + pull.failed;

  return {
    success: true,
    count,
    failed,
    total: remoteEvents.length,
    calendarId: GOOGLE_CALENDAR_ID,
    range: { timeMin, timeMax },
    push,
    pull,
    issues,
    preview: buildGoogleEventPreview(remoteEvents),
  };
};

const runGoogleCalendarBackgroundSync = async () => {
  if (googleBackgroundSyncRunning) return;
  googleBackgroundSyncRunning = true;

  try {
    const result = await syncGoogleCalendarToLocalAppointments();

    if (result.count || result.failed) {
      console.log(
        `[Google Sync] ciclo automatico concluido. alteracoes=${result.count} falhas=${result.failed}`
      );
    }
  } catch (error: any) {
    const message = String(error?.message || "");
    if (
      message.includes("Google Calendar nao conectado") ||
      message.includes("Credenciais do Google Calendar") ||
      message.includes("Supabase nao configurado")
    ) {
      return;
    }

    console.error("[Google Sync] falha no ciclo automatico:", error);
  } finally {
    googleBackgroundSyncRunning = false;
  }
};

const startGoogleCalendarBackgroundSync = () => {
  if (process.env.ENABLE_GOOGLE_BACKGROUND_SYNC === "false") return;
  if (googleBackgroundSyncTimer) return;

  googleBackgroundSyncTimer = setInterval(() => {
    void runGoogleCalendarBackgroundSync();
  }, GOOGLE_BACKGROUND_SYNC_INTERVAL_MS);

  void runGoogleCalendarBackgroundSync();
};

const getAppointmentForGoogleSync = async (appointmentId: number | string) => {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .single();

  if (error) throw error;
  const [hydrated] = await hydrateAppointmentsDisplayRelations(data ? [data] : []);
  return hydrated || data;
};

const syncAppointmentToGoogleCalendar = async (appointmentId: number | string) => {
  const googleClient = await getGoogleCalendarClient();
  if (!googleClient) {
    return { synced: false, action: "skipped", reason: "Google Calendar nao conectado." };
  }

  const appointment = await getAppointmentForGoogleSync(appointmentId);
  if (!appointment) {
    return { synced: false, action: "skipped", reason: "Agendamento nao encontrado." };
  }

  if (appointment.status === "cancelled") {
    if (!appointment.google_event_id) {
      return { synced: false, action: "skipped", reason: "Agendamento cancelado sem evento vinculado." };
    }

    try {
      await googleClient.calendar.events.delete({
        calendarId: GOOGLE_CALENDAR_ID,
        eventId: appointment.google_event_id,
      });
    } catch (error) {
      if (!isGoogleNotFoundError(error)) throw error;
    }

    await updateAppointmentSyncFields(appointmentId, {
      google_event_id: null,
      google_last_modified: null,
    });
    return { synced: true, action: "deleted", eventId: null };
  }

  const requestBody = await getGoogleEventRequestBody(appointment);

  if (appointment.google_event_id) {
    try {
      const event = await googleClient.calendar.events.patch({
        calendarId: GOOGLE_CALENDAR_ID,
        eventId: appointment.google_event_id,
        requestBody,
      });

      await updateAppointmentSyncFields(appointmentId, {
        google_event_id: appointment.google_event_id,
        google_calendar_id: GOOGLE_CALENDAR_ID,
        google_last_modified: getGoogleEventUpdatedIso(event.data),
      });

      return { synced: true, action: "updated", eventId: appointment.google_event_id };
    } catch (error) {
      if (!isGoogleNotFoundError(error)) throw error;
    }
  }

  const event = await googleClient.calendar.events.insert({
    calendarId: GOOGLE_CALENDAR_ID,
    requestBody,
  });

  const eventId = event.data.id || null;
  if (eventId) {
    await updateAppointmentSyncFields(appointmentId, {
      google_event_id: eventId,
      google_calendar_id: GOOGLE_CALENDAR_ID,
      google_last_modified: getGoogleEventUpdatedIso(event.data),
    });
  }

  return { synced: true, action: "created", eventId };
};

const SYSTEM_SETTING_KEYS = [
  "business_name",
  "business_phone",
  "business_email",
  "business_address",
  "booking_slot_minutes",
  "working_hours_start",
  "working_hours_end",
  "timezone",
] as const;

type SystemSettingsPayload = Record<(typeof SYSTEM_SETTING_KEYS)[number], string>;

const DEFAULT_SYSTEM_SETTINGS: SystemSettingsPayload = {
  business_name: "MA BEARD STYLE",
  business_phone: "",
  business_email: "",
  business_address: "",
  booking_slot_minutes: "60",
  working_hours_start: "09:00",
  working_hours_end: "18:00",
  timezone: "America/Sao_Paulo",
};

async function startServer() {
  const app = express();
  const PORT = 3000; // Forçamos a porta 3000 para coincidir com o fly.toml

  app.use(express.json());

  app.get("/app-config.js", (_req, res) => {
    res.type("application/javascript");
    res.setHeader("Cache-Control", "no-store");
    res.send(
      `window.__APP_CONFIG__ = ${JSON.stringify({
        supabaseUrl,
        supabaseAnonKey: supabaseKey,
      })};`
    );
  });

  // API Routes
  
  // Plans
  app.get("/api/plans", async (req, res) => {
    try {
      const { data, error } = await supabase.from('plans').select('*');
      if (error) throw error;
      
      if (data && data.length > 0) {
        const plansWithPrices = await Promise.all(data.map(async (p: any) => {
          const plan = { 
            ...p, 
            benefits: typeof p.benefits === 'string' ? JSON.parse(p.benefits) : p.benefits 
          };

          if (stripe && plan.stripe_product_id && !plan.stripe_price_id) {
            try {
              const prices = await stripe.prices.list({
                product: plan.stripe_product_id,
                active: true,
                limit: 1
              });
              if (prices.data.length > 0) {
                plan.stripe_price_id = prices.data[0].id;
              }
            } catch (e) {
              console.error(`Erro ao buscar preço para produto ${plan.stripe_product_id}:`, e);
            }
          }
          return plan;
        }));
        return res.json(plansWithPrices);
      }
      return res.json([]);
    } catch (e) {
      console.error("Erro ao buscar planos do Supabase:", e);
      return res.status(500).json({ error: "Erro ao buscar planos" });
    }
  });

  app.put("/api/plans/:id", async (req, res) => {
    const { name, price, description, benefits, stripe_product_id, stripe_price_id } = req.body;
    const { id } = req.params;
    
    // Ensure benefits is an array
    const benefitsArray = Array.isArray(benefits) ? benefits : [];
    
    try {
      const { data, error } = await supabase
        .from('plans')
        .upsert({ 
          id,
          name, 
          price, 
          description, 
          benefits: benefitsArray,
          stripe_product_id,
          stripe_price_id
        }, { onConflict: 'id' })
        .select();
      
      if (error) throw error;
      res.json({ success: true, data: data?.[0] });
    } catch (error: any) {
      console.error("Erro ao atualizar plano:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/plans", async (req, res) => {
    const { name, price, description, benefits, stripe_product_id, stripe_price_id } = req.body;
    const { data, error } = await supabase
      .from('plans')
      .insert([{ name, price, description, benefits, stripe_product_id, stripe_price_id }])
      .select();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
  });

  app.delete("/api/plans/:id", async (req, res) => {
    const { error } = await supabase
      .from('plans')
      .delete()
      .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.get("/api/settings", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('config')
        .select('key, value')
        .in('key', [...SYSTEM_SETTING_KEYS]);

      if (error) throw error;

      const settings = { ...DEFAULT_SYSTEM_SETTINGS };
      for (const row of data || []) {
        if (SYSTEM_SETTING_KEYS.includes(row.key as any)) {
          settings[row.key as keyof SystemSettingsPayload] = row.value || "";
        }
      }

      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/settings", async (req, res) => {
    try {
      const payload = req.body || {};
      const updates = SYSTEM_SETTING_KEYS.map((key) => ({
        key,
        value: String(payload[key] ?? DEFAULT_SYSTEM_SETTINGS[key]).trim(),
      }));

      const { error } = await supabase.from('config').upsert(updates, { onConflict: 'key' });
      if (error) throw error;

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/integrations/status", async (req, res) => {
    let googleConnected = false;
    const appointmentsSync = await getAppointmentsGoogleSyncSchemaStatus();
    try {
      if (await getGoogleCalendarClient({ validateConnection: true })) {
        googleConnected = true;
      }
    } catch (_e) {}

    res.json({
      stripe: {
        configured: Boolean(stripe),
      },
      google: {
        hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
        hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
        redirectUri: getGoogleRedirectUri(),
        configured: hasGoogleCalendarSecrets(),
        connected: googleConnected,
      },
      appointmentsSync,
    });
  });

  // Dashboard Stats
  app.get("/api/stats", async (req, res) => {
    try {
      const { count: activeSubscribers } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      const { data: mrrData } = await supabase
        .from('subscriptions')
        .select('plan_id')
        .eq('status', 'active');
      
      const { data: plans } = await supabase.from('plans').select('id, price');
      
      let mrr = 0;
      if (mrrData && plans) {
        mrrData.forEach(sub => {
          const plan = plans.find(p => p.id === sub.plan_id);
          if (plan) mrr += plan.price;
        });
      }

      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data: services } = await supabase
        .from('services')
        .select('price')
        .gte('date', firstDayOfMonth);
      
      const { data: sales } = await supabase
        .from('sales')
        .select('total_price')
        .gte('date', firstDayOfMonth);

      const totalRevenue = (services?.reduce((acc, s) => acc + s.price, 0) || 0) + 
                           (sales?.reduce((acc, s) => acc + s.total_price, 0) || 0);

      const { count: lowStockCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });
      // Note: Supabase doesn't easily support column-to-column comparison in basic select count
      const { data: products } = await supabase.from('products').select('stock, min_stock');
      const lowStockAlerts = products?.filter(p => p.stock <= p.min_stock).length || 0;

      res.json({
        activeSubscribers: activeSubscribers || 0,
        mrr: mrr,
        monthlyRevenue: totalRevenue,
        lowStockAlerts: lowStockAlerts
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Appointments CRUD
  app.get("/api/appointments", async (req, res) => {
    const start = typeof req.query.start === "string" ? toValidDate(req.query.start) : null;
    const end = typeof req.query.end === "string" ? toValidDate(req.query.end) : null;

    try {
      let query = supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: true });

      if (start) {
        query = query.gte('appointment_date', start.toISOString());
      }

      if (end) {
        query = query.lte('appointment_date', end.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      const formatted = await hydrateAppointmentsDisplayRelations(data || []);
      res.json(formatted || []);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/appointments", async (req, res) => {
    const { customer_id, barber_id, service_type, appointment_date, appointment_end, status, notes } = req.body;
    try {
      const start = toValidDate(appointment_date);
      if (!start) {
        return res.status(400).json({ error: "Data do agendamento invalida." });
      }

      const explicitEnd = toValidDate(appointment_end);
      const end = explicitEnd && explicitEnd.getTime() > start.getTime()
        ? explicitEnd
        : addMinutes(start, await getAppointmentDurationMinutes());

      const insertPayload = await withLegacyAppointmentTimeColumns({
        customer_id: customer_id || null,
        barber_id: barber_id || null,
        service_type,
        appointment_date: start.toISOString(),
        appointment_end: end.toISOString(),
        notes: notes || null,
        status: status || 'pending',
        sync_origin: 'local',
      });

      const { data, error } = await supabase
        .from('appointments')
        .insert([insertPayload])
        .select();
      
      if (error) throw normalizeAppointmentsWriteError(error);
      
      // Try to sync to Google Calendar immediately if connected
      try {
        await syncAppointmentToGoogleCalendar(data[0].id);
        if (false) {
        const { data: config } = await supabase.from('config').select('value').eq('key', 'google_calendar_tokens').single();
        if (config) {
          const tokens = JSON.parse(config.value);
          oauth2Client.setCredentials(tokens);
          const calendar = google.calendar({ version: "v3", auth: oauth2Client });
          
          const { data: fullApt } = await supabase
            .from('appointments')
            .select('*, customers(name), barbers(name)')
            .eq('id', data[0].id)
            .single();

          if (fullApt) {
            const start = new Date(fullApt.appointment_date);
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            const isBlocked = !fullApt.customer_id && String(fullApt.service_type || '').toLowerCase().includes('bloque');
            const summary = isBlocked
              ? `Horário bloqueado - ${fullApt.barbers?.name || 'Barbeiro'}`
              : `Corte: ${fullApt.customers?.name || 'Cliente'} com ${fullApt.barbers?.name || 'Barbeiro'}`;
            const description = isBlocked
              ? 'Bloqueio manual de agenda (almoço/compromisso pessoal).'
              : `Serviço: ${fullApt.service_type}`;
            
            const event = await calendar.events.insert({
              calendarId: "primary",
              requestBody: {
                summary,
                description,
                start: { dateTime: start.toISOString() },
                end: { dateTime: end.toISOString() },
              },
            });

            if (event.data.id) {
              await supabase.from('appointments').update({ google_event_id: event.data.id }).eq('id', data[0].id);
            }
          }
        }
        }
      } catch (syncErr) {
        console.error("Erro ao sincronizar agendamento com Google:", syncErr);
      }

      res.json({ id: data[0].id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/appointments/:id", async (req, res) => {
    const { status, appointment_date, appointment_end, service_type, barber_id, customer_id, notes } = req.body;
    const { id } = req.params;
    
    try {
      const { data: oldApt, error: fetchError } = await supabase.from('appointments').select('*').eq('id', id).single();
      if (fetchError) throw fetchError;

      const updateData: any = {};
      const currentStart = toValidDate(oldApt.appointment_date);
      const currentEnd = toValidDate(oldApt.appointment_end);
      const nextStart = appointment_date !== undefined ? toValidDate(appointment_date) : currentStart;
      const nextEndInput = appointment_end !== undefined ? toValidDate(appointment_end) : currentEnd;
      const fallbackDurationMs =
        currentStart && currentEnd && currentEnd.getTime() > currentStart.getTime()
          ? currentEnd.getTime() - currentStart.getTime()
          : (await getAppointmentDurationMinutes()) * 60 * 1000;

      if (status !== undefined) updateData.status = status;
      if (service_type !== undefined) updateData.service_type = service_type;
      if (barber_id !== undefined) updateData.barber_id = barber_id || null;
      if (customer_id !== undefined) updateData.customer_id = customer_id || null;
      if (notes !== undefined) updateData.notes = notes || null;

      if (nextStart) {
        const resolvedEnd = nextEndInput && nextEndInput.getTime() > nextStart.getTime()
          ? nextEndInput
          : new Date(nextStart.getTime() + fallbackDurationMs);

        updateData.appointment_date = nextStart.toISOString();
        updateData.appointment_end = resolvedEnd.toISOString();
      }

      const persistedUpdateData = await withLegacyAppointmentTimeColumns(updateData);

      const { error } = await supabase
        .from('appointments')
        .update(persistedUpdateData)
        .eq('id', id);
      
      if (error) throw normalizeAppointmentsWriteError(error);

      // Sync update to Google Calendar
      if (oldApt) {
        try {
          await syncAppointmentToGoogleCalendar(id);
          if (false) {
          const { data: config } = await supabase.from('config').select('value').eq('key', 'google_calendar_tokens').single();
          if (config) {
            const tokens = JSON.parse(config.value);
            oauth2Client.setCredentials(tokens);
            const calendar = google.calendar({ version: "v3", auth: oauth2Client });
            
            const { data: updatedApt } = await supabase
              .from('appointments')
              .select('*, customers(name), barbers(name)')
              .eq('id', id)
              .single();

            if (updatedApt) {
              const start = new Date(updatedApt.appointment_date);
              const end = new Date(start.getTime() + 60 * 60 * 1000);
              const isBlocked = !updatedApt.customer_id && String(updatedApt.service_type || '').toLowerCase().includes('bloque');
              const summary = isBlocked
                ? `Horário bloqueado - ${updatedApt.barbers?.name || 'Barbeiro'}`
                : `Corte: ${updatedApt.customers?.name || 'Cliente'} com ${updatedApt.barber_name || updatedApt.barbers?.name || 'Barbeiro'}`;
              const description = isBlocked
                ? 'Bloqueio manual de agenda (almoço/compromisso pessoal).'
                : `Serviço: ${updatedApt.service_type}`;

              if (updatedApt.status === 'cancelled') {
                try {
                  await calendar.events.delete({ calendarId: "primary", eventId: oldApt.google_event_id });
                } catch (e) {
                  console.warn("Event already deleted or not found in Google Calendar");
                }
                await supabase.from('appointments').update({ google_event_id: null }).eq('id', id);
              } else {
                await calendar.events.patch({
                  calendarId: "primary",
                  eventId: oldApt.google_event_id,
                  requestBody: {
                    summary,
                    description,
                    start: { dateTime: start.toISOString() },
                    end: { dateTime: end.toISOString() },
                  },
                });
              }
            }
          }
          }
        } catch (syncErr) {
          console.error("Erro ao atualizar agendamento no Google:", syncErr);
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/appointments/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const { data: apt, error: fetchError } = await supabase.from('appointments').select('google_event_id').eq('id', id).single();
      
      // Delete from Google Calendar if exists
      if (apt?.google_event_id) {
        try {
          const googleClient = await getGoogleCalendarClient();
          if (googleClient) {
            await googleClient.calendar.events.delete({ calendarId: "primary", eventId: apt.google_event_id });
          }
          if (false) {
          const { data: config } = await supabase.from('config').select('value').eq('key', 'google_calendar_tokens').single();
          if (config) {
            const tokens = JSON.parse(config.value);
            oauth2Client.setCredentials(tokens);
            const calendar = google.calendar({ version: "v3", auth: oauth2Client });
            await calendar.events.delete({ calendarId: "primary", eventId: apt.google_event_id });
          }
          }
        } catch (syncErr) {
          if (!isGoogleNotFoundError(syncErr)) {
            console.error("Erro ao excluir agendamento no Google:", syncErr);
          }
        }
      }

      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Customers CRUD
  app.get("/api/customers", async (req, res) => {
    const { data, error } = await supabase.from('customers').select('*').order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  app.post("/api/customers", async (req, res) => {
    const { name, email, phone, cpf } = req.body;
    
    if (!name) return res.status(400).json({ error: "Nome é obrigatório" });

    try {
      // First, check if customer already exists by phone or email
      if (phone || email) {
        let query = supabase.from('customers').select('id');
        if (phone && email) {
          query = query.or(`phone.eq.${phone},email.eq.${email}`);
        } else if (phone) {
          query = query.eq('phone', phone);
        } else {
          query = query.eq('email', email);
        }
        
        const { data: existing } = await query.maybeSingle();
        if (existing) {
          return res.json({ id: existing.id });
        }
      }

      const { data, error } = await supabase
        .from('customers')
        .insert([{ name, email, phone, cpf }])
        .select();
      
      if (error) {
        console.error("Erro Supabase ao inserir cliente:", error);
        if (error.code === '23505') {
          // Fallback if the check above missed it due to race condition
          const { data: existing } = await supabase.from('customers').select('id').or(`phone.eq.${phone},email.eq.${email}`).maybeSingle();
          if (existing) return res.json({ id: existing.id });
          return res.status(400).json({ error: "Email ou CPF já cadastrado" });
        }
        if (error.code === '42P01') {
          return res.status(500).json({ error: "Tabela 'customers' não encontrada. Verifique se o banco de dados foi configurado corretamente." });
        }
        return res.status(500).json({ error: "Erro ao salvar cliente: " + error.message });
      }
      
      if (!data || data.length === 0) {
        return res.status(500).json({ error: "Erro ao criar cliente: nenhum dado retornado pelo banco." });
      }
      
      res.json({ id: data[0].id });
    } catch (err: any) {
      console.error("Erro interno ao salvar cliente:", err);
      res.status(500).json({ error: "Erro interno no servidor: " + err.message });
    }
  });

  app.put("/api/customers/:id", async (req, res) => {
    const { name, email, phone, cpf } = req.body;
    const { error } = await supabase
      .from('customers')
      .update({ name, email, phone, cpf })
      .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/customers/:id", async (req, res) => {
    const { error } = await supabase.from('customers').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // POS (Caixa) - Manual Subscription
  app.post("/api/pos/subscribe", async (req, res) => {
    const { customerEmail, planId } = req.body;
    const { data: plan } = await supabase.from('plans').select('*').eq('id', planId).single();
    if (!plan) return res.status(404).json({ error: "Plano não encontrado" });

    const { error } = await supabase
      .from('subscriptions')
      .insert([{ 
        id: `manual_${Date.now()}`, 
        customer_email: customerEmail, 
        plan_id: planId, 
        status: 'active' 
      }]);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Reports
  app.get("/api/reports/margins", async (req, res) => {
    const { data, error } = await supabase.from('products').select('name, cost, price');
    if (error) return res.status(500).json({ error: error.message });
    
    const margins = data.map(p => ({
      ...p,
      margin: p.price - p.cost,
      margin_percent: (((p.price - p.cost) / p.price) * 100).toFixed(2)
    }));
    res.json(margins);
  });

  app.get("/api/reports/productivity", async (req, res) => {
    const { data: barbers } = await supabase.from('barbers').select('*').eq('active', true);
    const { data: services } = await supabase.from('services').select('*');
    
    const productivity = barbers?.map(b => {
      const bServices = services?.filter(s => s.barber_id === b.id) || [];
      return {
        name: b.name,
        total_services: bServices.length,
        total_revenue: bServices.reduce((acc, s) => acc + s.price, 0),
        total_commission: bServices.reduce((acc, s) => acc + s.commission_amount, 0)
      };
    });
    res.json(productivity || []);
  });

  app.get("/api/reports/analytics", async (req, res) => {
    const { data: sales } = await supabase.from('sales').select('total_price');
    const { data: services } = await supabase.from('services').select('price');
    const { count: totalCustomers } = await supabase.from('customers').select('*', { count: 'exact', head: true });
    const { count: activePlans } = await supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active');

    const allTransactions = [...(sales?.map(s => s.total_price) || []), ...(services?.map(s => s.price) || [])];
    const avgTicket = allTransactions.length > 0 ? allTransactions.reduce((acc, v) => acc + v, 0) / allTransactions.length : 0;

    res.json({
      avg_ticket: avgTicket,
      total_customers: totalCustomers || 0,
      active_plans: activePlans || 0
    });
  });

  // Barbers CRUD
  app.get("/api/barbers", async (req, res) => {
    const { data, error } = await supabase.from('barbers').select('*').eq('active', true).order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  app.post("/api/barbers", async (req, res) => {
    const { name, specialty, commission_rate, phone, cpf, address, photo_url } = req.body;
    const { data, error } = await supabase
      .from('barbers')
      .insert([{ name, specialty, commission_rate, phone, cpf, address, photo_url, active: true }])
      .select();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data[0].id });
  });

  app.put("/api/barbers/:id", async (req, res) => {
    const { name, specialty, commission_rate, phone, cpf, address, photo_url } = req.body;
    const { error } = await supabase
      .from('barbers')
      .update({ name, specialty, commission_rate, phone, cpf, address, photo_url })
      .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/barbers/:id", async (req, res) => {
    const { error } = await supabase
      .from('barbers')
      .update({ active: false })
      .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Products CRUD
  app.get("/api/products", async (req, res) => {
    const { data, error } = await supabase.from('products').select('*').order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  app.post("/api/products", async (req, res) => {
    const { name, cost, price, stock, min_stock, supplier, category, entry_date } = req.body;
    const { data, error } = await supabase
      .from('products')
      .insert([{ name, cost, price, stock, min_stock, supplier, category: category || 'Geral', entry_date: entry_date || new Date().toISOString().split('T')[0] }])
      .select();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data[0].id });
  });

  app.put("/api/products/:id", async (req, res) => {
    const { name, cost, price, stock, min_stock, supplier, category, entry_date } = req.body;
    const { error } = await supabase
      .from('products')
      .update({ name, cost, price, stock, min_stock, supplier, category, entry_date })
      .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Stock entry (entrada de mercadoria)
  app.post("/api/products/:id/stock-entry", async (req, res) => {
    const { quantity, reason, unit_cost } = req.body;
    const id = req.params.id;
    if (!quantity || quantity <= 0) return res.status(400).json({ error: 'Quantidade inválida' });

    const { data: product } = await supabase.from('products').select('stock').eq('id', id).single();
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

    const newStock = (product.stock || 0) + Number(quantity);
    const { error: updateErr } = await supabase.from('products').update({ stock: newStock }).eq('id', id);
    if (updateErr) return res.status(500).json({ error: updateErr.message });

    await supabase.from('stock_movements').insert([{ product_id: id, type: 'entrada', quantity, reason: reason || 'Entrada manual', unit_cost }]);
    res.json({ success: true, new_stock: newStock });
  });

  app.get("/api/products/:id/movements", async (req, res) => {
    const { data } = await supabase.from('stock_movements').select('*').eq('product_id', req.params.id).order('created_at', { ascending: false });
    res.json(data || []);
  });

  app.delete("/api/products/:id", async (req, res) => {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Services Catalog CRUD
  app.get("/api/services-catalog", async (req, res) => {
    const { data, error } = await supabase.from('services_catalog').select('*').order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  app.post("/api/services-catalog", async (req, res) => {
    const { name, price, duration_minutes, description } = req.body;
    const { data, error } = await supabase.from('services_catalog').insert([{ name, price, duration_minutes: duration_minutes || 60, description }]).select();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data[0]);
  });

  app.put("/api/services-catalog/:id", async (req, res) => {
    const { name, price, duration_minutes, description, active } = req.body;
    const { error } = await supabase.from('services_catalog').update({ name, price, duration_minutes, description, active }).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/services-catalog/:id", async (req, res) => {
    const { error } = await supabase.from('services_catalog').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // POS (Caixa)
  app.post("/api/pos/sale", async (req, res) => {
    const { productId, quantity } = req.body;
    const { data: product } = await supabase.from('products').select('*').eq('id', productId).single();
    
    if (!product || product.stock < quantity) {
      return res.status(400).json({ error: "Estoque insuficiente" });
    }

    const totalPrice = product.price * quantity;
    const payment_method = req.body.payment_method || 'dinheiro';
    
    await supabase.from('products').update({ stock: product.stock - quantity }).eq('id', productId);
    await supabase.from('sales').insert([{ product_id: productId, quantity, total_price: totalPrice, payment_method }]);
    
    res.json({ success: true });
  });

  app.post("/api/pos/service", async (req, res) => {
    const { barberId, customerName, serviceType, price, payment_method } = req.body;
    const { data: barber } = await supabase.from('barbers').select('*').eq('id', barberId).single();
    
    if (!barber) return res.status(404).json({ error: "Barbeiro não encontrado" });

    const commissionAmount = price * barber.commission_rate;
    
    const { error } = await supabase.from('services').insert([{
      barber_id: barberId,
      customer_name: customerName,
      service_type: serviceType,
      price,
      commission_amount: commissionAmount,
      payment_method: payment_method || 'dinheiro'
    }]);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Customers / Subscriptions
  app.get("/api/subscriptions", async (req, res) => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*, plans(name, price)')
      .order('created_at', { ascending: false });
    
    if (error) return res.status(500).json({ error: error.message });

    const formatted = data?.map(s => ({
      ...s,
      plan_name: (s as any).plans?.name,
      plan_price: (s as any).plans?.price
    }));
    
    res.json(formatted || []);
  });

  // Detailed Stats for Charts
  app.get("/api/stats/revenue", async (req, res) => {
    const { data: sales } = await supabase.from('sales').select('date, total_price').gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    const { data: services } = await supabase.from('services').select('date, price').gte('date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    
    const combined = [
      ...(sales?.map(s => ({ date: s.date.split('T')[0], value: s.total_price })) || []),
      ...(services?.map(s => ({ date: s.date.split('T')[0], value: s.price })) || [])
    ];

    const grouped: Record<string, number> = {};
    combined.forEach(item => {
      const label = item.date.split('-').reverse().slice(0, 2).join('/'); // DD/MM
      grouped[label] = (grouped[label] || 0) + item.value;
    });

    const revenueData = Object.entries(grouped).map(([label, value]) => ({ label, value }));
    res.json(revenueData);
  });

  // Stripe Checkout
  app.post("/api/create-checkout-session", async (req, res) => {
    const { planId, email } = req.body;
    console.log(`Iniciando checkout para plano: ${planId}, email: ${email}`);

    if (!stripe) {
      return res.status(503).json({ error: "Stripe não configurada no servidor" });
    }
    
    let plan: any;
    
    try {
      const { data: dbPlan } = await supabase.from('plans').select('*').eq('id', planId).single();
      
      if (dbPlan) {
        plan = {
          ...dbPlan,
          benefits: typeof dbPlan.benefits === 'string' ? JSON.parse(dbPlan.benefits) : dbPlan.benefits
        };
      }

      if (!plan) {
        console.error(`Plano não encontrado: ${planId}`);
        return res.status(404).json({ error: "Plan not found" });
      }

      const appUrl = process.env.APP_URL || (req.headers.origin as string) || `https://${req.get('host')}`;
      console.log(`[Stripe] Iniciando checkout. APP_URL detectado: ${appUrl}`);

      const lineItem: any = {
        quantity: 1,
      };

      if (plan.stripe_price_id && plan.stripe_price_id.startsWith('price_')) {
        console.log(`[Stripe] Usando Price ID: ${plan.stripe_price_id}`);
        lineItem.price = plan.stripe_price_id;
      } else {
        console.log(`[Stripe] Montando price_data para plano: ${plan.name}`);
        lineItem.price_data = {
          currency: "brl",
          unit_amount: Math.round(plan.price * 100),
          recurring: { interval: "month" },
        };

        if (plan.stripe_product_id && plan.stripe_product_id.startsWith('prod_')) {
          console.log(`[Stripe] Usando Product ID: ${plan.stripe_product_id}`);
          lineItem.price_data.product = plan.stripe_product_id;
        } else {
          console.log(`[Stripe] Usando product_data dinâmico`);
          lineItem.price_data.product_data = {
            name: plan.name,
            description: plan.description,
          };
        }
      }

      // Timeout para a chamada da Stripe
      const stripePromise = stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [lineItem],
        mode: "subscription",
        success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/`,
        customer_email: email,
        metadata: {
          plan_id: planId,
        },
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout na comunicação com a Stripe")), 10000)
      );

      const session = await Promise.race([stripePromise, timeoutPromise]) as Stripe.Checkout.Session;

      console.log(`[Stripe] Sessão criada com sucesso: ${session.id}`);
      res.json({ url: session.url });
    } catch (error: any) {
      console.error("[Stripe] Erro detalhado:", error);
      res.status(500).json({ 
        error: error.message,
        details: error.type === 'StripeAuthenticationError' ? 'Chave da Stripe inválida ou não configurada corretamente.' : 'Erro interno ao processar pagamento.'
      });
    }
  });

  app.post("/api/webhook", async (req, res) => {
    const event = req.body;
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      await supabase.from('subscriptions').insert([{
        id: session.id,
        customer_email: session.customer_email,
        plan_id: session.metadata?.plan_id || "",
        status: "active",
        stripe_subscription_id: session.subscription
      }]);
    }
    res.json({ received: true });
  });

  // --- Advanced Financial Routes ---

  // Stripe: Sync plans from Stripe dashboard
  app.get("/api/stripe/sync-plans", async (req, res) => {
    if (!stripe) return res.status(503).json({ error: 'Stripe não configurada' });
    try {
      const products = await stripe.products.list({ active: true, limit: 20 });
      const synced: any[] = [];

      for (const product of products.data) {
        const prices = await stripe.prices.list({ product: product.id, active: true, limit: 1 });
        const price = prices.data[0];
        if (!price) continue;

        const planData = {
          id: product.id.replace('prod_', '').toLowerCase().slice(0, 20),
          name: product.name,
          description: product.description || '',
          price: price.unit_amount ? price.unit_amount / 100 : 0,
          benefits: product.metadata?.benefits ? JSON.parse(product.metadata.benefits) : [],
          stripe_product_id: product.id,
          stripe_price_id: price.id,
        };

        const { data, error } = await (supabase as any).from('plans')
          .upsert(planData, { onConflict: 'stripe_product_id' })
          .select();

        if (!error) synced.push({ ...planData, dbId: data?.[0]?.id });
      }

      res.json({ success: true, synced: synced.length, plans: synced });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Expenses CRUD
  app.get("/api/expenses", async (req, res) => {
    const { data } = await supabase.from('expenses').select('*').order('date', { ascending: false });
    res.json(data || []);
  });

  app.post("/api/expenses", async (req, res) => {
    const { data, error } = await supabase.from('expenses').insert([req.body]).select();
    res.json(data ? data[0] : { error });
  });

  app.delete("/api/expenses/:id", async (req, res) => {
    await supabase.from('expenses').delete().eq('id', req.params.id);
    res.json({ success: true });
  });

  // DRE (Lucro Real)
  app.get("/api/reports/financial", async (req, res) => {
    const { data: services } = await supabase.from('services').select('price, commission_amount');
    const { data: sales } = await supabase.from('sales').select('total_price');
    const { data: expenses } = await supabase.from('expenses').select('amount');
    
    const revenue = (services?.reduce((acc, s) => acc + s.price, 0) || 0) + 
                    (sales?.reduce((acc, s) => acc + s.total_price, 0) || 0);
    
    const commissions = services?.reduce((acc, s) => acc + s.commission_amount, 0) || 0;
    const totalExpenses = (expenses?.reduce((acc, e) => acc + e.amount, 0) || 0) + commissions;
    
    res.json({
      revenue,
      expenses: totalExpenses,
      profit: revenue - totalExpenses,
      margin: revenue > 0 ? ((revenue - totalExpenses) / revenue) * 100 : 0
    });
  });

  // --- Public Booking Routes ---

  app.get("/api/public/barbers", async (req, res) => {
    const { data } = await supabase.from('barbers').select('id, name, specialty, photo_url').eq('active', true);
    res.json(data || []);
  });

  app.get("/api/public/services", async (req, res) => {
    const { data } = await supabase.from('services_catalog').select('*').eq('active', true).order('name');
    res.json(data || []);
  });

  app.post("/api/public/check-subscription", async (req, res) => {
    const rawIdentifier = String(req.body?.identifier || '').trim();

    if (!rawIdentifier) {
      return res.status(400).json({ error: 'Informe um e-mail ou CPF.' });
    }

    const normalizedEmail = rawIdentifier.toLowerCase();
    const cpfDigits = rawIdentifier.replace(/\D/g, '');
    const looksLikeEmail = rawIdentifier.includes('@');

    let candidateEmails: string[] = [];

    try {
      if (looksLikeEmail) {
        candidateEmails = [normalizedEmail];
      } else {
        const cpfVariants = Array.from(new Set([
          rawIdentifier,
          cpfDigits,
          cpfDigits.length === 11
            ? `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-${cpfDigits.slice(9)}`
            : ''
        ].filter(Boolean)));

        if (cpfVariants.length === 0) {
          return res.status(400).json({ error: 'CPF inválido.' });
        }

        const { data: customers, error: customerError } = await supabase
          .from('customers')
          .select('email')
          .in('cpf', cpfVariants);

        if (customerError) {
          return res.status(500).json({ error: customerError.message });
        }

        candidateEmails = (customers || [])
          .map((c: any) => String(c.email || '').trim().toLowerCase())
          .filter(Boolean);
      }

      if (candidateEmails.length === 0) {
        return res.json({ active: false });
      }

      for (const email of candidateEmails) {
        const { data: subscriptions, error: subError } = await supabase
          .from('subscriptions')
          .select('customer_email, status')
          .eq('status', 'active')
          .ilike('customer_email', email)
          .limit(1);

        if (subError) {
          return res.status(500).json({ error: subError.message });
        }

        if (subscriptions && subscriptions.length > 0) {
          return res.json({
            active: true,
            email: subscriptions[0].customer_email
          });
        }
      }

      return res.json({ active: false });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Erro ao validar assinatura.' });
    }
  });

  app.get("/api/public/available-slots", async (req, res) => {
    const { barberId, date } = req.query;

    if (!barberId || !date) {
      return res.status(400).json({ error: 'Parâmetros barberId e date são obrigatórios.' });
    }

    const { data: cfgRows } = await supabase
      .from('config')
      .select('key, value')
      .in('key', ['working_hours_start', 'working_hours_end', 'booking_slot_minutes']);

    const cfg: Record<string, string> = {};
    cfgRows?.forEach(r => { cfg[r.key] = r.value; });

    const parseTimeToMinutes = (time: string, fallback: number) => {
      const [hStr, mStr] = (time || '').split(':');
      const h = Number(hStr);
      const m = Number(mStr || '0');
      if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
      return h * 60 + m;
    };

    const workingStart = parseTimeToMinutes(cfg.working_hours_start || '09:00', 9 * 60);
    const workingEnd = parseTimeToMinutes(cfg.working_hours_end || '18:00', 18 * 60);
    const slotMinutes = Math.max(15, Number(cfg.booking_slot_minutes || '60') || 60);

    const slots: string[] = [];
    for (let minute = workingStart; minute + slotMinutes <= workingEnd; minute += slotMinutes) {
      const h = Math.floor(minute / 60);
      const m = minute % 60;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }

    const dayStartIso = `${date}T00:00:00`;
    const dayEndIso = `${date}T23:59:59`;

    const { data: appointments } = await supabase
      .from('appointments')
      .select('appointment_date, appointment_end')
      .eq('barber_id', barberId)
      .neq('status', 'cancelled')
      .gte('appointment_date', dayStartIso)
      .lte('appointment_date', dayEndIso);

    const busyRanges: Array<{ start: Date; end: Date }> = [];

    appointments?.forEach((apt) => {
      const start = new Date(apt.appointment_date);
      const end = apt.appointment_end ? new Date(apt.appointment_end) : new Date(start.getTime() + slotMinutes * 60000);
      busyRanges.push({ start, end });
    });

    try {
      const { data: config } = await supabase.from('config').select('value').eq('key', 'google_calendar_tokens').single();
      if (config?.value) {
        const tokens = JSON.parse(config.value);
        oauth2Client.setCredentials(tokens);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const gcalEvents = await calendar.events.list({
          calendarId: 'primary',
          timeMin: new Date(`${date}T00:00:00`).toISOString(),
          timeMax: new Date(`${date}T23:59:59`).toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250,
        });

        gcalEvents.data.items?.forEach((event) => {
          if (!event.start?.dateTime || !event.end?.dateTime) return;
          busyRanges.push({
            start: new Date(event.start.dateTime),
            end: new Date(event.end.dateTime),
          });
        });
      }
    } catch (error) {
      console.warn('Falha ao buscar eventos do Google Calendar para disponibilidade:', error);
    }

    const available = slots.filter((slot) => {
      const slotStart = new Date(`${date}T${slot}:00`);
      const slotEnd = new Date(slotStart.getTime() + slotMinutes * 60000);

      return !busyRanges.some(({ start, end }) => slotStart < end && slotEnd > start);
    });

    res.json(available);
  });

  // --- Google Calendar Auth ---
  app.get("/api/auth/google/config", async (req, res) => {
    let connected = false;
    try {
      if (await getGoogleCalendarClient({ validateConnection: true })) {
        connected = true;
      }
    } catch (e) {}

    res.json({ 
      redirectUri: getGoogleRedirectUri(),
      hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
      hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      configured: hasGoogleCalendarSecrets(),
      connected
    });
  });

  app.get("/api/auth/google/url", (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(400).json({ error: "GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET precisam estar configurados no servidor." });
    }

    if (!getGoogleRedirectUriValue()) {
      return res.status(400).json({ error: "Defina APP_URL ou GOOGLE_REDIRECT_URI para conectar o Google Calendar." });
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [GOOGLE_CALENDAR_SCOPE],
      include_granted_scopes: true,
      prompt: "consent"
    });
    res.json({ url });
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    if (typeof code !== "string" || !code) {
      return res.status(400).send("Codigo de autorizacao do Google nao informado.");
    }

    try {
      const { tokens } = await oauth2Client.getToken(code);

      await saveGoogleTokens(tokens as Record<string, any>);

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS' }, '*');
                window.close();
              } else {
                window.location.href = '/admin';
              }
            </script>
            <p>Conexão com Google Calendar realizada com sucesso! Esta janela fechará automaticamente.</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      res.status(500).send("Erro na autenticação: " + error.message);
    }
  });

  app.delete("/api/auth/google/connection", async (_req, res) => {
    try {
      const tokens = await getStoredGoogleTokens();
      const tokenToRevoke = tokens?.refresh_token || tokens?.access_token;

      if (tokenToRevoke) {
        try {
          await oauth2Client.revokeToken(tokenToRevoke);
        } catch (error) {
          console.warn("Nao foi possivel revogar o token do Google remotamente. Os tokens locais serao removidos.", error);
        }
      }

      await clearStoredGoogleTokens();
      oauth2Client.setCredentials({});

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Falha ao desconectar a conta Google." });
    }
  });

  app.post("/api/calendar/sync", async (req, res) => {
    try {
      const result = await syncGoogleCalendarToLocalAppointments(req.body || {});
      return res.json(result);

      const googleClient = await getGoogleCalendarClient({ validateConnection: true });
      if (!googleClient) return res.status(401).json({ error: "Google Calendar nao conectado." });
      const calendar: any = googleClient.calendar;
      if (false) {
      const { data: config } = await supabase.from('config').select('value').eq('key', 'google_calendar_tokens').single();
      if (!config) return res.status(401).json({ error: "Google Calendar não conectado" });

      const tokens = JSON.parse(config.value);
      oauth2Client.setCredentials(tokens);

      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      }

      // Fetch appointments to sync (only those not already synced)
      const { data: appointments } = await supabase
        .from('appointments')
        .select('*')
        .neq('status', 'cancelled')
        .is('google_event_id', null);

      if (!appointments || appointments.length === 0) return res.json({ message: "Nenhum agendamento novo para sincronizar", count: 0 });

      let count = 0;
      let failed = 0;
      for (const apt of appointments) {
        try {
          const result = await syncAppointmentToGoogleCalendar(apt.id);
          if (result.synced) count++;
          if (false) {
          const start = new Date(apt.appointment_date);
          const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour duration

          const event = await calendar.events.insert({
            calendarId: "primary",
            requestBody: {
              summary: `Corte: ${apt.customers?.name} com ${apt.barbers?.name}`,
              description: `Serviço: ${apt.service_type}`,
              start: { dateTime: start.toISOString() },
              end: { dateTime: end.toISOString() },
            },
          });

          if (event.data.id) {
            await supabase.from('appointments').update({ google_event_id: event.data.id }).eq('id', apt.id);
            count++;
          }
          }
        } catch (e) {
          failed++;
          console.error(`Erro ao sincronizar agendamento ${apt.id}:`, e);
        }
      }

      res.json({ success: true, count, failed, total: appointments.length });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  startGoogleCalendarBackgroundSync();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/") || req.path === "/api" || req.path === "/app-config.js" || path.extname(req.path)) {
        return next();
      }

      res.sendFile(path.resolve("dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
