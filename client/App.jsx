import React, { useCallback, useEffect, useMemo, useState } from 'react';
import bridge from '@vkontakte/vk-bridge';
import {
  Panel,
  View,
  PanelHeader,
  PanelHeaderBack,
  PanelHeaderButton,
  Group,
  Header,
  Div,
  Button,
  FormItem,
  Textarea,
  Input,
  Snackbar,
  CellButton,
  SegmentedControl,
  Placeholder,
  Epic,
  Tabbar,
  TabbarItem,
  Footnote,
  Switch,
} from '@vkontakte/vkui';
import './styles.css';
import { api } from './api.js';
import { subscribeStore } from './sharedStore.js';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];
const WEEKDAYS_FULL = [
  'воскресенье',
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
];

const KINDS = [
  {
    value: 'post',
    label: 'Пост',
    short: 'П',
    color: '#2688eb',
    hint: 'Обычная публикация на стене',
  },
  {
    value: 'clip',
    label: 'Клип',
    short: 'К',
    color: '#e64646',
    hint: 'Короткое вертикальное видео',
  },
  {
    value: 'story',
    label: 'Сторис',
    short: 'С',
    color: '#4bb34b',
    hint: 'Исчезающая история на 24 часа',
  },
];

const NETWORKS = [
  { value: 'vk', label: 'ВКонтакте', short: 'VK' },
  { value: 'instagram', label: 'Instagram', short: 'IG' },
];

const TEMPLATE_CATEGORIES = [
  'Дети',
  'Семья',
  'Отношения',
  'Бизнес',
  'Реклама',
  'Юмор',
  'Мотивация',
  'Другое',
];

const KIND_MAP = Object.fromEntries(KINDS.map((k) => [k.value, k]));
const NETWORK_MAP = Object.fromEntries(NETWORKS.map((n) => [n.value, n]));
const SLOT_HOURS = [10, 12, 15, 18, 21];
const CAL_PREVIEW = 2;
const CAL_DOTS = 4;

