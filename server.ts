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

const getGoogleEventRequestBody = async (appointment: any) => {
  const durationMinutes = await getAppointmentDurationMinutes();
  const start = new Date(appointment.appointment_date);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
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
      ];

  return {
    summary,
    description: descriptionLines.filter(Boolean).join("\n"),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
};

const getAppointmentForGoogleSync = async (appointmentId: number | string) => {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("appointments")
    .select("*, customers(name, phone), barbers(name)")
    .eq("id", appointmentId)
    .single();

  if (error) throw error;
  return data;
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
        calendarId: "primary",
        eventId: appointment.google_event_id,
      });
    } catch (error) {
      if (!isGoogleNotFoundError(error)) throw error;
    }

    await supabase!.from("appointments").update({ google_event_id: null }).eq("id", appointmentId);
    return { synced: true, action: "deleted", eventId: null };
  }

  const requestBody = await getGoogleEventRequestBody(appointment);

  if (appointment.google_event_id) {
    try {
      await googleClient.calendar.events.patch({
        calendarId: "primary",
        eventId: appointment.google_event_id,
        requestBody,
      });

      return { synced: true, action: "updated", eventId: appointment.google_event_id };
    } catch (error) {
      if (!isGoogleNotFoundError(error)) throw error;
    }
  }

  const event = await googleClient.calendar.events.insert({
    calendarId: "primary",
    requestBody,
  });

  const eventId = event.data.id || null;
  if (eventId) {
    await supabase!.from("appointments").update({ google_event_id: eventId }).eq("id", appointmentId);
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
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        customers (name, phone),
        barbers (name)
      `)
      .order('appointment_date', { ascending: true });
    
    if (error) return res.status(500).json({ error: error.message });

    const formatted = data?.map(a => ({
      ...a,
      customer_name: a.customers?.name,
      customer_phone: a.customers?.phone,
      barber_name: a.barbers?.name
    }));
    
    res.json(formatted || []);
  });

  app.post("/api/appointments", async (req, res) => {
    const { customer_id, barber_id, service_type, appointment_date, status } = req.body;
    try {
      const { data, error } = await supabase
        .from('appointments')
        .insert([{ customer_id, barber_id, service_type, appointment_date, status: status || 'pending' }])
        .select();
      
      if (error) throw error;
      
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
    const { status, appointment_date, service_type, barber_id } = req.body;
    const { id } = req.params;
    
    try {
      const { data: oldApt, error: fetchError } = await supabase.from('appointments').select('*').eq('id', id).single();
      if (fetchError) throw fetchError;

      const updateData: any = {};
      if (status !== undefined) updateData.status = status;
      if (appointment_date !== undefined) updateData.appointment_date = appointment_date;
      if (service_type !== undefined) updateData.service_type = service_type;
      if (barber_id !== undefined) updateData.barber_id = barber_id;

      const { error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', id);
      
      if (error) throw error;

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
      .select('appointment_date')
      .eq('barber_id', barberId)
      .neq('status', 'cancelled')
      .gte('appointment_date', dayStartIso)
      .lte('appointment_date', dayEndIso);

    const busyRanges: Array<{ start: Date; end: Date }> = [];

    appointments?.forEach((apt) => {
      const start = new Date(apt.appointment_date);
      const end = new Date(start.getTime() + slotMinutes * 60000);
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
      scope: ["https://www.googleapis.com/auth/calendar.events"],
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
