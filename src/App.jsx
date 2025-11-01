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
  BarChart3 as BarIcon,
  Pencil,
  Tag,
  ArrowUp,
  ArrowDown,
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
const LS_KEY_CATEGORIES = "budget.categories.v1";

const DEFAULT_CATEGORIES = [
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
function parseDateInput(v){ if(!v) return null; const parts=String(v).split('-').map(Number); if(parts.length!==3) return null; const [y,m,d]=parts; const dt=new Date(y, (m||1)-1, d||1); if(!Number.isFinite(dt.getTime())) return null; return dt; }
function toDateInputValue(date){
  if(!date) return "";
  const dt=new Date(date);
  if(!Number.isFinite(dt.getTime())) return "";
  return toISODate(dt);
}
function generateId(){ try{ if(typeof crypto!=='undefined' && crypto.randomUUID) return crypto.randomUUID(); }catch{} return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeXml(v){ return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); }
function buildExcelXml(rows){
  const xmlRows = rows.map(cells=>{
    if(!cells || cells.length===0) return "<Row/>";
    const cellsXml = cells.map(cell=>{
      const type = cell?.type||'String';
      const value = escapeXml(cell?.value??'');
      return `<Cell><Data ss:Type="${type}">${value}</Data></Cell>`;
    }).join("");
    return `<Row>${cellsXml}</Row>`;
  }).join("");
  return `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="消费明细"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
}
function downloadExcelXml(rows, filename){ const content=buildExcelXml(rows); const blob=new Blob([content],{type:"application/vnd.ms-excel"}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }

/** @typedef {{ id:string, title:string, amount:number, ts:number, category:string }} Expense */
/** @typedef {{ dailyBudget:number, monthlyBudget?:number }} Settings */

function loadExpenses() { try { const raw=localStorage.getItem(LS_KEY_EXPENSES); return raw? JSON.parse(raw): /** @type {Expense[]} */([]); } catch { return []; } }
function saveExpenses(x) { localStorage.setItem(LS_KEY_EXPENSES, JSON.stringify(x)); }
function loadSettings() {
  try {
    const raw=localStorage.getItem(LS_KEY_SETTINGS);
    if (raw) return JSON.parse(raw);
    return { dailyBudget: 30, monthlyBudget: 0 };
  } catch { return { dailyBudget: 30, monthlyBudget: 0 }; }
}
function saveSettings(s) { localStorage.setItem(LS_KEY_SETTINGS, JSON.stringify(s)); }
function loadTrash(){ try{ const raw=localStorage.getItem(LS_KEY_TRASH); return raw? JSON.parse(raw): []; }catch{ return []; } }
function saveTrash(t){ localStorage.setItem(LS_KEY_TRASH, JSON.stringify(t)); }
function loadCategories(){
  try {
    const raw = localStorage.getItem(LS_KEY_CATEGORIES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length>0) {
        return parsed.filter(c=> c && typeof c.name==='string' && c.name.trim()).map(c=>({ name: c.name.trim(), color: c.color || '#0ea5e9' }));
      }
    }
  } catch {}
  return DEFAULT_CATEGORIES;
}
function saveCategories(list){ localStorage.setItem(LS_KEY_CATEGORIES, JSON.stringify(list)); }

function groupByCategory(list) {
  const m=new Map();
  for (const e of list){
    const k=e.category||'日常';
    m.set(k,(m.get(k)||0)+(e.amount||0));
  }
  return Array.from(m, ([name,amount])=>({name,amount}));
}
const sum = (list)=> list.reduce((acc,e)=> acc+(e.amount||0), 0);
function eachDayBetween(start, end){ const arr=[]; const d=new Date(startOfDay(start)); const e=new Date(startOfDay(end)); while (d<=e){ arr.push(new Date(d)); d.setDate(d.getDate()+1);} return arr; }
function trendDaily(expenses, days){ const end=new Date(); const start=new Date(); start.setDate(end.getDate()-(days-1)); const daysArr=eachDayBetween(start,end); const byDate=new Map(); for (const e of expenses){ const iso=toISODate(e.ts); byDate.set(iso,(byDate.get(iso)||0)+(e.amount||0)); } return daysArr.map(d=>{ const iso=toISODate(d); return { date: iso.slice(5), amount: byDate.get(iso)||0 }; }); }

function Badge({children,color}){ const bg=`${color}22`; const border=`${color}55`; return <span className="px-2 py-0.5 rounded-lg text-xs font-medium" style={{backgroundColor:bg,color,border:`1px solid ${border}`}}>{children}</span>; }
function Card({ className="", children }){
  return (
    <div className={cn("w-full rounded-2xl bg-white/80 backdrop-blur shadow-sm ring-1 ring-black/5 p-4 sm:p-5", className)}>
      {children}
    </div>
  );
}
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

function CategorySelect({ value, onChange, categories }){
  const list = categories && categories.length>0 ? categories : DEFAULT_CATEGORIES;
  const [expanded, setExpanded] = useState(false);
  const listLength = list.length;
  useEffect(()=>{ if (listLength<=4) setExpanded(false); }, [listLength]);
  const visibleList = expanded ? list : list.slice(0,4);
  const showToggle = listLength>4;
  const gridCols = showToggle ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4";
  return (
    <div className="flex flex-col gap-2">
      <div className={cn("grid gap-2", gridCols)}>
        {visibleList.map(c=> (
          <button
            key={c.name}
            type="button"
            onClick={()=>onChange(c.name)}
            className={cn(
              "w-full rounded-xl border px-2 py-1 text-sm flex items-center justify-center gap-2",
              value===c.name?"border-transparent text-white":"border-gray-200"
            )}
            style={{
              backgroundColor: value===c.name? c.color: '#fff',
              color: value===c.name? readableTextColor(c.color): undefined,
            }}
          >
            <span
              className={cn(
                "inline-block w-2.5 h-2.5 rounded-full",
                value===c.name?"ring-1 ring-inset ring-white/70":""
              )}
              style={{ backgroundColor: value===c.name? '#fff': c.color }}
            />
            {c.name}
          </button>
        ))}
        {showToggle && (
          <button
            type="button"
            onClick={()=>setExpanded(v=>!v)}
            className="w-full rounded-xl border border-dashed border-gray-300 px-2 py-1 text-sm text-gray-500 transition hover:border-gray-400 hover:text-gray-700 col-span-2 sm:col-span-1"
          >
            {expanded? '收起': '更多'}
          </button>
        )}
      </div>
    </div>
  );
}

function readableTextColor(hex){ try{ const c=hex.replace('#',''); const b=parseInt(c.length===3? c.split('').map(x=>x+x).join(''): c,16); const r=(b>>16)&255, g=(b>>8)&255, bl=b&255; const L=(0.299*r+0.587*g+0.114*bl)/255; return L>0.6? '#111827':'#fff'; } catch { return '#111827'; } }

function Navbar({ tab, setTab }){
  const tabs = [
    { key: 'trend', label: '趋势', icon: LineIcon },
    { key: 'history', label: '历史', icon: History },
    { key: 'board', label: '看板', icon: PieIcon },
    { key: 'settings', label: '设置', icon: SettingsIcon },
    { key: 'trash', label: '回收', icon: Trash2 },
  ];
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 p-1 rounded-2xl bg-white/80 backdrop-blur ring-1 ring-black/5 w-full sm:w-auto">
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
  const [categories, setCategories] = useState(()=>loadCategories());

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dateStr, setDateStr] = useState(toISODate(new Date()));
  const [category, setCategory] = useState("");

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [historyJumpValue, setHistoryJumpValue] = useState(()=> toDateInputValue(new Date()));
  const [trendDays, setTrendDays] = useState(7);
  const [selectedYearForMonthly, setSelectedYearForMonthly] = useState(()=> new Date().getFullYear());
  const [selectedWeeklyMonth, setSelectedWeeklyMonth] = useState('recent');
  const [exportStart, setExportStart] = useState(()=> toISODate(startOfMonth(new Date())));
  const [exportEnd, setExportEnd] = useState(()=> toISODate(new Date()));
  const fileInputRef = useRef(null);

  // 今日/所选日 列表：是否展开全部
  const [showAllDay, setShowAllDay] = useState(false);

  const [tab, setTab] = useState('trend'); // trend | history | board | settings | trash

  // 历史编辑状态
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: '', amount: '', category: '' });

  // 分类管理
  const [categoryForm, setCategoryForm] = useState({ name: '', color: DEFAULT_CATEGORIES[0].color });
  const [categoryEditing, setCategoryEditing] = useState(null);

  // 图表交互
  const [activePieIndex, setActivePieIndex] = useState(-1);
  const [activeBarName, setActiveBarName] = useState(null);
  const [activeYearBarName, setActiveYearBarName] = useState(null);
  const [activeWeeklyIndex, setActiveWeeklyIndex] = useState(-1);

  useEffect(()=> saveSettings(settings), [settings]);
  useEffect(()=> saveExpenses(expenses), [expenses]);
  useEffect(()=> saveTrash(trash), [trash]);
  useEffect(()=> saveCategories(categories), [categories]);
  useEffect(()=>{ setHistoryJumpValue(toDateInputValue(selectedDate)); }, [selectedDate]);
  useEffect(()=>{
    if (categories.length===0){
      setCategory('');
      return;
    }
    setCategory(prev=>{
      if (prev && categories.some(c=>c.name===prev)) return prev;
      return categories[0].name;
    });
  }, [categories]);
  useEffect(()=>{
    setEditDraft(d=>{
      if (!d.category || categories.some(c=>c.name===d.category)) return d;
      return { ...d, category: categories[0]?.name || '' };
    });
  }, [categories]);

  // 时间范围（周/月统计仍基于今天所在周/月）
  const now=new Date();
  const weekStart=startOfWeek(now).getTime();
  const weekEnd=endOfWeek(now).getTime();
  const monthStart=startOfMonth(now).getTime();
  const monthEnd=endOfMonth(now).getTime();
  const yearStart=startOfDay(new Date(now.getFullYear(), 0, 1)).getTime();
  const yearEnd=endOfDay(now).getTime();

  // ——— 新需求：表单日期驱动下方列表 ———
  const inputDate = new Date(dateStr+"T00:00:00");
  const inputDayStart = startOfDay(inputDate).getTime();
  const inputDayEnd = endOfDay(inputDate).getTime();

  const expensesDay = useMemo(()=> expenses.filter(e=> e.ts>=inputDayStart && e.ts<=inputDayEnd), [expenses, inputDayStart, inputDayEnd]);
  const spentDay = sum(expensesDay);

  const expensesWeek = useMemo(()=> expenses.filter(e=> e.ts>=weekStart && e.ts<=weekEnd), [expenses]);
  const expensesMonth = useMemo(()=> expenses.filter(e=> e.ts>=monthStart && e.ts<=monthEnd), [expenses]);
  const expensesYear = useMemo(()=> expenses.filter(e=> e.ts>=yearStart && e.ts<=yearEnd), [expenses]);

  const spentWeek = sum(expensesWeek);
  const spentMonth = sum(expensesMonth);
  const categoryUsage = useMemo(()=>{
    const map = new Map();
    for (const item of expenses){
      const key = item.category || '';
      map.set(key, (map.get(key)||0)+1);
    }
    return map;
  }, [expenses]);

  // 预算
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const weeklyBudget = settings.dailyBudget * 7;
  const monthlyBudget = settings.monthlyBudget && settings.monthlyBudget>0 ? settings.monthlyBudget : settings.dailyBudget * daysInMonth;
  const leftToday = settings.dailyBudget - spentDay; // 此处按当前选择日期的当日预算计算
  const leftWeek = weeklyBudget - spentWeek;
  const leftMonth = monthlyBudget - spentMonth;

  const exportStartDate = parseDateInput(exportStart);
  const exportEndDate = parseDateInput(exportEnd);
  const exportDisabled = !exportStartDate || !exportEndDate || startOfDay(exportStartDate) > endOfDay(exportEndDate);

  function handleExport(){
    if (exportDisabled){ alert("请选择正确的导出日期区间"); return; }
    const startTs = startOfDay(exportStartDate).getTime();
    const endTs = endOfDay(exportEndDate).getTime();
    const list = expenses.filter(e=> e.ts>=startTs && e.ts<=endTs).sort((a,b)=> a.ts-b.ts);
    if (list.length===0){ alert("所选区间没有消费记录"); return; }
    const rows = [];
    rows.push([
      { type:'String', value:'日期' },
      { type:'String', value:'标题' },
      { type:'String', value:'分类' },
      { type:'String', value:'金额' },
      { type:'String', value:'记录时间' },
    ]);
    const dailyTotals = new Map();
    for (const item of list){
      const iso = toISODate(item.ts);
      const timeStr = new Date(item.ts).toLocaleString();
      rows.push([
        { type:'String', value: iso },
        { type:'String', value: item.title },
        { type:'String', value: item.category },
        { type:'Number', value: Number(item.amount||0) },
        { type:'String', value: timeStr },
      ]);
      const prev = dailyTotals.get(iso) || { total: 0, count: 0 };
      prev.total += item.amount || 0;
      prev.count += 1;
      dailyTotals.set(iso, prev);
    }
    rows.push([]);
    rows.push([
      { type:'String', value:'汇总' },
      { type:'String', value:'日期' },
      { type:'String', value:'条目' },
      { type:'String', value:'金额' },
      { type:'String', value:'' },
    ]);
    const sortedTotals = Array.from(dailyTotals.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
    let grandTotal = 0;
    for (const [dateKey, info] of sortedTotals){
      grandTotal += info.total;
      rows.push([
        { type:'String', value:'汇总' },
        { type:'String', value: dateKey },
        { type:'String', value: `${info.count} 条` },
        { type:'Number', value: Number(info.total.toFixed(2)) },
        { type:'String', value:'' },
      ]);
    }
    rows.push([
      { type:'String', value:'汇总' },
      { type:'String', value:'总计' },
      { type:'String', value: `${list.length} 条` },
      { type:'Number', value: Number(grandTotal.toFixed(2)) },
      { type:'String', value:'' },
    ]);
    const filename = `消费明细_${exportStart}_${exportEnd}.xls`;
    downloadExcelXml(rows, filename);
  }

  async function handleImport(ev){
    const file = ev.target.files?.[0];
    if(!file) return;
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "application/xml");
      if (doc.getElementsByTagName("parsererror").length>0) throw new Error("无法解析文件，请使用导出的模板");
      const rows = Array.from(doc.getElementsByTagName("Row"));
      if (rows.length<=1) throw new Error("文件中没有可导入的数据");
      const headerCells = Array.from(rows[0].getElementsByTagName("Cell")).map(cell=>{
        const dataNode = cell.getElementsByTagName("Data")[0];
        return dataNode? dataNode.textContent?.trim() || "" : "";
      });
      const columnIndex = {};
      headerCells.forEach((name, idx)=>{ if(name) columnIndex[name]=idx; });
      if (columnIndex['日期']===undefined || columnIndex['金额']===undefined) throw new Error("模板缺少必要的列：日期或金额");
      const imported = [];
      for (let i=1;i<rows.length;i++){
        const cells = Array.from(rows[i].getElementsByTagName("Cell"));
        const getValue = (header)=>{
          const idx = columnIndex[header];
          if (idx===undefined) return "";
          const cell = cells[idx];
          if (!cell) return "";
          const dataNode = cell.getElementsByTagName("Data")[0];
          return dataNode? dataNode.textContent || "" : "";
        };
        const dateValue = getValue('日期').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) continue;
        const amountValue = parseAmount(getValue('金额'));
        if (!(amountValue>0)) continue;
        const titleValue = getValue('标题').trim() || '默认';
        const categoryValue = getValue('分类').trim();
        imported.push({
          date: dateValue,
          title: titleValue,
          category: categoryValue,
          amount: amountValue,
        });
      }
      if (imported.length===0) throw new Error("未读取到有效的消费记录");
      const grouped = new Map();
      for (const item of imported){
        if (!grouped.has(item.date)) grouped.set(item.date, []);
        grouped.get(item.date).push(item);
      }
      const affectedDates = Array.from(grouped.keys()).sort();
      setExpenses(prev=>{
        const preserved = prev.filter(e=> !grouped.has(toISODate(e.ts)));
        const additions = [];
        for (const dateKey of affectedDates){
          const entries = grouped.get(dateKey) || [];
          entries.forEach((entry, idx)=>{
            const baseDate = parseDateInput(dateKey) || new Date();
            const tsDate = new Date(baseDate.getTime());
            tsDate.setHours(12, idx, 0, idx);
            const categoryName = categories.some(c=>c.name===entry.category) ? entry.category : (categories[0]?.name || DEFAULT_CATEGORIES[0].name);
            additions.push({ id: generateId(), title: entry.title, amount: entry.amount, category: categoryName, ts: tsDate.getTime() });
          });
        }
        const merged = [...preserved, ...additions].sort((a,b)=> a.ts-b.ts);
        return merged;
      });
      if (affectedDates.length>0){
        const latest = parseDateInput(affectedDates[affectedDates.length-1]);
        if (latest) setSelectedDate(latest);
      }
      alert(`成功导入 ${imported.length} 条消费记录，覆盖 ${grouped.size} 天。`);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : '导入失败，请检查文件格式');
    } finally {
      ev.target.value = "";
    }
  }

  function handleHistoryJump(ev){
    ev?.preventDefault?.();
    const dt = parseDateInput(historyJumpValue);
    if(!dt) return;
    setSelectedDate(dt);
    setEditingId(null);
  }

  function adjustFormDate(offset){
    const base = parseDateInput(dateStr) || new Date();
    const nextDate = new Date(base.getTime());
    nextDate.setDate(nextDate.getDate()+offset);
    setDateStr(toISODate(nextDate));
    setShowAllDay(false);
  }

  function handleAddCategory(ev){
    ev?.preventDefault?.();
    const name = categoryForm.name.trim();
    if (!name){ alert('分类名称不能为空'); return; }
    if (categories.some(c=>c.name===name)){ alert('分类名称已存在'); return; }
    const color = categoryForm.color || DEFAULT_CATEGORIES[0].color;
    const next = [...categories, { name, color }];
    setCategories(next);
    setCategoryForm({ name: '', color: DEFAULT_CATEGORIES[0].color });
    if (!category){ setCategory(name); }
  }

  useEffect(()=>{
    setCategoryEditing(state=>{
      if (!state) return state;
      const nextIndex = categories.findIndex(item=> item.name === (state.originalName || state.name));
      if (nextIndex === -1) return null;
      if (nextIndex === state.index) return state;
      return { ...state, index: nextIndex };
    });
  }, [categories]);

  function startCategoryEditForm(index){
    const target = categories[index];
    if (!target) return;
    setCategoryEditing({ index, name: target.name, color: target.color, originalName: target.name });
  }

  function cancelCategoryEdit(){ setCategoryEditing(null); }

  function submitCategoryEdit(){
    if (!categoryEditing) return;
    const idx = categoryEditing.index;
    const target = categories[idx];
    if (!target) { setCategoryEditing(null); return; }
    const name = categoryEditing.name.trim();
    if (!name){ alert('分类名称不能为空'); return; }
    if (categories.some((c,i)=> i!==idx && c.name===name)){ alert('分类名称已存在'); return; }
    const color = categoryEditing.color || DEFAULT_CATEGORIES[0].color;
    if (target.name===name && target.color===color){ setCategoryEditing(null); return; }
    setCategories(prev=>{
      const next=[...prev];
      next[idx]={ name, color };
      return next;
    });
    if (target.name!==name){
      setExpenses(prev=> prev.map(item=> item.category===target.name? { ...item, category: name }: item));
      setTrash(prev=> prev.map(item=> item.category===target.name? { ...item, category: name }: item));
      setCategory(cur=> cur===target.name? name: cur);
      setEditDraft(d=> ({ ...d, category: d.category===target.name? name: d.category }));
    }
    setCategoryEditing(null);
  }

  function moveCategory(index, delta){
    setCategories(prev=>{
      const nextIndex = index + delta;
      if (nextIndex<0 || nextIndex>=prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
  }

  function removeCategory(index){
    const target = categories[index];
    if (!target) return;
    if (categories.length<=1){ alert('至少保留一个分类'); return; }
    if ((categoryUsage.get(target.name) || 0)>0){
      alert('已经存在记账记录的分类不能删除');
      return;
    }
    const next = categories.filter((_,i)=> i!==index);
    if (next.length===0){ alert('至少保留一个分类'); return; }
    setCategories(next);
    setCategory(cur=> cur===target.name? next[0]?.name || '': cur);
    setEditDraft(d=> ({ ...d, category: d.category===target.name? next[0]?.name || '': d.category }));
    setCategoryEditing(null);
  }

  function addExpense(e){
    e.preventDefault();
    const amt = parseAmount(amount);
    const finalTitle = title.trim() || '默认';
    if (!(amt>=1)) return; // 金额从 1 起步
    const validCategory = categories.some(c=>c.name===category) ? category : (categories[0]?.name || '');
    if (!validCategory){ alert('请先添加分类'); return; }
    const ts = new Date(dateStr+"T"+ new Date().toTimeString().slice(0,8)).getTime();
    const item = { id: generateId(), title: finalTitle, amount: amt, ts, category: validCategory };
    setExpenses(prev=> [item, ...prev]);
    setTitle(""); setAmount(""); setCategory(categories[0]?.name || validCategory);
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
    const safeCategory = categories.some(c=>c.name===eItem.category) ? eItem.category : (categories[0]?.name || '');
    setEditDraft({ title: eItem.title, amount: String(eItem.amount), category: safeCategory });
  }
  function cancelEdit(){ setEditingId(null); }
  function saveEdit(id){
    const amt = parseAmount(editDraft.amount);
    if (!(amt>=1) || !editDraft.title.trim()) return;
    const finalCategory = categories.some(c=>c.name===editDraft.category) ? editDraft.category : (categories[0]?.name || '');
    if (!finalCategory) return;
    setExpenses(prev=> prev.map(x=> x.id===id? {...x, title: editDraft.title.trim(), amount: amt, category: finalCategory }: x));
    setEditingId(null);
  }

  // 图表数据与颜色映射
  const colorMap = useMemo(()=> Object.fromEntries(categories.map(c=>[c.name, c.color])), [categories]);
  const weekByCat = groupByCategory(expensesWeek);
  const monthByCat = groupByCategory(expensesMonth);
  const yearByCat = groupByCategory(expensesYear);

  const trendData = useMemo(()=> trendDaily(expensesMonth, trendDays), [expensesMonth, trendDays]);
  const yearlySummary = useMemo(()=>{
    const map = new Map();
    for (const item of expenses){
      const dt = new Date(item.ts);
      if (!Number.isFinite(dt.getTime())) continue;
      const year = dt.getFullYear();
      map.set(year, (map.get(year)||0) + (item.amount || 0));
    }
    const currentYear = new Date().getFullYear();
    if (!map.has(currentYear)) map.set(currentYear, 0);
    const arr = Array.from(map.entries()).map(([year,total])=>({ year, total }));
    arr.sort((a,b)=> a.year - b.year);
    return arr;
  }, [expenses]);
  const yearlyChartData = useMemo(()=> yearlySummary.map(item=>({ name: `${item.year}`, amount: Number(item.total || 0) })), [yearlySummary]);
  const availableYearsForMonthly = useMemo(()=> yearlySummary.map(item=>item.year), [yearlySummary]);
  useEffect(()=>{
    if (availableYearsForMonthly.length===0) return;
    if (!availableYearsForMonthly.includes(selectedYearForMonthly)){
      setSelectedYearForMonthly(availableYearsForMonthly[availableYearsForMonthly.length-1]);
    }
  }, [availableYearsForMonthly, selectedYearForMonthly]);
  const monthlyChartData = useMemo(()=>{
    const arr = Array.from({ length: 12 }, (_,i)=> ({ name: `${i+1}月`, amount: 0 }));
    for (const item of expenses){
      const dt = new Date(item.ts);
      if (!Number.isFinite(dt.getTime())) continue;
      if (dt.getFullYear() !== selectedYearForMonthly) continue;
      const idx = dt.getMonth();
      arr[idx].amount += item.amount || 0;
    }
    return arr.map(entry=> ({ ...entry, amount: Number(entry.amount || 0) }));
  }, [expenses, selectedYearForMonthly]);
  const weeklyMonthOptions = useMemo(()=>{
    const set = new Map();
    const nowDate = new Date();
    const nowKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth()+1).padStart(2,'0')}`;
    set.set(nowKey, { value: nowKey, year: nowDate.getFullYear(), month: nowDate.getMonth()+1 });
    for (const item of expenses){
      const dt = new Date(item.ts);
      if (!Number.isFinite(dt.getTime())) continue;
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      if (!set.has(key)) set.set(key, { value: key, year: dt.getFullYear(), month: dt.getMonth()+1 });
    }
    const arr = Array.from(set.values());
    arr.sort((a,b)=> a.year===b.year ? a.month-b.month : a.year-b.year);
    return arr.map(item=> ({ ...item, label: `${item.year}年${item.month}月` }));
  }, [expenses]);
  useEffect(()=>{
    if (selectedWeeklyMonth==='recent') return;
    if (!weeklyMonthOptions.some(opt=>opt.value===selectedWeeklyMonth)){
      setSelectedWeeklyMonth('recent');
    }
  }, [weeklyMonthOptions, selectedWeeklyMonth]);
  const weeklyPieData = useMemo(()=>{
    if (selectedWeeklyMonth === 'recent'){
      const nowDate = new Date();
      const baseStart = startOfWeek(nowDate);
      const segments = [];
      for (let offset=3; offset>=0; offset--){
        const startDate = new Date(baseStart);
        startDate.setDate(startDate.getDate() - offset*7);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate()+6);
        endDate.setHours(23,59,59,999);
        const label = `${startDate.getMonth()+1}/${String(startDate.getDate()).padStart(2,'0')}~${endDate.getMonth()+1}/${String(endDate.getDate()).padStart(2,'0')}`;
        const amount = expenses.reduce((acc,cur)=>{
          if (cur.ts>=startDate.getTime() && cur.ts<=endDate.getTime()){
            return acc + (cur.amount || 0);
          }
          return acc;
        }, 0);
        segments.push({ name: label, amount: Number(amount || 0) });
      }
      return segments;
    }
    const [yearStr, monthStr] = selectedWeeklyMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const daysInSelectedMonth = new Date(year, month, 0).getDate();
    const ranges = [
      { startDay: 1, endDay: Math.min(7, daysInSelectedMonth) },
      { startDay: 8, endDay: Math.min(14, daysInSelectedMonth) },
      { startDay: 15, endDay: Math.min(21, daysInSelectedMonth) },
      { startDay: 22, endDay: daysInSelectedMonth },
    ].filter(range=> range.startDay <= daysInSelectedMonth);
    return ranges.map(range=>{
      const startDate = startOfDay(new Date(year, month-1, range.startDay));
      const endDate = endOfDay(new Date(year, month-1, range.endDay));
      const amount = expenses.reduce((acc,cur)=>{
        if (cur.ts>=startDate.getTime() && cur.ts<=endDate.getTime()){
          return acc + (cur.amount || 0);
        }
        return acc;
      }, 0);
      return { name: `${range.startDay}-${range.endDay}日`, amount: Number(amount || 0) };
    });
  }, [expenses, selectedWeeklyMonth]);
  const yearlyChartHasData = useMemo(()=> yearlyChartData.some(item=>item.amount>0), [yearlyChartData]);
  const monthlyChartHasData = useMemo(()=> monthlyChartData.some(item=>item.amount>0), [monthlyChartData]);
  const weeklyPieHasData = useMemo(()=> weeklyPieData.some(item=>item.amount>0), [weeklyPieData]);
  const weeklyPalette = ["#0ea5e9", "#22c55e", "#f97316", "#a855f7"];
  const boardStats = useMemo(()=>{
    const nowDate=new Date();
    const dayMs=24*60*60*1000;
    const start30Base=new Date(nowDate.getTime());
    start30Base.setDate(start30Base.getDate()-29);
    const start30=startOfDay(start30Base);
    const endNow=endOfDay(nowDate);
    const mapByDate=new Map();
    for (const exp of expenses){
      const iso=toISODate(exp.ts);
      if(!mapByDate.has(iso)) mapByDate.set(iso, []);
      mapByDate.get(iso).push(exp);
    }
    for (const arr of mapByDate.values()){ arr.sort((a,b)=>a.ts-b.ts); }
    let total30=0;
    let minDay=null;
    let maxDay=null;
    const daysRange=eachDayBetween(start30, nowDate);
    for (const day of daysRange){
      const iso=toISODate(day);
      const entries=mapByDate.get(iso)||[];
      const dayTotal=entries.reduce((acc,cur)=> acc+(cur.amount||0), 0);
      total30+=dayTotal;
      if(dayTotal>0){
        if(!minDay || dayTotal<minDay.total){ minDay={ date: iso, total: dayTotal, entries: entries.slice() }; }
        if(!maxDay || dayTotal>maxDay.total){ maxDay={ date: iso, total: dayTotal, entries: entries.slice() }; }
      }
    }
    const yearStartBase=new Date(nowDate.getTime()-365*dayMs);
    const yearStart=startOfDay(yearStartBase).getTime();
    const yearEnd=endNow.getTime();
    let minExpense=null;
    let maxExpense=null;
    for (const exp of expenses){
      if(!(exp.amount>0)) continue;
      if(exp.ts<yearStart || exp.ts>yearEnd) continue;
      if(!minExpense || exp.amount<minExpense.amount || (exp.amount===minExpense.amount && exp.ts<minExpense.ts)) minExpense=exp;
      if(!maxExpense || exp.amount>maxExpense.amount || (exp.amount===maxExpense.amount && exp.ts<maxExpense.ts)) maxExpense=exp;
    }
    return { thirtyDay: { total: total30, minDay, maxDay }, yearly: { minExpense, maxExpense } };
  }, [expenses]);
  const thirtyDayStats = boardStats.thirtyDay;
  const yearlyStats = boardStats.yearly;

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-indigo-50 text-gray-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Header */}
        <header className="flex flex-col gap-4 rounded-3xl bg-white/70 p-4 shadow-sm ring-1 ring-black/5 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">活着</h1>
            <p className="mt-1 text-sm text-gray-500 md:hidden">{toISODate(new Date())}</p>
          </div>
          <Navbar tab={tab} setTab={setTab} />
          <p className="hidden text-sm text-gray-500 md:block">{toISODate(new Date())}</p>
        </header>

        <main className="mt-6 flex-1 space-y-6">
          {/* 顶部统计（所有页面都显示） */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="grid grid-cols-1 gap-6 lg:auto-rows-fr lg:grid-cols-2 lg:items-stretch">
                {/* 录入表单 */}
                <Card className="flex h-full flex-col">
                  <div className="mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    <h2 className="font-semibold">新增消费</h2>
                  </div>
                  <form onSubmit={addExpense} className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-[1.75fr_1fr_1.5fr]">
                    <input type="text" placeholder="事项:吃饭/地铁/咖啡" className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400" value={title} onChange={(e)=>setTitle(e.target.value)} />
                    <input type="number" step="1" min={1} placeholder="金额 (元)" className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400" value={amount} onChange={(e)=>setAmount(e.target.value)} />
                    <input type="date" className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400 sm:col-span-2 md:col-span-1" value={dateStr} onChange={(e)=>{ setDateStr(e.target.value); setShowAllDay(false); }} />
                    <div className="sm:col-span-2 md:col-span-3"><CategorySelect value={category} onChange={setCategory} categories={categories} /></div>
                    <div className="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-3 md:col-span-3 md:grid-cols-4">
                      <button
                        type="button"
                        className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm transition hover:bg-gray-50"
                        onClick={()=>adjustFormDate(-1)}
                      >前一天</button>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-gray-200 px-4 py-2 text-sm transition hover:bg-gray-50"
                        onClick={()=>adjustFormDate(1)}
                      >后一天</button>
                      <button
                        type="submit"
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 px-4 py-2 text-white transition hover:opacity-95 active:scale-[.99] md:col-span-2"
                      >
                        <Plus className="w-4 h-4" /> 添加
                      </button>
                    </div>
                  </form>
                </Card>

                {/* 所选日列表（受表单日期驱动） */}
                <Card className="flex h-full flex-col">
                  <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
                    <h2 className="text-base font-semibold sm:text-lg">{dateStr} 消费（仅展示所选日期）</h2>
                    <div className="text-sm text-gray-500 sm:ml-auto">共 {expensesDay.length} 条 · 已花 {formatCurrency(spentDay)}</div>
                  </div>
                  {expensesDay.length===0 ? (
                    <div className="text-sm text-gray-500">这一天还没有记录，快在上方添加一笔吧～</div>
                  ) : (
                    <>
                      <ul className="divide-y divide-gray-100">
                        {(showAllDay ? expensesDay : expensesDay.slice(0,3)).map(e=> (
                          <li key={e.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2 font-medium">{e.title}<Badge color={colorMap[e.category] || '#e5e7eb'}>{e.category}</Badge></div>
                              <div className="text-xs text-gray-400">{new Date(e.ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                            </div>
                            <div className="flex items-center gap-3 sm:ml-auto sm:min-w-[140px] sm:justify-end">
                              <div className="tabular-nums text-right font-semibold sm:text-right">-{formatCurrency(e.amount)}</div>
                              <button className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100" title="删除" onClick={()=>moveToTrash(e.id)}><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </li>
                        ))}
                      </ul>
                      {expensesDay.length>3 && (
                        <div className="mt-3 flex justify-center sm:justify-end">
                          <button type="button" onClick={()=>setShowAllDay(v=>!v)}
                            className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 px-3 py-1.5 text-sm text-white shadow-sm transition hover:opacity-95 active:scale-[.99]">
                            {showAllDay ? '收起' : `显示全部（${expensesDay.length}）`}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </Card>
              </div>

            </>
          )}

          {tab === 'history' && (
            <>
              <div className="grid gap-6">
              {/* 历史浏览（日历 + 当日明细，可编辑/删除） */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <div className="flex items-center gap-2 mb-4"><History className="w-5 h-5" /><h2 className="font-semibold">历史浏览</h2></div>
                  <MonthCalendar value={selectedDate} onChange={(d)=>{ setSelectedDate(d); setEditingId(null); }} expenses={expenses} />
                  <form onSubmit={handleHistoryJump} className="mt-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input type="date" className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 sm:w-48 sm:flex-none" value={historyJumpValue} onChange={(ev)=>setHistoryJumpValue(ev.target.value)} />
                      <button
                        type="submit"
                        className="h-10 rounded-xl bg-black px-4 text-sm text-white sm:px-6 sm:min-w-[108px] self-end sm:self-auto sm:ml-auto"
                      >跳转</button>
                    </div>
                  </form>
                </Card>
                <Card>
                  <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
                    <h3 className="font-semibold">{toISODate(selectedDate)} 明细</h3>
                    <div className="text-sm text-gray-500 sm:ml-auto">合计 {formatCurrency(spentSelected)}</div>
                  </div>
                  {expensesSelected.length===0? <div className="text-sm text-gray-500">这一天没有记录</div> : (
                    <ul className="divide-y divide-gray-100">
                      {expensesSelected.map(e=> (
                        <li key={e.id} className="py-3">
                          {editingId===e.id ? (
                            <div className="flex flex-col md:flex-row md:items-center gap-2">
                              <input className="rounded-xl border border-gray-200 px-3 py-1" value={editDraft.title} onChange={ev=>setEditDraft(d=>({...d, title: ev.target.value}))} />
                              <input type="number" min={1} step="1" className="rounded-xl border border-gray-200 px-3 py-1 w-28" value={editDraft.amount} onChange={ev=>setEditDraft(d=>({...d, amount: ev.target.value}))} />
                              <select className="rounded-xl border border-gray-200 px-3 py-1" value={editDraft.category} onChange={ev=>setEditDraft(d=>({...d, category: ev.target.value}))}>
                                {categories.map(c=> <option key={c.name} value={c.name}>{c.name}</option>)}
                              </select>
                              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end md:ml-auto">
                                <button className="w-full rounded-xl bg-black px-3 py-1 text-sm text-white sm:w-auto" onClick={()=>saveEdit(e.id)}>保存</button>
                                <button className="w-full rounded-xl border px-3 py-1 text-sm sm:w-auto" onClick={cancelEdit}>取消</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-2 font-medium">{e.title}<Badge color={colorMap[e.category] || '#e5e7eb'}>{e.category}</Badge></div>
                                <div className="text-xs text-gray-400">{new Date(e.ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                              </div>
                              <div className="flex items-center gap-3 sm:ml-auto sm:min-w-[160px] sm:justify-end">
                                <div className="tabular-nums text-right font-semibold sm:text-right">-{formatCurrency(e.amount)}</div>
                                <button className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100" title="编辑" onClick={()=>startEdit(e)}><Pencil className="w-4 h-4" /></button>
                                <button className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100" title="删除" onClick={()=>moveToTrash(e.id)}><Trash2 className="w-4 h-4" /></button>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              <Card>
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2"><CalendarRange className="w-5 h-5" /><h2 className="font-semibold">数据导入导出</h2></div>
                    <p className="text-xs text-gray-500">选择日期区间导出 Excel；导入同模板将按天覆盖原有数据。</p>
                  </div>
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">开始</span>
                      <input type="date" className="rounded-xl border border-gray-200 px-3 py-1" value={exportStart} max={exportEnd || undefined} onChange={ev=>setExportStart(ev.target.value)} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">结束</span>
                      <input type="date" className="rounded-xl border border-gray-200 px-3 py-1" value={exportEnd} min={exportStart || undefined} onChange={ev=>setExportEnd(ev.target.value)} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button className={cn("px-3 py-1.5 rounded-xl text-sm", exportDisabled?"bg-gray-200 text-gray-500 cursor-not-allowed":"bg-black text-white")} onClick={handleExport} disabled={exportDisabled}>导出 Excel</button>
                      <button className="px-3 py-1.5 rounded-xl border text-sm" onClick={()=>fileInputRef.current?.click()}>导入 Excel</button>
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".xls" className="hidden" onChange={handleImport} />
                </div>
              </Card>
            </div>
          </>
        )}

        {tab === 'board' && (
          <>
            <div className="grid gap-6">
              {/* 趋势折线（7天/30天，每天合计） */}
              <Card>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2"><LineIcon className="w-5 h-5" /><h2 className="font-semibold">趋势（{trendDays} 天）</h2></div>
                  <div className="flex items-center gap-2">
                    <button className={cn("px-2 py-1 rounded-lg border", trendDays===7?"bg-black text-white":"hover:bg-gray-50")} onClick={()=>setTrendDays(7)}>7天</button>
                    <button className={cn("px-2 py-1 rounded-lg border", trendDays===30?"bg-black text-white":"hover:bg-gray-50")} onClick={()=>setTrendDays(30)}>30天</button>
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
                      <Line type="monotone" dataKey="amount" name="金额" stroke="#111827" strokeWidth={2} dot={false} isAnimationActive />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-1">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <BarIcon className="h-5 w-5" />
                      <h2 className="font-semibold">每年消费金额</h2>
                    </div>
                  </div>
                  {yearlyChartHasData ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={yearlyChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="name" tickLine={false} axisLine={false} />
                          <YAxis tickLine={false} axisLine={false} tickFormatter={(v)=>`¥${v}`} />
                          <Tooltip formatter={(value)=>formatCurrency(value)} cursor={{ fill: "#f1f5f9" }} />
                          <Bar dataKey="amount" name="金额" fill="#6366f1" radius={[10,10,0,0]} barSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">暂无数据</div>
                  )}
                </Card>

                <Card className="lg:col-span-1">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <BarIcon className="h-5 w-5" />
                      <h2 className="font-semibold">每月消费金额</h2>
                    </div>
                    <select
                      value={selectedYearForMonthly}
                      onChange={(ev)=>setSelectedYearForMonthly(Number(ev.target.value))}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                    >
                      {availableYearsForMonthly.map(year=> (
                        <option key={year} value={year}>{year}年</option>
                      ))}
                    </select>
                  </div>
                  {monthlyChartHasData ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthlyChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="name" tickLine={false} axisLine={false} />
                          <YAxis tickLine={false} axisLine={false} tickFormatter={(v)=>`¥${v}`} />
                          <Tooltip formatter={(value)=>formatCurrency(value)} cursor={{ fill: "#f1f5f9" }} />
                          <Bar dataKey="amount" name="金额" fill="#0ea5e9" radius={[10,10,0,0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">所选年份暂无数据</div>
                  )}
                </Card>

                <Card className="lg:col-span-1">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <PieIcon className="h-5 w-5" />
                      <h2 className="font-semibold">每周消费金额</h2>
                    </div>
                    <select
                      value={selectedWeeklyMonth}
                      onChange={(ev)=>setSelectedWeeklyMonth(ev.target.value)}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                    >
                      <option value="recent">最近四周</option>
                      {weeklyMonthOptions.map(opt=> (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  {weeklyPieHasData ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            dataKey="amount"
                            data={weeklyPieData}
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            innerRadius={40}
                            paddingAngle={2}
                            activeIndex={activeWeeklyIndex >= 0 ? activeWeeklyIndex : undefined}
                            onMouseEnter={(_,index)=>setActiveWeeklyIndex(index)}
                            onMouseLeave={()=>setActiveWeeklyIndex(-1)}
                            label
                          >
                            {weeklyPieData.map((entry,index)=>(
                              <Cell key={entry.name} fill={weeklyPalette[index % weeklyPalette.length]} opacity={activeWeeklyIndex===-1 || activeWeeklyIndex===index ? 1 : 0.5} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value)=>formatCurrency(value)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">所选时间暂无数据</div>
                  )}
                </Card>
              </div>

              {/* 看板统计：周饼 + 月/年柱（细长条，阴影高亮） */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
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
                        <Pie dataKey="amount" name="金额" data={weekByCat} outerRadius={90} isAnimationActive activeIndex={activePieIndex}
                          onMouseEnter={(_,i)=>setActivePieIndex(i)} onMouseLeave={()=>setActivePieIndex(-1)} onClick={(_,i)=>setActivePieIndex(i)}
                          activeShape={(p)=>{ const {cx,cy,innerRadius,outerRadius,startAngle,endAngle,fill}=p; return <g><Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius+6} startAngle={startAngle} endAngle={endAngle} fill={fill} filter="url(#shadow)"/></g>; }} label>
                          {weekByCat.map((entry,i)=> (<Cell key={i} fill={colorMap[entry.name]||'#999'} opacity={activePieIndex===-1 || activePieIndex===i?1:0.45}/>))}
                        </Pie>
                        <Tooltip formatter={(v)=>[formatCurrency(v), '金额']} />
                        <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>

                <Card>
                  <div className="flex items-center gap-2 mb-4"><PieIcon className="w-5 h-5" /><h2 className="font-semibold">本月分类统计</h2></div>
                  {monthByCat.length===0 ? <div className="text-sm text-gray-500">本月暂无数据</div> : (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthByCat} onMouseMove={(s)=>{ const p=s?.activePayload?.[0]?.payload; setActiveBarName(p?.name||null); }} onMouseLeave={()=>setActiveBarName(null)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(v)=>[formatCurrency(v), '金额']} />
                        <Legend />
                        <defs>
                          <filter id="shadowBar" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="4" stdDeviation="0" floodColor="#0f172a" floodOpacity="0.18" /></filter>
                        </defs>
                        {/* 瘦一点的长方形 */}
                        <Bar dataKey="amount" name="金额" isAnimationActive barSize={16} radius={[5,5,0,0]}>
                          {monthByCat.map((entry,i)=> (
                            <Cell key={i} fill={colorMap[entry.name]||'#999'} filter={activeBarName===entry.name? 'url(#shadowBar)': undefined} opacity={activeBarName===null || activeBarName===entry.name ? 1 : 0.55} />
                          ))}
                        </Bar>
                      </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>

                <Card>
                  <div className="flex items-center gap-2 mb-4"><PieIcon className="w-5 h-5" /><h2 className="font-semibold">本年分类统计</h2></div>
                  {yearByCat.length===0 ? <div className="text-sm text-gray-500">本年暂无数据</div> : (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={yearByCat} onMouseMove={(s)=>{ const p=s?.activePayload?.[0]?.payload; setActiveYearBarName(p?.name||null); }} onMouseLeave={()=>setActiveYearBarName(null)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(v)=>[formatCurrency(v), '金额']} />
                        <Legend />
                        <defs>
                          <filter id="shadowBarYear" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="4" stdDeviation="0" floodColor="#0f172a" floodOpacity="0.18" /></filter>
                        </defs>
                        <Bar dataKey="amount" name="金额" isAnimationActive barSize={16} radius={[5,5,0,0]}>
                          {yearByCat.map((entry,i)=> (
                            <Cell key={i} fill={colorMap[entry.name]||'#999'} filter={activeYearBarName===entry.name? 'url(#shadowBarYear)': undefined} opacity={activeYearBarName===null || activeYearBarName===entry.name ? 1 : 0.55} />
                          ))}
                        </Bar>
                      </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>

                <Card className="lg:col-span-3">
                  <div className="flex items-center gap-2 mb-4"><LineIcon className="w-5 h-5" /><h2 className="font-semibold">消费统计</h2></div>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                    <div className="rounded-2xl border border-gray-100 bg-white/70 p-4 shadow-sm">
                      <div className="text-xs uppercase tracking-wide text-gray-400">近30天合计</div>
                      <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{formatCurrency(thirtyDayStats.total)}</div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-gray-100 bg-white/70 p-4 shadow-sm">
                        <div className="text-xs uppercase tracking-wide text-gray-400">近一年单笔最低</div>
                        {yearlyStats.minExpense ? (
                          <div className="mt-3 space-y-2 text-sm text-gray-600">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                              <span className="font-medium text-gray-900 truncate">{yearlyStats.minExpense.title}</span>
                              <span className="text-lg font-semibold text-gray-900 tabular-nums">{formatCurrency(yearlyStats.minExpense.amount)}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                              <span>日期 {toISODate(yearlyStats.minExpense.ts)}</span>
                              {yearlyStats.minExpense.category && (<Badge color={colorMap[yearlyStats.minExpense.category] || '#e5e7eb'}>{yearlyStats.minExpense.category}</Badge>)}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-gray-400">近一年无消费记录</div>
                        )}
                      </div>
                      <div className="rounded-2xl border border-gray-100 bg-white/70 p-4 shadow-sm">
                        <div className="text-xs uppercase tracking-wide text-gray-400">近一年单笔最高</div>
                        {yearlyStats.maxExpense ? (
                          <div className="mt-3 space-y-2 text-sm text-gray-600">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                              <span className="font-medium text-gray-900 truncate">{yearlyStats.maxExpense.title}</span>
                              <span className="text-lg font-semibold text-gray-900 tabular-nums">{formatCurrency(yearlyStats.maxExpense.amount)}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                              <span>日期 {toISODate(yearlyStats.maxExpense.ts)}</span>
                              {yearlyStats.maxExpense.category && (<Badge color={colorMap[yearlyStats.maxExpense.category] || '#e5e7eb'}>{yearlyStats.maxExpense.category}</Badge>)}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 text-xs text-gray-400">近一年无消费记录</div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-gray-100 bg-white/70 p-4 shadow-sm">
                      <div className="text-xs uppercase tracking-wide text-gray-400">单日最低</div>
                      {thirtyDayStats.minDay ? (
                        <div className="mt-3 space-y-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                            <span className="text-sm font-medium text-gray-900">{thirtyDayStats.minDay.date}</span>
                            <span className="text-lg font-semibold text-gray-900 tabular-nums">{formatCurrency(thirtyDayStats.minDay.total)}</span>
                          </div>
                          <ul className="space-y-2 text-xs text-gray-600">
                            {thirtyDayStats.minDay.entries.map(item=>(
                              <li key={item.id} className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="truncate">{item.title}</span>
                                  {item.category && (<Badge color={colorMap[item.category] || '#e5e7eb'}>{item.category}</Badge>)}
                                </div>
                                <span className="tabular-nums font-medium text-gray-900">{formatCurrency(item.amount)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="mt-3 text-xs text-gray-400">近30天无消费记录</div>
                      )}
                    </div>
                    <div className="rounded-2xl border border-gray-100 bg-white/70 p-4 shadow-sm">
                      <div className="text-xs uppercase tracking-wide text-gray-400">单日最高</div>
                      {thirtyDayStats.maxDay ? (
                        <div className="mt-3 space-y-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                            <span className="text-sm font-medium text-gray-900">{thirtyDayStats.maxDay.date}</span>
                            <span className="text-lg font-semibold text-gray-900 tabular-nums">{formatCurrency(thirtyDayStats.maxDay.total)}</span>
                          </div>
                          <ul className="space-y-2 text-xs text-gray-600">
                            {thirtyDayStats.maxDay.entries.map(item=>(
                              <li key={item.id} className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="truncate">{item.title}</span>
                                  {item.category && (<Badge color={colorMap[item.category] || '#e5e7eb'}>{item.category}</Badge>)}
                                </div>
                                <span className="tabular-nums font-medium text-gray-900">{formatCurrency(item.amount)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="mt-3 text-xs text-gray-400">近30天无消费记录</div>
                      )}
                    </div>
                  </div>
                </div>
                </Card>
              </div>
            </div>
          </>
        )}

        {tab === 'settings' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card>
                <div className="flex items-center gap-2 mb-4"><SettingsIcon className="w-5 h-5" /><h2 className="font-semibold">预算设置</h2></div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-gray-600">每日预算 (元)</label>
                    <input type="number" step="1" min={1} className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" value={settings.dailyBudget} onChange={(e)=> setSettings({ ...settings, dailyBudget: Math.max(1, parseAmount(e.target.value)) })} />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600">月度预算 (元，可选)</label>
                    <input type="number" step="1" min={0} className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" value={settings.monthlyBudget || 0} onChange={(e)=> setSettings({ ...settings, monthlyBudget: Math.max(0, parseAmount(e.target.value)) })} />
                    <p className="text-xs text-gray-500 mt-1">为空或 0 时，按每日预算 × 当月天数计算。</p>
                  </div>
                </div>
              </Card>

              <Card className="lg:col-span-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                  <div className="flex items-center gap-2"><Tag className="w-5 h-5" /><h2 className="font-semibold">分类管理</h2></div>
                  <div className="text-xs text-gray-400">共 {categories.length} 个分类</div>
                </div>
                <form onSubmit={handleAddCategory} className="grid gap-3 sm:grid-cols-[minmax(0,220px),minmax(0,140px),auto]">
                  <input type="text" placeholder="分类名称，如 交通 / 娱乐" className="rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" value={categoryForm.name} onChange={(ev)=>setCategoryForm(form=>({ ...form, name: ev.target.value }))} />
                  <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2">
                    <span className="text-xs text-gray-500">颜色</span>
                    <input type="color" className="h-8 w-12 cursor-pointer border-none bg-transparent p-0" value={categoryForm.color} onChange={(ev)=>setCategoryForm(form=>({ ...form, color: ev.target.value }))} />
                  </div>
                  <button type="submit" className="rounded-xl bg-gradient-to-r from-indigo-600 to-sky-500 px-4 py-2 text-sm font-medium text-white hover:opacity-95 active:scale-[.99] transition">添加分类</button>
                </form>
                <p className="mt-2 text-xs text-gray-500">分类会同步在新增消费、历史编辑、统计等模块中使用。</p>
                <div className="mt-6 space-y-3">
                  {categories.length===0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">暂无分类，请先添加一个分类。</div>
                  ) : (
                    <ul className="space-y-3">
                      {categories.map((c, idx)=>{
                        const usage = categoryUsage.get(c.name) || 0;
                        const isEditing = !!categoryEditing && categoryEditing.index===idx;
                        return (
                          <li key={c.name} className="rounded-2xl border border-gray-100 bg-white/70 p-4 shadow-sm">
                            {isEditing ? (
                              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                                <input className="rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" value={categoryEditing.name} onChange={(ev)=> setCategoryEditing(state=> state? { ...state, name: ev.target.value }: state)} placeholder="分类名称" />
                                <div className="flex items-center gap-3">
                                  <span className="text-xs text-gray-500">颜色</span>
                                  <input type="color" className="h-9 w-12 cursor-pointer border-none bg-transparent p-0" value={categoryEditing.color} onChange={(ev)=> setCategoryEditing(state=> state? { ...state, color: ev.target.value }: state)} />
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end md:ml-auto">
                                  <button type="button" className="w-full rounded-xl bg-black px-4 py-2 text-sm text-white sm:w-auto" onClick={submitCategoryEdit}>保存</button>
                                  <button type="button" className="w-full rounded-xl border px-4 py-2 text-sm sm:w-auto" onClick={cancelCategoryEdit}>取消</button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="inline-flex h-4 w-4 rounded-full border border-gray-200" style={{ backgroundColor: c.color }} />
                                  <span className="text-sm font-medium text-gray-900">{c.name}</span>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 md:ml-auto md:flex-1 md:justify-end">
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                    <span>已使用 {usage} 次</span>
                                    <div className="flex gap-1">
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
                                        onClick={()=>moveCategory(idx, -1)}
                                        disabled={idx===0}
                                        title="上移"
                                      >
                                        <ArrowUp className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">上移</span>
                                      </button>
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
                                        onClick={()=>moveCategory(idx, 1)}
                                        disabled={idx===categories.length-1}
                                        title="下移"
                                      >
                                        <ArrowDown className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">下移</span>
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex flex-col gap-2 sm:flex-row sm:gap-3 md:ml-0">
                                    <button type="button" className="w-full rounded-xl border px-4 py-2 text-sm transition hover:bg-gray-50 sm:w-auto" onClick={()=>startCategoryEditForm(idx)}>修改</button>
                                    <button type="button" className="w-full rounded-xl border px-4 py-2 text-sm transition sm:w-auto" disabled={usage>0} onClick={()=>removeCategory(idx)} title={usage>0? '已有记账引用该分类，无法删除':''}>
                                      <span className={cn(usage>0? 'text-gray-400':'text-red-500')}>删除</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
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
                    <li key={t.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <div className="font-medium flex flex-wrap items-center gap-2">{t.title}<Badge color={colorMap[t.category] || '#e5e7eb'}>{t.category}</Badge></div>
                        <div className="text-xs text-gray-400">原始金额：{formatCurrency(t.amount)} · 原始日期：{toISODate(t.ts)} · 删除于：{new Date(t.deletedAt).toLocaleString()}</div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <button className="w-full rounded-xl bg-black px-3 py-1 text-sm text-white sm:w-auto" onClick={()=>restoreFromTrash(t.id)}>恢复</button>
                        <button className="w-full rounded-xl border px-3 py-1 text-sm sm:w-auto" onClick={()=>deleteForever(t.id)}>彻底删除</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
        </main>

        <footer className="mt-6 text-center text-xs text-gray-500">由细胞驱动的程序</footer>
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
