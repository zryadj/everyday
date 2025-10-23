import React, { useEffect, useMemo, useState } from "react";
import { Plus, Wallet, CalendarDays, CalendarRange, Settings as SettingsIcon, Trash2 } from "lucide-react";

/**
 * 本地离线记账小程序（单文件 React 组件）
 * 功能：
 * 1) 设置每日预算金额（如 30 元）
 * 2) 记录消费事项（名称、金额、时间自动或手动）
 * 3) 展示当日/本周/本月结余
 * 4) 列表仅展示“今天”的消费记录（历史自动隐藏）
 * 5) 所有数据保存在 localStorage，离线可用
 * 6) Tailwind 美观样式，模块化布局
 */

// ===== Utils =====
const LS_KEY_EXPENSES = "budget.expenses.v1";
const LS_KEY_SETTINGS = "budget.settings.v1";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function toISODate(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d = new Date()) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function endOfDay(d = new Date()) {
  const dt = new Date(d);
  dt.setHours(23, 59, 59, 999);
  return dt;
}

function startOfWeek(d = new Date()) {
  // 以周一为一周开始
  const dt = startOfDay(d);
  const day = dt.getDay(); // 0 周日
  const diff = (day === 0 ? -6 : 1 - day); // Monday-based
  dt.setDate(dt.getDate() + diff);
  return dt;
}

function endOfWeek(d = new Date()) {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfMonth(d = new Date()) {
  const dt = new Date(d.getFullYear(), d.getMonth(), 1);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function endOfMonth(d = new Date()) {
  const dt = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  dt.setHours(23, 59, 59, 999);
  return dt;
}

function formatCurrency(n) {
  // 人民币格式化（不强依赖 Intl，以便更通用）
  const s = (Number(n) || 0).toFixed(2);
  return `¥${s}`;
}

function parseAmount(input) {
  if (typeof input === "number") return input;
  const cleaned = String(input).replace(/[^\d.\-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ===== Types (JSDoc) =====
/** @typedef {{ id: string, title: string, amount: number, ts: number }} Expense */
/** @typedef {{ dailyBudget: number }} Settings */

// ===== Storage helpers =====
function loadExpenses() {
  try {
    const raw = localStorage.getItem(LS_KEY_EXPENSES);
    return raw ? JSON.parse(raw) : /** @type {Expense[]} */([]);
  } catch {
    return [];
  }
}

function saveExpenses(expenses) {
  localStorage.setItem(LS_KEY_EXPENSES, JSON.stringify(expenses));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY_SETTINGS);
    return raw ? JSON.parse(raw) : /** @type {Settings} */({ dailyBudget: 30 });
  } catch {
    return { dailyBudget: 30 };
  }
}

function saveSettings(settings) {
  localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(settings));
}

// ===== Cards =====
function Card({ className = "", children }) {
  return (
    <div className={cn("rounded-2xl bg-white/70 backdrop-blur shadow-sm ring-1 ring-black/5 p-5", className)}>
      {children}
    </div>
  );
}

function Stat({ icon, label, value, sub }) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 rounded-xl bg-gray-100">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="text-xl font-semibold">{value}</div>
        {typeof sub !== "undefined" && (
          <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
        )}
      </div>
    </div>
  );
}

