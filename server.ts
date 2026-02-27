import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_mock", {
  apiVersion: "2025-01-27.acacia" as any,
});

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json());

  // API Routes
  
  // Plans
  app.get("/api/plans", async (req, res) => {
    try {
      const { data, error } = await supabase.from('plans').select('*');
      if (error) throw error;
      
      if (data && data.length > 0) {
        return res.json(data.map((p: any) => ({ 
          ...p, 
          benefits: typeof p.benefits === 'string' ? JSON.parse(p.benefits) : p.benefits 
        })));
      }
    } catch (e) {
      console.error("Erro ao buscar planos do Supabase, usando fallback");
    }

    // Fallback plans
    const fallbackPlans = [
      { id: 'basic', name: 'Plano Basic', price: 89, description: 'Praticidade e economia para o dia a dia.', benefits: ['2 cortes por mês', '1 barba', '5% desconto em produtos'] },
      { id: 'premium', name: 'Plano Premium', price: 149, description: 'O mais escolhido para quem quer estar sempre impecável.', benefits: ['4 cortes por mês', '2 barbas', 'Prioridade no agendamento', '10% desconto em produtos'] },
      { id: 'vip', name: 'Plano VIP', price: 199, description: 'Experiência completa e ilimitada.', benefits: ['Corte ilimitado (1 por semana)', 'Barba ilimitada (1 por semana)', 'Atendimento prioritário', '15% desconto em produtos', 'Brinde mensal'] }
    ];
    res.json(fallbackPlans);
  });

  app.put("/api/plans/:id", async (req, res) => {
    const { name, price, description, benefits } = req.body;
    const { error } = await supabase
      .from('plans')
      .update({ name, price, description, benefits: JSON.stringify(benefits) })
      .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
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
      // We'll just fetch products and filter for simplicity in this demo, or use a better query
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
    const { customer_id, barber_id, service_type, appointment_date } = req.body;
    const { data, error } = await supabase
      .from('appointments')
      .insert([{ customer_id, barber_id, service_type, appointment_date }])
      .select();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data[0].id });
  });

  app.put("/api/appointments/:id", async (req, res) => {
    const { status } = req.body;
    const { error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/appointments/:id", async (req, res) => {
    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Customers CRUD
  app.get("/api/customers", async (req, res) => {
    const { data, error } = await supabase.from('customers').select('*').order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  });

  app.post("/api/customers", async (req, res) => {
    const { name, email, phone, cpf } = req.body;
    const { data, error } = await supabase
      .from('customers')
      .insert([{ name, email, phone, cpf }])
      .select();
    
    if (error) return res.status(400).json({ error: "Email ou CPF já cadastrado" });
    res.json({ id: data[0].id });
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
    const { data: plan } = await supabase.from('plans').select('*').eq('id', planId).single();

    if (!plan) return res.status(404).json({ error: "Plan not found" });

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "brl",
              product_data: {
                name: plan.name,
                description: plan.description,
              },
              unit_amount: plan.price * 100,
              recurring: { interval: "month" },
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${process.env.APP_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL}/plans`,
        customer_email: email,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Webhook (Simplified for demo)
  app.post("/api/webhook", async (req, res) => {
    const event = req.body;
    // In a real app, verify Stripe signature
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      await supabase.from('subscriptions').insert([{
        id: session.id,
        customer_email: session.customer_email,
        plan_id: "premium", // Simplified
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
