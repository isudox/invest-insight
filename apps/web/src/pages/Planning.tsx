import { useEffect, useState, type FormEvent } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, notifyDataChanged, useApi } from '../api';
import { Icon, Modal, Segmented, STATUS_COLOR, StatusBadge, useToast } from '../components/ui';
import { compact, money, pct, today } from '../format';
import type { Account, Category, Goal, Planning } from '@invest-insight/shared';
import i18n from '../i18n';

export function PlanningPage() {
  const toast = useToast();
  const { data } = useApi<Planning>('/api/planning');
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  if (!data) return null;
  const cur = data.base_currency;

  const remove = async (g: Goal) => {
    if (!confirm(i18n.t('planning.confirmDelete', { name: g.name }))) return;
    await api.del(`/api/goals/${g.id}`);
    notifyDataChanged();
    toast(i18n.t('common.deleted'));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{i18n.t('nav.planning')}</h1>
          <p>{i18n.t('planning.subtitle')}</p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> {i18n.t('planning.newGoal')}
          </button>
        </div>
      </div>

      <div className="stack">
        <FireCard data={data} />

        {data.goals.length === 0 ? (
          <div className="card empty">{i18n.t('planning.empty')}</div>
        ) : (
          <div className="grid half">
            {data.goals.map((g) => (
              <div className="card goal-card" key={g.id}>
                <div className="head">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{g.name}</div>
                    <div className="help">
                      {g.scope_name} · {i18n.t('planning.targetDate', { date: g.target_date })}
                      {g.months_left > 0 ? i18n.t('planning.monthsLeft', { count: g.months_left }) : ''}
                    </div>
                  </div>
                  <div className="actions" style={{ flexWrap: 'nowrap', gap: 2 }}>
                    <StatusBadge status={g.status} />
                    <button className="icon-btn" title={i18n.t('common.edit')} onClick={() => setEditing(g)}>
                      <Icon name="edit" />
                    </button>
                    <button className="icon-btn" title={i18n.t('common.delete')} onClick={() => remove(g)}>
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>
                <div className="nums">
                  <span>
                    <strong>{money(g.current, cur, 0)}</strong> <span className="muted">/ {money(g.target_amount, cur, 0)}</span>
                  </span>
                  <span className="num">{pct(g.progress, 1)}</span>
                </div>
                <div className="progress">
                  <span style={{ width: `${g.progress}%`, background: STATUS_COLOR[g.status] }} />
                </div>
                <div className="kv">
                  <div>
                    <div className="k">{i18n.t('planning.projected')}</div>
                    <div className="v">{compact(g.projected, cur)}</div>
                  </div>
                  <div>
                    <div className="k">{i18n.t('planning.currentMonthly')}</div>
                    <div className="v">{money(g.monthly_contribution, cur, 0)}</div>
                  </div>
                  <div>
                    <div className="k">{i18n.t('planning.requiredMonthly')}</div>
                    <div
                      className="v"
                      style={g.required_monthly !== null && g.required_monthly > g.monthly_contribution ? { color: 'var(--warn)' } : undefined}
                    >
                      {g.required_monthly === null ? i18n.t('planning.due') : money(g.required_monthly, cur, 0)}
                    </div>
                  </div>
                </div>
                {g.trajectory.length > 1 && <GoalChart goal={g} cur={cur} />}
              </div>
            ))}
          </div>
        )}
        <p className="help">{i18n.t('planning.method')}</p>
      </div>

      {editing && <GoalForm goal={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function GoalChart({ goal, cur }: { goal: Goal; cur: string }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="legend" style={{ marginBottom: 4 }}>
        <span>
          <i className="dot" style={{ background: 'var(--series-direct)' }} />
          {i18n.t('planning.nominal')}
        </span>
        <span>
          <i className="dot" style={{ background: 'var(--muted)' }} />
          {i18n.t('planning.scenarios')}
        </span>
        <span>
          <i className="dot" style={{ background: 'var(--text)', height: 2, borderRadius: 0 }} />
          {i18n.t('planning.target')}
        </span>
      </div>
      <div style={{ height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={goal.trajectory} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="date" stroke="var(--axis)" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} minTickGap={32} />
            <YAxis
              stroke="var(--axis)"
              tick={{ fill: 'var(--muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
              domain={[0, (max: number) => Math.max(max, goal.target_amount) * 1.05]}
              tickFormatter={(v) => compact(v, cur)}
            />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="chart-tip">
                    <div className="tip-title">{label}</div>
                    {(['optimistic', 'nominal', 'pessimistic'] as const).map((k) => (
                      <div className="tip-row" key={k}>
                        <span>{i18n.t(`planning.${k}`)}</span>
                        <span className="num">{money((payload[0].payload as Goal['trajectory'][number])[k], cur, 0)}</span>
                      </div>
                    ))}
                  </div>
                ) : null
              }
            />
            <ReferenceLine y={goal.target_amount} stroke="var(--text)" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="optimistic" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="pessimistic" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="nominal" stroke="var(--series-direct)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function FireCard({ data }: { data: Planning }) {
  const toast = useToast();
  const f = data.fire;
  const cur = data.base_currency;
  const [draft, setDraft] = useState({ monthly_expense: '', fire_swr: '', fire_return: '', fire_monthly_saving: '' });
  useEffect(() => {
    setDraft({
      monthly_expense: String(f.monthly_expense),
      fire_swr: String(f.swr),
      fire_return: String(f.expected_return),
      fire_monthly_saving: String(f.monthly_saving),
    });
  }, [f.monthly_expense, f.swr, f.expected_return, f.monthly_saving]);

  const save = async () => {
    try {
      await api.put('/api/prefs', Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Number(v) || 0])));
      notifyDataChanged();
      toast(i18n.t('planning.recalculated'));
    } catch (e) {
      toast((e as Error).message, true);
    }
  };

  const years = f.months_to_fire === null ? null : f.months_to_fire / 12;
  return (
    <div className="card">
      <div className="card-head">
        <h2>{i18n.t('planning.fireTitle')}</h2>
        <span className="hint">{i18n.t('planning.fireFormula')}</span>
      </div>
      <div className="grid two" style={{ gap: 24 }}>
        <div className="form-grid">
          {(
            [
              ['monthly_expense', 'monthlyExpense', cur],
              ['fire_monthly_saving', 'monthlySaving', cur],
              ['fire_return', 'expectedReturn', '%'],
              ['fire_swr', 'swr', '%'],
            ] as const
          ).map(([k, label, unit]) => (
            <div className="field" key={k}>
              <label>{i18n.t(`planning.fireFields.${label}`, { unit })}</label>
              <input className="input num" type="number" min={0} step="any" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
            </div>
          ))}
          <div className="full">
            <button className="btn primary" onClick={save}>
              {i18n.t('planning.recalculate')}
            </button>
          </div>
        </div>
        <div>
          {f.fire_number === null ? (
            <div className="empty" style={{ padding: 24 }}>
              {i18n.t('planning.fireEmpty')}
            </div>
          ) : (
            <>
              <div className="nums" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span>
                  <strong>{compact(data.total_value, cur)}</strong>{' '}
                  <span className="muted">/ {i18n.t('planning.fireTarget', { amount: compact(f.fire_number, cur) })}</span>
                </span>
                <span className="num">{pct(f.progress, 1)}</span>
              </div>
              <div className="progress" style={{ height: 10 }}>
                <span style={{ width: `${f.progress ?? 0}%`, background: 'var(--accent)' }} />
              </div>
              <div className="kv">
                <div>
                  <div className="k">{i18n.t('planning.eta')}</div>
                  <div className="v">{f.months_to_fire === 0 ? i18n.t('status.achieved') : f.fire_date ? `${f.fire_date}` : i18n.t('planning.never')}</div>
                  {years !== null && years > 0 && <div className="help">{i18n.t('planning.inYears', { years: years.toFixed(1) })}</div>}
                </div>
                <div>
                  <div className="k">{i18n.t('planning.sustainable')}</div>
                  <div className="v">{money(f.sustainable_annual, cur, 0)}</div>
                  <div className="help">{i18n.t('planning.perMonth', { amount: money(f.sustainable_annual / 12, cur, 0) })}</div>
                </div>
                <div>
                  <div className="k">{i18n.t('planning.coverage')}</div>
                  <div className="v">{f.monthly_expense > 0 ? pct((f.sustainable_annual / (f.monthly_expense * 12)) * 100, 0) : '—'}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GoalForm({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const toast = useToast();
  const { data: categories } = useApi<Category[]>('/api/categories');
  const { data: accounts } = useApi<Account[]>('/api/accounts');
  const [f, setF] = useState({
    name: goal?.name ?? '',
    target_amount: goal ? String(goal.target_amount) : '',
    target_date: goal?.target_date ?? `${Number(today().slice(0, 4)) + 5}-01-01`,
    monthly_contribution: goal ? String(goal.monthly_contribution) : '0',
    expected_return: goal ? String(goal.expected_return) : '5',
    notes: goal?.notes ?? '',
  });
  const [scopeType, setScopeType] = useState<Goal['scope_type']>(goal?.scope_type ?? 'portfolio');
  const [scopeId, setScopeId] = useState<number | ''>(goal?.scope_id ?? '');
  const [error, setError] = useState('');
  const scopeOptions = scopeType === 'category' ? (categories ?? []) : scopeType === 'account' ? (accounts ?? []) : [];
  const effectiveScopeId = scopeId === '' ? scopeOptions[0]?.id : scopeId;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      name: f.name,
      target_amount: Number(f.target_amount),
      target_date: f.target_date,
      monthly_contribution: Number(f.monthly_contribution) || 0,
      expected_return: Number(f.expected_return) || 0,
      scope_type: scopeType,
      scope_id: scopeType === 'portfolio' ? null : (effectiveScopeId ?? null),
      notes: f.notes || null,
    };
    try {
      if (goal) await api.put(`/api/goals/${goal.id}`, body);
      else await api.post('/api/goals', body);
      notifyDataChanged();
      toast(i18n.t('common.saved'));
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const field = (k: keyof typeof f, label: string, type = 'text') => (
    <div className="field">
      <label>{label}</label>
      <input className="input" type={type} step="any" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );

  return (
    <Modal
      title={goal ? i18n.t('planning.editGoal') : i18n.t('planning.newGoal')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {i18n.t('common.cancel')}
          </button>
          <button className="btn primary" type="submit" form="goal-form" disabled={!f.name.trim() || !(Number(f.target_amount) > 0)}>
            {i18n.t('common.save')}
          </button>
        </>
      }
    >
      <form id="goal-form" className="form-grid" onSubmit={submit}>
        {field('name', i18n.t('planning.goalName'))}
        {field('target_amount', i18n.t('planning.targetAmount'), 'number')}
        {field('target_date', i18n.t('planning.targetDateLabel'), 'date')}
        {field('monthly_contribution', i18n.t('planning.monthly'), 'number')}
        {field('expected_return', i18n.t('planning.expectedReturnPct'), 'number')}
        <div className="field full">
          <label>{i18n.t('planning.scope')}</label>
          <Segmented
            value={scopeType}
            onChange={(v) => {
              setScopeType(v);
              setScopeId('');
            }}
            options={[
              { value: 'portfolio', label: i18n.t('planning.scopePortfolio') },
              { value: 'category', label: i18n.t('planning.scopeCategory') },
              { value: 'account', label: i18n.t('planning.scopeAccount') },
            ]}
          />
        </div>
        {scopeType !== 'portfolio' && (
          <div className="field full">
            <select className="input" value={effectiveScopeId ?? ''} onChange={(e) => setScopeId(Number(e.target.value))}>
              {scopeOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field full">
          <label>{i18n.t('common.notes')}</label>
          <input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </div>
        {error && <div className="form-error full">{error}</div>}
      </form>
    </Modal>
  );
}
