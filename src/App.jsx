import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Wallet,
  CalendarDays,
  CalendarRange,
  Settings as SettingsIcon,
  Trash2,
  History,
  PieChart as PieIcon,
  LineChart as LineIcon,
  Pencil
} from "lucide-react";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
  Sector,
} from "recharts";

/**
 * 活着 · 本地离线记账（React 单文件）
 *
 * 变更：
 * 1) 「新增消费」中选择日期时，下方列表展示对应日期的消费。
 * 2) 历史明细支持「编辑 / 删除」。删除进入「回收站」，可恢复。
 * 3) 顶部导航新增「回收站」页。
 */

// ===== 常量 & 工具 =====
const LS_KEY_EXPENSES = "budget.expenses.v2"; // 正常条目
const LS_KEY_SETTINGS = "budget.settings.v2"; // 设置
const LS_KEY_TRASH = "budget.trash.v1";        // 回收站

const DEFAULT_SETTINGS = { dailyBudget: 30, monthlyBudget: 0 };
const EXPORT_VERSION = 1;
const EXPORT_FILE_PREFIX = "budget-backup";

const FIXED_CATEGORIES = [
  { name: "日常", color: "#0ea5e9" },
  { name: "吃饭", color: "#22c55e" },
  { name: "数码", color: "#f97316" },
  { name: "额外", color: "#a78bfa" },
];

function cn(...classes) { return classes.filter(Boolean).join(" "); }
function toISODate(d) {
  const dt=new Date(d);
  const y=dt.getFullYear();
  const m=String(dt.getMonth()+1).padStart(2,'0');
  const day=String(dt.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function startOfDay(d=new Date()) { const t=new Date(d); t.setHours(0,0,0,0); return t; }
function endOfDay(d=new Date()) { const t=new Date(d); t.setHours(23,59,59,999); return t; }
function startOfWeek(d=new Date()) { const t=startOfDay(d); const day=t.getDay(); const diff= day===0? -6 : 1-day; t.setDate(t.getDate()+diff); return t; }
function endOfWeek(d=new Date()) { const s=startOfWeek(d); const e=new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999); return e; }
function startOfMonth(d=new Date()) { const t=new Date(d.getFullYear(), d.getMonth(), 1); t.setHours(0,0,0,0); return t; }
function endOfMonth(d=new Date()) { const t=new Date(d.getFullYear(), d.getMonth()+1, 0); t.setHours(23,59,59,999); return t; }
function formatCurrency(n) { return `¥${(Number(n)||0).toFixed(2)}`; }
function parseAmount(v) { if (typeof v==="number") return v; const n=parseFloat(String(v).replace(/[^0-9.\-]/g,'')); return isNaN(n)?0:n; }

/** @typedef {{ id:string, title:string, amount:number, ts:number, category:string }} Expense */
/** @typedef {{ dailyBudget:number, monthlyBudget?:number }} Settings */

function loadExpenses() { try { const raw=localStorage.getItem(LS_KEY_EXPENSES); return raw? JSON.parse(raw): /** @type {Expense[]} */([]); } catch { return []; } }
function saveExpenses(x) { localStorage.setItem(LS_KEY_EXPENSES, JSON.stringify(x)); }
function loadSettings() {
  try {
    const raw=localStorage.getItem(LS_KEY_SETTINGS);
    if (raw) return JSON.parse(raw);
    return { ...DEFAULT_SETTINGS };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) { localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(s)); }
function loadTrash(){ try{ const raw=localStorage.getItem(LS_KEY_TRASH); return raw? JSON.parse(raw): []; }catch{ return []; } }
function saveTrash(t){ localStorage.setItem(LS_KEY_TRASH, JSON.stringify(t)); }

function normalizeExpense(raw) {
  if (!raw || typeof raw !== "object") throw new Error("invalid expense");
  const amountValue = parseAmount(raw.amount);
  const amount = Number.isFinite(amountValue) ? Math.max(0, amountValue) : 0;
  const ts = Number(raw.ts);
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "未命名",
    amount,
    ts: Number.isFinite(ts) ? ts : Date.now(),
    category: typeof raw.category === "string" && raw.category ? raw.category : FIXED_CATEGORIES[0].name,
  };
}

function normalizeTrashEntry(raw) {
  const base = normalizeExpense(raw);
  const deletedAt = Number(raw.deletedAt);
  return { ...base, deletedAt: Number.isFinite(deletedAt) ? deletedAt : Date.now() };
}

