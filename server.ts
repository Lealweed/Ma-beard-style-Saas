import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();

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

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || (process.env.APP_URL ? `${process.env.APP_URL}/api/auth/google/callback` : undefined)
);

// Helper to get redirect URI for display
const getGoogleRedirectUri = () => {
  return process.env.GOOGLE_REDIRECT_URI || (process.env.APP_URL ? `${process.env.APP_URL}/api/auth/google/callback` : "URL não configurada (defina APP_URL)");
};

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

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
      const { data: config } = await supabase.from('config').select('value').eq('key', 'google_calendar_tokens').single();
      if (config?.value) {
        const tokens = JSON.parse(config.value);
        oauth2Client.setCredentials(tokens);
        const calendar = google.calendar({ version: "v3", auth: oauth2Client });
        await calendar.calendarList.list({ maxResults: 1 });
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
            
            const event = await calendar.events.insert({
              calendarId: "primary",
              requestBody: {
                summary: `Corte: ${fullApt.customers?.name} com ${fullApt.barbers?.name}`,
                description: `Serviço: ${fullApt.service_type}`,
                start: { dateTime: start.toISOString() },
                end: { dateTime: end.toISOString() },
              },
            });

            if (event.data.id) {
              await supabase.from('appointments').update({ google_event_id: event.data.id }).eq('id', data[0].id);
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
      if (oldApt.google_event_id) {
        try {
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
                    summary: `Corte: ${updatedApt.customers?.name} com ${updatedApt.barber_name || updatedApt.barbers?.name}`,
                    description: `Serviço: ${updatedApt.service_type}`,
                    start: { dateTime: start.toISOString() },
                    end: { dateTime: end.toISOString() },
                  },
                });
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
          const { data: config } = await supabase.from('config').select('value').eq('key', 'google_calendar_tokens').single();
          if (config) {
            const tokens = JSON.parse(config.value);
            oauth2Client.setCredentials(tokens);
            const calendar = google.calendar({ version: "v3", auth: oauth2Client });
            await calendar.events.delete({ calendarId: "primary", eventId: apt.google_event_id });
          }
        } catch (syncErr) {
          console.error("Erro ao excluir agendamento no Google:", syncErr);
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
    const { name, specialty, commission_rate } = req.body;
    const { data, error } = await supabase
      .from('barbers')
      .insert([{ name, specialty, commission_rate, active: true }])
      .select();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data[0].id });
  });

  app.put("/api/barbers/:id", async (req, res) => {
    const { name, specialty, commission_rate } = req.body;
    const { error } = await supabase
      .from('barbers')
      .update({ name, specialty, commission_rate })
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
    const { name, cost, price, stock, min_stock } = req.body;
    const { data, error } = await supabase
      .from('products')
      .insert([{ name, cost, price, stock, min_stock }])
      .select();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data[0].id });
  });

  app.put("/api/products/:id", async (req, res) => {
    const { name, cost, price, stock, min_stock } = req.body;
    const { error } = await supabase
      .from('products')
      .update({ name, cost, price, stock, min_stock })
      .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/products/:id", async (req, res) => {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', req.params.id);
    
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
    
    await supabase.from('products').update({ stock: product.stock - quantity }).eq('id', productId);
    await supabase.from('sales').insert([{ product_id: productId, quantity, total_price: totalPrice }]);
    
    res.json({ success: true });
  });

  app.post("/api/pos/service", async (req, res) => {
    const { barberId, customerName, serviceType, price } = req.body;
    const { data: barber } = await supabase.from('barbers').select('*').eq('id', barberId).single();
    
    if (!barber) return res.status(404).json({ error: "Barbeiro não encontrado" });

    const commissionAmount = price * barber.commission_rate;
    
    const { error } = await supabase.from('services').insert([{
      barber_id: barberId,
      customer_name: customerName,
      service_type: serviceType,
      price,
      commission_amount: commissionAmount
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

  app.get("/api/public/available-slots", async (req, res) => {
    const { barberId, date } = req.query;
    // Lógica simplificada: 09:00 às 18:00, de 1 em 1 hora
    const slots = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
    
    const { data: appointments } = await supabase
      .from('appointments')
      .select('appointment_date')
      .eq('barber_id', barberId)
      .gte('appointment_date', `${date}T00:00:00`)
      .lte('appointment_date', `${date}T23:59:59`);
    
    const bookedHours = appointments?.map(a => new Date(a.appointment_date).getHours().toString().padStart(2, '0') + ":00") || [];
    const available = slots.filter(s => !bookedHours.includes(s));
    
    res.json(available);
  });

  // --- Google Calendar Auth ---
  app.get("/api/auth/google/config", async (req, res) => {
    let connected = false;
    try {
      const { data: config } = await supabase.from('config').select('value').eq('key', 'google_calendar_tokens').single();
      if (config) {
        const tokens = JSON.parse(config.value);
        oauth2Client.setCredentials(tokens);
        const calendar = google.calendar({ version: "v3", auth: oauth2Client });
        await calendar.calendarList.list({ maxResults: 1 });
        connected = true;
      }
    } catch (e) {}

    res.json({ 
      redirectUri: getGoogleRedirectUri(),
      hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
      hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      connected
    });
  });

  app.get("/api/auth/google/url", (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/calendar.events"],
      prompt: "consent"
    });
    res.json({ url });
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);

      await supabase.from('config').upsert({ 
        key: 'google_calendar_tokens', 
        value: JSON.stringify(tokens) 
      }, { onConflict: 'key' });

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

  app.post("/api/calendar/sync", async (req, res) => {
    try {
      const { data: config } = await supabase.from('config').select('value').eq('key', 'google_calendar_tokens').single();
      if (!config) return res.status(401).json({ error: "Google Calendar não conectado" });

      const tokens = JSON.parse(config.value);
      oauth2Client.setCredentials(tokens);

      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      // Fetch appointments to sync (only those not already synced)
      const { data: appointments } = await supabase
        .from('appointments')
        .select('*, customers(name), barbers(name)')
        .eq('status', 'pending')
        .is('google_event_id', null);

      if (!appointments || appointments.length === 0) return res.json({ message: "Nenhum agendamento novo para sincronizar", count: 0 });

      let count = 0;
      for (const apt of appointments) {
        try {
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
        } catch (e) {
          console.error(`Erro ao sincronizar agendamento ${apt.id}:`, e);
        }
      }

      res.json({ success: true, count });
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
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
