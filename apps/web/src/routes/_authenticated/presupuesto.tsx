import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createTopLevelCategory, parseMoney } from '@balance/core'
import { useBudget, useBudgetMutations } from '@/hooks/use-budget'
import { useCategories } from '@/hooks/use-categories'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { formatMoney } from '@/lib/format'

export const Route = createFileRoute('/_authenticated/presupuesto')({ component: BudgetPage })
const nowMonth = () => new Date().toISOString().slice(0, 7)
const shiftMonth = (month: string, delta: number) => { const parts=month.split('-').map(Number); const y=parts[0]??new Date().getFullYear(); const m=parts[1]??1; const d=new Date(y,m-1+delta,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
const money = (v: string) => { try { return parseMoney(v) } catch { return -1 } }

function BudgetPage() {
  const [month,setMonth]=useState(nowMonth())
  const [income,setIncome]=useState('')
  const [category,setCategory]=useState('')
  const [target,setTarget]=useState('')
  const [newName,setNewName]=useState('')
  const budget=useBudget(month); const mutations=useBudgetMutations(month)
  const {data:categories=[]}=useCategories({entity:'personal'}); const qc=useQueryClient()
  const available=categories.filter(c=>c.parent_id===null && !budget.data?.categories.some(b=>b.category_id===c.id))
  const previous=shiftMonth(month,-1)
  async function copyPrevious() { try { await mutations.copy.mutateAsync({from:previous,replace:false}) } catch { if (window.confirm('Este mes ya tiene datos. ¿Reemplazarlos?')) mutations.copy.mutate({from:previous,replace:true}) } }
  return <div className="space-y-6">
    <div className="flex items-center justify-between"><h1 className="text-xl font-semibold">Presupuesto</h1><div className="flex items-center gap-2"><button onClick={()=>setMonth(shiftMonth(month,-1))}>‹</button><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/><button onClick={()=>setMonth(shiftMonth(month,1))}>›</button></div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Summary label="Disponible real" value={budget.data?.actual_available}/><Summary label="Disponible planificado" value={budget.data?.planned_available}/><Summary label="Ingreso real" value={budget.data?.actual_income}/><Summary label="Asignado" value={budget.data?.total_allocated}/>
    </div>
    <form className="flex gap-2" onSubmit={e=>{e.preventDefault(); const v=money(income); if(v>=0) mutations.income.mutate(v)}}><input aria-label="Ingreso planificado" className="rounded border px-3 py-2" placeholder={String(budget.data?.planned_income??0)} value={income} onChange={e=>setIncome(e.target.value)}/><button className="rounded bg-primary px-3 text-primary-foreground">Guardar ingreso</button></form>
    <div className="grid gap-3 md:grid-cols-2">{budget.data?.categories.map(row=><div key={row.category_id} className="rounded-lg border p-4 space-y-2"><div className="flex justify-between"><strong>{row.name}</strong><button className="text-sm text-muted-foreground" onClick={()=>mutations.remove.mutate(row.category_id)}>Quitar</button></div><div className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{width:`${Math.min(100,row.percentage_used)}%`}}/></div><div className="flex justify-between text-sm"><span>{formatMoney(row.spent)} gastado</span><span>{formatMoney(row.remaining)} restante</span></div><form className="flex gap-2" onSubmit={e=>{e.preventDefault(); const input=new FormData(e.currentTarget).get('amount') as string; const v=money(input); if(v>=0) mutations.target.mutate({categoryId:row.category_id,amount:v})}}><input name="amount" aria-label={`Meta ${row.name}`} className="w-full rounded border px-2 py-1" defaultValue={row.target/100}/><button>Editar</button></form></div>)}</div>
    {!budget.isLoading && !budget.data?.categories.length && <p className="text-muted-foreground">Este mes todavía no tiene asignaciones.</p>}
    <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();const v=money(target);if(category&&v>=0)mutations.target.mutate({categoryId:category,amount:v})}}><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Categoría…</option>{available.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><input placeholder="Meta PEN" value={target} onChange={e=>setTarget(e.target.value)}/><button>Agregar meta</button><button type="button" onClick={()=>void copyPrevious()}>Copiar {previous}</button></form>
    <form className="flex gap-2" onSubmit={async e=>{e.preventDefault();if(!newName.trim())return;await createTopLevelCategory(supabase,newName);setNewName('');void qc.invalidateQueries({queryKey:['categories']})}}><input placeholder="Nueva categoría" value={newName} onChange={e=>setNewName(e.target.value)}/><button>Crear categoría</button></form>
  </div>
}
function Summary({label,value}:{label:string;value?:number}) { return <div className="rounded-lg border p-4"><div className="text-sm text-muted-foreground">{label}</div><div className="text-xl font-semibold">{formatMoney(value??0)}</div></div> }