function normalizeSettings(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const daily = parseAmount(raw.dailyBudget);
  const monthly = parseAmount(raw.monthlyBudget);
  return {
    dailyBudget: daily > 0 ? daily : DEFAULT_SETTINGS.dailyBudget,
    monthlyBudget: monthly > 0 ? monthly : 0,
  };
}

function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== "object") throw new Error("invalid snapshot");
  const expenses = Array.isArray(raw.expenses) ? raw.expenses.map(normalizeExpense) : [];
  const trash = Array.isArray(raw.trash) ? raw.trash.map(normalizeTrashEntry) : [];
  const settings = normalizeSettings(raw.settings);
  expenses.sort((a, b) => b.ts - a.ts);
  trash.sort((a, b) => b.deletedAt - a.deletedAt);
  return { expenses, trash, settings };
}

function buildExportPayload(expenses, settings, trash) {
  return {
    version: EXPORT_VERSION,
    generatedAt: new Date().toISOString(),
    expenses,
    settings,
    trash,
  };
}

function groupByCategory(list) { const m=new Map(); for (const e of list){ const k=e.category||'日常'; m.set(k,(m.get(k)||0)+(e.amount||0)); } return Array.from(m, ([name,value])=>({name,value})); }
const sum = (list)=> list.reduce((acc,e)=> acc+(e.amount||0), 0);
function eachDayBetween(start, end){ const arr=[]; const d=new Date(startOfDay(start)); const e=new Date(startOfDay(end)); while (d<=e){ arr.push(new Date(d)); d.setDate(d.getDate()+1);} return arr; }
function trendDaily(expenses, days){ const end=new Date(); const start=new Date(); start.setDate(end.getDate()-(days-1)); const daysArr=eachDayBetween(start,end); const byDate=new Map(); for (const e of expenses){ const iso=toISODate(e.ts); byDate.set(iso,(byDate.get(iso)||0)+(e.amount||0)); } return daysArr.map(d=>{ const iso=toISODate(d); return { date: iso.slice(5), value: byDate.get(iso)||0 }; }); }

function Badge({children,color}){ const bg=`${color}22`; const border=`${color}55`; return <span className="px-2 py-0.5 rounded-lg text-xs font-medium" style={{backgroundColor:bg,color,border:`1px solid ${border}`}}>{children}</span>; }
function Card({ className="", children }){ return <div className={cn("rounded-2xl bg-white/80 backdrop-blur shadow-sm ring-1 ring-black/5 p-5", className)}>{children}</div>; }
function Stat({ icon, label, value, sub, danger }){ const Icon=icon; const isDanger = !!danger; return (
  <div className="flex items-center gap-3">
    <div className={cn("p-2 rounded-xl", isDanger?"bg-red-50":"bg-gray-100")}> <Icon className={cn("w-5 h-5", isDanger?"text-red-600":"text-gray-700")} /> </div>
    <div>
      <div className="text-sm text-gray-500">{label}</div>
      <div className={cn("text-xl font-semibold", isDanger?"text-red-600":"")}>{value}</div>
      {typeof sub!=="undefined" && <div className={cn("text-xs mt-0.5", isDanger?"text-red-500":"text-gray-400")}>{sub}</div>}
    </div>
  </div>
); }

function CategorySelect({ value, onChange }){
  return (
    <div className="grid grid-cols-4 gap-2">
      {FIXED_CATEGORIES.map(c=> (
        <button key={c.name} type="button" onClick={()=>onChange(c.name)}
          className={cn("w-full rounded-xl border px-2 py-1 text-sm flex items-center justify-center gap-2", value===c.name?"border-transparent text-white":"border-gray-200")}
          style={{ backgroundColor: value===c.name? c.color: '#fff', color: value===c.name? readableTextColor(c.color): undefined }}>
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{backgroundColor:c.color}} />{c.name}
        </button>
      ))}
    </div>
  );
}

function readableTextColor(hex){ try{ const c=hex.replace('#',''); const b=parseInt(c.length===3? c.split('').map(x=>x+x).join(''): c,16); const r=(b>>16)&255, g=(b>>8)&255, bl=b&255; const L=(0.299*r+0.587*g+0.114*bl)/255; return L>0.6? '#111827':'#fff'; } catch { return '#111827'; } }

