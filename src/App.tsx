import React, { useState, useEffect } from 'react';
import { 
  Check, Crown, Scissors, User, Package, LayoutDashboard, TrendingUp, 
  Users, ShoppingBag, AlertTriangle, Menu, X, Plus, Trash2, Edit2, 
  DollarSign, CreditCard, History, Settings, LogOut, ChevronRight,
  Search, Filter, MoreVertical, Save, ArrowRight, FileText, PieChart,
  Lock, Mail, Key, Star, Calendar, MessageCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, BarChart, Bar, Cell 
} from 'recharts';
import { supabase, isSupabaseConfigured, getSupabaseDiagnostics, testSupabaseConnection } from './lib/supabase';
import { Session } from '@supabase/supabase-js';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Plan {
  id: string;
  name: string;
  price: number;
  description: string;
  benefits: string[];
}

interface Stats {
  activeSubscribers: number;
  mrr: number;
  monthlyRevenue: number;
  lowStockAlerts: number;
}

interface Barber {
  id: number;
  name: string;
  specialty: string;
  commission_rate: number;
  photo_url?: string;
  phone?: string;
  cpf?: string;
  address?: string;
  hired_at?: string;
}

interface Customer {
  id: number;
  name: string;
  email: string;
  phone?: string;
  cpf?: string;
  created_at?: string;
}

interface Product {
  id: number;
  name: string;
  cost: number;
  price: number;
  stock: number;
  min_stock: number;
}

interface Subscription {
  id: string;
  customer_email: string;
  plan_id: string;
  plan_name: string;
  plan_price: number;
  status: string;
  created_at: string;
}

interface Appointment {
  id: number;
  customer_id: number;
  barber_id: number;
  service_type: string;
  appointment_date: string;
  status: string;
  customer_name?: string;
  customer_phone?: string;
  barber_name?: string;
}

// --- Components ---

const Navbar = ({ activeTab, setActiveTab, session }: { activeTab: string, setActiveTab: (t: string) => void, session: Session | null }) => {
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { id: 'landing', label: 'Início', icon: Scissors },
    { id: 'admin', label: 'Dashboard', icon: LayoutDashboard },
  ];

  const handleLogout = async () => {
    if (!isSupabaseConfigured) return;
    await supabase.auth.signOut();
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
              <Scissors className="text-black w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tighter text-white uppercase">MA BEARD STYLE</span>
          </div>
          
          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-baseline space-x-4">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
                    activeTab === item.id 
                      ? "bg-white text-black" 
                      : "text-gray-300 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </button>
              ))}
            </div>
            {session && (
              <button 
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-white transition-colors"
                title="Sair"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="md:hidden">
            <button onClick={() => setIsOpen(!isOpen)} className="text-gray-300">
              {isOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-black border-b border-white/10"
          >
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setIsOpen(false); }}
                  className={cn(
                    "block px-3 py-2 rounded-md text-base font-medium w-full text-left flex items-center gap-3",
                    activeTab === item.id ? "bg-white text-black" : "text-gray-300"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const LandingPage = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [videoUrl, setVideoUrl] = useState("https://assets.mixkit.co/videos/preview/mixkit-barber-cutting-hair-with-scissors-close-up-42862-large.mp4");

  useEffect(() => {
    fetch('/api/plans').then(res => res.json()).then(setPlans);
    
    // Try to fetch video from Supabase Storage if configured
    const fetchVideo = async () => {
      if (!isSupabaseConfigured) return;
      try {
        const { data } = supabase.storage.from('videos').getPublicUrl('hero-video.mp4');
        if (data?.publicUrl) {
          // Check if file exists by doing a head request or just use it if you trust it's there
          setVideoUrl(data.publicUrl);
        }
      } catch (e) {
        console.log("Using default video");
      }
    };
    fetchVideo();
  }, []);

  const handleSubscribe = async (planId: string) => {
    const email = prompt("Digite seu e-mail para continuar:");
    if (!email) return;

    const res = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, email })
    });
    const { url } = await res.json();
    if (url) window.location.href = url;
  };

  return (
    <div className="relative overflow-hidden">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-white/5 blur-[120px] rounded-full" />
      </div>

      {/* Hero Section with Video Background */}
      <section className="relative h-[85vh] min-h-[600px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <video autoPlay muted loop playsInline key={videoUrl} className="w-full h-full object-cover scale-105">
            <source src={videoUrl} type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black" />
        </div>

        <div className="relative z-10 px-4 max-w-7xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }}>
            <h1 className="text-7xl md:text-9xl font-light tracking-tighter text-white mb-8 leading-[0.85]">
              MA BEARD <br />
              <span className="italic font-serif text-white/30">STYLE</span>
            </h1>
            <p className="text-gray-200 text-lg md:text-2xl max-w-2xl mx-auto mb-12 leading-relaxed font-light drop-shadow-lg">
              A excelência em cada detalhe. <br />
              <span className="text-white font-medium">Assine</span> e mantenha seu estilo impecável todos os dias.
            </p>
            <div className="flex flex-wrap justify-center gap-6">
              <button onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })} className="px-10 py-5 bg-white text-black rounded-full font-bold hover:bg-gray-200 transition-all active:scale-95 shadow-[0_20px_50px_rgba(255,255,255,0.15)]">
                Ver Planos de Assinatura
              </button>
              <button className="px-10 py-5 bg-white/10 text-white border border-white/20 backdrop-blur-md rounded-full font-bold hover:bg-white/20 transition-all">
                Conhecer a Unidade
              </button>
            </div>
          </motion.div>
        </div>

        <motion.div animate={{ y: [0, 10, 0] }} transition={{ duration: 2, repeat: Infinity }} className="absolute bottom-10 left-1/2 -translate-x-1/2 text-white/30">
          <div className="w-px h-12 bg-gradient-to-b from-white/50 to-transparent mx-auto" />
        </motion.div>
      </section>

      {/* Plans Section */}
      <section id="plans" className="py-20 px-4 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div className="max-w-xl">
            <h2 className="text-3xl md:text-4xl font-light text-white mb-4">Escolha seu Plano</h2>
            <p className="text-gray-500">Praticidade, economia e a garantia de estar sempre pronto para qualquer ocasião.</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold tracking-widest text-white/40 uppercase">
            <TrendingUp className="w-4 h-4" />
            Recorrência Garantida
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan, idx) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className={cn(
                "relative p-8 rounded-[2.5rem] border transition-all duration-500 group overflow-hidden",
                plan.id === 'premium' 
                  ? "bg-white text-black border-white shadow-[0_30px_60px_-15px_rgba(255,255,255,0.3)] scale-105 z-10" 
                  : "bg-zinc-900/40 text-white border-white/5 hover:border-white/20 backdrop-blur-sm"
              )}
            >
              {plan.id === 'premium' && <div className="absolute top-6 right-6"><Crown className="w-6 h-6 text-black" /></div>}
              <div className="mb-8">
                <div className={cn("text-[10px] uppercase tracking-[0.2em] font-bold mb-4", plan.id === 'premium' ? "text-black/40" : "text-white/40")}>
                  {plan.id === 'vip' ? 'Experiência Elite' : 'Assinatura Mensal'}
                </div>
                <h3 className="text-2xl font-semibold mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-light tracking-tighter">R$ {plan.price}</span>
                  <span className="text-sm opacity-60">/mês</span>
                </div>
                <p className={cn("mt-6 text-sm leading-relaxed", plan.id === 'premium' ? "text-black/70" : "text-gray-400")}>
                  {plan.description}
                </p>
              </div>
              <div className={cn("h-px w-full mb-8", plan.id === 'premium' ? "bg-black/10" : "bg-white/10")} />
              <ul className="space-y-4 mb-10">
                {plan.benefits.map((benefit, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <div className={cn("w-5 h-5 rounded-full flex items-center justify-center", plan.id === 'premium' ? "bg-black text-white" : "bg-white/10 text-white")}>
                      <Check className="w-3 h-3" />
                    </div>
                    {benefit}
                  </li>
                ))}
              </ul>
              <button onClick={() => handleSubscribe(plan.id)} className={cn("w-full py-5 rounded-2xl font-bold transition-all active:scale-95 text-sm uppercase tracking-widest", plan.id === 'premium' ? "bg-black text-white hover:bg-zinc-800" : "bg-white text-black hover:bg-gray-200")}>
                Assinar Plano
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-900/20 to-black pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-light mb-6">Por que se tornar um <span className="font-serif italic text-white/50">Membro?</span></h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-lg">Muito mais do que um corte de cabelo. Uma assinatura pensada para homens que valorizam tempo, dinheiro e uma aparência sempre impecável.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-gradient-to-br from-zinc-900 to-black border border-white/10 p-8 rounded-[2rem] hover:border-white/30 transition-all group">
              <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform group-hover:bg-white/10">
                <Crown className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-4">Sempre Impecável</h3>
              <p className="text-gray-400 leading-relaxed">
                Corte e barba sempre em dia. Nunca mais se preocupe em tentar encaixar um horário de última hora para aquele evento importante ou reunião de negócios.
              </p>
            </div>

            <div className="bg-gradient-to-br from-zinc-900 to-black border border-white/10 p-8 rounded-[2rem] hover:border-white/30 transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[50px] rounded-full" />
              <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold mb-4">Economia Inteligente</h3>
              <p className="text-gray-400 leading-relaxed">
                Pague um valor fixo mensal e <strong className="text-white font-medium">economize até 40%</strong> comparado aos cortes avulsos. O melhor custo-benefício para manter seu estilo.
              </p>
            </div>

            <div className="bg-gradient-to-br from-zinc-900 to-black border border-white/10 p-8 rounded-[2rem] hover:border-white/30 transition-all group">
              <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform group-hover:bg-white/10">
                <Star className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-4">Tratamento VIP</h3>
              <p className="text-gray-400 leading-relaxed">
                Prioridade total de agendamento, descontos exclusivos em pomadas e óleos, e aquela cerveja gelada sempre te esperando. Você não é só um cliente, é um membro.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-black border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-light mb-4">Prova Social</h2>
          <p className="text-gray-500 max-w-2xl mx-auto">
            As avaliações públicas serão exibidas aqui após a configuração das integrações oficiais da operação.
          </p>
        </div>
      </section>
    </div>
  );
};