function useIsMobile(maxWidth = 480) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches
      : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [maxWidth]);
  return mobile;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function mondayIndex(date) {
  return (date.getDay() + 6) % 7;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toLocalInputValue(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function localInputToIso(local) {
  return new Date(local).toISOString();
}

function isoToLocalInput(iso) {
  return toLocalInputValue(new Date(iso));
}

function formatTime(iso) {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function dayKey(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function dayTitle(year, month, day) {
  const d = new Date(year, month, day);
  const wd = WEEKDAYS_FULL[d.getDay()];
  return `${day} ${MONTHS[month].toLowerCase()}, ${wd}`;
}

function buildMonthCells(year, month) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = mondayIndex(first);
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function nextSlotForDay(year, month, day, existing) {
  const taken = new Set(
    existing.map((p) => {
      const d = new Date(p.publish_at);
      return d.getHours() * 60 + d.getMinutes();
    })
  );
  for (const h of SLOT_HOURS) {
    const mins = h * 60;
    if (![...taken].some((t) => Math.abs(t - mins) < 30)) {
      return toLocalInputValue(new Date(year, month, day, h, 0, 0, 0));
    }
  }
  if (existing.length) {
    const last = new Date(existing[existing.length - 1].publish_at);
    last.setHours(last.getHours() + 1);
    if (
      last.getFullYear() === year &&
      last.getMonth() === month &&
      last.getDate() === day
    ) {
      return toLocalInputValue(last);
    }
  }
  return toLocalInputValue(new Date(year, month, day, 10, 0, 0, 0));
}

function pillColor(p) {
  return KIND_MAP[p.kind]?.color || '#2688eb';
}

function NetIcon({ network }) {
  if (network === 'instagram') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
        <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.6 2C7.2 2 4 5.3 4 10.1c0 3.1 1.6 5.6 4.4 6.4V22l4-2.2c.4 0 .8.1 1.2.1 5.4 0 9.2-3.4 9.2-9.8C22.8 5.3 18.5 2 12.6 2zm5 8.3h-1.8c-.2 2-.9 3.4-2 4.2v1.6h-1.9v-1.5c-.3 0-.6.1-.9.1-1.7 0-2.9-1.3-2.9-3.5V9.1H6.2V7.5h1.9V5.3h1.9v2.2h2.1v1.6H9.9v1.8c0 1 .4 1.5 1.2 1.5.3 0 .6 0 .8-.1v-1.7c1.6-.2 2.7-1.6 3-3.4H17.6v1.6z" />
    </svg>
  );
}

function KindIcon({ kind }) {
  if (kind === 'clip') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
        <path d="M10 9.5v5l4.5-2.5L10 9.5z" fill="currentColor" />
      </svg>
    );
  }
  if (kind === 'story') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
        <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar({ active }) {
  return (
    <svg
      className={`cp-nav-icon${active ? ' cp-nav-icon--active' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8.5" cy="14.5" r="1.2" fill="currentColor" />
      <circle cx="12" cy="14.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function IconHistory({ active }) {
  return (
    <svg
      className={`cp-nav-icon${active ? ' cp-nav-icon--active' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7.5V12l3.2 2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTemplates({ active }) {
  return (
    <svg
      className={`cp-nav-icon${active ? ' cp-nav-icon--active' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 4.5L7 19.5M17 4.5L15 19.5M4.5 9h15M4 15h15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="8"
        y="8"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M6 15H5.5A2.5 2.5 0 0 1 3 12.5v-7A2.5 2.5 0 0 1 5.5 3h7A2.5 2.5 0 0 1 15 5.5V6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NetBadge({ network, size = 'sm' }) {
  const isIg = network === 'instagram';
  return (
    <span
      className={`cp-net ${isIg ? 'cp-net--ig' : 'cp-net--vk'}${size === 'lg' ? ' cp-net--lg' : ''}`}
      title={isIg ? 'Instagram' : 'ВКонтакте'}
    >
      <NetIcon network={network || 'vk'} />
    </span>
  );
}

function shiftToDay(iso, year, month, day) {
  const src = new Date(iso);
  return new Date(
    year,
    month,
    day,
    src.getHours(),
    src.getMinutes(),
    0,
    0
  ).toISOString();
}

function addDaysLocal(base, days) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return d;
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function IconMove() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 7h7M14 7l-2.5-2.5M14 7l-2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 17H10M10 17l2.5 2.5M10 17l2.5-2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
    </svg>
  );
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function copyToClipboard(payload) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = payload;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

function MonthGrid({
  year,
  month,
  postsByDay,
  onOpenDay,
  compact,
  onDropPost,
}) {
  const cells = useMemo(() => buildMonthCells(year, month), [year, month]);
  const [dropDay, setDropDay] = useState(null);
  const [dragId, setDragId] = useState(null);
  const today = new Date();
  const isToday = (day) =>
    day === today.getDate() &&
    month === today.getMonth() &&
    year === today.getFullYear();

  return (
    <Div style={{ paddingTop: 0, paddingBottom: 8 }}>
      <div className="cp-calendar">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cp-weekday">
            {w}
          </div>
        ))}
      </div>
      <div className="cp-calendar">
        {cells.map((day, idx) => {
          if (day == null) {
            return <div key={`e-${idx}`} />;
          }
          const key = dayKey(year, month, day);
          const dayPosts = postsByDay[key] || [];
          const preview = dayPosts.slice(0, CAL_PREVIEW);
          const more = dayPosts.length - preview.length;
          const dots = dayPosts.slice(0, CAL_DOTS);
          const dotsMore = dayPosts.length - dots.length;
          const todayCell = isToday(day);

          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              className={`cp-cell${todayCell ? ' cp-cell--today' : ''}${dropDay === day ? ' cp-cell--drop' : ''}`}
              onClick={() => onOpenDay(day)}
              onDragOver={(e) => {
                if (!onDropPost) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDropDay(day);
              }}
              onDragLeave={() => {
                setDropDay((d) => (d === day ? null : d));
              }}
              onDrop={(e) => {
                if (!onDropPost) return;
                e.preventDefault();
                e.stopPropagation();
                setDropDay(null);
                const id = Number(e.dataTransfer.getData('text/plain'));
                if (id) onDropPost(id, year, month, day);
                setDragId(null);
              }}
            >
              <div className="cp-cell__head">
                <span className="cp-cell__day">{day}</span>
                {!compact && dayPosts.length > 0 && (
                  <span className="cp-cell__count">{dayPosts.length}</span>
                )}
              </div>

              {compact ? (
                <div className="cp-dots" aria-hidden="true">
                  {dots.map((p) => (
                    <span
                      key={p.id}
                      className={`cp-dot${p.reminded === 1 ? ' cp-dot--done' : ''}`}
                      style={{ background: pillColor(p) }}
                      title={`${KIND_MAP[p.kind]?.label} · ${formatTime(p.publish_at)}`}
                    />
                  ))}
                  {dotsMore > 0 && (
                    <span className="cp-dot-more">+{dotsMore}</span>
                  )}
                </div>
              ) : (
                <div className="cp-desktop-preview">
                  {preview.map((p) => (
                    <div
                      key={p.id}
                      draggable
                      className={`cp-pill${p.reminded === 1 ? ' cp-pill--done' : ''}${dragId === p.id ? ' cp-pill--dragging' : ''}`}
                      style={{ background: pillColor(p) }}
                      title={`${KIND_MAP[p.kind]?.label} · ${NETWORK_MAP[p.network]?.label || 'VK'} · ${formatTime(p.publish_at)} · перетащите на другой день`}
                      onClick={(e) => e.stopPropagation()}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData('text/plain', String(p.id));
                        e.dataTransfer.effectAllowed = 'move';
                        setDragId(p.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropDay(null);
                      }}
                    >
                      <span className="cp-pill__label">
                        {KIND_MAP[p.kind]?.short || 'П'} {formatTime(p.publish_at)}
                      </span>
                      <NetBadge network={p.network || 'vk'} />
                    </div>
                  ))}
                  {more > 0 && <div className="cp-more">+{more}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="cp-legend">
        {KINDS.map((k) => (
          <span key={k.value} className="cp-legend__item">
            <span className="cp-legend__dot" style={{ background: k.color }} />
            {k.label}
          </span>
        ))}
        <span className="cp-legend__item">
          <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>
            П 10:00
          </span>
          Разместили
        </span>
      </div>
      {!compact && (
        <Footnote style={{ marginTop: 8, opacity: 0.55, textAlign: 'center' }}>
          Перетащите плашку на другой день, чтобы перенести
        </Footnote>
      )}
    </Div>
  );
}

function DayPanelBody({ year, month, day, posts, onAdd, onEdit, onMove }) {
  return (
    <>
      <Group>
        <Div>
          <div className="cp-day-hero">
            <h2 className="cp-day-hero__title">{dayTitle(year, month, day)}</h2>
            <div className="cp-day-hero__meta">
              {posts.length
                ? `${posts.length} публикац${posts.length === 1 ? 'ия' : posts.length < 5 ? 'ии' : 'ий'}`
                : 'Пока пусто — добавьте первую'}
            </div>
          </div>
        </Div>
      </Group>

      <Group header={<Header mode="secondary">Расписание</Header>}>
        {posts.length === 0 ? (
          <Placeholder
            className="cp-anim"
            header="Нет публикаций"
            action={
              <Button size="m" onClick={onAdd}>
                Добавить
              </Button>
            }
          >
            Пост, клип или сторис — для VK и Instagram
          </Placeholder>
        ) : (
          <div className="cp-day-list">
            {posts.map((p) => {
              const meta = KIND_MAP[p.kind] || KIND_MAP.post;
              const net = NETWORK_MAP[p.network] || NETWORK_MAP.vk;
              const done = p.reminded === 1;
              return (
                <div key={p.id} className="cp-day-row">
                  <button
                    type="button"
                    className="cp-kind-icon"
                    style={{
                      background: pillColor(p),
                      opacity: done ? 0.62 : 1,
                      border: 0,
                      cursor: 'pointer',
                    }}
                    onClick={() => onEdit(p)}
                    aria-label="Редактировать"
                  >
                    <KindIcon kind={p.kind} />
                  </button>
                  <button
                    type="button"
                    className="cp-day-row__body"
                    style={{
                      border: 0,
                      background: 'transparent',
                      padding: 0,
                      textAlign: 'left',
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'inherit',
                    }}
                    onClick={() => onEdit(p)}
                  >
                    <div
                      className={`cp-day-row__title${done ? ' cp-day-row__title--done' : ''}`}
                    >
                      {p.text?.trim() || '(без текста)'}
                    </div>
                    <div className="cp-day-row__meta">
                      {meta.label} · {net.label} · {p.category || 'Другое'} ·{' '}
                      {done ? 'разместили' : 'ожидает'}
                    </div>
                  </button>
                  <div className="cp-day-row__aside">
                    <span className="cp-day-row__time">
                      {formatTime(p.publish_at)}
                    </span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <NetBadge network={p.network || 'vk'} size="lg" />
                      <button
                        type="button"
                        className="cp-icon-btn"
                        title="Перенести на другой день"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMove(p);
                        }}
                      >
                        <IconMove />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {posts.length > 0 && (
          <CellButton centered onClick={onAdd}>
            Добавить публикацию
          </CellButton>
        )}
      </Group>
    </>
  );
}

function MoveFormBody({ post, onBack, onMoved }) {
  const current = new Date(post.publish_at);
  const today = new Date();
  const quick = [
    { label: 'Сегодня', date: addDaysLocal(today, 0) },
    { label: 'Завтра', date: addDaysLocal(today, 1) },
    { label: '+2 дня', date: addDaysLocal(today, 2) },
    { label: '+1 неделя', date: addDaysLocal(today, 7) },
  ];
  const [dateVal, setDateVal] = useState(toDateInputValue(current));
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState(toDateInputValue(current));

  const apply = async (y, m, d) => {
    setBusy(true);
    try {
      await api('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          id: post.id,
          text: post.text,
          publish_at: shiftToDay(post.publish_at, y, m, d),
          kind: post.kind || 'post',
          network: post.network || 'vk',
          category: post.category || 'Другое',
        }),
      });
      onMoved({ year: y, month: m, day: d });
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const applyFromInput = () => {
    const [ys, ms, ds] = dateVal.split('-').map(Number);
    if (!ys || !ms || !ds) return;
    apply(ys, ms - 1, ds);
  };

  return (
    <div className="cp-form-block">
      <Group>
        <Div>
          <div className="cp-day-hero">
            <h2 className="cp-day-hero__title">Перенести</h2>
            <div className="cp-day-hero__meta">
              Время {formatTime(post.publish_at)} сохранится ·{' '}
              {post.text?.trim()?.slice(0, 80) || '(без текста)'}
            </div>
          </div>
        </Div>
        <FormItem top="Быстрый выбор">
          <div className="cp-move-grid">
            {quick.map((q) => {
              const key = toDateInputValue(q.date);
              return (
                <button
                  key={q.label}
                  type="button"
                  className={`cp-move-chip${picked === key ? ' cp-move-chip--active' : ''}`}
                  disabled={busy}
                  onClick={() => {
                    setPicked(key);
                    setDateVal(key);
                    apply(q.date.getFullYear(), q.date.getMonth(), q.date.getDate());
                  }}
                >
                  {q.label}
                </button>
              );
            })}
          </div>
        </FormItem>
        <FormItem top="Или выберите дату">
          <Input
            type="date"
            value={dateVal}
            onChange={(e) => {
              setDateVal(e.target.value);
              setPicked(e.target.value);
            }}
          />
        </FormItem>
      </Group>
      <Group>
        <Div>
          <Button
            size="l"
            stretched
            disabled={busy || !dateVal}
            onClick={applyFromInput}
          >
            Перенести на выбранную дату
          </Button>
        </Div>
        <Div>
          <Button size="l" stretched mode="secondary" onClick={onBack}>
            Отмена
          </Button>
        </Div>
      </Group>
    </div>
  );
}

function PostFormBody({ draft, onBack, onSaved, onDeleted, onPickTemplate, onSnack }) {
  const isEdit = Boolean(draft?.post?.id);
  const [text, setText] = useState(draft?.post?.text ?? draft?.presetText ?? '');
  const [kind, setKind] = useState(draft?.post?.kind || draft?.kind || 'post');
  const [network, setNetwork] = useState(
    draft?.post?.network || draft?.network || 'vk'
  );
  const [category, setCategory] = useState(
    draft?.post?.category || draft?.category || 'Другое'
  );
  const [when, setWhen] = useState(
    draft?.post?.publish_at
      ? isoToLocalInput(draft.post.publish_at)
      : draft?.draftDate || toLocalInputValue(new Date())
  );
  const [busy, setBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [placed, setPlaced] = useState(draft?.post?.reminded === 1);

  useEffect(() => {
    if (draft?.presetText != null) {
      setText(draft.presetText);
    }
  }, [draft?.presetText]);

  useEffect(() => {
    if (draft?.category != null) {
      setCategory(draft.category);
    }
  }, [draft?.category]);

  const kindMeta = KIND_MAP[kind] || KIND_MAP.post;
  const netMeta = NETWORK_MAP[network] || NETWORK_MAP.vk;

  const datePart = when?.slice(0, 10) || '';
  const timePart = when?.slice(11, 16) || '';

  const setDatePart = (v) => {
    setWhen(`${v}T${timePart || '12:00'}`);
  };
  const setTimePart = (v) => {
    setWhen(`${datePart || toDateInputValue(new Date())}T${v}`);
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        text,
        publish_at: localInputToIso(when),
        kind,
        network,
        category,
      };
      if (isEdit) {
        body.id = draft.post.id;
        body.placed = placed ? 1 : 0;
      }
      await api('/api/posts', { method: 'POST', body: JSON.stringify(body) });
      onSaved();
      onBack();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!isEdit) return;
    setBusy(true);
    try {
      await api(`/api/posts/${draft.post.id}`, { method: 'DELETE' });
      onDeleted();
      onBack();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const copyText = async () => {
    const payload = text.trim();
    if (!payload) {
      onSnack?.('Нет текста для копирования');
      return;
    }
    setCopyBusy(true);
    try {
      await copyToClipboard(payload);
      onSnack?.('Текст скопирован');
    } catch (e) {
      console.error(e);
      onSnack?.('Не удалось скопировать');
    } finally {
      setCopyBusy(false);
    }
  };

  const placeholder =
    kind === 'clip'
      ? 'О чём клип?'
      : kind === 'story'
        ? 'О чём сторис?'
        : 'О чём пост?';

  return (
    <div className="cp-form-block">
      <Group>
        <Div>
          <div
            key={kind + network}
            className="cp-type-banner"
            style={{ background: kindMeta.color }}
          >
            <div className="cp-type-banner__badge">
              <KindIcon kind={kind} />
            </div>
            <div className="cp-type-banner__text">
              <div className="cp-type-banner__title">{kindMeta.label}</div>
              <div className="cp-type-banner__sub">
                {kindMeta.hint} · {netMeta.label}
                {category ? ` · ${category}` : ''}
              </div>
            </div>
          </div>
        </Div>

        {!isEdit && (
          <>
            <FormItem top="Тип публикации">
              <SegmentedControl
                size="l"
                value={kind}
                onChange={(v) => setKind(String(v))}
                options={KINDS.map((k) => ({
                  label: k.label,
                  value: k.value,
                }))}
              />
            </FormItem>

            <FormItem top="Соцсеть">
              <div className="cp-net-pick">
                {NETWORKS.map((n) => {
                  const active = network === n.value;
                  return (
                    <div
                      key={n.value}
                      role="button"
                      tabIndex={0}
                      className={`cp-net-card cp-net-card--${n.value === 'instagram' ? 'ig' : 'vk'}${active ? ' cp-net-card--active' : ''}`}
                      onClick={() => setNetwork(n.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setNetwork(n.value);
                        }
                      }}
                    >
                      <div
                        className={`cp-net-card__icon cp-net-card__icon--${n.value === 'instagram' ? 'ig' : 'vk'}`}
                      >
                        <NetIcon network={n.value} />
                      </div>
                      <span className="cp-net-card__label">{n.label}</span>
                    </div>
                  );
                })}
              </div>
            </FormItem>
          </>
        )}

        <FormItem top="Тематика">
          <div className="cp-tpl-chips">
            {TEMPLATE_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`cp-tpl-chip${category === c ? ' cp-tpl-chip--active' : ''}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </FormItem>

        <FormItem top={isEdit ? 'Текст / идея' : `Текст / идея · ${kindMeta.label}`}>
          <div className="cp-text-toolbar">
            {!isEdit && (
              <Button size="s" mode="secondary" onClick={() => onPickTemplate?.(category)}>
                Выбрать заготовку
              </Button>
            )}
            <Button
              size="s"
              mode="secondary"
              disabled={copyBusy || !text.trim()}
              onClick={copyText}
              before={
                <span className="cp-btn-ico" aria-hidden="true">
                  <IconCopy />
                </span>
              }
            >
              Скопировать
            </Button>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
          />
        </FormItem>

        <FormItem top="Когда публиковать">
          <div className="cp-when">
            <div className="cp-when__field">
              <div className="cp-when__label">Дата</div>
              <Input
                type="date"
                value={datePart}
                onChange={(e) => setDatePart(e.target.value)}
              />
            </div>
            <div className="cp-when__field">
              <div className="cp-when__label">Время</div>
              <Input
                type="time"
                value={timePart}
                step={300}
                onChange={(e) => setTimePart(e.target.value)}
              />
            </div>
          </div>
        </FormItem>

        {isEdit && (
          <FormItem top="Статус размещения">
            <div className="cp-placed-row">
              <div className="cp-placed-row__text">
                <div className="cp-placed-row__title">Размещена</div>
                <div className="cp-placed-row__hint">
                  Отметьте вручную после публикации в соцсети
                </div>
              </div>
              <Switch
                checked={placed}
                onChange={(e) => setPlaced(e.target.checked)}
              />
            </div>
          </FormItem>
        )}
      </Group>

      <Group>
        <Div>
          <Button
            size="l"
            stretched
            mode="secondary"
            disabled={copyBusy || !text.trim()}
            onClick={copyText}
            before={
              <span className="cp-btn-ico" aria-hidden="true">
                <IconCopy />
              </span>
            }
          >
            Скопировать текст для соцсети
          </Button>
        </Div>
        <Div>
          <Button
            size="l"
            stretched
            disabled={busy || !datePart || !timePart}
            onClick={save}
          >
            Сохранить {kindMeta.label.toLowerCase()}
          </Button>
        </Div>
        {isEdit && (
          <Div>
            <Button
              size="l"
              stretched
              mode="secondary"
              appearance="negative"
              disabled={busy}
              onClick={remove}
            >
              Удалить
            </Button>
          </Div>
        )}
      </Group>
    </div>
  );
}

function HistoryDetailBody({ entry, onSnack }) {
  const meta = KIND_MAP[entry.kind] || KIND_MAP.post;
  const net = NETWORK_MAP[entry.network] || NETWORK_MAP.vk;
  const [copyBusy, setCopyBusy] = useState(false);

  const copyText = async () => {
    const payload = (entry.text || '').trim();
    if (!payload) {
      onSnack?.('Нет текста для копирования');
      return;
    }
    setCopyBusy(true);
    try {
      await copyToClipboard(payload);
      onSnack?.('Текст скопирован');
    } catch (e) {
      console.error(e);
      onSnack?.('Не удалось скопировать');
    } finally {
      setCopyBusy(false);
    }
  };

  const rows = [
    { label: 'Тип', value: meta.label },
    { label: 'Соцсеть', value: net.label },
    { label: 'Тематика', value: entry.category || 'Другое' },
    { label: 'План публикации', value: formatDateTime(entry.publish_at) },
    { label: 'Отмечена размещённой', value: formatDateTime(entry.placed_at) },
  ];

  return (
    <div className="cp-form-block">
      <Group>
        <Div>
          <div
            className="cp-type-banner"
            style={{ background: meta.color }}
          >
            <div className="cp-type-banner__badge">
              <KindIcon kind={entry.kind} />
            </div>
            <div className="cp-type-banner__text">
              <div className="cp-type-banner__title">{meta.label}</div>
              <div className="cp-type-banner__sub">
                {net.label} · {entry.category || 'Другое'} · размещена
              </div>
            </div>
          </div>
        </Div>
        <FormItem top="Текст">
          <div className="cp-history-text">
            {entry.text?.trim() || '(без текста)'}
          </div>
        </FormItem>
        <Div>
          <div className="cp-history-facts">
            {rows.map((r) => (
              <div key={r.label} className="cp-history-fact">
                <div className="cp-history-fact__label">{r.label}</div>
                <div className="cp-history-fact__value">{r.value}</div>
              </div>
            ))}
          </div>
        </Div>
      </Group>
      <Group>
        <Div>
          <Button
            size="l"
            stretched
            mode="secondary"
            disabled={copyBusy || !(entry.text || '').trim()}
            onClick={copyText}
            before={
              <span className="cp-btn-ico" aria-hidden="true">
                <IconCopy />
              </span>
            }
          >
            Скопировать текст
          </Button>
        </Div>
      </Group>
    </div>
  );
}

function TemplatesList({
  templates,
  category,
  onCategory,
  onSelect,
  selectMode,
  onEdit,
}) {
  const cats = useMemo(() => {
    const set = new Set(TEMPLATE_CATEGORIES);
    for (const t of templates) set.add(t.category);
    return ['Все', ...[...set]];
  }, [templates]);

  const filtered = useMemo(() => {
    if (!category || category === 'Все') return templates;
    return templates.filter((t) => t.category === category);
  }, [templates, category]);

  return (
    <div className="cp-form-block">
      <Div style={{ paddingBottom: 0 }}>
        <div className="cp-tpl-chips">
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              className={`cp-tpl-chip${category === c ? ' cp-tpl-chip--active' : ''}`}
              onClick={() => onCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </Div>
      <Group>
        {filtered.length === 0 ? (
          <Placeholder header="Нет заготовок">
            Добавьте тексты по тематикам — они появятся здесь
          </Placeholder>
        ) : (
          filtered.map((t) => (
            <button
              key={t.id}
              type="button"
              className="cp-tpl-card"
              onClick={() => (selectMode ? onSelect(t) : onEdit(t))}
            >
              <div className="cp-tpl-card__cat">{t.category}</div>
              <div className="cp-tpl-card__text">{t.text}</div>
            </button>
          ))
        )}
      </Group>
    </div>
  );
}

function TemplateFormBody({ draft, onBack, onSaved, onDeleted }) {
  const isEdit = Boolean(draft?.id);
  const [category, setCategory] = useState(draft?.category || 'Другое');
  const [text, setText] = useState(draft?.text || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const body = { category, text };
      if (isEdit) body.id = draft.id;
      await api('/api/templates', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onSaved();
      onBack();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!isEdit) return;
    setBusy(true);
    try {
      await api(`/api/templates/${draft.id}`, { method: 'DELETE' });
      onDeleted();
      onBack();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cp-form-block">
      <Group>
        <FormItem top="Тематика">
          <div className="cp-tpl-chips">
            {TEMPLATE_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`cp-tpl-chip${category === c ? ' cp-tpl-chip--active' : ''}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </FormItem>
        <FormItem top="Текст заготовки">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Готовый текст для поста…"
          />
        </FormItem>
      </Group>
      <Group>
        <Div>
          <Button
            size="l"
            stretched
            disabled={busy || !text.trim()}
            onClick={save}
          >
            Сохранить
          </Button>
        </Div>
        {isEdit && (
          <Div>
            <Button
              size="l"
              stretched
              mode="secondary"
              appearance="negative"
              disabled={busy}
              onClick={remove}
            >
              Удалить
            </Button>
          </Div>
        )}
      </Group>
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [posts, setPosts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [activePanel, setActivePanel] = useState('main');
  const [dayFocus, setDayFocus] = useState(null);
  const [draft, setDraft] = useState(null);
  const [tplDraft, setTplDraft] = useState(null);
  const [tplCategory, setTplCategory] = useState('Все');
  const [tplSelectMode, setTplSelectMode] = useState(false);
  const [history, setHistory] = useState([]);
  const [snack, setSnack] = useState(null);
  const [movePost, setMovePost] = useState(null);
  const [historyFocus, setHistoryFocus] = useState(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const range = useMemo(() => {
    const from = new Date(year, month, 1).toISOString();
    const to = new Date(year, month + 1, 1).toISOString();
    return { from, to };
  }, [year, month]);

  const loadPosts = useCallback(async () => {
    try {
      const data = await api(
        `/api/posts?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`
      );
      setPosts(data);
    } catch (e) {
      console.error(e);
    }
  }, [range.from, range.to]);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await api('/api/templates');
      setTemplates(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api('/api/history');
      setHistory(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Live updates: Firebase (all devices) or storage event (other tabs)
  useEffect(() => {
    const STATIC = import.meta.env.VITE_STATIC === 'true';
    if (STATIC) {
      return subscribeStore(() => {
        loadPosts();
        loadTemplates();
        loadHistory();
      });
    }
    // Local Express API: poll so another open client sees changes
    const id = setInterval(() => {
      loadPosts();
      if (activePanel === 'history' || activePanel === 'history-detail') {
        loadHistory();
      }
      if (activePanel === 'templates' || activePanel === 'template-edit') {
        loadTemplates();
      }
    }, 4000);
    return () => clearInterval(id);
  }, [loadPosts, loadTemplates, loadHistory, activePanel]);

  useEffect(() => {
    (async () => {
      try {
        await bridge.send('VKWebAppInit');
      } catch {
        /* browser / outside VK */
      }
    })();
  }, []);

  const postsByDay = useMemo(() => {
    const map = {};
    for (const p of posts) {
      const d = new Date(p.publish_at);
      const key = dayKey(d.getFullYear(), d.getMonth(), d.getDate());
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    return map;
  }, [posts]);

  const dayPosts = useMemo(() => {
    if (!dayFocus) return [];
    const key = dayKey(dayFocus.year, dayFocus.month, dayFocus.day);
    return postsByDay[key] || [];
  }, [dayFocus, postsByDay]);

  const openDay = (day) => {
    setDayFocus({ year, month, day });
    setActivePanel('day');
  };

  const openAdd = () => {
    if (!dayFocus) return;
    setDraft({
      draftDate: nextSlotForDay(
        dayFocus.year,
        dayFocus.month,
        dayFocus.day,
        dayPosts
      ),
      kind: 'post',
      network: 'vk',
      returnTo: 'day',
    });
    setActivePanel('edit');
  };

  const openEdit = (post) => {
    setDraft({ post, returnTo: 'day' });
    setActivePanel('edit');
  };

  const openMove = (post) => {
    setMovePost(post);
    setActivePanel('move');
  };

  const backFromMove = () => {
    setMovePost(null);
    setActivePanel(dayFocus ? 'day' : 'main');
  };

  const afterMoved = async ({ year: y, month: m, day: d }) => {
    setMovePost(null);
    setCursor(startOfMonth(new Date(y, m, 1)));
    setDayFocus({ year: y, month: m, day: d });
    try {
      const from = new Date(y, m, 1).toISOString();
      const to = new Date(y, m + 1, 1).toISOString();
      const data = await api(
        `/api/posts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      setPosts(data);
    } catch (e) {
      console.error(e);
    }
    setSnack('Перенесено');
    setActivePanel('day');
  };

  const dropPost = async (id, y, m, d) => {
    const post = posts.find((p) => p.id === id);
    if (!post) return;
    const cur = new Date(post.publish_at);
    if (
      cur.getFullYear() === y &&
      cur.getMonth() === m &&
      cur.getDate() === d
    ) {
      return;
    }
    try {
      await api('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          id: post.id,
          text: post.text,
          publish_at: shiftToDay(post.publish_at, y, m, d),
          kind: post.kind || 'post',
          network: post.network || 'vk',
          category: post.category || 'Другое',
        }),
      });
      await loadPosts();
      setSnack('Перенесено');
    } catch (e) {
      console.error(e);
    }
  };

  const backFromDay = () => {
    setActivePanel('main');
    setDayFocus(null);
  };

  const backFromEdit = () => {
    setDraft(null);
    setActivePanel(draft?.returnTo === 'day' && dayFocus ? 'day' : 'main');
  };

  const openTemplates = (selectMode = false, categoryFilter) => {
    setTplSelectMode(selectMode);
    setTplCategory(
      selectMode && categoryFilter && categoryFilter !== 'Все'
        ? categoryFilter
        : 'Все'
    );
    setActivePanel('templates');
  };

  const backFromTemplates = () => {
    if (tplSelectMode) {
      setTplSelectMode(false);
      setActivePanel('edit');
    } else {
      setActivePanel('main');
    }
  };

  const pickTemplate = (t) => {
    setDraft((d) => ({
      ...(d || {}),
      presetText: t.text,
      category: t.category,
      returnTo: d?.returnTo || 'day',
    }));
    setTplSelectMode(false);
    setActivePanel('edit');
  };

  const openTplEdit = (t) => {
    setTplDraft(t || { category: 'Другое', text: '' });
    setActivePanel('template-edit');
  };

  const afterSave = () => {
    loadPosts();
    loadHistory();
    setSnack('Сохранено');
  };

  const afterDelete = () => {
    loadPosts();
    loadHistory();
    setSnack('Удалено');
  };

  const editTitle = draft?.post?.id ? 'Редактировать' : 'Новая публикация';

  const story =
    activePanel === 'history' || activePanel === 'history-detail'
      ? 'history'
      : activePanel === 'templates' || activePanel === 'template-edit'
        ? 'templates'
        : 'main';

  const showTabbar =
    (activePanel === 'main' ||
      activePanel === 'history' ||
      (activePanel === 'templates' && !tplSelectMode)) &&
    !tplSelectMode;

  const mainPanel = ['main', 'day', 'edit', 'move'].includes(activePanel)
    ? activePanel
    : 'main';
  const historyPanel =
    activePanel === 'history-detail' ? 'history-detail' : 'history';
  const templatesPanel =
    activePanel === 'template-edit' ? 'template-edit' : 'templates';

  const goTab = (id) => {
    if (id === 'history') {
      setHistoryFocus(null);
      loadHistory();
    }
    if (id === 'templates') {
      setTplSelectMode(false);
      loadTemplates();
    }
    setActivePanel(id);
  };

  const openHistoryDetail = (entry) => {
    setHistoryFocus(entry);
    setActivePanel('history-detail');
  };

  const backFromHistoryDetail = () => {
    setHistoryFocus(null);
    setActivePanel('history');
  };

  return (
    <Epic
      activeStory={story}
      tabbar={
        showTabbar ? (
          <Tabbar className="cp-tabbar">
            <TabbarItem
              selected={story === 'main'}
              onClick={() => goTab('main')}
              text="Календарь"
            >
              <IconCalendar active={story === 'main'} />
            </TabbarItem>
            <TabbarItem
              selected={story === 'history'}
              onClick={() => goTab('history')}
              text="История"
            >
              <IconHistory active={story === 'history'} />
            </TabbarItem>
            <TabbarItem
              selected={story === 'templates'}
              onClick={() => goTab('templates')}
              text="Заготовки"
            >
              <IconTemplates active={story === 'templates'} />
            </TabbarItem>
          </Tabbar>
        ) : null
      }
    >
      <View id="main" activePanel={mainPanel}>
        <Panel id="main">
          <PanelHeader
            before={
              <PanelHeaderButton
                onClick={() => setCursor((c) => addMonths(c, -1))}
              >
                ‹
              </PanelHeaderButton>
            }
            after={
              <PanelHeaderButton
                onClick={() => setCursor((c) => addMonths(c, 1))}
              >
                ›
              </PanelHeaderButton>
            }
          >
            {MONTHS[month]} {year}
          </PanelHeader>
          <Group>
            <MonthGrid
              year={year}
              month={month}
              postsByDay={postsByDay}
              onOpenDay={openDay}
              compact={isMobile}
              onDropPost={dropPost}
            />
          </Group>
          {snack && activePanel === 'main' && (
            <Snackbar onClose={() => setSnack(null)}>{snack}</Snackbar>
          )}
        </Panel>

        <Panel id="day">
          <PanelHeader before={<PanelHeaderBack onClick={backFromDay} />}>
            День
          </PanelHeader>
          <DayPanelBody
            year={dayFocus?.year ?? year}
            month={dayFocus?.month ?? month}
            day={dayFocus?.day ?? 1}
            posts={dayPosts}
            onAdd={openAdd}
            onEdit={openEdit}
            onMove={openMove}
          />
          {snack && activePanel === 'day' && (
            <Snackbar onClose={() => setSnack(null)}>{snack}</Snackbar>
          )}
        </Panel>

        <Panel id="edit">
          <PanelHeader before={<PanelHeaderBack onClick={backFromEdit} />}>
            {editTitle}
          </PanelHeader>
          {draft && (
            <PostFormBody
              key={
                draft.post?.id ||
                `${draft.draftDate}-${draft.kind || 'post'}-${draft.network || 'vk'}`
              }
              draft={draft}
              onBack={backFromEdit}
              onSaved={afterSave}
              onDeleted={afterDelete}
              onPickTemplate={(cat) => openTemplates(true, cat)}
              onSnack={setSnack}
            />
          )}
          {snack && activePanel === 'edit' && (
            <Snackbar onClose={() => setSnack(null)}>{snack}</Snackbar>
          )}
        </Panel>

        <Panel id="move">
          <PanelHeader before={<PanelHeaderBack onClick={backFromMove} />}>
            Перенести
          </PanelHeader>
          {movePost && (
            <MoveFormBody
              key={movePost.id}
              post={movePost}
              onBack={backFromMove}
              onMoved={afterMoved}
            />
          )}
          {snack && activePanel === 'move' && (
            <Snackbar onClose={() => setSnack(null)}>{snack}</Snackbar>
          )}
        </Panel>
      </View>

      <View id="history" activePanel={historyPanel}>
        <Panel id="history">
          <PanelHeader>История</PanelHeader>
          <Group>
            {history.length === 0 ? (
              <Placeholder header="Пока пусто">
                Отметьте «Размещена» в редактировании — запись появится здесь
              </Placeholder>
            ) : (
              history.map((h) => {
                const meta = KIND_MAP[h.kind] || KIND_MAP.post;
                const net = NETWORK_MAP[h.network] || NETWORK_MAP.vk;
                return (
                  <button
                    key={h.id}
                    type="button"
                    className="cp-tpl-card"
                    onClick={() => openHistoryDetail(h)}
                  >
                    <div className="cp-tpl-card__cat">
                      {meta.label} · {net.label} · {h.category || 'Другое'} ·{' '}
                      {formatDateTime(h.placed_at)}
                    </div>
                    <div className="cp-tpl-card__text">
                      {h.text?.trim() || '(без текста)'}
                    </div>
                    <div className="cp-tpl-card__more">Открыть →</div>
                  </button>
                );
              })
            )}
          </Group>
          {snack && activePanel === 'history' && (
            <Snackbar onClose={() => setSnack(null)}>{snack}</Snackbar>
          )}
        </Panel>

        <Panel id="history-detail">
          <PanelHeader
            before={<PanelHeaderBack onClick={backFromHistoryDetail} />}
          >
            Публикация
          </PanelHeader>
          {historyFocus && (
            <HistoryDetailBody
              key={historyFocus.id}
              entry={historyFocus}
              onSnack={setSnack}
            />
          )}
          {snack && activePanel === 'history-detail' && (
            <Snackbar onClose={() => setSnack(null)}>{snack}</Snackbar>
          )}
        </Panel>
      </View>

      <View id="templates" activePanel={templatesPanel}>
        <Panel id="templates">
          <PanelHeader
            before={
              tplSelectMode ? (
                <PanelHeaderBack onClick={backFromTemplates} />
              ) : null
            }
            after={
              !tplSelectMode ? (
                <PanelHeaderButton onClick={() => openTplEdit(null)}>
                  +
                </PanelHeaderButton>
              ) : null
            }
          >
            {tplSelectMode ? 'Выбор заготовки' : 'Заготовки'}
          </PanelHeader>
          <TemplatesList
            templates={templates}
            category={tplCategory}
            onCategory={setTplCategory}
            selectMode={tplSelectMode}
            onSelect={pickTemplate}
            onEdit={openTplEdit}
          />
          {snack && activePanel === 'templates' && (
            <Snackbar onClose={() => setSnack(null)}>{snack}</Snackbar>
          )}
        </Panel>

        <Panel id="template-edit">
          <PanelHeader
            before={
              <PanelHeaderBack
                onClick={() => {
                  setTplDraft(null);
                  setActivePanel('templates');
                }}
              />
            }
          >
            {tplDraft?.id ? 'Редактировать' : 'Новая заготовка'}
          </PanelHeader>
          {tplDraft && (
            <TemplateFormBody
              key={tplDraft.id || 'new-tpl'}
              draft={tplDraft}
              onBack={() => {
                setTplDraft(null);
                setActivePanel('templates');
              }}
              onSaved={() => {
                loadTemplates();
                setSnack('Заготовка сохранена');
              }}
              onDeleted={() => {
                loadTemplates();
                setSnack('Заготовка удалена');
              }}
            />
          )}
        </Panel>
      </View>
    </Epic>
  );
}