function Navbar({ tab, setTab }){
  const tabs = [
    { key: 'trend', label: '趋势', icon: LineIcon },
    { key: 'history', label: '历史', icon: History },
    { key: 'board', label: '看板', icon: PieIcon },
    { key: 'trash', label: '回收', icon: Trash2 },
  ];
  return (
    <div className="flex items-center gap-2 p-1 rounded-2xl bg-white/80 backdrop-blur ring-1 ring-black/5 w-max">
      {tabs.map(t=>{
        const Icon=t.icon; const active = tab===t.key;
        return (
          <button key={t.key} onClick={()=>setTab(t.key)}
            className={cn("flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm transition",
              active?"bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-sm":"text-gray-700 hover:bg-gray-100")}
            aria-current={active? 'page': undefined}
          >
            <Icon className="w-4 h-4" /> {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ===== 主组件 =====
export default function BudgetApp(){
  const [settings, setSettings] = useState(loadSettings());
  const [expenses, setExpenses] = useState(loadExpenses());
  const [trash, setTrash] = useState(loadTrash());

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dateStr, setDateStr] = useState(toISODate(new Date()));
  const [category, setCategory] = useState(FIXED_CATEGORIES[0].name);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [trendDays, setTrendDays] = useState(7);

  // 今日/所选日 列表：是否展开全部
  const [showAllDay, setShowAllDay] = useState(false);

  const [tab, setTab] = useState('trend'); // trend | history | board | trash

  // 历史编辑状态
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: '', amount: '', category: FIXED_CATEGORIES[0].name });

  // 图表交互
  const [activePieIndex, setActivePieIndex] = useState(-1);
  const [activeBarName, setActiveBarName] = useState(null);

  const fileInputRef = useRef(null);
  const [importFeedback, setImportFeedback] = useState(null);

  useEffect(()=> saveSettings(settings), [settings]);
  useEffect(()=> saveExpenses(expenses), [expenses]);
  useEffect(()=> saveTrash(trash), [trash]);

  useEffect(()=>{
    if (!importFeedback) return;
    const timer = setTimeout(()=> setImportFeedback(null), 5000);
    return ()=> clearTimeout(timer);
  }, [importFeedback]);

  // 时间范围（周/月统计仍基于今天所在周/月）
  const now=new Date();
  const weekStart=startOfWeek(now).getTime();
  const weekEnd=endOfWeek(now).getTime();
  const monthStart=startOfMonth(now).getTime();
  const monthEnd=endOfMonth(now).getTime();

  // ——— 新需求：表单日期驱动下方列表 ———
  const inputDate = new Date(dateStr+"T00:00:00");
  const inputDayStart = startOfDay(inputDate).getTime();
  const inputDayEnd = endOfDay(inputDate).getTime();

  const expensesDay = useMemo(()=> expenses.filter(e=> e.ts>=inputDayStart && e.ts<=inputDayEnd), [expenses, inputDayStart, inputDayEnd]);
  const spentDay = sum(expensesDay);

  const expensesWeek = useMemo(()=> expenses.filter(e=> e.ts>=weekStart && e.ts<=weekEnd), [expenses]);
  const expensesMonth = useMemo(()=> expenses.filter(e=> e.ts>=monthStart && e.ts<=monthEnd), [expenses]);

  const spentWeek = sum(expensesWeek);
  const spentMonth = sum(expensesMonth);

  // 预算
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const weeklyBudget = settings.dailyBudget * 7;
  const monthlyBudget = settings.monthlyBudget && settings.monthlyBudget>0 ? settings.monthlyBudget : settings.dailyBudget * daysInMonth;
  const leftToday = settings.dailyBudget - spentDay; // 此处按当前选择日期的当日预算计算
  const leftWeek = weeklyBudget - spentWeek;
  const leftMonth = monthlyBudget - spentMonth;

  function addExpense(e){
    e.preventDefault();
    const amt = parseAmount(amount);
    const finalTitle = title.trim() || '默认';
    if (!(amt>=1)) return; // 金额从 1 起步
    const ts = new Date(dateStr+"T"+ new Date().toTimeString().slice(0,8)).getTime();
    const item = { id: crypto.randomUUID(), title: finalTitle, amount: amt, ts, category };
    setExpenses(prev=> [item, ...prev]);
    setTitle(""); setAmount(""); setCategory(FIXED_CATEGORIES[0].name);
  }

  // 软删除：移入回收站
  function moveToTrash(id){
    setExpenses(prev=>{
      const idx = prev.findIndex(x=>x.id===id);
      if (idx===-1) return prev;
      const item = prev[idx];
      setTrash(t=> [{...item, deletedAt: Date.now()}, ...t]);
      const copy = [...prev]; copy.splice(idx,1); return copy;
    });
  }
  function restoreFromTrash(id){
    setTrash(prev=>{
      const idx=prev.findIndex(x=>x.id===id); if(idx===-1) return prev;
      const item=prev[idx]; setExpenses(e=> [item, ...e]);
      const cp=[...prev]; cp.splice(idx,1); return cp;
    })
  }
  function deleteForever(id){ setTrash(prev=> prev.filter(x=>x.id!==id)); }

  // 历史某一天（历史页用）
  const selectedDayStart = startOfDay(selectedDate).getTime();
  const selectedDayEnd = endOfDay(selectedDate).getTime();
  const expensesSelected = useMemo(()=> expenses.filter(e=> e.ts>=selectedDayStart && e.ts<=selectedDayEnd), [expenses, selectedDate]);
  const spentSelected = sum(expensesSelected);

  // 编辑：进入与保存
  function startEdit(eItem){
    setEditingId(eItem.id);
    setEditDraft({ title: eItem.title, amount: String(eItem.amount), category: eItem.category });
  }
  function cancelEdit(){ setEditingId(null); }
  function saveEdit(id){
    const amt = parseAmount(editDraft.amount);
    if (!(amt>=1) || !editDraft.title.trim()) return;
    setExpenses(prev=> prev.map(x=> x.id===id? {...x, title: editDraft.title.trim(), amount: amt, category: editDraft.category }: x));
    setEditingId(null);
  }

  function handleExport(){
    try {
      const payload = buildExportPayload(expenses, settings, trash);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${EXPORT_FILE_PREFIX}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setImportFeedback({ type: "success", message: "导出成功，备份文件已生成。" });
    } catch (err) {
      console.error(err);
      setImportFeedback({ type: "error", message: "导出失败，请稍后再试。" });
    }
  }

  function triggerImport(){
    fileInputRef.current?.click();
  }

  function handleImportFile(ev){
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try {
        const text = typeof reader.result === "string" ? reader.result : "";
        const parsed = JSON.parse(text);
        const snapshot = normalizeSnapshot(parsed);
        setExpenses(snapshot.expenses);
        setSettings(snapshot.settings);
        setTrash(snapshot.trash);
        setImportFeedback({ type: "success", message: `导入成功，已同步 ${snapshot.expenses.length} 条消费、${snapshot.trash.length} 条回收。` });
      } catch (error) {
        console.error(error);
        setImportFeedback({ type: "error", message: "导入失败：文件不是有效的备份。" });
      } finally {
        ev.target.value = "";
      }
    };
    reader.onerror = ()=>{
      setImportFeedback({ type: "error", message: "导入失败：无法读取文件。" });
      ev.target.value = "";
    };
    reader.readAsText(file);
  }

  // 图表数据与颜色映射
  const colorMap = Object.fromEntries(FIXED_CATEGORIES.map(c=>[c.name, c.color]));
  const weekByCat = groupByCategory(expensesWeek);
  const monthByCat = groupByCategory(expensesMonth);

  const trendData = useMemo(()=> trendDaily(expensesMonth, trendDays), [expensesMonth, trendDays]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-indigo-50 text-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold tracking-tight">活着</h1>
          <Navbar tab={tab} setTab={setTab} />
        </header>
        <div className="text-sm text-gray-500 mb-6">{toISODate(new Date())}</div>

        {/* 顶部统计（所有页面都显示） */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <Stat icon={Wallet} label="当日结余" value={formatCurrency(leftToday)} sub={`预算 ${formatCurrency(settings.dailyBudget)} · 已花 ${formatCurrency(spentDay)} · 日期 ${dateStr}`} danger={leftToday<0} />
          </Card>
          <Card>
            <Stat icon={CalendarDays} label="本周结余 (周一-周日)" value={formatCurrency(leftWeek)} sub={`预算 ${formatCurrency(weeklyBudget)} · 已花 ${formatCurrency(spentWeek)}`} danger={leftWeek<0} />
          </Card>
          <Card>
            <Stat icon={CalendarRange} label="本月结余" value={formatCurrency(leftMonth)} sub={`预算 ${formatCurrency(monthlyBudget)} · 已花 ${formatCurrency(spentMonth)}`} danger={leftMonth<0} />
          </Card>
        </div>

        {/* 页内容 */}
        {tab === 'trend' && (
          <>
            {/* 主布局：录入 + 设置 + 当日(表单日期)列表 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 录入表单 */}
              <Card className="lg:col-span-2">
                <div className="flex items中心 gap-2 mb-4">
                  <Plus className="w-5 h-5" />
                  <h2 className="font-semibold">新增消费</h2>
                </div>
                <form onSubmit={addExpense} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input type="text" placeholder="事项，如 吃饭/地铁/咖啡" className="md:col-span-2 w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400" value={title} onChange={(e)=>setTitle(e.target.value)} />
                  <input type="number" step="1" min={1} placeholder="金额 (元)" className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400" value={amount} onChange={(e)=>setAmount(e.target.value)} />
                  <input type="date" className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400" value={dateStr} onChange={(e)=>{ setDateStr(e.target.value); setShowAllDay(false); }} />
                  <div className="md:col-span-4"><CategorySelect value={category} onChange={setCategory} /></div>
                  <button type="submit" className="md:col-span-4 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 text-white px-4 py-2 hover:opacity-95 active:scale-[.99] transition"><Plus className="w-4 h-4" /> 添加</button>
                </form>
              </Card>

              {/* 设置 */}
              <Card>
                <div className="flex items-center gap-2 mb-4"><SettingsIcon className="w-5 h-5" /><h2 className="font-semibold">设置</h2></div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-600">每日预算 (元)</label>
                    <input type="number" step="1" min={1} className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" value={settings.dailyBudget} onChange={(e)=> setSettings({ ...settings, dailyBudget: Math.max(1, parseAmount(e.target.value)) })} />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600">月度预算 (元，可选)</label>
                    <input type="number" step="1" min={1} className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" value={settings.monthlyBudget || 0} onChange={(e)=> setSettings({ ...settings, monthlyBudget: Math.max(0, parseAmount(e.target.value)) })} />
                    <p className="text-xs text-gray-500 mt-1">为空或 0 时，按每日预算 × 当月天数计算。</p>
                  </div>
                  <div className="pt-4 border-t border-gray-100">
                    <div className="text-sm font-semibold text-gray-700 mb-2">数据导出 / 导入</div>
                    <p className="text-xs text-gray-500 mb-3">导出后可在其它设备导入，实现本地数据同步。</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={handleExport} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
                        导出数据
                      </button>
                      <button type="button" onClick={triggerImport} className="inline-flex items-center gap-2 rounded-xl bg-black text-white px-3 py-2 text-sm hover:opacity-90">
                        导入数据
                      </button>
                    </div>
                    {importFeedback && (
                      <p className={cn("mt-2 text-xs", importFeedback.type === "success" ? "text-green-600" : "text-red-600")}>{importFeedback.message}</p>
                    )}
                    <input ref={fileInputRef} type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
                  </div>
                </div>
              </Card>
            </div>

            {/* 所选日列表（受表单日期驱动） */}
            <Card className="mt-6">
              <div className="flex items-center justify-between mb-4"><h2 className="font-semibold">{dateStr} 消费（仅展示所选日期）</h2><div className="text-sm text-gray-500">共 {expensesDay.length} 条 · 已花 {formatCurrency(spentDay)}</div></div>
              {expensesDay.length===0 ? (
                <div className="text-sm text-gray-500">这一天还没有记录，快在上方添加一笔吧～</div>
              ) : (
                <>
                  <ul className="divide-y divide-gray-100">
                    {(showAllDay ? expensesDay : expensesDay.slice(0,3)).map(e=> (
                      <li key={e.id} className="flex items-center justify-between py-3">
                        <div>
                          <div className="font-medium flex items-center gap-2">{e.title}<Badge color={colorMap[e.category] || '#e5e7eb'}>{e.category}</Badge></div>
                          <div className="text-xs text-gray-400">{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="tabular-nums font-semibold">-{formatCurrency(e.amount)}</div>
                          <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="删除" onClick={()=>moveToTrash(e.id)}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {expensesDay.length>3 && (
                    <div className="mt-3 flex justify中心">
                      <button type="button" onClick={()=>setShowAllDay(v=>!v)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm bg-gradient-to-r from-indigo-600 to-sky-500 text-white shadow-sm hover:opacity-95 active:scale-[.99] transition">
                        {showAllDay ? '收起' : `显示全部（${expensesDay.length}）`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </Card>

            {/* 趋势折线（7天/30天，每天合计） */}
            <Card className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><LineIcon className="w-5 h-5" /><h2 className="font-semibold">趋势（{trendDays} 天）</h2></div>
                <div className="flex items-center gap-2">
                  <button className={cn("px-2 py-1 rounded-lg border", trendDays===7?"bg-black text-white":"hover:bg-gray-50")} onClick={()=>setTrendDays(7)}>7天</button>
                  <button className={cn("px-2 py-1 rounded-lg border", trendDays===30?"bg-black text-white":"hover:bg灰-50")} onClick={()=>setTrendDays(30)}>30天</button>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(v)=>formatCurrency(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="value" stroke="#111827" strokeWidth={2} dot={false} isAnimationActive />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </>
        )}

        {tab === 'history' && (
          <>
            {/* 历史浏览（日历 + 当日明细，可编辑/删除） */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <div className="flex items-center gap-2 mb-4"><History className="w-5 h-5" /><h2 className="font-semibold">历史浏览</h2></div>
                <MonthCalendar value={selectedDate} onChange={(d)=>{ setSelectedDate(d); setEditingId(null); }} expenses={expenses} />
              </Card>
              <Card>
                <div className="flex items-center justify-between mb-4"><h3 className="font-semibold">{toISODate(selectedDate)} 明细</h3><div className="text-sm text-gray-500">合计 {formatCurrency(spentSelected)}</div></div>
                {expensesSelected.length===0? <div className="text-sm text-gray-500">这一天没有记录</div> : (
                  <ul className="divide-y divide-gray-100">
                    {expensesSelected.map(e=> (
                      <li key={e.id} className="py-3">
                        {editingId===e.id ? (
                          <div className="flex flex-col md:flex-row md:items-center gap-2">
                            <input className="rounded-xl border border-gray-200 px-3 py-1" value={editDraft.title} onChange={ev=>setEditDraft(d=>({...d, title: ev.target.value}))} />
                            <input type="number" min={1} step="1" className="rounded-xl border border-gray-200 px-3 py-1 w-28" value={editDraft.amount} onChange={ev=>setEditDraft(d=>({...d, amount: ev.target.value}))} />
                            <select className="rounded-xl border border-gray-200 px-3 py-1" value={editDraft.category} onChange={ev=>setEditDraft(d=>({...d, category: ev.target.value}))}>
                              {FIXED_CATEGORIES.map(c=> <option key={c.name} value={c.name}>{c.name}</option>)}
                            </select>
                            <div className="ml-auto flex gap-2">
                              <button className="px-3 py-1 rounded-xl bg黑 text白 text-sm" onClick={()=>saveEdit(e.id)}>保存</button>
                              <button className="px-3 py-1 rounded-xl border text-sm" onClick={cancelEdit}>取消</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium flex items-center gap-2">{e.title}<Badge color={colorMap[e.category] || '#e5e7eb'}>{e.category}</Badge></div>
                              <div className="text-xs text-gray-400">{new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="tabular-nums font-semibold">-{formatCurrency(e.amount)}</div>
                              <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="编辑" onClick={()=>startEdit(e)}><Pencil className="w-4 h-4" /></button>
                              <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="删除" onClick={()=>moveToTrash(e.id)}><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}

        {tab === 'board' && (
          <>
            {/* 看板统计：周饼 + 月柱（细长条，阴影高亮） */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <div className="flex items-center gap-2 mb-4"><PieIcon className="w-5 h-5" /><h2 className="font-semibold">本周分类统计</h2></div>
                {weekByCat.length===0 ? <div className="text-sm text-gray-500">本周暂无数据</div> : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <defs>
                          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.25" />
                          </filter>
                        </defs>
                        <Pie dataKey="value" data={weekByCat} outerRadius={90} isAnimationActive activeIndex={activePieIndex}
                          onMouseEnter={(_,i)=>setActivePieIndex(i)} onMouseLeave={()=>setActivePieIndex(-1)} onClick={(_,i)=>setActivePieIndex(i)}
                          activeShape={(p)=>{ const {cx,cy,innerRadius,outerRadius,startAngle,endAngle,fill}=p; return <g><Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius+6} startAngle={startAngle} endAngle={endAngle} fill={fill} filter="url(#shadow)"/></g>; }} label>
                          {weekByCat.map((entry,i)=> (<Cell key={i} fill={colorMap[entry.name]||'#999'} opacity={activePieIndex===-1 || activePieIndex===i?1:0.45}/>))}
                        </Pie>
                        <Tooltip formatter={(v)=>formatCurrency(v)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card>
                <div className="flex items中心 gap-2 mb-4"><PieIcon className="w-5 h-5" /><h2 className="font-semibold">本月分类统计</h2></div>
                {monthByCat.length===0 ? <div className="text-sm text-gray-500">本月暂无数据</div> : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthByCat} onMouseMove={(s)=>{ const p=s?.activePayload?.[0]?.payload; setActiveBarName(p?.name||null); }} onMouseLeave={()=>setActiveBarName(null)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(v)=>formatCurrency(v)} />
                        <Legend />
                        <defs>
                          <filter id="shadowBar" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.25" /></filter>
                        </defs>
                        {/* 瘦一点的长方形 */}
                        <Bar dataKey="value" isAnimationActive barSize={16} radius={[5,5,0,0]}>
                          {monthByCat.map((entry,i)=> (
                            <Cell key={i} fill={colorMap[entry.name]||'#999'} filter={activeBarName===entry.name? 'url(#shadowBar)': undefined} opacity={activeBarName===null || activeBarName===entry.name ? 1 : 0.55} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>
          </>
        )}

        {tab === 'trash' && (
          <>
            <Card>
              <div className="flex items-center gap-2 mb-4"><Trash2 className="w-5 h-5" /><h2 className="font-semibold">回收</h2></div>
              {trash.length===0 ? <div className="text-sm text-gray-500">空空如也～</div> : (
                <ul className="divide-y divide-gray-100">
                  {trash.map(t=> (
                    <li key={t.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="font-medium flex items-center gap-2">{t.title}<Badge color={colorMap[t.category] || '#e5e7eb'}>{t.category}</Badge></div>
                        <div className="text-xs text-gray-400">原始金额：{formatCurrency(t.amount)} · 原始日期：{toISODate(t.ts)} · 删除于：{new Date(t.deletedAt).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="px-3 py-1 rounded-xl bg-black text-white text-sm" onClick={()=>restoreFromTrash(t.id)}>恢复</button>
                        <button className="px-3 py-1 rounded-xl border text-sm" onClick={()=>deleteForever(t.id)}>彻底删除</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}

        <footer className="text-center text-xs text-gray-500 mt-8">由细胞驱动的程序</footer>
      </div>
    </div>
  );
}

// ===== 简易月历组件（与先前版本保持一致风格） =====
function MonthCalendar({ value, onChange, expenses }){
  const base=new Date(value); const y=base.getFullYear(); const m=base.getMonth();
  const first=new Date(y,m,1); const last=new Date(y,m+1,0); const days=last.getDate();
  let offset=first.getDay(); offset = offset===0? 6: offset-1; // 周一开头
  const cells=[]; for(let i=0;i<offset;i++) cells.push(null); for(let d=1; d<=days; d++) cells.push(new Date(y,m,d));
  const totalByDate=new Map(); for (const e of expenses){ const k=toISODate(e.ts); totalByDate.set(k,(totalByDate.get(k)||0)+e.amount); }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-500">{y} 年 {m+1} 月</div>
        <div className="flex gap-2">
          <button className="px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm" onClick={()=> onChange(new Date(y, m-1, Math.min(value.getDate(), 28)))}>上月</button>
          <button className="px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm" onClick={()=> onChange(new Date(y, m+1, Math.min(value.getDate(), 28)))}>下月</button>
          <button className="px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm" onClick={()=> onChange(new Date())}>今天</button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-1">{['一','二','三','四','五','六','日'].map(w=> <div key={w}>周{w}</div>)}</div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((d,idx)=>{
          if (!d) return <div key={idx}/>;
          const iso=toISODate(d); const sel= toISODate(value)===iso; const today= toISODate(new Date())===iso; const spent= totalByDate.get(iso)||0;
          return (
            <button key={idx} onClick={()=> onChange(d)} className={cn("h-16 rounded-xl border flex flex-col items-center justify-center relative", sel?"border-black bg-black text-white":"border-gray-200 hover:bg-gray-50", today && !sel?"ring-1 ring-black/10":"")}>
              <div className="text-sm">{d.getDate()}</div>
              {spent>0 && (<div className={cn("text-[10px] mt-1", sel?"text-white/80":"text-gray-500")}>- {formatCurrency(spent)}</div>)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
