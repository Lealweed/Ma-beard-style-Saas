import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('barber.db');

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    description TEXT,
    benefits TEXT -- JSON string
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    customer_email TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL,
    stripe_subscription_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(plan_id) REFERENCES plans(id)
  );

  CREATE TABLE IF NOT EXISTS barbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    specialty TEXT,
    commission_rate REAL NOT NULL,
    phone TEXT,
    cpf TEXT,
    address TEXT,
    hired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    cpf TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cost REAL NOT NULL,
    price REAL NOT NULL,
    stock INTEGER NOT NULL,
    min_stock INTEGER DEFAULT 5
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barber_id INTEGER NOT NULL,
    customer_name TEXT,
    service_type TEXT NOT NULL,
    price REAL NOT NULL,
    commission_amount REAL NOT NULL,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(barber_id) REFERENCES barbers(id)
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    total_price REAL NOT NULL,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    barber_id INTEGER NOT NULL,
    service_type TEXT NOT NULL,
    appointment_date DATETIME NOT NULL,
    status TEXT DEFAULT 'scheduled',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(barber_id) REFERENCES barbers(id)
  );
`);

// Migrations for existing tables
try { db.exec("ALTER TABLE barbers ADD COLUMN phone TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE barbers ADD COLUMN cpf TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE barbers ADD COLUMN address TEXT;"); } catch (e) {}
try { db.exec("ALTER TABLE barbers ADD COLUMN hired_at DATETIME DEFAULT CURRENT_TIMESTAMP;"); } catch (e) {}

// Seed plans if empty
const planCount = db.prepare('SELECT COUNT(*) as count FROM plans').get() as { count: number };
if (planCount.count === 0) {
  const insertPlan = db.prepare('INSERT INTO plans (id, name, price, description, benefits) VALUES (?, ?, ?, ?, ?)');
  insertPlan.run('basic', 'Plano Basic', 89, 'Praticidade e economia para o dia a dia.', JSON.stringify(['2 cortes por mês', '1 barba', '5% desconto em produtos']));
  insertPlan.run('premium', 'Plano Premium', 149, 'O mais escolhido para quem quer estar sempre impecável.', JSON.stringify(['4 cortes por mês', '2 barbas', 'Prioridade no agendamento', '10% desconto em produtos']));
  insertPlan.run('vip', 'Plano VIP', 199, 'Experiência completa e ilimitada.', JSON.stringify(['Corte ilimitado (1 por semana)', 'Barba ilimitada (1 por semana)', 'Atendimento prioritário', '15% desconto em produtos', 'Brinde mensal']));
}

// Seed some barbers if empty
const barberCount = db.prepare('SELECT COUNT(*) as count FROM barbers').get() as { count: number };
if (barberCount.count === 0) {
  const insertBarber = db.prepare('INSERT INTO barbers (name, specialty, commission_rate) VALUES (?, ?, ?)');
  insertBarber.run('Carlos Silva', 'Corte & Barba', 0.4);
  insertBarber.run('Ricardo Santos', 'Degradê & Pigmentação', 0.4);
}

// Seed some products if empty
const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
if (productCount.count === 0) {
  const insertProduct = db.prepare('INSERT INTO products (name, cost, price, stock, min_stock) VALUES (?, ?, ?, ?, ?)');
  insertProduct.run('Pomada Modeladora Matte', 25, 45, 15, 5);
  insertProduct.run('Óleo para Barba Premium', 30, 60, 3, 5);
  insertProduct.run('Shampoo Masculino 3 em 1', 20, 40, 20, 5);
}

export default db;
