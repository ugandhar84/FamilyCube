/**
 * Health Report Generator — World-class veterinary document
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { supabase } from './supabase';
import { parseDbTime, localDateStr } from './dates';
import { format, differenceInYears, differenceInMonths } from 'date-fns';
import type { Pet } from './types';

export type ReportSection =
  | 'profile' | 'medications' | 'vaccines' | 'appointments'
  | 'vet_visits' | 'weight' | 'allergies' | 'mood'
  | 'lab_reports' | 'insurance';

export const REPORT_SECTION_LABELS: Record<ReportSection, string> = {
  profile: 'Pet Profile', medications: 'Medications', vaccines: 'Vaccinations',
  appointments: 'Appointments', vet_visits: 'Vet Visit History', weight: 'Weight Log',
  allergies: 'Allergies', mood: 'Mood & Wellbeing', lab_reports: 'Lab Reports (AI Analyzed)',
  insurance: 'Insurance',
};

export const DEFAULT_SECTIONS: ReportSection[] = [
  'profile', 'medications', 'vaccines', 'appointments',
  'vet_visits', 'weight', 'allergies', 'lab_reports', 'mood',
];

// ── Data fetcher ──────────────────────────────────────────────────────────────
async function fetchReportData(petId: string, sections: ReportSection[]) {
  const has = (s: ReportSection) => sections.includes(s);
  const [meds, vaccines, appts, visits, weights, allergies, mood, insurance, records] = await Promise.all([
    has('medications') ? supabase.from('medications').select('name,dosage,frequency,start_date,end_date,is_active,notes').eq('pet_id', petId).order('is_active', { ascending: false }).order('start_date', { ascending: false }).limit(50) : null,
    has('vaccines') ? supabase.from('vaccines').select('name,last_given,next_due,vet_name,clinic,notes').eq('pet_id', petId).order('last_given', { ascending: false }).limit(30) : null,
    has('appointments') ? supabase.from('appointments').select('title,type,scheduled_at,vet_name,clinic_name,status,notes').eq('pet_id', petId).order('scheduled_at', { ascending: false }).limit(20) : null,
    has('vet_visits') ? supabase.from('vet_visits').select('visit_date,vet_name,clinic_name,reason,diagnosis,notes').eq('pet_id', petId).order('visit_date', { ascending: false }).limit(30) : null,
    has('weight') ? supabase.from('weight_logs').select('weight_kg,logged_at,notes').eq('pet_id', petId).order('logged_at', { ascending: false }).limit(24) : null,
    has('allergies') ? supabase.from('allergies').select('allergen,severity,category,notes,diagnosed_date').eq('pet_id', petId).order('severity', { ascending: false }) : null,
    has('mood') ? supabase.from('mood_logs').select('mood_label,mood_score,happy_pct,playful_pct,tired_pct,anxious_pct,created_at').eq('pet_id', petId).order('created_at', { ascending: false }).limit(30) : null,
    has('insurance') ? supabase.from('pet_insurance').select('provider,policy_number,coverage_type,start_date,end_date,premium_amount,deductible,reimbursement_percent,annual_limit,claims_phone,notes').eq('pet_id', petId).order('created_at', { ascending: false }).limit(5) : null,
    has('lab_reports') ? supabase.from('health_records').select('id,file_name,ai_summary,extracted_data,created_at,status').eq('pet_id', petId).eq('status', 'done').eq('auto_saved', true).order('created_at', { ascending: false }).limit(20) : null,
  ]);
  const labRecords = records?.data ?? [];
  console.log('[HealthReport] lab_records fetched:', labRecords.length);
  return {
    medications: meds?.data ?? [], vaccines: vaccines?.data ?? [],
    appointments: appts?.data ?? [], vet_visits: visits?.data ?? [],
    weights: weights?.data ?? [], allergies: allergies?.data ?? [],
    mood: mood?.data ?? [], insurance: insurance?.data ?? [],
    lab_records: labRecords,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function petAge(birthday: string | null): string {
  if (!birthday) return 'Unknown';
  const born = parseDbTime(birthday + 'T00:00:00Z');
  const y = differenceInYears(new Date(), born);
  if (y >= 1) return `${y} yr${y !== 1 ? 's' : ''}`;
  const m = differenceInMonths(new Date(), born);
  return `${m} mo${m !== 1 ? 's' : ''}`;
}
function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  try { return format(parseDbTime(v), 'MMM d, yyyy'); } catch { return v; }
}
function fmtDateOnly(v: string | null | undefined) {
  if (!v) return '—';
  try { return format(new Date(v + 'T00:00:00'), 'MMM d, yyyy'); } catch { return v; }
}
function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : ''; }

function moodColor(label: string) {
  const m: Record<string, string> = { happy: '#D97706', playful: '#059669', calm: '#2563EB', tired: '#6B7280', grumpy: '#DC2626', anxious: '#B45309', content: '#059669', excited: '#D97706' };
  return m[label?.toLowerCase()] ?? '#6B7280';
}

function numericValue(raw: string | null, unit: string | null): string {
  if (!raw) return '—';
  if (unit) {
    const esc = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const s = raw.replace(new RegExp('\\s*' + esc + '$'), '').trim();
    if (s) return s;
  }
  const m = raw.match(/^([<>≤≥]?\s*[\d.,]+)/);
  return m ? m[1].trim() : raw;
}

function abnormalDir(raw: string | null, ref: string | null): 'H' | 'L' | null {
  if (!raw || !ref) return null;
  const n = parseFloat(raw.replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) return null;
  const rng = ref.match(/^([\d.]+)\s*[-–]\s*([\d.]+)/);
  if (rng) { if (n > parseFloat(rng[2])) return 'H'; if (n < parseFloat(rng[1])) return 'L'; return null; }
  const lt = ref.match(/^<\s*([\d.]+)/); if (lt && n >= parseFloat(lt[1])) return 'H';
  const gt = ref.match(/^>\s*([\d.]+)/); if (gt && n <= parseFloat(gt[1])) return 'L';
  return null;
}

function detectPanel(name: string): string {
  const u = name.toUpperCase();
  if (/\b(WBC|RBC|HGB|HCT|MCV|MCH|MCHC|PLATELET|NEUTRO|LYMPHO|MONO|EOS|BASO|BAND)\b/.test(u)) return 'CBC — Complete Blood Count';
  if (/\b(SODIUM|POTASSIUM|NA\/K|CHLORIDE|MAGNESIUM|BICARB|PHOSPHORUS|CALCIUM)\b/.test(u)) return 'Electrolytes & Minerals';
  return 'Chemistry Panel';
}

// Visual range bar showing where a value falls within its reference range
function rangeBar(raw: string | null, ref: string | null): string {
  if (!raw || !ref) return '';
  const n = parseFloat(raw.replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) return '';
  const m = ref.match(/^([\d.]+)\s*[-–]\s*([\d.]+)/);
  if (!m) return '';
  const lo = parseFloat(m[1]), hi = parseFloat(m[2]);
  if (lo >= hi) return '';
  const ext = (hi - lo) * 0.6;
  const scMin = Math.max(0, lo - ext), scMax = hi + ext, scSpan = scMax - scMin;
  const loP  = ((lo - scMin) / scSpan * 100).toFixed(1);
  const wP   = ((hi - lo) / scSpan * 100).toFixed(1);
  const valP = Math.min(98, Math.max(2, (n - scMin) / scSpan * 100)).toFixed(1);
  const isAbn = n < lo || n > hi;
  const mc = isAbn ? '#DC2626' : '#059669';
  return `<div class="rb"><div class="rb-track"><div class="rb-zone" style="left:${loP}%;width:${wP}%"></div><div class="rb-pin" style="left:${valP}%;background:${mc}"></div></div></div>`;
}

// SVG sparkline for weight trend
function weightSparkline(rows: any[]): string {
  if (rows.length < 3) return '';
  const data = [...rows].reverse().map(r => parseFloat(r.weight_kg));
  const lo = Math.min(...data), hi = Math.max(...data), span = hi - lo || 1;
  const W = 240, H = 44, P = 4;
  const pts = data.map((w, i) => {
    const x = P + (i / (data.length - 1)) * (W - P * 2);
    const y = P + (1 - (w - lo) / span) * (H - P * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = data[data.length - 1], prev = data[0];
  const color = last > prev ? '#DC2626' : last < prev ? '#059669' : '#6B7280';
  const lx = (P + (W - P * 2)).toFixed(1);
  const ly = (P + (1 - (last - lo) / span) * (H - P * 2)).toFixed(1);
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>
    <circle cx="${lx}" cy="${ly}" r="3.5" fill="${color}"/>
  </svg>`;
}

// ── Section renderer helpers ───────────────────────────────────────────────────
function secHead(title: string, icon: string, subtitle: string = '') {
  return `<div class="sec-head">
    <div class="sec-head-left"><span class="sec-icon">${icon}</span><span class="sec-title">${title}</span></div>
    ${subtitle ? `<span class="sec-sub">${subtitle}</span>` : ''}
  </div>`;
}

function noData(msg = 'No records found.') {
  return `<div class="no-data"><span>—</span> ${msg}</div>`;
}

function kpiRow(items: { label: string; value: string; color?: string }[]) {
  return `<div class="kpi-row">${items.map(k => `
    <div class="kpi-card">
      <div class="kpi-val" ${k.color ? `style="color:${k.color}"` : ''}>${k.value}</div>
      <div class="kpi-lbl">${k.label}</div>
    </div>`).join('')}</div>`;
}

// ── Section renderers ──────────────────────────────────────────────────────────

function renderProfile(pet: Pet, ownerName: string | null, useLbs = false, latestWeightKg?: number) {
  const species = cap(pet.species ?? '');
  const breed   = cap(pet.breed ?? '');
  const gender  = cap(pet.gender ?? '');
  return `
    <div class="profile-block">
      <div class="profile-avatar">${pet.avatar_url ? `<img src="${pet.avatar_url}" alt="${pet.name}"/>` : (pet.emoji ?? '🐾')}</div>
      <div style="flex:1">
        <div class="profile-name">${pet.name}</div>
        <div class="profile-tags">
          ${species ? `<span class="ptag">${species}</span>` : ''}
          ${breed   ? `<span class="ptag">${breed}</span>`   : ''}
          ${gender  ? `<span class="ptag">${gender}</span>`  : ''}
          ${pet.birthday ? `<span class="ptag">${petAge(pet.birthday)}</span>` : ''}
        </div>
        <table class="pi-tbl">
          <tr>
            <td class="pi-lbl">Date of Birth</td><td class="pi-val">${fmtDateOnly(pet.birthday)}</td>
            <td class="pi-lbl">Microchip ID</td><td class="pi-val">${pet.microchip_id ?? '—'}</td>
          </tr>
          <tr>
            <td class="pi-lbl">Weight</td><td class="pi-val">${(() => { const wkg = pet.weight_kg ?? latestWeightKg; return wkg != null ? (useLbs ? `${(wkg * 2.205).toFixed(1)} lbs (${wkg} kg)` : `${wkg} kg (${(wkg * 2.205).toFixed(1)} lbs)`) : '—'; })()}</td>
            <td class="pi-lbl">Owner</td><td class="pi-val">${ownerName ?? '—'}</td>
          </tr>
          <tr>
            <td class="pi-lbl">Report Date</td><td class="pi-val">${format(new Date(), 'MMMM d, yyyy')}</td>
            <td class="pi-lbl"></td><td class="pi-val"></td>
          </tr>
        </table>
      </div>
    </div>`;
}

function renderMedications(rows: any[]) {
  if (!rows.length) return noData();
  const active   = rows.filter(r => r.is_active !== false);
  const inactive = rows.filter(r => r.is_active === false);

  const tbl = (items: any[], isActive: boolean) => {
    if (!items.length) return '';
    return `
      <div class="sub-group-label ${isActive ? 'sg-active' : 'sg-past'}">
        ${isActive ? '● Active Medications' : '○ Past / Discontinued'}
      </div>
      <table class="dt">
        <thead><tr>
          <th>Medication</th><th>Dosage</th><th>Frequency</th>
          <th>Start Date</th><th>End Date</th><th>Notes</th>
        </tr></thead>
        <tbody>
          ${items.map((r, i) => `<tr class="${i%2?'ro':'re'}${isActive ? ' row-active-med' : ''}">
            <td class="fw">${r.name}</td>
            <td class="tn">${r.dosage ?? '—'}</td>
            <td>${r.frequency ? cap(r.frequency) : '—'}</td>
            <td class="tn">${fmtDateOnly(r.start_date)}</td>
            <td class="tn">${fmtDateOnly(r.end_date)}</td>
            <td class="nc">${r.notes ?? '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  };

  return `
    ${kpiRow([
      { label: 'Active', value: String(active.length), color: '#059669' },
      { label: 'Discontinued', value: String(inactive.length), color: '#6B7280' },
      { label: 'Total on Record', value: String(rows.length) },
    ])}
    ${tbl(active, true)}
    ${tbl(inactive, false)}`;
}

function renderVaccines(rows: any[]) {
  if (!rows.length) return noData();
  const today = localDateStr();
  const overdue   = rows.filter(r => r.next_due && r.next_due < today);
  const current   = rows.filter(r => !r.next_due || r.next_due >= today);
  return `
    ${kpiRow([
      { label: 'Current', value: String(current.length), color: '#059669' },
      { label: 'Overdue', value: String(overdue.length), color: overdue.length ? '#DC2626' : '#6B7280' },
      { label: 'Total on Record', value: String(rows.length) },
    ])}
    <table class="dt">
      <thead><tr>
        <th>Vaccine</th><th>Last Given</th><th>Next Due</th><th>Status</th><th>Vet / Clinic</th><th>Notes</th>
      </tr></thead>
      <tbody>
        ${rows.map((r, i) => {
          const od = r.next_due && r.next_due < today;
          const sc = od ? 'fb-red' : 'fb-green';
          const sl = od ? 'Overdue' : 'Current';
          return `<tr class="${i%2?'ro':'re'}${od?' row-alert':''}">
            <td class="fw">${r.name}</td>
            <td class="tn">${fmtDateOnly(r.last_given)}</td>
            <td class="tn">${fmtDateOnly(r.next_due)}</td>
            <td><span class="fbadge ${sc}">${sl}</span></td>
            <td>${[r.vet_name, r.clinic].filter(Boolean).join('<br>') || '—'}</td>
            <td class="nc">${r.notes ?? '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function renderAppointments(rows: any[]) {
  if (!rows.length) return noData();
  const upcoming  = rows.filter(r => r.status === 'scheduled' || r.status === 'upcoming');
  const completed = rows.filter(r => r.status === 'completed');
  return `
    ${kpiRow([
      { label: 'Upcoming', value: String(upcoming.length), color: '#2563EB' },
      { label: 'Completed', value: String(completed.length), color: '#059669' },
      { label: 'Total', value: String(rows.length) },
    ])}
    <table class="dt">
      <thead><tr>
        <th>Title</th><th>Type</th><th>Date</th><th>Vet / Clinic</th><th>Status</th><th>Notes</th>
      </tr></thead>
      <tbody>
        ${rows.map((r, i) => {
          const sc = r.status==='completed' ? 'fb-green' : r.status==='cancelled' ? 'fb-red' : 'fb-blue';
          return `<tr class="${i%2?'ro':'re'}">
            <td class="fw">${r.title ?? '—'}</td>
            <td>${cap(r.type ?? '')}</td>
            <td class="tn">${fmtDate(r.scheduled_at)}</td>
            <td>${[r.vet_name, r.clinic_name].filter(Boolean).join('<br>') || '—'}</td>
            <td><span class="fbadge ${sc}">${cap(r.status ?? '')}</span></td>
            <td class="nc">${r.notes ?? '—'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function renderVetVisits(rows: any[]) {
  if (!rows.length) return noData();
  return `
    ${kpiRow([
      { label: 'Total Visits', value: String(rows.length) },
      { label: 'Last Visit', value: fmtDateOnly(rows[0]?.visit_date) },
      { label: 'First Visit', value: fmtDateOnly(rows[rows.length-1]?.visit_date) },
    ])}
    <table class="dt">
      <thead><tr>
        <th style="width:90px">Date</th>
        <th style="width:150px">Vet / Clinic</th>
        <th>Reason for Visit</th>
        <th>Diagnosis / Findings</th>
        <th>Clinical Notes</th>
      </tr></thead>
      <tbody>
        ${rows.map((r, i) => `<tr class="${i%2?'ro':'re'}">
          <td class="tn nw">${fmtDateOnly(r.visit_date)}</td>
          <td>${[r.vet_name, r.clinic_name].filter(Boolean).join('<br>') || '—'}</td>
          <td>${r.reason ?? '—'}</td>
          <td>${r.diagnosis && r.diagnosis !== '—' ? `<span class="diag">${r.diagnosis}</span>` : '—'}</td>
          <td class="nc">${r.notes ?? '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderWeight(rows: any[], useLbs = false) {
  if (!rows.length) return noData();
  const latest = rows[0], oldest = rows[rows.length-1];
  const delta  = rows.length > 1 ? (latest.weight_kg - oldest.weight_kg) : 0;
  const min    = Math.min(...rows.map(r => r.weight_kg));
  const max    = Math.max(...rows.map(r => r.weight_kg));
  const arrow  = delta > 0 ? '▲' : delta < 0 ? '▼' : '●';
  const dc     = delta > 0 ? '#DC2626' : delta < 0 ? '#059669' : '#6B7280';
  const spark  = weightSparkline(rows);
  const fmt    = (kg: number) => useLbs ? `${(kg * 2.205).toFixed(1)} lbs` : `${kg} kg`;
  const fmtD   = (kg: number) => useLbs ? `${(Math.abs(kg) * 2.205).toFixed(1)} lbs` : `${Math.abs(kg).toFixed(2)} kg`;

  return `
    <div class="weight-header">
      <div>
        ${kpiRow([
          { label: 'Current Weight', value: fmt(latest.weight_kg), color: '#0A2540' },
          { label: 'Change (all time)', value: `${arrow} ${fmtD(delta)}`, color: dc },
          { label: 'Lowest', value: fmt(min), color: '#059669' },
          { label: 'Highest', value: fmt(max), color: '#DC2626' },
          { label: 'Entries', value: String(rows.length) },
        ])}
      </div>
      ${spark ? `<div class="weight-sparkline">${spark}<div class="spark-lbl">Weight Trend (oldest → newest)</div></div>` : ''}
    </div>
    <table class="dt">
      <thead><tr>
        ${useLbs
          ? `<th>Date</th><th class="num">Weight (lbs)</th><th class="num">Weight (kg)</th><th>Notes</th>`
          : `<th>Date</th><th class="num">Weight (kg)</th><th class="num">Weight (lbs)</th><th>Notes</th>`}
      </tr></thead>
      <tbody>
        ${rows.map((r, i) => `<tr class="${i%2?'ro':'re'}">
          <td class="tn">${fmtDate(r.logged_at)}</td>
          ${useLbs
            ? `<td class="tn num">${(r.weight_kg * 2.205).toFixed(1)}</td><td class="tn num">${r.weight_kg}</td>`
            : `<td class="tn num">${r.weight_kg}</td><td class="tn num">${(r.weight_kg * 2.205).toFixed(1)}</td>`}
          <td class="nc">${r.notes ?? '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderAllergies(rows: any[]) {
  if (!rows.length) return `<div class="no-data-ok">&#10003; No known allergies on record — all clear.</div>`;
  const sevMap: Record<string, string> = { severe: 'fb-red', moderate: 'fb-amber', mild: 'fb-green' };
  return `
    ${kpiRow([
      { label: 'Severe', value: String(rows.filter(r=>r.severity==='severe').length), color: '#DC2626' },
      { label: 'Moderate', value: String(rows.filter(r=>r.severity==='moderate').length), color: '#D97706' },
      { label: 'Mild', value: String(rows.filter(r=>r.severity==='mild').length), color: '#059669' },
    ])}
    <table class="dt">
      <thead><tr>
        <th>Allergen</th><th>Severity</th><th>Category</th><th>Date Diagnosed</th><th>Notes</th>
      </tr></thead>
      <tbody>
        ${rows.map((r, i) => `<tr class="${i%2?'ro':'re'}">
          <td class="fw">${r.allergen}</td>
          <td><span class="fbadge ${sevMap[r.severity] ?? 'fb-blue'}">${cap(r.severity ?? '')}</span></td>
          <td>${cap(r.category ?? '')}</td>
          <td class="tn">${fmtDateOnly(r.diagnosed_date)}</td>
          <td class="nc">${r.notes ?? '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderMood(rows: any[]) {
  if (!rows.length) return noData();
  const avgScore = Math.round(rows.reduce((s, r) => s + (r.mood_score ?? 0), 0) / rows.length);
  const labelCounts: Record<string, number> = {};
  rows.forEach(r => { labelCounts[r.mood_label] = (labelCounts[r.mood_label] ?? 0) + 1; });
  const topMood = Object.entries(labelCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const scoreColor = avgScore >= 75 ? '#059669' : avgScore >= 50 ? '#D97706' : '#DC2626';

  return `
    ${kpiRow([
      { label: 'Avg Wellbeing Score', value: `${avgScore}/100`, color: scoreColor },
      { label: 'Most Common Mood', value: cap(topMood ?? '—'), color: moodColor(topMood ?? '') },
      { label: 'Total AI Scans', value: String(rows.length) },
    ])}
    <table class="dt">
      <thead><tr>
        <th>Date & Time</th><th>Mood</th><th class="num">Score</th>
        <th class="num">Happy %</th><th class="num">Playful %</th>
        <th class="num">Tired %</th><th class="num">Anxious %</th>
      </tr></thead>
      <tbody>
        ${rows.slice(0, 20).map((r, i) => `<tr class="${i%2?'ro':'re'}">
          <td class="tn">${fmtDate(r.created_at)}</td>
          <td><span class="mood-dot" style="background:${moodColor(r.mood_label)}"></span>${cap(r.mood_label)}</td>
          <td class="tn num" style="font-weight:700;color:${moodColor(r.mood_label)}">${r.mood_score ?? '—'}</td>
          <td class="tn num">${r.happy_pct != null ? r.happy_pct+'%' : '—'}</td>
          <td class="tn num">${r.playful_pct != null ? r.playful_pct+'%' : '—'}</td>
          <td class="tn num">${r.tired_pct != null ? r.tired_pct+'%' : '—'}</td>
          <td class="tn num">${r.anxious_pct != null ? r.anxious_pct+'%' : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderInsurance(rows: any[]) {
  if (!rows.length) return noData();
  return rows.map(r => `
    <div class="ins-card">
      <div class="ins-header">
        <span class="ins-provider">${r.provider ?? 'Insurance Policy'}</span>
        ${r.coverage_type ? `<span class="fbadge fb-blue">${cap(r.coverage_type)}</span>` : ''}
      </div>
      <table class="dt ins-dt">
        <tbody>
          <tr class="re"><td class="pi-lbl">Policy Number</td><td class="tn">${r.policy_number ?? '—'}</td>
              <td class="pi-lbl">Coverage Period</td><td class="tn">${fmtDateOnly(r.start_date)} – ${fmtDateOnly(r.end_date)}</td></tr>
          <tr class="ro"><td class="pi-lbl">Monthly Premium</td><td class="tn">${r.premium_amount ? '$'+r.premium_amount : '—'}</td>
              <td class="pi-lbl">Annual Deductible</td><td class="tn">${r.deductible ? '$'+r.deductible : '—'}</td></tr>
          <tr class="re"><td class="pi-lbl">Reimbursement</td><td class="tn">${r.reimbursement_percent ? r.reimbursement_percent+'%' : '—'}</td>
              <td class="pi-lbl">Annual Limit</td><td class="tn">${r.annual_limit ? '$'+r.annual_limit : '—'}</td></tr>
          ${r.claims_phone ? `<tr class="ro"><td class="pi-lbl">Claims Phone</td><td colspan="3">${r.claims_phone}</td></tr>` : ''}
          ${r.notes ? `<tr class="re"><td class="pi-lbl">Notes</td><td colspan="3" class="nc">${r.notes}</td></tr>` : ''}
        </tbody>
      </table>
    </div>`).join('');
}

function renderLabReports(records: any[]) {
  if (!records.length) return noData();

  const withItems = records.filter(r => r.extracted_data?.items?.length);
  if (!withItems.length) {
    const summOnly = records.filter(r => r.ai_summary);
    if (!summOnly.length) return noData();
    return summOnly.map(r => `
      <div class="lab-card">
        <div class="lab-card-head"><div class="lab-card-title">Lab Report &nbsp;·&nbsp; ${fmtDate(r.created_at)}</div></div>
        <div class="lab-ai-box"><div class="lab-ai-lbl">AI Clinical Summary</div><p>${r.ai_summary}</p></div>
      </div>`).join('');
  }

  return withItems.map(record => {
    const ed   = record.extracted_data as { items: any[]; visit_date?: string|null; vet_name?: string|null; clinic?: string|null };
    const items = ed.items ?? [];
    const labItems  = items.filter(i => i.type === 'lab_result');
    const diagItems = items.filter(i => i.type === 'diagnosis');
    const medItems  = items.filter(i => i.type === 'medication');
    const vacItems  = items.filter(i => i.type === 'vaccine');
    const wtItems   = items.filter(i => i.type === 'weight');
    const procItems = items.filter(i => ['procedure','imaging','exam_finding'].includes(i.type));
    const NOISE_NOTES = /^(sample condition|sample quality|specimen condition|specimen quality|comments|accession)$/i;
    const noteItems = items.filter(i => ['instruction','note'].includes(i.type) && !NOISE_NOTES.test((i.title ?? '').trim()));

    const docDate   = ed.visit_date ? fmtDateOnly(ed.visit_date) : fmtDate(record.created_at);
    const docVet    = ed.vet_name ? `Dr. ${ed.vet_name}` : null;
    const docClinic = ed.clinic ?? null;
    const abnCount  = labItems.filter(r => r.is_abnormal).length;

    // Group lab items by panel
    const panels: Record<string, any[]> = {};
    labItems.forEach(item => {
      const p = detectPanel(item.title ?? '');
      if (!panels[p]) panels[p] = [];
      panels[p].push(item);
    });

    const renderPanel = (panelName: string, rows: any[]) => `
      <div class="lab-panel">
        <div class="lab-panel-name">${panelName}</div>
        <table class="lab-tbl">
          <thead><tr>
            <th class="lth-test">Test Name</th>
            <th class="lth-result">Result</th>
            <th class="lth-unit">Units</th>
            <th class="lth-range">Reference Range</th>
            <th class="lth-bar">Range</th>
            <th class="lth-flag">Flag</th>
            <th class="lth-interp">Interpretation</th>
          </tr></thead>
          <tbody>
            ${rows.map((r, i) => {
              const dir  = abnormalDir(r.raw_value, r.reference_range);
              const abn  = r.is_abnormal === true;
              const flag = abn ? (dir === 'H' ? 'H' : dir === 'L' ? 'L' : 'ABN') : r.is_abnormal === false ? 'N' : '—';
              const fc   = abn ? (dir === 'H' ? 'fb-red' : 'fb-lob') : 'fb-green';
              const disp = numericValue(r.raw_value, r.unit);
              return `<tr class="${i%2?'ro':'re'}${abn?' lab-abn':''}">
                <td class="lth-test-v">${r.title ?? '—'}</td>
                <td class="lth-result-v${abn?' abn-v':''}">${disp}</td>
                <td class="lth-unit-v">${r.unit ?? '—'}</td>
                <td class="lth-range-v">${r.reference_range ?? '—'}</td>
                <td class="lth-bar-v">${rangeBar(r.raw_value, r.reference_range)}</td>
                <td class="lth-flag-v"><span class="fbadge ${fc}">${flag}</span></td>
                <td class="lth-interp-v">${r.plain_language ?? '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    const simTbl = (rows: any[], cols: {k:string,l:string,cls?:string}[]) => !rows.length ? '' : `
      <table class="dt">
        <thead><tr>${cols.map(c=>`<th>${c.l}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r,i)=>`<tr class="${i%2?'ro':'re'}">${cols.map(c=>`<td class="${c.cls??''}">${r[c.k]??'—'}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;

    return `
      <div class="lab-card">
        <div class="lab-card-head">
          <div>
            <div class="lab-card-title">Lab Report &nbsp;·&nbsp; ${docDate}</div>
            <div class="lab-card-meta">
              ${docVet ?? ''}${docVet && docClinic ? ` &nbsp;·&nbsp; ` : ''}${docClinic ?? ''}
            </div>
          </div>
          ${abnCount > 0 ? `<div class="lab-abn-badge">&#9651; ${abnCount} Abnormal Result${abnCount>1?'s':''}</div>` : `<div class="lab-ok-badge">&#10003; All Within Range</div>`}
        </div>

        ${record.ai_summary ? `
          <div class="lab-ai-box">
            <div class="lab-ai-lbl">AI Clinical Summary</div>
            <p>${record.ai_summary}</p>
          </div>` : ''}

        ${labItems.length ? `
          <div class="lab-results-wrap">
            <div class="lab-results-title">
              Laboratory Results
              ${abnCount > 0 ? `<span class="abn-bar">&#9651; ${abnCount} result${abnCount>1?'s':''} outside reference range — see highlighted rows</span>` : ''}
            </div>
            ${Object.entries(panels).map(([p, r]) => renderPanel(p, r)).join('')}
          </div>` : ''}

        ${diagItems.length ? `<div class="lab-sub"><div class="lab-sub-title">Diagnoses & Clinical Findings</div>
          ${simTbl(diagItems,[{k:'title',l:'Condition',cls:'fw'},{k:'plain_language',l:'Details',cls:'nc'},{k:'severity',l:'Severity'},{k:'notes',l:'Notes',cls:'nc'}])}</div>` : ''}

        ${procItems.length ? `<div class="lab-sub"><div class="lab-sub-title">Procedures & Exam Findings</div>
          ${simTbl(procItems,[{k:'title',l:'Procedure / Finding',cls:'fw'},{k:'plain_language',l:'Details',cls:'nc'},{k:'notes',l:'Notes',cls:'nc'}])}</div>` : ''}

        ${medItems.length ? `<div class="lab-sub"><div class="lab-sub-title">Medications Prescribed</div>
          ${simTbl(medItems,[{k:'title',l:'Medication',cls:'fw'},{k:'dosage',l:'Dosage',cls:'tn'},{k:'frequency',l:'Frequency'},{k:'notes',l:'Notes',cls:'nc'}])}</div>` : ''}

        ${vacItems.length ? `<div class="lab-sub"><div class="lab-sub-title">Vaccines Administered</div>
          ${simTbl(vacItems,[{k:'title',l:'Vaccine',cls:'fw'},{k:'manufacturer',l:'Manufacturer'},{k:'next_due',l:'Next Due',cls:'tn'},{k:'notes',l:'Notes',cls:'nc'}])}</div>` : ''}

        ${wtItems.length ? `<div class="lab-sub"><div class="lab-sub-title">Weight at Visit</div>
          ${simTbl(wtItems,[{k:'raw_value',l:'Value',cls:'tn fw'},{k:'unit',l:'Unit'},{k:'notes',l:'Notes',cls:'nc'}])}</div>` : ''}

        ${noteItems.length ? `<div class="lab-sub"><div class="lab-sub-title">Instructions & Clinical Notes</div>
          <ul class="note-ul">${noteItems.map(n=>`<li><strong>${n.title}</strong>${n.plain_language&&n.plain_language!==n.title?` — ${n.plain_language}`:''}</li>`).join('')}</ul>
        </div>` : ''}
      </div>`;
  }).join('');
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  @page { margin: 20mm 18mm; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 11.5px; color: #1a1a2e; background: #fff;
    line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact;
    padding-bottom: 36px;
  }

  /* ─── COVER ────────────────────────────────────────────── */
  .cover {
    background: linear-gradient(150deg, #0A2540 0%, #0F3460 60%, #0A2540 100%);
    border-radius: 12px; padding: 36px 32px 28px; margin-bottom: 28px;
    position: relative; overflow: hidden;
  }
  .cover::before {
    content: ''; position: absolute; top: -60px; right: -60px;
    width: 220px; height: 220px; border-radius: 50%;
    background: rgba(255,255,255,0.04);
  }
  .cover::after {
    content: ''; position: absolute; bottom: -40px; left: 40%;
    width: 160px; height: 160px; border-radius: 50%;
    background: rgba(255,255,255,0.03);
  }
  .cover-inner { display: flex; gap: 24px; align-items: center; margin-bottom: 24px; position: relative; z-index: 1; }
  .cover-emoji {
    font-size: 64px; width: 100px; height: 100px; flex-shrink: 0;
    background: rgba(255,255,255,0.1); border-radius: 20px;
    display: flex; align-items: center; justify-content: center;
    border: 1.5px solid rgba(255,255,255,0.2);
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    overflow: hidden;
  }
  .cover-emoji img { width: 100%; height: 100%; object-fit: cover; border-radius: 20px; }
  .cover-text { color: #fff; }
  .cover-label {
    font-size: 9.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 2px; color: rgba(255,255,255,0.5); margin-bottom: 6px;
  }
  .cover-petname { font-size: 32px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.1; margin-bottom: 6px; }
  .cover-species { font-size: 13px; color: rgba(255,255,255,0.7); margin-bottom: 14px; }
  .cover-chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .cover-chip {
    font-size: 10px; font-weight: 600; border-radius: 4px;
    padding: 3px 9px; letter-spacing: 0.3px;
    background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.9);
    border: 1px solid rgba(255,255,255,0.2);
  }
  .cover-info-grid {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 0; border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px; overflow: hidden;
    background: rgba(255,255,255,0.05); position: relative; z-index: 1;
  }
  .cover-info-cell { padding: 10px 14px; border-right: 1px solid rgba(255,255,255,0.08); }
  .cover-info-cell:nth-child(3n) { border-right: none; }
  .cover-info-cell:nth-child(n+4) { border-top: 1px solid rgba(255,255,255,0.08); }
  .cic-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: rgba(255,255,255,0.45); margin-bottom: 3px; }
  .cic-val { font-size: 11.5px; font-weight: 600; color: #fff; }
  .cover-footer {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.12);
    font-size: 9.5px; color: rgba(255,255,255,0.45); position: relative; z-index: 1;
  }
  .cover-footer strong { color: rgba(255,255,255,0.7); }

  /* ─── SECTIONS ──────────────────────────────────────────── */
  .section { margin-bottom: 22px; }
  .sec-head {
    display: flex; align-items: center; justify-content: space-between;
    background: #0A2540; padding: 8px 14px; margin-bottom: 0;
    border-radius: 6px 6px 0 0;
  }
  .sec-head-left { display: flex; align-items: center; gap: 8px; }
  .sec-icon { font-size: 15px; }
  .sec-title {
    font-size: 11px; font-weight: 800; color: #fff;
    text-transform: uppercase; letter-spacing: 0.8px;
  }
  .sec-sub { font-size: 9.5px; color: rgba(255,255,255,0.55); font-weight: 600; }
  .sec-body { border: 1px solid #D0D9E8; border-top: none; border-radius: 0 0 6px 6px; padding: 14px; }

  /* ─── KPI CARDS ─────────────────────────────────────────── */
  .kpi-row {
    display: flex; gap: 0; margin-bottom: 14px;
    border: 1px solid #D0D9E8; border-radius: 6px; overflow: hidden;
  }
  .kpi-card {
    flex: 1; padding: 10px 12px; text-align: center;
    border-right: 1px solid #D0D9E8; background: #FAFBFD;
  }
  .kpi-card:last-child { border-right: none; }
  .kpi-val { font-size: 18px; font-weight: 800; color: #0A2540; line-height: 1.1; }
  .kpi-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; color: #8492A6; margin-top: 3px; font-weight: 700; }

  /* ─── PROFILE ───────────────────────────────────────────── */
  .profile-block {
    display: flex; gap: 18px; align-items: flex-start;
    background: #F8FAFF; border: 1px solid #D0D9E8; border-radius: 0 0 6px 6px; padding: 16px;
  }
  .profile-avatar {
    font-size: 50px; width: 74px; height: 74px; flex-shrink: 0;
    background: #E8EEF8; border-radius: 12px; border: 1px solid #D0D9E8;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .profile-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; }
  .profile-name { font-size: 20px; font-weight: 800; color: #0A2540; margin-bottom: 8px; }
  .profile-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .ptag {
    font-size: 10px; font-weight: 700; border-radius: 4px;
    padding: 2px 8px; background: #E8EEF8; color: #2D4A7A;
    border: 1px solid #C0CDE4; text-transform: uppercase; letter-spacing: 0.3px;
  }
  .pi-tbl { width: 100%; border-collapse: collapse; }
  .pi-tbl td { padding: 3px 0; vertical-align: top; }
  .pi-lbl { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #8492A6; width: 90px; }
  .pi-val { font-size: 11.5px; color: #0A2540; font-weight: 500; padding-right: 24px; }

  /* ─── DATA TABLE ─────────────────────────────────────────── */
  .dt {
    width: 100%; border-collapse: collapse; font-size: 11px;
    border: 1px solid #D0D9E8; border-radius: 0; margin-top: 0;
  }
  .dt th {
    background: #EEF2FA; color: #344563; font-weight: 700;
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px;
    padding: 6px 10px; text-align: left;
    border-bottom: 1.5px solid #C0CDE4; border-right: 1px solid #D0D9E8;
  }
  .dt th:last-child { border-right: none; }
  .dt td {
    padding: 7px 10px; vertical-align: top;
    border-bottom: 1px solid #E8EEF8; border-right: 1px solid #EEF2FA;
  }
  .dt td:last-child { border-right: none; }
  .dt tr:last-child td { border-bottom: none; }
  .re td { background: #fff; }
  .ro td { background: #F8FAFF; }
  .row-alert td { background: #FFF5F5 !important; }
  .row-active-med td { border-left: 3px solid #059669; }
  .row-active-med td:first-child { padding-left: 7px; }
  .fw { font-weight: 700; }
  .tn { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .nw { white-space: nowrap; }
  .num { text-align: right; }
  .nc { color: #5A6A8D; font-size: 10.5px; }
  .diag { display: inline-block; background: #EAF0FF; color: #1E3A8A; border-radius: 3px; padding: 1px 5px; font-size: 10.5px; font-weight: 600; }

  /* ─── BADGES / FLAGS ─────────────────────────────────────── */
  .fbadge {
    display: inline-block; font-size: 9px; font-weight: 800;
    padding: 2px 7px; border-radius: 3px; border: 1px solid;
    letter-spacing: 0.3px; white-space: nowrap; text-transform: uppercase;
  }
  .fb-green  { background: #ECFDF5; color: #065F46; border-color: #A7F3D0; }
  .fb-red    { background: #FEF2F2; color: #991B1B; border-color: #FECACA; }
  .fb-lob    { background: #EFF6FF; color: #1E40AF; border-color: #BFDBFE; }
  .fb-blue   { background: #EFF6FF; color: #1E40AF; border-color: #BFDBFE; }
  .fb-amber  { background: #FFFBEB; color: #92400E; border-color: #FDE68A; }

  /* ─── SUBSECTION LABELS ──────────────────────────────────── */
  .sub-group-label {
    font-size: 9.5px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.6px; padding: 6px 0 4px; margin-top: 10px;
  }
  .sg-active { color: #065F46; border-left: 3px solid #059669; padding-left: 8px; }
  .sg-past   { color: #6B7280; border-left: 3px solid #9CA3AF; padding-left: 8px; }

  /* ─── WEIGHT ─────────────────────────────────────────────── */
  .weight-header { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 0; }
  .weight-sparkline { flex-shrink: 0; }
  .spark-lbl { font-size: 9px; color: #8492A6; text-align: center; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.3px; }

  /* ─── RANGE BAR ──────────────────────────────────────────── */
  .rb { width: 72px; display: inline-block; vertical-align: middle; }
  .rb-track {
    position: relative; height: 5px; background: #F0F2F8;
    border-radius: 3px;
  }
  .rb-zone {
    position: absolute; top: 0; bottom: 0;
    background: rgba(5,150,105,0.18);
    border-left: 1.5px solid rgba(5,150,105,0.6);
    border-right: 1.5px solid rgba(5,150,105,0.6);
  }
  .rb-pin {
    position: absolute; top: -3px; width: 3px; height: 11px;
    border-radius: 2px; transform: translateX(-50%);
  }

  /* ─── MOOD ───────────────────────────────────────────────── */
  .mood-dot {
    display: inline-block; width: 8px; height: 8px;
    border-radius: 50%; margin-right: 5px; vertical-align: middle;
  }

  /* ─── INSURANCE ──────────────────────────────────────────── */
  .ins-card { border: 1px solid #D0D9E8; border-radius: 6px; overflow: hidden; margin-bottom: 12px; }
  .ins-header {
    display: flex; align-items: center; justify-content: space-between;
    background: #0A2540; padding: 8px 14px;
  }
  .ins-provider { font-size: 12px; font-weight: 800; color: #fff; }
  .ins-dt { border: none; border-radius: 0; }
  .ins-dt .pi-lbl { color: #6B7280; font-size: 9.5px; white-space: nowrap; }

  /* ─── LAB REPORTS ────────────────────────────────────────── */
  .lab-card {
    border: 1.5px solid #C0CDE4; border-radius: 8px;
    overflow: hidden; margin-bottom: 20px;
  }
  .lab-card-head {
    background: linear-gradient(135deg, #0A2540 0%, #0F3460 100%);
    padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;
  }
  .lab-card-title { font-size: 13px; font-weight: 800; color: #fff; margin-bottom: 3px; }
  .lab-card-meta  { font-size: 10px; color: rgba(255,255,255,0.55); }
  .lab-abn-badge {
    background: #DC2626; color: #fff; font-size: 9.5px; font-weight: 800;
    padding: 4px 10px; border-radius: 4px; white-space: nowrap;
  }
  .lab-ok-badge {
    background: rgba(5,150,105,0.9); color: #fff; font-size: 9.5px; font-weight: 800;
    padding: 4px 10px; border-radius: 4px; white-space: nowrap;
  }
  .lab-ai-box {
    background: #F0F5FF; padding: 10px 16px; border-bottom: 1px solid #D0D9E8;
  }
  .lab-ai-lbl {
    font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px;
    color: #1E40AF; margin-bottom: 4px;
  }
  .lab-ai-box p { font-size: 11.5px; color: #1a1a2e; line-height: 1.65; }

  .lab-results-wrap { border-top: 1px solid #D0D9E8; }
  .lab-results-title {
    font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.6px;
    color: #fff; background: #1E3A8A; padding: 5px 16px;
    display: flex; align-items: center; gap: 12px;
  }
  .abn-bar {
    font-size: 9px; color: #FECACA; font-weight: 700; letter-spacing: 0.2px;
  }
  .lab-panel { border-bottom: 1px solid #D0D9E8; }
  .lab-panel:last-child { border-bottom: none; }
  .lab-panel-name {
    font-size: 9px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.6px; color: #344563;
    background: #EEF2FA; padding: 4px 16px;
    border-bottom: 1px solid #D0D9E8;
  }

  /* Lab table */
  .lab-tbl { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  .lab-tbl th {
    background: #F4F6FB; color: #344563; font-weight: 700;
    font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.4px;
    padding: 5px 8px; text-align: left;
    border-bottom: 1.5px solid #C0CDE4; border-right: 1px solid #D0D9E8;
  }
  .lab-tbl th:last-child { border-right: none; }
  .lab-tbl td {
    padding: 6px 8px; vertical-align: top;
    border-bottom: 1px solid #EEF2FA; border-right: 1px solid #EEF2FA;
  }
  .lab-tbl td:last-child { border-right: none; }
  .lab-tbl tr:last-child td { border-bottom: none; }
  .lab-tbl .re td { background: #fff; }
  .lab-tbl .ro td { background: #FAFBFD; }
  .lab-tbl .lab-abn td { background: #FFF5F5 !important; border-left: 3px solid #DC2626; }
  .lab-tbl .lab-abn td:first-child { padding-left: 5px; }
  .lth-test   { width: 20%; } .lth-result { width: 8%; } .lth-unit  { width: 8%; }
  .lth-range  { width: 12%; } .lth-bar    { width: 8%; } .lth-flag  { width: 5%; text-align:center; }
  .lth-interp { width: 39%; }
  .lth-test-v   { font-weight: 600; font-size: 10.5px; }
  .lth-result-v { font-variant-numeric: tabular-nums; font-weight: 800; }
  .lth-unit-v   { color: #8492A6; font-size: 9.5px; }
  .lth-range-v  { color: #8492A6; font-variant-numeric: tabular-nums; font-size: 9.5px; }
  .lth-bar-v    { vertical-align: middle; }
  .lth-flag-v   { text-align: center; }
  .lth-interp-v { color: #374151; font-size: 10px; line-height: 1.55; }
  .abn-v { color: #DC2626; }

  /* Lab sub-sections */
  .lab-sub { padding: 10px 14px; border-top: 1px solid #EEF2FA; }
  .lab-sub-title {
    font-size: 9px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.6px; color: #1E3A8A; margin-bottom: 6px;
  }
  .note-ul { padding-left: 16px; }
  .note-ul li { font-size: 11px; color: #374151; margin-bottom: 5px; line-height: 1.55; }

  /* ─── MISC ───────────────────────────────────────────────── */
  .no-data { color: #9CA3AF; font-style: italic; padding: 10px 2px; font-size: 11.5px; }
  .no-data-ok { color: #065F46; font-weight: 700; padding: 10px 2px; font-size: 11.5px; }

  /* ─── FOOTER ─────────────────────────────────────────────── */
  .footer {
    position: fixed; bottom: 0; left: 0; right: 0;
    padding: 6px 20px; border-top: 1.5px solid #D0D9E8;
    background: #fff;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 9px; color: #A0AEC0; letter-spacing: 0.2px;
  }
  .footer-logo { font-weight: 800; color: #6B7280; letter-spacing: 0.5px; }
`;

// ── HTML assembler ─────────────────────────────────────────────────────────────
function buildHTML(pet: Pet, ownerName: string | null, sections: ReportSection[], data: Awaited<ReturnType<typeof fetchReportData>>, useLbs = false): string {
  const has      = (s: ReportSection) => sections.includes(s);
  const species  = cap(pet.species ?? '');
  const breed    = cap(pet.breed   ?? '');
  const gender   = cap(pet.gender  ?? '');
  const age      = pet.birthday ? petAge(pet.birthday) : '—';
  const today    = localDateStr();

  // Compute cover info cells
  const latestWt   = data.weights[0]?.weight_kg;
  const overdueVax = data.vaccines.filter(v => v.next_due && v.next_due < today).length;
  const activeMeds = data.medications.filter(m => m.is_active !== false).length;
  const lastVisit  = data.vet_visits[0]?.visit_date ? fmtDateOnly(data.vet_visits[0].visit_date) : '—';
  const nextVax    = data.vaccines.filter(v => v.next_due >= today).sort((a,b)=>a.next_due<b.next_due?-1:1)[0]?.next_due;
  const avgMood    = data.mood.length ? Math.round(data.mood.reduce((s,r)=>s+(r.mood_score??0),0)/data.mood.length) : null;

  function makeSection(key: ReportSection, icon: string, title: string, sub: string, body: string) {
    if (!has(key)) return '';
    return `<div class="section"><div class="sec-head"><div class="sec-head-left"><span class="sec-icon">${icon}</span><span class="sec-title">${title}</span></div>${sub ? `<span class="sec-sub">${sub}</span>` : ''}</div><div class="sec-body">${body}</div></div>`;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>${CSS}</style>
</head>
<body>

  <!-- COVER -->
  <div class="cover">
    <div class="cover-inner">
      <div class="cover-emoji">${pet.avatar_url ? `<img src="${pet.avatar_url}" alt="${pet.name}"/>` : (pet.emoji ?? '🐾')}</div>
      <div class="cover-text">
        <div class="cover-label">Family Cube &nbsp;·&nbsp; Health Report</div>
        <div class="cover-petname">${pet.name}</div>
        <div class="cover-species">${[species, breed, gender].filter(Boolean).join(' · ')}</div>
        <div class="cover-chips">
          ${age !== '—' ? `<span class="cover-chip">Age: ${age}</span>` : ''}
          ${pet.birthday ? `<span class="cover-chip">DOB: ${fmtDateOnly(pet.birthday)}</span>` : ''}
          ${ownerName ? `<span class="cover-chip">Owner: ${ownerName}</span>` : ''}
          ${pet.microchip_id ? `<span class="cover-chip">Chip: ${pet.microchip_id}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="cover-info-grid">
      <div class="cover-info-cell"><div class="cic-lbl">Current Weight</div><div class="cic-val">${latestWt != null ? (useLbs ? `${(latestWt * 2.205).toFixed(1)} lbs` : `${latestWt} kg`) : '—'}</div></div>
      <div class="cover-info-cell"><div class="cic-lbl">Active Medications</div><div class="cic-val">${activeMeds}</div></div>
      <div class="cover-info-cell"><div class="cic-lbl">Last Vet Visit</div><div class="cic-val">${lastVisit}</div></div>
      <div class="cover-info-cell"><div class="cic-lbl">Overdue Vaccines</div><div class="cic-val" style="color:${overdueVax>0?'#FCA5A5':'#6EE7B7'}">${overdueVax === 0 ? 'None ✓' : overdueVax + ' overdue'}</div></div>
      <div class="cover-info-cell"><div class="cic-lbl">Next Vaccine Due</div><div class="cic-val">${nextVax ? fmtDateOnly(nextVax) : '—'}</div></div>
      <div class="cover-info-cell"><div class="cic-lbl">Avg Mood Score</div><div class="cic-val">${avgMood != null ? avgMood + '/100' : '—'}</div></div>
    </div>
    <div class="cover-footer">
      <span>Report generated <strong>${format(new Date(), 'MMMM d, yyyy')}</strong></span>
      <span>For veterinary reference only — not a substitute for clinical diagnosis</span>
      <span><strong>FAMILY CUBE</strong></span>
    </div>
  </div>

  ${makeSection('profile',      '🐾', 'Patient Profile',          '',                                      renderProfile(pet, ownerName, useLbs, latestWt))}
  ${makeSection('medications',  '💊', 'Medications',              `${activeMeds} active`,                  renderMedications(data.medications))}
  ${makeSection('vaccines',     '💉', 'Vaccination Record',       `${overdueVax > 0 ? overdueVax + ' overdue' : 'All current'}`, renderVaccines(data.vaccines))}
  ${makeSection('appointments', '📅', 'Appointments',             `${data.appointments.length} records`,   renderAppointments(data.appointments))}
  ${makeSection('vet_visits',   '🏥', 'Vet Visit History',        `${data.vet_visits.length} visits`,      renderVetVisits(data.vet_visits))}
  ${makeSection('weight',       '⚖️', 'Weight Log',               `${data.weights.length} entries`,        renderWeight(data.weights, useLbs))}
  ${makeSection('allergies',    '⚠️', 'Allergies & Sensitivities', `${data.allergies.length} on record`,   renderAllergies(data.allergies))}
  ${makeSection('mood',         '😊', 'Mood & Wellbeing',         avgMood != null ? `Avg ${avgMood}/100` : '', renderMood(data.mood))}
  ${makeSection('lab_reports',  '🔬', 'Lab Reports & AI Analysis', `${data.lab_records.length} approved`, renderLabReports(data.lab_records))}
  ${makeSection('insurance',    '🛡️', 'Insurance',                 '',                                    renderInsurance(data.insurance))}

</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function generateAndShareReport(pet: Pet, ownerName: string | null, sections: ReportSection[], useLbs = false): Promise<void> {
  const data = await fetchReportData(pet.id, sections);
  const html = buildHTML(pet, ownerName, sections, data, useLbs);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${pet.name}'s Health Report`, UTI: 'com.adobe.pdf' });
  } else {
    await Print.printAsync({ uri });
  }
}