// ===== Main App =====
export default function BudgetApp() {
  const [settings, setSettings] = useState(loadSettings());
  const [expenses, setExpenses] = useState(loadExpenses());

  // 新增消费
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dateStr, setDateStr] = useState(toISODate(new Date())); // 允许手动调整

  // 保存副作用
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveExpenses(expenses);
  }, [expenses]);

  // 过滤器：今天、本周、本月
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);

  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const expensesToday = useMemo(
    () => expenses.filter(e => e.ts >= todayStart.getTime() && e.ts <= todayEnd.getTime()),
    [expenses]
  );

  const expensesWeek = useMemo(
    () => expenses.filter(e => e.ts >= weekStart.getTime() && e.ts <= weekEnd.getTime()),
    [expenses]
  );

  const expensesMonth = useMemo(
    () => expenses.filter(e => e.ts >= monthStart.getTime() && e.ts <= monthEnd.getTime()),
    [expenses]
  );

  const sum = (list) => list.reduce((acc, e) => acc + (e.amount || 0), 0);

  const spentToday = sum(expensesToday);
  const spentWeek = sum(expensesWeek);
  const spentMonth = sum(expensesMonth);

  // 预算：默认按“每日预算”计算周/月预算（周*7，月*当月天数）
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const weeklyBudget = settings.dailyBudget * 7;
  const monthlyBudget = settings.dailyBudget * daysInMonth;

  const leftToday = settings.dailyBudget - spentToday;
  const leftWeek = weeklyBudget - spentWeek;
  const leftMonth = monthlyBudget - spentMonth;

  function addExpense(e) {
    e.preventDefault();
    const amt = parseAmount(amount);
    if (!title.trim() || !amt) return;

    const ts = new Date(dateStr + "T" + new Date().toTimeString().slice(0,8)).getTime();

    const newItem = {
      id: crypto.randomUUID(),
      title: title.trim(),
      amount: amt,
      ts,
    };
    setExpenses((prev) => [newItem, ...prev]);
    setTitle("");
    setAmount("");
  }

  function deleteExpense(id) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight">本地离线记账</h1>
          <div className="text-sm text-gray-500">{toISODate(new Date())}</div>
        </header>

        {/* Top grid: Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <Stat
              icon={Wallet}
              label="今日结余"
              value={formatCurrency(leftToday)}
              sub={`预算 ${formatCurrency(settings.dailyBudget)} · 已花 ${formatCurrency(spentToday)}`}
            />
          </Card>
          <Card>
            <Stat
              icon={CalendarDays}
              label="本周结余 (周一-周日)"
              value={formatCurrency(leftWeek)}
              sub={`预算 ${formatCurrency(weeklyBudget)} · 已花 ${formatCurrency(spentWeek)}`}
            />
          </Card>
          <Card>
            <Stat
              icon={CalendarRange}
              label="本月结余"
              value={formatCurrency(leftMonth)}
              sub={`预算 ${formatCurrency(monthlyBudget)} · 已花 ${formatCurrency(spentMonth)}`}
            />
          </Card>
        </div>

        {/* Main grid: Form + Today list + Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Expense */}
          <Card className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Plus className="w-5 h-5" />
              <h2 className="font-semibold">新增消费</h2>
            </div>
            <form onSubmit={addExpense} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="事项，如 吃饭/地铁/咖啡"
                className="md:col-span-2 w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <input
                type="number"
                step="0.01"
                placeholder="金额 (元)"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <input
                type="date"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
              />
              <button
                type="submit"
                className="md:col-span-4 inline-flex items-center justify-center gap-2 rounded-xl bg-black text-white px-4 py-2 hover:bg-gray-800 active:scale-[.99] transition"
              >
                <Plus className="w-4 h-4" /> 添加
              </button>
            </form>
          </Card>

          {/* Settings */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <SettingsIcon className="w-5 h-5" />
              <h2 className="font-semibold">设置</h2>
            </div>
            <div className="space-y-3">
              <label className="block text-sm text-gray-600">每日预算 (元)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
                value={settings.dailyBudget}
                onChange={(e) => setSettings({ ...settings, dailyBudget: parseAmount(e.target.value) })}
              />
              <p className="text-xs text-gray-500">周/月预算会根据每日预算自动计算（周=×7，月=×当月天数）。</p>
            </div>
          </Card>
        </div>

        {/* Today List */}
        <Card className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">今日消费（仅展示今天，历史自动隐藏）</h2>
            <div className="text-sm text-gray-500">共 {expensesToday.length} 条 · 已花 {formatCurrency(spentToday)}</div>
          </div>
          {expensesToday.length === 0 ? (
            <div className="text-sm text-gray-500">今天还没有记录，快在上方添加一笔吧～</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {expensesToday.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">{e.title}</div>
                    <div className="text-xs text-gray-400">{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="tabular-nums font-semibold">-{formatCurrency(e.amount)}</div>
                    <button
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                      title="删除"
                      onClick={() => deleteExpense(e.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Footer */}
        <footer className="text-center text-xs text-gray-400 mt-8">
          离线本地存储 · 刷新仍在 · 建议将此页面添加到手机主屏或者桌面快捷方式
        </footer>
      </div>
    </div>
  );
}