const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<'overview' | 'pos' | 'appointments' | 'barbers' | 'inventory' | 'customers' | 'reports' | 'plans' | 'settings'>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    fetch('/api/stats').then(res => res.json()).then(setStats);
    fetch('/api/stats/revenue').then(res => res.json()).then(setRevenueData);
  }, [activeView]);

  const menuItems = [
    { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'pos', label: 'Caixa (PDV)', icon: CreditCard },
    { id: 'appointments', label: 'Agendamentos', icon: Calendar },
    { id: 'barbers', label: 'Gestão de Equipe', icon: Scissors },
    { id: 'inventory', label: 'Cadastro de Produtos', icon: Package },
    { id: 'customers', label: 'Clientes', icon: Users },
    { id: 'reports', label: 'Relatórios', icon: FileText },
    { id: 'plans', label: 'Cadastro de Planos', icon: Crown },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  if (!stats) return <div className="pt-32 text-center text-white">Carregando painel...</div>;

  return (
    <div className="flex min-h-screen bg-[#050505] text-white pt-16">
      <aside className={cn("fixed left-0 top-16 bottom-0 z-40 bg-black border-r border-white/5 transition-all duration-300", sidebarOpen ? "w-64" : "w-20")}>
        <div className="flex flex-col h-full p-4">
          <div className="space-y-2 flex-1">
            {menuItems.map((item) => (
              <button key={item.id} onClick={() => setActiveView(item.id as any)} className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group", activeView === item.id ? "bg-white text-black shadow-[0_10px_20px_rgba(255,255,255,0.1)]" : "text-gray-500 hover:text-white hover:bg-white/5")}>
                <item.icon className={cn("w-5 h-5 shrink-0", activeView === item.id ? "text-black" : "group-hover:scale-110 transition-transform")} />
                {sidebarOpen && <span className="font-medium text-sm">{item.label}</span>}
              </button>
            ))}
          </div>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-3 rounded-xl bg-white/5 text-gray-500 hover:text-white transition-colors flex justify-center">
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </aside>

      <main className={cn("flex-1 transition-all duration-300 p-8", sidebarOpen ? "ml-64" : "ml-20")}>
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h2 className="text-4xl font-light tracking-tight mb-2">{menuItems.find(i => i.id === activeView)?.label}</h2>
            <p className="text-gray-500 text-sm">Gerencie sua barbearia com precisão cirúrgica.</p>
          </div>
          <div className="bg-zinc-900 border border-white/5 rounded-full px-4 py-2 flex items-center gap-3">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-bold tracking-widest uppercase text-gray-400">Sistema Online</span>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div key={activeView} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {activeView === 'overview' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatCard label="Assinantes" value={stats.activeSubscribers} icon={Users} trend="+12%" />
                  <StatCard label="MRR" value={`R$ ${stats.mrr}`} icon={TrendingUp} trend="+R$ 450" />
                  <StatCard label="Receita Total" value={`R$ ${stats.monthlyRevenue}`} icon={DollarSign} />
                  <StatCard label="Alertas Estoque" value={stats.lowStockAlerts} icon={AlertTriangle} variant={stats.lowStockAlerts > 0 ? 'warning' : 'default'} />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-8">
                    <h3 className="text-lg font-medium mb-8 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-500" /> Fluxo de Receita (7 dias)</h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={revenueData}>
                          <defs><linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ffffff" stopOpacity={0.3}/><stop offset="95%" stopColor="#ffffff" stopOpacity={0}/></linearGradient></defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                          <XAxis dataKey="label" stroke="#ffffff40" fontSize={12} tickLine={false} axisLine={false} />
                          <YAxis stroke="#ffffff40" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} />
                          <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #ffffff10', borderRadius: '12px' }} itemStyle={{ color: '#fff' }} />
                          <Area type="monotone" dataKey="value" stroke="#ffffff" fillOpacity={1} fill="url(#colorValue)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-8">
                    <h3 className="text-lg font-medium mb-8">Atalhos Rápidos</h3>
                    <div className="space-y-4">
                      <QuickAction label="Novo Agendamento" icon={Calendar} onClick={() => setActiveView('appointments')} />
                      <QuickAction label="Registrar Venda" icon={ShoppingBag} onClick={() => setActiveView('pos')} />
                      <QuickAction label="Gestão de Equipe" icon={Scissors} onClick={() => setActiveView('barbers')} />
                      <QuickAction label="Cadastro de Produtos" icon={Package} onClick={() => setActiveView('inventory')} />
                      <QuickAction label="Cadastro de Planos" icon={Crown} onClick={() => setActiveView('plans')} />
                      <QuickAction label="Ver Clientes" icon={Users} onClick={() => setActiveView('customers')} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeView === 'pos' && <POSSystem />}
            {activeView === 'appointments' && <AppointmentsManager />}
            {activeView === 'barbers' && <BarberManager />}
            {activeView === 'inventory' && <InventoryManager />}
            {activeView === 'customers' && <CustomerManager />}
            {activeView === 'reports' && <ReportsView />}
            {activeView === 'plans' && <PlansManager />}
            {activeView === 'settings' && <SettingsView />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};

