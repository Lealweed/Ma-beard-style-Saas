import express from "express";
import { createServer as createViteServer } from "vite";
import db from "./src/lib/db";
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_mock", {
  apiVersion: "2026-02-25.clover",
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  
  // Plans
  app.get("/api/plans", (req, res) => {
    const plans = db.prepare("SELECT * FROM plans").all();
    res.json(plans.map((p: any) => ({ ...p, benefits: JSON.parse(p.benefits) })));
  });

  app.put("/api/plans/:id", (req, res) => {
    const { name, price, description, benefits } = req.body;
    db.prepare("UPDATE plans SET name = ?, price = ?, description = ?, benefits = ? WHERE id = ?")
      .run(name, price, description, JSON.stringify(benefits), req.params.id);
    res.json({ success: true });
  });

  // Dashboard Stats
  app.get("/api/stats", (req, res) => {
    const activeSubscribers = db.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'").get() as any;
    const mrr = db.prepare(`
      SELECT SUM(p.price) as total 
      FROM subscriptions s 
      JOIN plans p ON s.plan_id = p.id 
      WHERE s.status = 'active'
    `).get() as any;
    
    const monthlyRevenue = db.prepare(`
      SELECT (
        COALESCE((SELECT SUM(price) FROM services WHERE strftime('%m', date) = strftime('%m', 'now')), 0) +
        COALESCE((SELECT SUM(total_price) FROM sales WHERE strftime('%m', date) = strftime('%m', 'now')), 0)
      ) as total
    `).get() as any;

    const productsLowStock = db.prepare("SELECT COUNT(*) as count FROM products WHERE stock <= min_stock").get() as any;

    res.json({
      activeSubscribers: activeSubscribers.count,
      mrr: mrr.total || 0,
      monthlyRevenue: monthlyRevenue.total || 0,
      lowStockAlerts: productsLowStock.count
    });
  });

  // Appointments CRUD
  app.get("/api/appointments", (req, res) => {
    const appointments = db.prepare(`
      SELECT a.*, c.name as customer_name, c.phone as customer_phone, b.name as barber_name 
      FROM appointments a 
      JOIN customers c ON a.customer_id = c.id 
      JOIN barbers b ON a.barber_id = b.id 
      ORDER BY a.appointment_date ASC
    `).all();
    res.json(appointments);
  });

  app.post("/api/appointments", (req, res) => {
    const { customer_id, barber_id, service_type, appointment_date } = req.body;
    const result = db.prepare("INSERT INTO appointments (customer_id, barber_id, service_type, appointment_date) VALUES (?, ?, ?, ?)").run(customer_id, barber_id, service_type, appointment_date);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/appointments/:id", (req, res) => {
    const { status } = req.body;
    db.prepare("UPDATE appointments SET status = ? WHERE id = ?").run(status, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/appointments/:id", (req, res) => {
    db.prepare("DELETE FROM appointments WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Customers CRUD
  app.get("/api/customers", (req, res) => {
    const customers = db.prepare("SELECT * FROM customers").all();
    res.json(customers);
  });

  app.post("/api/customers", (req, res) => {
    const { name, email, phone, cpf } = req.body;
    try {
      const result = db.prepare("INSERT INTO customers (name, email, phone, cpf) VALUES (?, ?, ?, ?)").run(name, email, phone, cpf);
      res.json({ id: result.lastInsertRowid });
    } catch (e: any) {
      res.status(400).json({ error: "Email ou CPF já cadastrado" });
    }
  });

  app.put("/api/customers/:id", (req, res) => {
    const { name, email, phone, cpf } = req.body;
    db.prepare("UPDATE customers SET name = ?, email = ?, phone = ?, cpf = ? WHERE id = ?")
      .run(name, email, phone, cpf, req.params.id);
    res.json({ success: true });
  });

  // POS (Caixa) - Manual Subscription
  app.post("/api/pos/subscribe", (req, res) => {
    const { customerEmail, planId } = req.body;
    const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(planId) as any;
    if (!plan) return res.status(404).json({ error: "Plano não encontrado" });

    db.prepare("INSERT INTO subscriptions (id, customer_email, plan_id, status) VALUES (?, ?, ?, ?)")
      .run(`manual_${Date.now()}`, customerEmail, planId, 'active');
    
    res.json({ success: true });
  });

  // Reports
  app.get("/api/reports/margins", (req, res) => {
    const margins = db.prepare(`
      SELECT name, cost, price, (price - cost) as margin, 
             ROUND(((price - cost) / price) * 100, 2) as margin_percent
      FROM products
    `).all();
    res.json(margins);
  });

  app.get("/api/reports/productivity", (req, res) => {
    const productivity = db.prepare(`
      SELECT b.name, COUNT(s.id) as total_services, SUM(s.price) as total_revenue, SUM(s.commission_amount) as total_commission
      FROM barbers b
      LEFT JOIN services s ON b.id = s.barber_id
      WHERE b.active = 1
      GROUP BY b.id
    `).all();
    res.json(productivity);
  });

  app.get("/api/reports/analytics", (req, res) => {
    const ticketMedio = db.prepare(`
      SELECT 
        (SELECT AVG(total_price) FROM (
          SELECT total_price FROM sales
          UNION ALL
          SELECT price as total_price FROM services
        )) as avg_ticket,
        (SELECT COUNT(*) FROM customers) as total_customers,
        (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') as active_plans
    `).get() as any;
    res.json(ticketMedio);
  });

  // Barbers CRUD
  app.get("/api/barbers", (req, res) => {
    const barbers = db.prepare("SELECT * FROM barbers WHERE active = 1").all();
    res.json(barbers);
  });

  app.post("/api/barbers", (req, res) => {
    const { name, specialty, commission_rate } = req.body;
    const result = db.prepare("INSERT INTO barbers (name, specialty, commission_rate) VALUES (?, ?, ?)").run(name, specialty, commission_rate);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/barbers/:id", (req, res) => {
    const { name, specialty, commission_rate } = req.body;
    db.prepare("UPDATE barbers SET name = ?, specialty = ?, commission_rate = ? WHERE id = ?")
      .run(name, specialty, commission_rate, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/barbers/:id", (req, res) => {
    db.prepare("UPDATE barbers SET active = 0 WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Products CRUD
  app.get("/api/products", (req, res) => {
    const products = db.prepare("SELECT * FROM products").all();
    res.json(products);
  });

  app.post("/api/products", (req, res) => {
    const { name, cost, price, stock, min_stock } = req.body;
    const result = db.prepare("INSERT INTO products (name, cost, price, stock, min_stock) VALUES (?, ?, ?, ?, ?)").run(name, cost, price, stock, min_stock);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/products/:id", (req, res) => {
    const { name, cost, price, stock, min_stock } = req.body;
    db.prepare("UPDATE products SET name = ?, cost = ?, price = ?, stock = ?, min_stock = ? WHERE id = ?")
      .run(name, cost, price, stock, min_stock, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/products/:id", (req, res) => {
    db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // POS (Caixa)
  app.post("/api/pos/sale", (req, res) => {
    const { productId, quantity } = req.body;
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId) as any;
    
    if (!product || product.stock < quantity) {
      return res.status(400).json({ error: "Estoque insuficiente" });
    }

    const totalPrice = product.price * quantity;
    
    const transaction = db.transaction(() => {
      db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(quantity, productId);
      db.prepare("INSERT INTO sales (product_id, quantity, total_price) VALUES (?, ?, ?)").run(productId, quantity, totalPrice);
    });
    
    transaction();
    res.json({ success: true });
  });

  app.post("/api/pos/service", (req, res) => {
    const { barberId, customerName, serviceType, price } = req.body;
    const barber = db.prepare("SELECT * FROM barbers WHERE id = ?").get(barberId) as any;
    
    if (!barber) return res.status(404).json({ error: "Barbeiro não encontrado" });

    const commissionAmount = price * barber.commission_rate;
    
    db.prepare("INSERT INTO services (barber_id, customer_name, service_type, price, commission_amount) VALUES (?, ?, ?, ?, ?)")
      .run(barberId, customerName, serviceType, price, commissionAmount);
    
    res.json({ success: true });
  });

  // Customers / Subscriptions
  app.get("/api/subscriptions", (req, res) => {
    const subs = db.prepare(`
      SELECT s.*, p.name as plan_name, p.price as plan_price 
      FROM subscriptions s 
      JOIN plans p ON s.plan_id = p.id
      ORDER BY s.created_at DESC
    `).all();
    res.json(subs);
  });

  // Detailed Stats for Charts
  app.get("/api/stats/revenue", (req, res) => {
    const revenueData = db.prepare(`
      SELECT strftime('%d/%m', date) as label, SUM(total_price) as value
      FROM (
        SELECT date, total_price FROM sales
        UNION ALL
        SELECT date, price as total_price FROM services
      )
      WHERE date >= date('now', '-7 days')
      GROUP BY label
      ORDER BY date ASC
    `).all();
    res.json(revenueData);
  });

  // Stripe Checkout
  app.post("/api/create-checkout-session", async (req, res) => {
    const { planId, email } = req.body;
    const plan = db.prepare("SELECT * FROM plans WHERE id = ?").get(planId) as any;

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
  app.post("/api/webhook", (req, res) => {
    const event = req.body;
    // In a real app, verify Stripe signature
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      db.prepare("INSERT INTO subscriptions (id, customer_email, plan_id, status, stripe_subscription_id) VALUES (?, ?, ?, ?, ?)")
        .run(session.id, session.customer_email, "premium", "active", session.subscription);
    }
    res.json({ received: true });
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