const StatCard = ({ label, value, icon: Icon, trend, variant = 'default' }: { label: string, value: string | number, icon: any, trend?: string, variant?: 'default' | 'warning' }) => (
  <div className={cn("p-6 rounded-2xl border bg-zinc-900/50", variant === 'warning' ? "border-amber-500/20" : "border-white/5")}>
    <div className="flex items-center justify-between mb-4">
      <div className={cn("p-2 rounded-lg", variant === 'warning' ? "bg-amber-500/10 text-amber-500" : "bg-white/5 text-gray-400")}>
        <Icon className="w-5 h-5" />
      </div>
      {trend && <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">{trend}</span>}
    </div>
    <div className="text-2xl font-light text-white mb-1">{value}</div>
    <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
  </div>
);

const QuickAction = ({ label, icon: Icon, onClick }: { label: string, icon: any, onClick: () => void }) => (
  <button onClick={onClick} className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
      <span className="text-sm font-medium">{label}</span>
    </div>
    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors" />
  </button>
);

const AppointmentsManager = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [editing, setEditing] = useState<Partial<Appointment> | null>(null);

  const fetchData = () => {
    fetch('/api/appointments').then(res => res.json()).then(setAppointments);
    fetch('/api/customers').then(res => res.json()).then(setCustomers);
    fetch('/api/barbers').then(res => res.json()).then(setBarbers);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSave = async () => {
    const method = editing?.id ? 'PUT' : 'POST';
    const url = editing?.id ? `/api/appointments/${editing.id}` : '/api/appointments';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
    setEditing(null);
    fetchData();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja realmente cancelar este agendamento?')) return;
    await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
    fetchData();
  };

  const sendWhatsAppReminder = (apt: Appointment) => {
    if (!apt.customer_phone) {
      alert('Cliente sem telefone cadastrado.');
      return;
    }
    const dateStr = new Date(apt.appointment_date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const text = `Olá ${apt.customer_name}! Passando para lembrar do seu agendamento na MA BEARD STYLE.\n\nServiço: ${apt.service_type}\nBarbeiro: ${apt.barber_name}\nData/Hora: ${dateStr}\n\nTe esperamos lá!`;
    const url = `https://wa.me/55${apt.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button onClick={() => setEditing({ customer_id: 0, barber_id: 0, service_type: '', appointment_date: new Date().toISOString().slice(0, 16) })} className="bg-white text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-200 transition-all">
          <Plus className="w-4 h-4" /> Novo Agendamento
        </button>
      </div>

      <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-gray-500 border-b border-white/5">
              <th className="px-8 py-6 font-medium">Data/Hora</th>
              <th className="px-8 py-6 font-medium">Cliente</th>
              <th className="px-8 py-6 font-medium">Barbeiro</th>
              <th className="px-8 py-6 font-medium">Serviço</th>
              <th className="px-8 py-6 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {appointments.map((apt) => (
              <tr key={apt.id} className="text-sm text-gray-300 hover:bg-white/5 transition-colors group">
                <td className="px-8 py-6 font-medium text-white">{new Date(apt.appointment_date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="px-8 py-6">{apt.customer_name}</td>
                <td className="px-8 py-6">{apt.barber_name}</td>
                <td className="px-8 py-6">{apt.service_type}</td>
                <td className="px-8 py-6 text-right">
                  <div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => sendWhatsAppReminder(apt)} className="p-2 hover:bg-emerald-500/10 rounded-lg text-gray-400 hover:text-emerald-500 transition-colors" title="Lembrete WhatsApp">
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(apt.id)} className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500 transition-colors" title="Cancelar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {appointments.length === 0 && (
              <tr><td colSpan={5} className="px-8 py-12 text-center text-gray-500">Nenhum agendamento encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-medium mb-6">Novo Agendamento</h3>
            <div className="space-y-4">
              <select value={editing.customer_id || ''} onChange={e => setEditing({...editing, customer_id: Number(e.target.value)})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm">
                <option value="">Selecione o Cliente</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={editing.barber_id || ''} onChange={e => setEditing({...editing, barber_id: Number(e.target.value)})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm">
                <option value="">Selecione o Barbeiro</option>
                {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <input placeholder="Tipo de Serviço (ex: Corte e Barba)" value={editing.service_type} onChange={e => setEditing({...editing, service_type: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
              <input type="datetime-local" value={editing.appointment_date} onChange={e => setEditing({...editing, appointment_date: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
              <div className="flex gap-4 pt-4">
                <button onClick={() => setEditing(null)} className="flex-1 py-4 rounded-xl bg-white/5 font-bold">Cancelar</button>
                <button onClick={handleSave} className="flex-1 py-4 rounded-xl bg-white text-black font-bold">Salvar</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const POSSystem = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<{product?: Product, plan?: Plan, quantity: number}[]>([]);
  const [serviceData, setServiceData] = useState({ barberId: '', customerId: '', serviceType: '', price: '' });
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [receipt, setReceipt] = useState<{ text: string, phone: string } | null>(null);

  useEffect(() => {
    fetch('/api/products').then(res => res.json()).then(setProducts);
    fetch('/api/barbers').then(res => res.json()).then(setBarbers);
    fetch('/api/plans').then(res => res.json()).then(setPlans);
    fetch('/api/customers').then(res => res.json()).then(setCustomers);
  }, []);

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.product?.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.product?.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const addPlanToCart = (plan: Plan) => {
    const existing = cart.find(item => item.plan?.id === plan.id);
    if (existing) return; // Only one plan per sale usually
    setCart([...cart, { plan, quantity: 1 }]);
  };

  const finalizeSale = async () => {
    if (!selectedCustomer) {
      alert("Selecione um cliente para a venda.");
      return;
    }
    const customer = customers.find(c => c.id.toString() === selectedCustomer);
    if (!customer) return;

    let total = 0;
    let itemsText = '';

    for (const item of cart) {
      if (item.product) {
        await fetch('/api/pos/sale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: item.product.id, quantity: item.quantity }) });
        const itemTotal = item.product.price * item.quantity;
        total += itemTotal;
        itemsText += `- ${item.quantity}x ${item.product.name}: R$ ${itemTotal.toFixed(2)}\n`;
      } else if (item.plan) {
        await fetch('/api/pos/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerEmail: customer.email, planId: item.plan.id }) });
        const itemTotal = item.plan.price * item.quantity;
        total += itemTotal;
        itemsText += `- Assinatura ${item.plan.name}: R$ ${itemTotal.toFixed(2)}/mês\n`;
      }
    }

    const receiptText = `*MA BEARD STYLE - COMPROVANTE*\n\nOlá ${customer.name}!\n\n*Itens:*\n${itemsText}\n*Total: R$ ${total.toFixed(2)}*\n\nObrigado pela preferência!`;

    setCart([]);
    if (customer.phone) {
      setReceipt({ text: receiptText, phone: customer.phone.replace(/\D/g, '') });
    } else {
      alert('Venda finalizada com sucesso! (Cliente sem telefone cadastrado)');
    }
  };

  const finalizeService = async () => {
    if (!serviceData.customerId) {
      alert("Selecione o cliente.");
      return;
    }
    const customer = customers.find(c => c.id.toString() === serviceData.customerId);
    if (!customer) return;

    const res = await fetch('/api/pos/service', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...serviceData, customerName: customer.name, price: Number(serviceData.price) }) });
    if (res.ok) { 
      const barber = barbers.find(b => b.id.toString() === serviceData.barberId);
      const receiptText = `*MA BEARD STYLE - COMPROVANTE*\n\nOlá ${customer.name}!\n\n*Serviço:* ${serviceData.serviceType}\n*Barbeiro:* ${barber?.name}\n*Total: R$ ${Number(serviceData.price).toFixed(2)}*\n\nObrigado pela preferência!`;
      
      setServiceData({ barberId: '', customerId: '', serviceType: '', price: '' }); 
      
      if (customer.phone) {
        setReceipt({ text: receiptText, phone: customer.phone.replace(/\D/g, '') });
      } else {
        alert('Serviço registrado com sucesso! (Cliente sem telefone cadastrado)');
      }
    }
  };

  const sendWhatsApp = () => {
    if (!receipt) return;
    const url = `https://wa.me/55${receipt.phone}?text=${encodeURIComponent(receipt.text)}`;
    window.open(url, '_blank');
    setReceipt(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl text-center">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-2xl font-medium mb-2">Sucesso!</h3>
            <p className="text-gray-400 mb-8">A transação foi registrada no sistema.</p>
            
            <div className="space-y-4">
              <button onClick={sendWhatsApp} className="w-full py-4 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-2">
                <MessageCircle className="w-5 h-5" /> Enviar Comprovante no WhatsApp
              </button>
              <button onClick={() => setReceipt(null)} className="w-full py-4 bg-white/5 text-white rounded-xl font-bold hover:bg-white/10 transition-all">
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-8">
        <h3 className="text-xl font-medium mb-6 flex items-center gap-2"><ShoppingBag className="w-5 h-5" /> Venda de Produtos & Planos</h3>
        
        <div className="mb-6">
          <label className="text-[10px] uppercase text-gray-500 block mb-2">Selecionar Cliente</label>
          <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm">
            <option value="">Selecione um cliente...</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone || 'Sem telefone'})</option>)}
          </select>
        </div>

        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Produtos</h4>
            <div className="grid grid-cols-2 gap-4">
              {products.map(p => (
                <button key={p.id} onClick={() => addToCart(p)} disabled={p.stock <= 0} className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/20 text-left transition-all disabled:opacity-50">
                  <div className="text-sm font-medium mb-1">{p.name}</div>
                  <div className="text-xs text-gray-500">R$ {p.price} • {p.stock} un.</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Planos</h4>
            <div className="grid grid-cols-2 gap-4">
              {plans.map(p => (
                <button key={p.id} onClick={() => addPlanToCart(p)} className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/20 text-left transition-all">
                  <div className="text-sm font-medium mb-1">{p.name}</div>
                  <div className="text-xs text-gray-500">R$ {p.price}/mês</div>
                </button>
              ))}
            </div>
          </div>
        </div>
        {cart.length > 0 && (
          <div className="space-y-4 border-t border-white/5 pt-6 mt-8">
            <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Carrinho</h4>
            {cart.map((item, i) => (
              <div key={i} className="flex justify-between items-center text-sm">
                <span>{item.product?.name || item.plan?.name} {item.quantity > 1 ? `x${item.quantity}` : ''}</span>
                <span>R$ {(item.product?.price || item.plan?.price || 0) * item.quantity}</span>
              </div>
            ))}
            <div className="flex justify-between items-center font-bold text-lg pt-4 border-t border-white/5">
              <span>Total</span>
              <span>R$ {cart.reduce((acc, item) => acc + ((item.product?.price || item.plan?.price || 0) * item.quantity), 0)}</span>
            </div>
            <button onClick={finalizeSale} className="w-full py-4 bg-white text-black rounded-xl font-bold hover:bg-gray-200 transition-all">Finalizar Venda</button>
          </div>
        )}
      </div>
      <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-8">
        <h3 className="text-xl font-medium mb-6 flex items-center gap-2"><Scissors className="w-5 h-5" /> Registro de Serviço</h3>
        <div className="space-y-4">
          <div><label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 block">Barbeiro</label><select value={serviceData.barberId} onChange={e => setServiceData({...serviceData, barberId: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:border-white transition-colors"><option value="">Selecione um barbeiro</option>{barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div><label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 block">Cliente</label><select value={serviceData.customerId} onChange={e => setServiceData({...serviceData, customerId: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:border-white transition-colors"><option value="">Selecione um cliente</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone || 'Sem telefone'})</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 block">Serviço</label><input type="text" placeholder="Ex: Corte Degradê" value={serviceData.serviceType} onChange={e => setServiceData({...serviceData, serviceType: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:border-white transition-colors" /></div>
            <div><label className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2 block">Valor (R$)</label><input type="number" placeholder="0.00" value={serviceData.price} onChange={e => setServiceData({...serviceData, price: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm focus:outline-none focus:border-white transition-colors" /></div>
          </div>
          <button onClick={finalizeService} disabled={!serviceData.barberId || !serviceData.price || !serviceData.customerId} className="w-full py-4 bg-white text-black rounded-xl font-bold hover:bg-gray-200 transition-all disabled:opacity-50 mt-4">Registrar Serviço</button>
        </div>
      </div>
    </div>
  );
};

const BarberManager = () => {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [editing, setEditing] = useState<Partial<Barber> | null>(null);
  const [photoStatus, setPhotoStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fetchBarbers = () => fetch('/api/barbers').then(res => res.json()).then(setBarbers);
  useEffect(() => { fetchBarbers(); }, []);
  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editing) return;

    if (!isSupabaseConfigured) {
      setPhotoStatus({ type: 'error', message: 'Supabase não configurado para upload da foto.' });
      return;
    }

    setUploadingPhoto(true);
    setPhotoStatus({ type: 'info', message: 'Enviando foto do barbeiro...' });

    try {
      const extension = file.name.split('.').pop() || 'jpg';
      const safeName = (editing.name || 'barbeiro')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const filePath = `${safeName || 'barbeiro'}-${Date.now()}.${extension}`;

      const { error } = await supabase.storage.from('barbers').upload(filePath, file, { upsert: true });
      if (error) throw error;

      const { data } = supabase.storage.from('barbers').getPublicUrl(filePath);
      setEditing({ ...editing, photo_url: data.publicUrl });
      setPhotoStatus({ type: 'success', message: 'Foto enviada com sucesso.' });
    } catch (error: any) {
      setPhotoStatus({
        type: 'error',
        message: error?.message?.includes('not found')
          ? 'Bucket "barbers" não existe. Crie um bucket público com esse nome no Supabase Storage.'
          : `Erro ao enviar foto: ${error.message || 'falha desconhecida'}`,
      });
    } finally {
      setUploadingPhoto(false);
    }
  };
  const handleSave = async () => {
    const method = editing?.id ? 'PUT' : 'POST';
    const url = editing?.id ? `/api/barbers/${editing.id}` : '/api/barbers';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
    setEditing(null);
    setPhotoStatus(null);
    fetchBarbers();
  };
  const handleDelete = async (id: number) => { if (!confirm('Deseja realmente excluir este barbeiro?')) return; await fetch(`/api/barbers/${id}`, { method: 'DELETE' }); fetchBarbers(); };
  return (
    <div className="space-y-8">
      <div className="flex justify-end"><button onClick={() => { setEditing({ name: '', specialty: '', commission_rate: 0.4, phone: '', cpf: '', address: '', photo_url: '' }); setPhotoStatus(null); }} className="bg-white text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-200 transition-all"><Plus className="w-4 h-4" /> Novo Barbeiro</button></div>
      <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] overflow-hidden">
        <table className="w-full text-left">
          <thead><tr className="text-[10px] uppercase tracking-widest text-gray-500 border-b border-white/5"><th className="px-8 py-6 font-medium">Nome</th><th className="px-8 py-6 font-medium">Especialidade</th><th className="px-8 py-6 font-medium">Contato</th><th className="px-8 py-6 font-medium">Comissão</th><th className="px-8 py-6 font-medium text-right">Ações</th></tr></thead>
          <tbody className="divide-y divide-white/5">{barbers.map((barber) => (<tr key={barber.id} className="text-sm text-gray-300 hover:bg-white/5 transition-colors group"><td className="px-8 py-6 font-medium text-white"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 border border-white/10 shrink-0">{barber.photo_url ? <img src={barber.photo_url} alt={barber.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-300">{barber.name?.charAt(0) || '?'}</div>}</div><span>{barber.name}</span></div></td><td className="px-8 py-6">{barber.specialty}</td><td className="px-8 py-6 text-gray-500">{barber.phone || 'Sem telefone'}</td><td className="px-8 py-6">{barber.commission_rate * 100}%</td><td className="px-8 py-6 text-right"><div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"><button onClick={() => { setEditing(barber); setPhotoStatus(null); }} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"><Edit2 className="w-4 h-4" /></button><button onClick={() => handleDelete(barber.id)} className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button></div></td></tr>))}</tbody>
        </table>
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <h3 className="text-xl font-medium mb-6">{editing.id ? 'Editar Barbeiro' : 'Novo Barbeiro'}</h3>
            <div className="mb-6 p-4 rounded-xl border border-white/10 bg-black/30">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Foto de Perfil</p>
              <div className="flex flex-col md:flex-row gap-4 md:items-center">
                <div className="w-20 h-20 rounded-full overflow-hidden border border-white/10 bg-white/5 shrink-0">
                  {editing.photo_url ? (
                    <img src={editing.photo_url} alt={editing.name || 'Barbeiro'} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-400">
                      {editing.name?.charAt(0) || '?'}
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <input placeholder="URL pública da foto" value={editing.photo_url || ''} onChange={e => setEditing({ ...editing, photo_url: e.target.value })} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
                  <label className={cn('inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors', uploadingPhoto ? 'bg-white/10 text-gray-400 cursor-not-allowed' : 'bg-white text-black hover:bg-gray-200 cursor-pointer')}>
                    {uploadingPhoto ? 'Enviando foto...' : 'Upload da foto'}
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                  </label>
                  <p className="text-[11px] text-gray-500">A mesma foto será usada no fluxo público de escolha do barbeiro (agendamento).</p>
                </div>
              </div>
              {photoStatus && (
                <div className={cn('mt-3 text-xs rounded-lg p-3 border', photoStatus.type === 'success' && 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10', photoStatus.type === 'error' && 'text-red-400 border-red-500/20 bg-red-500/10', photoStatus.type === 'info' && 'text-blue-400 border-blue-500/20 bg-blue-500/10')}>
                  {photoStatus.message}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Dados Profissionais</label>
                <input placeholder="Nome Completo" value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
                <input placeholder="Especialidade" value={editing.specialty} onChange={e => setEditing({...editing, specialty: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
                <input type="number" placeholder="Taxa de Comissão (ex: 0.4)" value={editing.commission_rate} onChange={e => setEditing({...editing, commission_rate: Number(e.target.value)})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
              </div>
              <div className="space-y-4">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-500">Dados Pessoais</label>
                <input placeholder="Telefone" value={editing.phone} onChange={e => setEditing({...editing, phone: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
                <input placeholder="CPF" value={editing.cpf} onChange={e => setEditing({...editing, cpf: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
                <input placeholder="Endereço" value={editing.address} onChange={e => setEditing({...editing, address: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
              </div>
            </div>
            <div className="flex gap-4 pt-8"><button onClick={() => setEditing(null)} className="flex-1 py-4 rounded-xl bg-white/5 font-bold">Cancelar</button><button onClick={handleSave} className="flex-1 py-4 rounded-xl bg-white text-black font-bold">Salvar</button></div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const InventoryManager = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);
  const fetchProducts = () => fetch('/api/products').then(res => res.json()).then(setProducts);
  useEffect(() => { fetchProducts(); }, []);
  const handleSave = async () => {
    const method = editing?.id ? 'PUT' : 'POST';
    const url = editing?.id ? `/api/products/${editing.id}` : '/api/products';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
    setEditing(null); fetchProducts();
  };
  const handleDeleteProduct = async (productId: number) => {
    const confirmed = window.confirm('Tem certeza que deseja excluir este produto?');
    if (!confirmed) return;

    setDeletingProductId(productId);

    if (!isSupabaseConfigured) {
      setDeleteStatus({ type: 'error', message: 'Supabase não configurado para excluir produto.' });
      setDeletingProductId(null);
      return;
    }

    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) {
      setDeleteStatus({ type: 'error', message: `Erro ao excluir produto: ${error.message}` });
      setDeletingProductId(null);
      return;
    }

    setProducts(prev => prev.filter(product => product.id !== productId));
    setDeleteStatus({ type: 'success', message: 'Produto excluído com sucesso.' });
    setDeletingProductId(null);
  };
  return (
    <div className="space-y-8">
      <div className="flex justify-end"><button onClick={() => setEditing({ name: '', cost: 0, price: 0, stock: 0, min_stock: 5 })} className="bg-white text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-200 transition-all"><Plus className="w-4 h-4" /> Novo Produto</button></div>
      {deleteStatus && (
        <div className={cn(
          'p-4 rounded-xl border text-sm',
          deleteStatus.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
        )}>
          {deleteStatus.message}
        </div>
      )}
      <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] overflow-hidden">
        <table className="w-full text-left">
          <thead><tr className="text-[10px] uppercase tracking-widest text-gray-500 border-b border-white/5"><th className="px-8 py-6 font-medium">Produto</th><th className="px-8 py-6 font-medium">Estoque</th><th className="px-8 py-6 font-medium">Preço</th><th className="px-8 py-6 font-medium">Status</th><th className="px-8 py-6 font-medium text-right">Ações</th></tr></thead>
          <tbody className="divide-y divide-white/5">{products.map((product) => (<tr key={product.id} className="text-sm text-gray-300 hover:bg-white/5 transition-colors group"><td className="px-8 py-6 font-medium text-white">{product.name}</td><td className="px-8 py-6">{product.stock} un.</td><td className="px-8 py-6">R$ {product.price}</td><td className="px-8 py-6"><span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase", product.stock <= product.min_stock ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500")}>{product.stock <= product.min_stock ? 'Baixo' : 'OK'}</span></td><td className="px-8 py-6 text-right"><div className="flex justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"><button onClick={() => setEditing(product)} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"><Edit2 className="w-4 h-4" /></button><button onClick={() => handleDeleteProduct(product.id)} disabled={deletingProductId === product.id} className="p-2 hover:bg-red-500/10 rounded-lg text-red-400 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Excluir produto">{deletingProductId === product.id ? <div className="w-4 h-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}</button></div></td></tr>))}</tbody>
        </table>
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-medium mb-6">{editing.id ? 'Editar Produto' : 'Novo Produto'}</h3>
            <div className="space-y-4">
              <input placeholder="Nome do Produto" value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
              <div className="grid grid-cols-2 gap-4"><input type="number" placeholder="Custo (R$)" value={editing.cost} onChange={e => setEditing({...editing, cost: Number(e.target.value)})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" /><input type="number" placeholder="Preço (R$)" value={editing.price} onChange={e => setEditing({...editing, price: Number(e.target.value)})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" /></div>
              <div className="grid grid-cols-2 gap-4"><input type="number" placeholder="Estoque Inicial" value={editing.stock} onChange={e => setEditing({...editing, stock: Number(e.target.value)})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" /><input type="number" placeholder="Mínimo Alerta" value={editing.min_stock} onChange={e => setEditing({...editing, min_stock: Number(e.target.value)})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" /></div>
              <div className="flex gap-4 pt-4"><button onClick={() => setEditing(null)} className="flex-1 py-4 rounded-xl bg-white/5 font-bold">Cancelar</button><button onClick={handleSave} className="flex-1 py-4 rounded-xl bg-white text-black font-bold">Salvar</button></div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const CustomerManager = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);
  const fetchCustomers = () => fetch('/api/customers').then(res => res.json()).then(setCustomers);
  useEffect(() => { fetchCustomers(); }, []);

  const handleSave = async () => {
    const method = editing?.id ? 'PUT' : 'POST';
    const url = editing?.id ? `/api/customers/${editing.id}` : '/api/customers';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
    if (res.ok) { setEditing(null); fetchCustomers(); }
    else { const err = await res.json(); alert(err.error); }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-end"><button onClick={() => setEditing({ name: '', email: '', phone: '', cpf: '' })} className="bg-white text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-200 transition-all"><Plus className="w-4 h-4" /> Novo Cliente</button></div>
      <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] overflow-hidden">
        <table className="w-full text-left">
          <thead><tr className="text-[10px] uppercase tracking-widest text-gray-500 border-b border-white/5"><th className="px-8 py-6 font-medium">Nome</th><th className="px-8 py-6 font-medium">E-mail</th><th className="px-8 py-6 font-medium">Telefone</th><th className="px-8 py-6 font-medium text-right">Ações</th></tr></thead>
          <tbody className="divide-y divide-white/5">{customers.map((customer) => (<tr key={customer.id} className="text-sm text-gray-300 hover:bg-white/5 transition-colors group"><td className="px-8 py-6 font-medium text-white">{customer.name}</td><td className="px-8 py-6">{customer.email}</td><td className="px-8 py-6">{customer.phone || '-'}</td><td className="px-8 py-6 text-right"><button onClick={() => setEditing(customer)} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"><Edit2 className="w-4 h-4" /></button></td></tr>))}</tbody>
        </table>
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-md shadow-2xl">
            <h3 className="text-xl font-medium mb-6">{editing.id ? 'Editar Cliente' : 'Novo Cliente'}</h3>
            <div className="space-y-4">
              <input placeholder="Nome Completo" value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
              <input placeholder="E-mail" value={editing.email} onChange={e => setEditing({...editing, email: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
              <input placeholder="Telefone" value={editing.phone} onChange={e => setEditing({...editing, phone: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
              <input placeholder="CPF" value={editing.cpf} onChange={e => setEditing({...editing, cpf: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm" />
              <div className="flex gap-4 pt-4"><button onClick={() => setEditing(null)} className="flex-1 py-4 rounded-xl bg-white/5 font-bold">Cancelar</button><button onClick={handleSave} className="flex-1 py-4 rounded-xl bg-white text-black font-bold">Salvar</button></div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const ReportsView = () => {
  const [margins, setMargins] = useState<any[]>([]);
  const [productivity, setProductivity] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);

  useEffect(() => {
    fetch('/api/reports/margins').then(res => res.json()).then(setMargins);
    fetch('/api/reports/productivity').then(res => res.json()).then(setProductivity);
    fetch('/api/reports/analytics').then(res => res.json()).then(setAnalytics);
  }, []);

  if (!analytics) return <div className="text-white">Carregando relatórios...</div>;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label="Ticket Médio" value={`R$ ${analytics.avg_ticket?.toFixed(2) || 0}`} icon={DollarSign} />
        <StatCard label="Total Clientes" value={analytics.total_customers} icon={Users} />
        <StatCard label="Planos Ativos" value={analytics.active_plans} icon={Crown} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-8">
          <h3 className="text-xl font-medium mb-6 flex items-center gap-2"><Package className="w-5 h-5" /> Margens de Produtos</h3>
          <div className="space-y-4">
            {margins.map((m, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex justify-between text-sm">
                  <span className="text-white font-medium">{m.name}</span>
                  <span className="text-emerald-500 font-bold">{m.margin_percent}% margem</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Custo: R$ {m.cost} | Venda: R$ {m.price}</span>
                  <span>Lucro: R$ {m.margin}</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full mt-1 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${m.margin_percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-8">
          <h3 className="text-xl font-medium mb-6 flex items-center gap-2"><Scissors className="w-5 h-5" /> Produtividade de Barbeiros</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={productivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff40" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#000', border: '1px solid #ffffff10', borderRadius: '12px' }} itemStyle={{ color: '#fff' }} />
                <Bar dataKey="total_revenue" name="Receita Total" fill="#ffffff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total_commission" name="Comissão" fill="#ffffff40" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 space-y-2">
            {productivity.map((b, i) => (
              <div key={i} className="flex justify-between text-xs border-t border-white/5 pt-2">
                <span className="text-gray-400">{b.name}</span>
                <span className="text-white">{b.total_services} atendimentos</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean, message: string} | null>(null);

  const diag = getSupabaseDiagnostics();

  const handleTestConnection = async () => {
    setLoading(true);
    const result = await testSupabaseConnection();
    setTestResult(result);
    setLoading(false);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      alert('ERRO DE CONFIGURAÇÃO:\nAs chaves do Supabase não foram encontradas ou são inválidas.\n\nCertifique-se de adicionar VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no painel de Secrets.');
      return;
    }
    if (password.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: {
            emailRedirectTo: window.location.origin
          }
        });
        if (error) throw error;
        
        if (data.user && data.session) {
          alert('Cadastro realizado com sucesso! Você já está logado.');
        } else {
          alert('Cadastro realizado! Verifique sua caixa de entrada para confirmar o e-mail antes de entrar.\n\nIMPORTANTE: Se não confirmar o e-mail, o login falhará.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message === 'Invalid login credentials') {
            throw new Error('E-mail ou senha incorretos. Se você acabou de se cadastrar, confirme o e-mail no seu inbox.');
          }
          if (error.message.includes('Email not confirmed')) {
            throw new Error('E-mail ainda não confirmado. Verifique sua caixa de entrada.');
          }
          throw error;
        }
      }
    } catch (error: any) {
      alert('Erro: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-black">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-zinc-900 border border-white/5 p-8 rounded-[2.5rem] shadow-2xl"
      >
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center">
            <Scissors className="text-black w-8 h-8" />
          </div>
        </div>
        <h2 className="text-2xl font-light text-center mb-8">
          {isSignUp ? 'Criar Conta Administrativa' : 'Acesso Restrito'}
        </h2>
        <form onSubmit={handleAuth} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input 
              type="email" 
              placeholder="E-mail" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-xl p-4 pl-12 text-sm focus:outline-none focus:border-white transition-colors"
              required
            />
          </div>
          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input 
              type="password" 
              placeholder="Senha" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-xl p-4 pl-12 text-sm focus:outline-none focus:border-white transition-colors"
              required
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 bg-white text-black rounded-xl font-bold hover:bg-gray-200 transition-all disabled:opacity-50"
          >
            {loading ? 'Processando...' : isSignUp ? 'Cadastrar' : 'Entrar'}
          </button>
        </form>
        <button 
          onClick={() => setIsSignUp(!isSignUp)}
          className="w-full mt-6 text-sm text-gray-500 hover:text-white transition-colors"
        >
          {isSignUp ? 'Já tem uma conta? Entre aqui' : 'Não tem conta? Solicite acesso'}
        </button>

        <div className="mt-8 pt-6 border-t border-white/5">
          <button 
            onClick={() => setShowDebug(!showDebug)}
            className="text-[10px] uppercase tracking-widest text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-2 mx-auto"
          >
            <AlertTriangle className="w-3 h-3" />
            Problemas com o acesso?
          </button>
          
          <AnimatePresence>
            {showDebug && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mt-4 space-y-3"
              >
                <div className="p-4 bg-white/5 rounded-xl text-[11px] space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">URL Configurada:</span>
                    <span className={diag.urlSet ? 'text-emerald-500' : 'text-red-500'}>{diag.urlSet ? 'Sim' : 'Não'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">URL Válida (http):</span>
                    <span className={diag.urlValid ? 'text-emerald-500' : 'text-red-500'}>{diag.urlValid ? 'Sim' : 'Não'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Chave Configurada:</span>
                    <span className={diag.keySet ? 'text-emerald-500' : 'text-red-500'}>{diag.keySet ? 'Sim' : 'Não'}</span>
                  </div>
                  <div className="pt-2 border-t border-white/5 text-gray-400 italic">
                    Dica: Verifique se as chaves no painel de Secrets começam com <strong>VITE_</strong>.
                  </div>
                </div>

                <button 
                  onClick={handleTestConnection}
                  disabled={loading}
                  className="w-full py-2 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] font-bold transition-all"
                >
                  {loading ? 'Testando...' : 'Testar Conexão com API'}
                </button>

                {testResult && (
                  <div className={cn(
                    "p-3 rounded-lg text-[10px] border",
                    testResult.success ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"
                  )}>
                    {testResult.success ? '✅ ' : '❌ '} {testResult.message}
                  </div>
                )}

                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-200 leading-relaxed">
                  <strong>Configuração no Supabase:</strong><br />
                  1. Vá em Authentication &rarr; Configuration &rarr; Site URL<br />
                  2. Adicione esta URL: <br />
                  <code className="block bg-black/50 p-1 mt-1 rounded select-all">{window.location.origin}</code>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

const PlansManager = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<Plan | null>(null);

  const fetchPlans = () => fetch('/api/plans').then(res => res.json()).then(setPlans);
  useEffect(() => { fetchPlans(); }, []);

  const handleSave = async () => {
    if (!editing) return;
    await fetch(`/api/plans/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing)
    });
    setEditing(null);
    fetchPlans();
  };

  const handleBenefitChange = (index: number, value: string) => {
    if (!editing) return;
    const newBenefits = [...editing.benefits];
    newBenefits[index] = value;
    setEditing({ ...editing, benefits: newBenefits });
  };

  const addBenefit = () => {
    if (!editing) return;
    setEditing({ ...editing, benefits: [...editing.benefits, ''] });
  };

  const removeBenefit = (index: number) => {
    if (!editing) return;
    const newBenefits = editing.benefits.filter((_, i) => i !== index);
    setEditing({ ...editing, benefits: newBenefits });
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <div key={plan.id} className="bg-zinc-900/40 border border-white/5 p-8 rounded-[2.5rem] relative group">
            <div className="absolute top-6 right-6 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <button onClick={() => setEditing(plan)} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors">
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
            
            <div className="mb-6">
              <h3 className="text-2xl font-semibold mb-2">{plan.name}</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-light tracking-tighter">R$ {plan.price}</span>
                <span className="text-sm opacity-60">/mês</span>
              </div>
              <p className="mt-4 text-sm text-gray-400 h-16">{plan.description}</p>
            </div>
            
            <div className="h-px w-full bg-white/10 mb-6" />
            
            <ul className="space-y-3">
              {plan.benefits.map((benefit, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                  <Check className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-white/10 p-8 rounded-[2.5rem] w-full max-w-2xl shadow-2xl my-8">
            <h3 className="text-xl font-medium mb-6 flex items-center gap-2"><Crown className="w-5 h-5" /> Editar Plano: {editing.name}</h3>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase text-gray-500 block mb-2">Nome do Plano</label>
                  <input value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm focus:border-white transition-colors outline-none" />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-gray-500 block mb-2">Preço Mensal (R$)</label>
                  <input type="number" value={editing.price} onChange={e => setEditing({...editing, price: Number(e.target.value)})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm focus:border-white transition-colors outline-none" />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase text-gray-500 block mb-2">Descrição Curta</label>
                <textarea value={editing.description} onChange={e => setEditing({...editing, description: e.target.value})} className="w-full bg-black border border-white/10 rounded-xl p-4 text-sm h-24 resize-none focus:border-white transition-colors outline-none" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] uppercase text-gray-500">Benefícios (Checklist)</label>
                  <button onClick={addBenefit} className="text-xs text-emerald-500 hover:text-emerald-400 flex items-center gap-1 font-bold">
                    <Plus className="w-3 h-3" /> Adicionar
                  </button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                  {editing.benefits.map((benefit, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 text-gray-400" />
                      </div>
                      <input 
                        value={benefit} 
                        onChange={e => handleBenefitChange(index, e.target.value)} 
                        className="flex-1 bg-black border border-white/10 rounded-lg p-3 text-sm focus:border-white transition-colors outline-none" 
                        placeholder="Ex: 2 cortes por mês"
                      />
                      <button onClick={() => removeBenefit(index)} className="p-3 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4 border-t border-white/5">
                <button onClick={() => setEditing(null)} className="flex-1 py-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors font-bold text-sm">Cancelar</button>
                <button onClick={handleSave} className="flex-1 py-4 rounded-xl bg-white text-black hover:bg-gray-200 transition-colors font-bold text-sm flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> Salvar Alterações
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const SettingsView = () => {
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsStatus, setSettingsStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<{
    stripe: { configured: boolean };
    google: { hasClientId: boolean; hasClientSecret: boolean; redirectUri: string; connected: boolean };
  } | null>(null);
  const [settings, setSettings] = useState({
    business_name: 'MA BEARD STYLE',
    business_phone: '',
    business_email: '',
    business_address: '',
    booking_slot_minutes: '60',
    working_hours_start: '09:00',
    working_hours_end: '18:00',
    timezone: 'America/Sao_Paulo',
  });

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (res.ok) {
        setSettings({
          business_name: data.business_name || 'MA BEARD STYLE',
          business_phone: data.business_phone || '',
          business_email: data.business_email || '',
          business_address: data.business_address || '',
          booking_slot_minutes: data.booking_slot_minutes || '60',
          working_hours_start: data.working_hours_start || '09:00',
          working_hours_end: data.working_hours_end || '18:00',
          timezone: data.timezone || 'America/Sao_Paulo',
        });
      }
    } catch (_e) {}
  };

  const fetchIntegrationStatus = async () => {
    try {
      const res = await fetch('/api/integrations/status');
      const data = await res.json();
      if (res.ok) setIntegrationStatus(data);
    } catch (_e) {}
  };

  useEffect(() => {
    fetchSettings();
    fetchIntegrationStatus();
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event?.data?.type === 'GOOGLE_AUTH_SUCCESS') {
        setSettingsStatus({ type: 'success', message: 'Google Calendar conectada com sucesso.' });
        fetchIntegrationStatus();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const connectGoogleCalendar = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const data = await res.json();
      if (!data.url) throw new Error('Não foi possível gerar a URL de autenticação.');
      window.open(data.url, 'google-auth', 'width=560,height=720');
      setSettingsStatus({ type: 'info', message: 'Finalize a autenticação na janela do Google.' });
    } catch (error: any) {
      setSettingsStatus({ type: 'error', message: `Erro ao iniciar conexão com Google: ${error.message}` });
    }
  };

  const saveSystemSettings = async () => {
    setSavingSettings(true);
    setSettingsStatus({ type: 'info', message: 'Salvando configurações...' });
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar.');
      setSettingsStatus({ type: 'success', message: 'Configurações salvas com sucesso.' });
    } catch (error: any) {
      setSettingsStatus({ type: 'error', message: `Falha ao salvar: ${error.message}` });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset status
    setStatus(null);

    if (!isSupabaseConfigured) {
      setStatus({ type: 'error', message: 'Supabase não está configurado. Verifique as variáveis de ambiente.' });
      return;
    }

    // Basic validation
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      setStatus({ type: 'error', message: 'O arquivo é muito grande. O limite é 50MB.' });
      return;
    }

    setUploading(true);
    setStatus({ type: 'info', message: 'Iniciando upload... Por favor, não feche esta página.' });

    try {
      const { data, error } = await supabase.storage
        .from('videos')
        .upload('hero-video.mp4', file, { 
          upsert: true,
          contentType: 'video/mp4'
        });

      if (error) throw error;
      
      setStatus({ 
        type: 'success', 
        message: 'Vídeo atualizado com sucesso! O novo vídeo aparecerá na página inicial em instantes.' 
      });
      
      // Clear input
      e.target.value = '';
    } catch (error: any) {
      console.error('Upload error:', error);
      
      const isBucketError = error.message?.includes('Bucket not found') || error.message?.includes('The resource was not found');
      
      setStatus({ 
        type: 'error', 
        message: isBucketError 
          ? 'Erro: O bucket "videos" não existe no seu Supabase. Siga as instruções abaixo para criá-lo.'
          : `Erro ao fazer upload: ${error.message || 'Erro desconhecido'}. Verifique as permissões do bucket.` 
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-zinc-900/40 border border-white/5 rounded-[2.5rem] p-8">
      <h3 className="text-xl font-medium mb-8 flex items-center gap-2"><Settings className="w-5 h-5" /> Configurações do Sistema</h3>
      
      <div className="space-y-8">
        <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
          <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Integrações Oficiais</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white font-medium">Stripe</span>
                <span className={cn("text-xs font-bold uppercase", integrationStatus?.stripe.configured ? 'text-emerald-400' : 'text-red-400')}>
                  {integrationStatus?.stripe.configured ? 'Configurada' : 'Não Configurada'}
                </span>
              </div>
              <p className="text-xs text-gray-400">A Stripe depende da variável STRIPE_SECRET_KEY no backend.</p>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white font-medium">Google Calendar</span>
                <span className={cn("text-xs font-bold uppercase", integrationStatus?.google.connected ? 'text-emerald-400' : 'text-amber-400')}>
                  {integrationStatus?.google.connected ? 'Conectada' : 'Pendente'}
                </span>
              </div>
              <p className="text-xs text-gray-400 break-all">Redirect URI: {integrationStatus?.google.redirectUri || 'N/A'}</p>
              <p className="text-xs text-gray-500">
                Client ID: {integrationStatus?.google.hasClientId ? 'OK' : 'Ausente'} | Secret: {integrationStatus?.google.hasClientSecret ? 'OK' : 'Ausente'}
              </p>
              <button onClick={connectGoogleCalendar} className="px-4 py-2 rounded-lg bg-white text-black text-xs font-bold hover:bg-gray-200 transition-colors">
                Conectar Google Calendar
              </button>
            </div>
          </div>
          <div className="mt-4">
            <button onClick={fetchIntegrationStatus} className="px-4 py-2 rounded-lg bg-white/10 text-white text-xs font-bold hover:bg-white/20 transition-colors">
              Atualizar Status
            </button>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
          <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Parâmetros Editáveis do Sistema</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase text-gray-500 block mb-1">Nome do Negócio</label>
              <input value={settings.business_name} onChange={(e) => setSettings({ ...settings, business_name: e.target.value })} className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-gray-500 block mb-1">Telefone</label>
              <input value={settings.business_phone} onChange={(e) => setSettings({ ...settings, business_phone: e.target.value })} className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-gray-500 block mb-1">E-mail</label>
              <input value={settings.business_email} onChange={(e) => setSettings({ ...settings, business_email: e.target.value })} className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-gray-500 block mb-1">Fuso Horário</label>
              <input value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] uppercase text-gray-500 block mb-1">Endereço</label>
              <input value={settings.business_address} onChange={(e) => setSettings({ ...settings, business_address: e.target.value })} className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-gray-500 block mb-1">Duração de Slot (min)</label>
              <input type="number" min={15} step={5} value={settings.booking_slot_minutes} onChange={(e) => setSettings({ ...settings, booking_slot_minutes: e.target.value })} className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase text-gray-500 block mb-1">Abertura</label>
                <input type="time" value={settings.working_hours_start} onChange={(e) => setSettings({ ...settings, working_hours_start: e.target.value })} className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-gray-500 block mb-1">Fechamento</label>
                <input type="time" value={settings.working_hours_end} onChange={(e) => setSettings({ ...settings, working_hours_end: e.target.value })} className="w-full bg-black border border-white/10 rounded-xl p-3 text-sm" />
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button onClick={saveSystemSettings} disabled={savingSettings} className="px-6 py-3 rounded-xl bg-white text-black font-bold hover:bg-gray-200 transition-colors disabled:opacity-60">
              {savingSettings ? 'Salvando...' : 'Salvar Configurações'}
            </button>
            <button onClick={fetchSettings} className="px-4 py-3 rounded-xl bg-white/10 text-white font-bold hover:bg-white/20 transition-colors text-sm">
              Recarregar
            </button>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
          <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Vídeo de Fundo (Landing Page)</h4>
          <p className="text-xs text-gray-400 mb-6">
            Faça upload de um novo vídeo para a seção principal da página inicial. 
            O arquivo será salvo no Supabase Storage (bucket: "videos", arquivo: "hero-video.mp4").
          </p>
          
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className={cn(
                "cursor-pointer px-6 py-3 rounded-xl font-bold transition-all flex items-center gap-2",
                uploading 
                  ? "bg-gray-800 text-gray-500 cursor-not-allowed" 
                  : "bg-white text-black hover:bg-gray-200"
              )}>
                {uploading ? <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" /> : <Package className="w-4 h-4" />}
                {uploading ? 'Enviando Vídeo...' : 'Selecionar Vídeo (MP4)'}
                <input 
                  type="file" 
                  accept="video/mp4" 
                  className="hidden" 
                  onChange={handleVideoUpload}
                  disabled={uploading}
                />
              </label>
              
              {uploading && (
                <span className="text-xs text-emerald-500 animate-pulse flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  Processando arquivo...
                </span>
              )}
            </div>

            <AnimatePresence>
              {status && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className={cn(
                    "p-4 rounded-xl text-sm border flex flex-col gap-3",
                    status.type === 'success' && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
                    status.type === 'error' && "bg-red-500/10 border-red-500/20 text-red-400",
                    status.type === 'info' && "bg-blue-500/10 border-blue-500/20 text-blue-400"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {status.type === 'success' && <Check className="w-5 h-5 shrink-0" />}
                    {status.type === 'error' && <AlertTriangle className="w-5 h-5 shrink-0" />}
                    {status.type === 'info' && <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />}
                    <p>{status.message}</p>
                  </div>
                  
                  {status.type === 'error' && status.message.includes('não existe') && (
                    <div className="mt-2 p-3 bg-black/30 rounded-lg text-xs text-red-200 space-y-2">
                      <strong className="block text-red-400">Como criar o bucket no Supabase:</strong>
                      <ol className="list-decimal ml-4 space-y-1">
                        <li>Acesse o painel do seu projeto no Supabase.</li>
                        <li>No menu lateral esquerdo, clique em <strong>Storage</strong>.</li>
                        <li>Clique no botão <strong>New Bucket</strong>.</li>
                        <li>Nomeie o bucket exatamente como: <code className="bg-black/50 px-1 rounded">videos</code></li>
                        <li><strong>MUITO IMPORTANTE:</strong> Marque a opção <strong>"Public bucket"</strong>.</li>
                        <li>Clique em <strong>Save</strong> e tente fazer o upload novamente.</li>
                      </ol>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-white/5 border border-white/5">
          <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Informações do Supabase</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase text-gray-500 block mb-1">Status da Conexão</label>
              <div className={cn("flex items-center gap-2 text-sm", isSupabaseConfigured ? "text-emerald-500" : "text-amber-500")}>
                <div className={cn("w-2 h-2 rounded-full", isSupabaseConfigured ? "bg-emerald-500" : "bg-amber-500 animate-pulse")} />
                {isSupabaseConfigured ? 'Conectado ao Supabase' : 'Supabase não configurado'}
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase text-gray-500 block mb-1">Bucket de Vídeos</label>
              <div className="text-sm text-white">{isSupabaseConfigured ? '"videos" (Público)' : 'N/A'}</div>
            </div>
          </div>
          {!isSupabaseConfigured && (
            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200 leading-relaxed">
              <strong className="block mb-2 text-amber-500">⚠️ Ação Necessária:</strong>
              Para habilitar Login e Upload de Vídeo, você precisa configurar exatamente estas chaves no painel de <strong>Secrets</strong>:
              <ul className="list-disc ml-4 mt-2 space-y-1">
                <li><code className="bg-black/50 px-1 rounded">VITE_SUPABASE_URL</code></li>
                <li><code className="bg-black/50 px-1 rounded">VITE_SUPABASE_ANON_KEY</code></li>
              </ul>
              <p className="mt-2 text-[10px] opacity-70 italic">
                Nota: O prefixo <strong>VITE_</strong> é obrigatório para que o navegador consiga acessar as chaves.
              </p>
            </div>
          )}
        </div>

        <AnimatePresence>
          {settingsStatus && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={cn(
                'p-4 rounded-xl text-sm border flex items-start gap-3',
                settingsStatus.type === 'success' && 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
                settingsStatus.type === 'error' && 'bg-red-500/10 border-red-500/20 text-red-400',
                settingsStatus.type === 'info' && 'bg-blue-500/10 border-blue-500/20 text-blue-400'
              )}
            >
              {settingsStatus.type === 'success' && <Check className="w-5 h-5 shrink-0" />}
              {settingsStatus.type === 'error' && <AlertTriangle className="w-5 h-5 shrink-0" />}
              {settingsStatus.type === 'info' && <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />}
              <p>{settingsStatus.message}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState('landing');
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const roleFromMetadata = String(
    session?.user?.app_metadata?.role ||
    session?.user?.user_metadata?.role ||
    ''
  ).toLowerCase();
  const isAdmin = Boolean(session) && (
    !roleFromMetadata || ['admin', 'owner', 'superadmin'].includes(roleFromMetadata)
  );

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-white selection:text-black">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} session={session} />
      <main>
        <AnimatePresence mode="wait">
          {activeTab === 'landing' ? (
            <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><LandingPage /></motion.div>
          ) : (
            !session ? (
              <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Auth /></motion.div>
            ) : !isAdmin ? (
              <motion.div 
                key="denied" 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center"
              >
                <Lock className="w-12 h-12 text-red-500 mb-4" />
                <h2 className="text-2xl font-light mb-2">Acesso Negado</h2>
                <p className="text-gray-500 max-w-md">
                  Sua conta ({session.user.email}) não possui role administrativa no Supabase.
                  Defina app_metadata.role como admin/owner/superadmin para liberar o Dashboard.
                </p>
                <button 
                  onClick={() => supabase.auth.signOut()}
                  className="mt-8 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm transition-all"
                >
                  Sair da Conta
                </button>
              </motion.div>
            ) : (
              <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><AdminDashboard /></motion.div>
            )
          )}
        </AnimatePresence>
      </main>
      <footer className="border-t border-white/5 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4"><Scissors className="w-5 h-5 text-gray-500" /><span className="text-sm font-bold tracking-widest text-gray-500 uppercase">MA Beard Style</span></div>
          <p className="text-xs text-gray-600">© 2026 MA Beard Style. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
