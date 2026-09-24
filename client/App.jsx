import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Placeholder,
  Epic,
  Tabbar,
  TabbarItem,
  Footnote,
  Switch,
} from '@vkontakte/vkui';
import './styles.css';
import { api } from './api.js';
import {
  DEFAULT_CATEGORIES,
  subscribeStore,
  subscribeSyncStatus,
} from './sharedStore.js';
import {
  notificationSupport,
  requestNotificationPermission,
  startReminderLoop,
} from './reminders.js';

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

const PLAN_POSTS_FROM = '2020-01-01T00:00:00.000Z';
const PLAN_POSTS_TO = '2035-01-01T00:00:00.000Z';

function normText(t) {
  return String(t || '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** planned = in calendar, placed = already published */
function templateUsageStatus(text, posts, history) {
  const key = normText(text);
  if (!key) return null;
  if ((history || []).some((h) => normText(h.text) === key)) return 'placed';
  const matching = (posts || []).filter((p) => normText(p.text) === key);
  if (matching.some((p) => p.reminded === 1 || p.placed === 1)) return 'placed';
  if (matching.length) return 'planned';
  return null;
}

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
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.525-2.05-1.714-1.033-.997-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.688-1.253.688-1.846 0-3.896-1.118-5.335-3.202C4.624 10.873 4.03 8.114 4.03 7.663c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.678.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.39 0 .542.203.542.643v3.572c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.254-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.763-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.05.17.49-.085.744-.576.744z" />
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

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7M8.5 7l.7 11.2a1.5 1.5 0 0 0 1.5 1.4h2.6a1.5 1.5 0 0 0 1.5-1.4L15.5 7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - dow);
  return x;
}

function addDaysDate(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayLabelShort(d) {
  const names = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  return `${names[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3).toLowerCase()}`;
}

function ConfirmDialog({ title, message, confirmLabel = 'Удалить', onConfirm, onCancel }) {
  return (
    <div className="cp-confirm" role="alertdialog" aria-modal="true">
      <button
        type="button"
        className="cp-confirm__backdrop"
        aria-label="Закрыть"
        onClick={onCancel}
      />
      <div className="cp-confirm__card">
        <div className="cp-confirm__title">{title}</div>
        {message ? <div className="cp-confirm__msg">{message}</div> : null}
        <div className="cp-confirm__actions">
          <Button size="m" mode="secondary" stretched onClick={onCancel}>
            Отмена
          </Button>
          <Button
            size="m"
            mode="primary"
            appearance="negative"
            stretched
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SyncBadge() {
  const [sync, setSync] = useState(() => ({
    status: 'idle',
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  }));

  useEffect(() => subscribeSyncStatus(setSync), []);

  let label = 'Локально';
  let mod = 'local';
  if (!sync.online || sync.status === 'offline') {
    label = 'Офлайн';
    mod = 'offline';
  } else if (sync.status === 'syncing') {
    label = 'Синхронизация…';
    mod = 'syncing';
  } else if (sync.status === 'saved' || sync.status === 'idle') {
    label = 'Сохранено';
    mod = 'saved';
  } else if (sync.status === 'error') {
    label = 'Ошибка синка';
    mod = 'error';
  } else if (sync.status === 'local') {
    label = 'Локально';
    mod = 'local';
  }

  return (
    <span className={`cp-sync cp-sync--${mod}`} title={label}>
      <span className="cp-sync__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

function UpcomingStrip({ posts, onOpenToday, onOpenTomorrow, onOpenWeek }) {
  const { todayCount, tomorrowCount, nextTodayTime } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = addDaysDate(today, 1);
    const list = (posts || [])
      .filter((p) => p.reminded !== 1 && p.placed !== 1)
      .sort((a, b) => String(a.publish_at).localeCompare(String(b.publish_at)));
    const todayList = list.filter((p) => sameDay(new Date(p.publish_at), today));
    const tomorrowList = list.filter((p) =>
      sameDay(new Date(p.publish_at), tomorrow)
    );
    return {
      todayCount: todayList.length,
      tomorrowCount: tomorrowList.length,
      nextTodayTime: todayList[0] ? formatTime(todayList[0].publish_at) : null,
    };
  }, [posts]);

  return (
    <Div className="cp-soon-wrap">
      <div className="cp-soon">
        <button
          type="button"
          className={`cp-soon__chip${todayCount ? ' cp-soon__chip--hot' : ''}`}
          onClick={() => onOpenToday?.()}
        >
          <span className="cp-soon__label">Сегодня</span>
          <span className={`cp-soon__count${todayCount ? ' cp-soon__count--on' : ''}`}>
            {todayCount}
          </span>
          {nextTodayTime && (
            <span className="cp-soon__time">{nextTodayTime}</span>
          )}
        </button>
        <button
          type="button"
          className="cp-soon__chip"
          onClick={() => onOpenTomorrow?.()}
        >
          <span className="cp-soon__label">Завтра</span>
          <span className={`cp-soon__count${tomorrowCount ? ' cp-soon__count--on' : ''}`}>
            {tomorrowCount}
          </span>
        </button>
        <button
          type="button"
          className="cp-soon__chip cp-soon__chip--week"
          onClick={onOpenWeek}
        >
          Неделя
        </button>
      </div>
      <SyncBadge />
    </Div>
  );
}

function WeekPanelBody({ weekStart, posts, onOpenPost, onShiftWeek }) {
  const days = useMemo(() => {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = addDaysDate(weekStart, i);
      const dayPosts = (posts || [])
        .filter((p) => sameDay(new Date(p.publish_at), d))
        .sort((a, b) => String(a.publish_at).localeCompare(String(b.publish_at)));
      out.push({ date: d, posts: dayPosts });
    }
    return out;
  }, [weekStart, posts]);

  const total = days.reduce((n, d) => n + d.posts.length, 0);
  const end = addDaysDate(weekStart, 6);
  const rangeLabel = `${weekStart.getDate()}–${end.getDate()} ${MONTHS[end.getMonth()]}`;

  return (
    <div className="cp-form-block">
      <Group>
        <Div className="cp-week-nav">
          <button
            type="button"
            className="cp-week-nav__btn"
            onClick={() => onShiftWeek?.(-1)}
            aria-label="Предыдущая неделя"
          >
            ‹
          </button>
          <div className="cp-week-nav__label">
            <div className="cp-week-nav__title">Неделя</div>
            <div className="cp-week-nav__range">{rangeLabel}</div>
          </div>
          <button
            type="button"
            className="cp-week-nav__btn"
            onClick={() => onShiftWeek?.(1)}
            aria-label="Следующая неделя"
          >
            ›
          </button>
        </Div>
        <Div>
          <div className="cp-week-summary">
            {total
              ? `${total} публикац${total === 1 ? 'ия' : total < 5 ? 'ии' : 'ий'}`
              : 'На этой неделе пока пусто'}
          </div>
        </Div>
      </Group>
      {days.map(({ date, posts: dayPosts }) => {
        const today = sameDay(date, new Date());
        return (
          <Group
            key={dayKey(date.getFullYear(), date.getMonth(), date.getDate())}
            header={
              <Header mode="secondary">
                {dayLabelShort(date)}
                {today ? ' · сегодня' : ''}
              </Header>
            }
          >
            {dayPosts.length === 0 ? (
              <Div>
                <div className="cp-week-empty-day">Нет слотов</div>
              </Div>
            ) : (
              dayPosts.map((p) => {
                const meta = KIND_MAP[p.kind] || KIND_MAP.post;
                const done = p.reminded === 1 || p.placed === 1;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`cp-week-row${done ? ' cp-week-row--done' : ''}`}
                    onClick={() => onOpenPost?.(p)}
                  >
                    <span
                      className="cp-week-row__bar"
                      style={{ background: pillColor(p) }}
                    />
                    <span className="cp-week-row__time">
                      {formatTime(p.publish_at)}
                    </span>
                    <span className="cp-week-row__meta">
                      {meta.label}
                      <NetBadge network={p.network} size="sm" />
                    </span>
                    <span className="cp-week-row__text">
                      {(p.text || '').trim() || '(без текста)'}
                    </span>
                  </button>
                );
              })
            )}
          </Group>
        );
      })}
    </div>
  );
}

function NotifyBanner({ onEnabled }) {
  const [perm, setPerm] = useState(() => notificationSupport());
  const [busy, setBusy] = useState(false);
  if (perm !== 'default') return null;

  return (
    <Group>
      <Div className="cp-notify-banner">
        <div className="cp-notify-banner__text">
          Включить напоминания за час до публикации?
        </div>
        <Button
          size="s"
          mode="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const next = await requestNotificationPermission();
            setPerm(next);
            setBusy(false);
            if (next === 'granted') onEnabled?.();
          }}
        >
          Включить
        </Button>
      </Div>
    </Group>
  );
}

function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3ZM14 7l3 3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
      <rect
        x="3.5"
        y="5"
        width="17"
        height="15"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M3.5 10h17"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M8 3.5v3.5M16 3.5v3.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M9.5 15.5h5M12.5 13l2.5 2.5-2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
          <div
            key={w}
            className={`cp-weekday${w === 'Сб' || w === 'Вс' ? ' cp-weekday--weekend' : ''}`}
          >
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
          const weekend = idx % 7 >= 5;

          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              className={`cp-cell${todayCell ? ' cp-cell--today' : ''}${weekend ? ' cp-cell--weekend' : ''}${dropDay === day ? ' cp-cell--drop' : ''}`}
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

function DayPanelBody({ year, month, day, posts, onAdd, onEdit, onMove, onDelete }) {
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
                    <div className="cp-day-row__tools">
                      <NetBadge network={p.network || 'vk'} />
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
                      <button
                        type="button"
                        className="cp-icon-btn cp-icon-btn--danger"
                        title="Удалить"
                        aria-label="Удалить публикацию"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete?.(p);
                        }}
                      >
                        <IconTrash />
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

function PostFormBody({
  draft,
  onBack,
  onSaved,
  onDeleted,
  onPickTemplate,
  onSnack,
  categories,
}) {
  const themeList =
    categories?.length > 0 ? categories : DEFAULT_CATEGORIES;
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
  // create flow: null = pick source, 'template' | 'custom'
  const [contentMode, setContentMode] = useState(() => {
    if (isEdit) return 'custom';
    if (draft?.presetText) return 'template';
    return null;
  });

  useEffect(() => {
    if (draft?.presetText != null) {
      setText(draft.presetText);
      setContentMode('template');
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
    if (!text.trim()) {
      onSnack?.('Добавьте текст или выберите заготовку');
      return;
    }
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

  const startCustom = () => {
    setContentMode('custom');
    if (!text.trim()) setCategory('Другое');
  };

  const clearContent = () => {
    setText('');
    setCategory('Другое');
    setContentMode(null);
  };

  const placeholder =
    kind === 'clip'
      ? 'О чём клип?'
      : kind === 'story'
        ? 'О чём сторис?'
        : 'О чём пост?';

  const showContentEditor = isEdit || contentMode != null;
  const fromTemplate = !isEdit && contentMode === 'template';

  return (
    <div className="cp-form-block cp-post-form">
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
            <div className="cp-type-banner__net" aria-hidden="true">
              <NetBadge network={network} size="lg" />
            </div>
          </div>
        </Div>

        {isEdit && (
          <Div>
            <div className={`cp-placed-card${placed ? ' cp-placed-card--on' : ''}`}>
              <div className="cp-placed-row">
                <div className="cp-placed-row__text">
                  <div className="cp-placed-row__title">Размещена</div>
                  <div className="cp-placed-row__hint">
                    Отметьте после публикации в соцсети
                  </div>
                </div>
                <Switch
                  checked={placed}
                  onChange={(e) => setPlaced(e.target.checked)}
                />
              </div>
            </div>
          </Div>
        )}

        {!isEdit && contentMode == null && (
          <Div className="cp-post-source">
            <button
              type="button"
              className="cp-post-source__main"
              onClick={() => onPickTemplate?.()}
            >
              <span className="cp-post-source__ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M7 4h10a2 2 0 0 1 2 2v14l-3.2-2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 9h6M9 12.5h6"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="cp-post-source__title">Выбрать заготовку</span>
              <span className="cp-post-source__hint">
                Тематика и текст подтянутся автоматически
              </span>
            </button>
            <button
              type="button"
              className="cp-post-source__alt"
              onClick={startCustom}
            >
              Или написать свой текст
            </button>
          </Div>
        )}

        {showContentEditor && (
          <>
            {!isEdit && fromTemplate && (
              <Div className="cp-post-from">
                <span className="cp-post-from__pill">{category || 'Другое'}</span>
                <span className="cp-post-from__label">из заготовки</span>
                <button
                  type="button"
                  className="cp-post-from__change"
                  onClick={() => onPickTemplate?.()}
                >
                  Сменить
                </button>
              </Div>
            )}

            {(isEdit || contentMode === 'custom') && (
              <FormItem top="Тематика">
                <div className="cp-tpl-filter" role="listbox" aria-label="Тематика">
                  {themeList.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`cp-tpl-filter__item${category === c ? ' cp-tpl-filter__item--active' : ''}`}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </FormItem>
            )}

            <FormItem top={isEdit ? 'Текст' : fromTemplate ? 'Текст · можно подправить' : 'Текст'}>
              <div className="cp-text-toolbar">
                {!isEdit && (
                  <>
                    {contentMode === 'custom' && (
                      <Button size="s" mode="secondary" onClick={() => onPickTemplate?.()}>
                        Из заготовки
                      </Button>
                    )}
                    <Button size="s" mode="secondary" onClick={clearContent}>
                      Сбросить
                    </Button>
                  </>
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
          </>
        )}

        {(isEdit || showContentEditor) && (
          <>
            {!isEdit && (
              <>
                <FormItem top="Тип публикации">
                  <div className="cp-kind-pick" role="tablist" aria-label="Тип публикации">
                    {KINDS.map((k) => (
                      <button
                        key={k.value}
                        type="button"
                        role="tab"
                        aria-selected={kind === k.value}
                        className={`cp-kind-pick__item${kind === k.value ? ' cp-kind-pick__item--active' : ''}`}
                        style={
                          kind === k.value
                            ? { '--cp-kind-color': k.color }
                            : undefined
                        }
                        onClick={() => setKind(k.value)}
                      >
                        <span
                          className="cp-kind-pick__dot"
                          style={{ background: k.color }}
                          aria-hidden="true"
                        />
                        {k.label}
                      </button>
                    ))}
                  </div>
                </FormItem>

                <FormItem top="Соцсеть">
                  <div className="cp-net-pick">
                    {NETWORKS.map((n) => {
                      const active = network === n.value;
                      const isIg = n.value === 'instagram';
                      return (
                        <button
                          key={n.value}
                          type="button"
                          className={`cp-net-card cp-net-card--${isIg ? 'ig' : 'vk'}${active ? ' cp-net-card--active' : ''}`}
                          onClick={() => setNetwork(n.value)}
                        >
                          <span
                            className={`cp-net-card__icon cp-net-card__icon--${isIg ? 'ig' : 'vk'}`}
                          >
                            <NetIcon network={n.value} />
                          </span>
                          <span className="cp-net-card__label">{n.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </FormItem>
              </>
            )}

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
          </>
        )}
      </Group>

      {showContentEditor && (
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
              disabled={busy || !text.trim() || !datePart || !timePart}
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
      )}
    </div>
  );
}

function HistoryDetailBody({ entry, onSnack, onDeleted }) {
  const meta = KIND_MAP[entry.kind] || KIND_MAP.post;
  const net = NETWORK_MAP[entry.network] || NETWORK_MAP.vk;
  const [copyBusy, setCopyBusy] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/history/${entry.id}`, { method: 'DELETE' });
      onDeleted?.();
    } catch (e) {
      console.error(e);
      onSnack?.('Не удалось удалить');
    } finally {
      setBusy(false);
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
        <Div>
          <Button
            size="l"
            stretched
            mode="secondary"
            appearance="negative"
            disabled={busy}
            onClick={remove}
            before={
              <span className="cp-btn-ico" aria-hidden="true">
                <IconTrash />
              </span>
            }
          >
            Удалить из истории
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
  onAdd,
  onQuickDelete,
  onManageCategories,
  categories,
  posts,
  history,
}) {
  const [query, setQuery] = useState('');

  const cats = useMemo(() => {
    const base = categories?.length > 0 ? categories : DEFAULT_CATEGORIES;
    const extras = [];
    for (const t of templates) {
      const c = t.category || 'Другое';
      if (!base.includes(c) && !extras.includes(c)) extras.push(c);
    }
    return ['Все', ...base, ...extras];
  }, [templates, categories]);

  const filtered = useMemo(() => {
    let list =
      !category || category === 'Все'
        ? templates
        : templates.filter((t) => t.category === category);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          String(t.text || '')
            .toLowerCase()
            .includes(q) ||
          String(t.category || '')
            .toLowerCase()
            .includes(q)
      );
    }
    return list;
  }, [templates, category, query]);

  return (
    <div className="cp-form-block cp-templates">
      {!selectMode && (
        <Div>
          <button
            type="button"
            className="cp-add-tpl"
            onClick={() => onAdd?.()}
          >
            <span className="cp-add-tpl__ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="cp-add-tpl__label">Добавить заготовку</span>
          </button>
        </Div>
      )}
      <Div className="cp-templates__filters">
        <Input
          className="cp-tpl-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по тексту или тематике…"
          type="search"
        />
        <div className="cp-tpl-filter" role="tablist" aria-label="Тематика">
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              className={`cp-tpl-filter__item${category === c ? ' cp-tpl-filter__item--active' : ''}`}
              onClick={() => onCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        {!selectMode && (
          <button
            type="button"
            className="cp-cat-manage-link"
            onClick={() => onManageCategories?.()}
          >
            <span className="cp-cat-manage-link__ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="cp-cat-manage-link__text">Управление тематиками</span>
          </button>
        )}
      </Div>
      <Group>
        {filtered.length === 0 ? (
          <Placeholder
            header={query.trim() ? 'Ничего не найдено' : 'Нет заготовок'}
            action={
              !selectMode && !query.trim() ? (
                <Button size="m" mode="primary" onClick={() => onAdd?.()}>
                  Создать первую
                </Button>
              ) : null
            }
          >
            {query.trim()
              ? 'Попробуйте другой запрос или смените тематику'
              : selectMode
                ? 'В этой тематике пока пусто'
                : 'Создайте тексты по тематикам — они появятся здесь'}
          </Placeholder>
        ) : (
          filtered.map((t) => {
            const status = templateUsageStatus(t.text, posts, history);
            const statusLabel =
              status === 'placed'
                ? 'Размещена'
                : status === 'planned'
                  ? 'В плане'
                  : null;
            return (
              <div
                key={t.id}
                className={`cp-tpl-card${status === 'planned' ? ' cp-tpl-card--planned' : ''}${status === 'placed' ? ' cp-tpl-card--placed' : ''}`}
              >
                <button
                  type="button"
                  className="cp-tpl-card__main"
                  onClick={() => (selectMode ? onSelect(t) : onEdit(t))}
                >
                  <div className="cp-tpl-card__top">
                    <div className="cp-tpl-card__cat">{t.category}</div>
                    {statusLabel && (
                      <span
                        className={`cp-tpl-badge cp-tpl-badge--${status}`}
                      >
                        {statusLabel}
                      </span>
                    )}
                  </div>
                  <div
                    className={`cp-tpl-card__text${status === 'placed' ? ' cp-tpl-card__text--done' : ''}`}
                  >
                    {t.text}
                  </div>
                </button>
                {status === 'placed' && !selectMode && (
                  <button
                    type="button"
                    className="cp-icon-btn cp-icon-btn--danger"
                    aria-label="Удалить заготовку"
                    title="Удалить из заготовок"
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuickDelete?.(t);
                    }}
                  >
                    <IconTrash />
                  </button>
                )}
              </div>
            );
          })
        )}
      </Group>
    </div>
  );
}

function TemplateFormBody({ draft, onBack, onSaved, onDeleted, categories }) {
  const themeList =
    categories?.length > 0 ? categories : DEFAULT_CATEGORIES;
  const isEdit = Boolean(draft?.id);
  const [category, setCategory] = useState(draft?.category || 'Другое');
  const [text, setText] = useState(draft?.text || '');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

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
    setConfirmDel(false);
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
          <div className="cp-tpl-filter" role="listbox" aria-label="Тематика">
            {themeList.map((c) => (
              <button
                key={c}
                type="button"
                className={`cp-tpl-filter__item${category === c ? ' cp-tpl-filter__item--active' : ''}`}
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
              onClick={() => setConfirmDel(true)}
            >
              Удалить
            </Button>
          </Div>
        )}
      </Group>
      {confirmDel && (
        <ConfirmDialog
          title="Удалить заготовку?"
          message="Текст будет удалён безвозвратно."
          onCancel={() => setConfirmDel(false)}
          onConfirm={remove}
        />
      )}
    </div>
  );
}

function CategoriesManageBody({ categories, onChanged, onSnack }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCat, setConfirmCat] = useState(null);

  const add = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      await api('/api/categories', {
        method: 'POST',
        body: JSON.stringify({ name: n }),
      });
      setName('');
      onSnack?.('Тематика добавлена');
      onChanged?.();
    } catch (e) {
      console.error(e);
      onSnack?.(e?.message === 'already exists' ? 'Уже есть такая тематика' : 'Не удалось добавить');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (cat) => {
    setEditing(cat);
    setEditValue(cat);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    const to = editValue.trim();
    if (!editing || !to || busy) return;
    if (to === editing) {
      cancelEdit();
      return;
    }
    setBusy(true);
    try {
      await api('/api/categories', {
        method: 'PUT',
        body: JSON.stringify({ from: editing, to }),
      });
      cancelEdit();
      onSnack?.('Тематика изменена');
      onChanged?.();
    } catch (e) {
      console.error(e);
      onSnack?.(
        e?.message === 'already exists'
          ? 'Уже есть такая тематика'
          : 'Не удалось изменить'
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (cat) => {
    if (busy || cat === 'Другое') return;
    setConfirmCat(null);
    setBusy(true);
    try {
      await api(`/api/categories?name=${encodeURIComponent(cat)}`, {
        method: 'DELETE',
      });
      if (editing === cat) cancelEdit();
      onSnack?.('Тематика удалена');
      onChanged?.();
    } catch (e) {
      console.error(e);
      onSnack?.('Не удалось удалить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cp-form-block">
      <Group>
        <FormItem top="Новая тематика">
          <div className="cp-cat-add">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <Button
              size="m"
              mode="primary"
              disabled={busy || !name.trim()}
              onClick={add}
            >
              Добавить
            </Button>
          </div>
        </FormItem>
      </Group>
      <Group header={<Header mode="secondary">Тематики</Header>}>
        {(categories?.length ? categories : DEFAULT_CATEGORIES).map((c) => (
          <div key={c} className="cp-cat-row">
            {editing === c ? (
              <div className="cp-cat-row__edit">
                <Input
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveEdit();
                    } else if (e.key === 'Escape') {
                      cancelEdit();
                    }
                  }}
                />
                <Button
                  size="s"
                  mode="primary"
                  disabled={busy || !editValue.trim()}
                  onClick={saveEdit}
                >
                  Сохранить
                </Button>
                <Button size="s" mode="secondary" disabled={busy} onClick={cancelEdit}>
                  Отмена
                </Button>
              </div>
            ) : (
              <>
                <span className="cp-cat-row__name">{c}</span>
                <div className="cp-cat-row__actions">
                  <button
                    type="button"
                    className="cp-icon-btn"
                    aria-label="Изменить"
                    title="Изменить"
                    disabled={busy}
                    onClick={() => startEdit(c)}
                  >
                    <IconEdit />
                  </button>
                  <button
                    type="button"
                    className="cp-icon-btn cp-icon-btn--danger"
                    aria-label="Удалить"
                    title={
                      c === 'Другое'
                        ? '«Другое» нельзя удалить'
                        : 'Удалить тематику'
                    }
                    disabled={busy || c === 'Другое'}
                    onClick={() => setConfirmCat(c)}
                  >
                    <IconTrash />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </Group>
      <Div>
        <Footnote className="cp-cat-hint">
          При удалении посты и заготовки этой тематики перейдут в «Другое».
        </Footnote>
      </Div>
      {confirmCat && (
        <ConfirmDialog
          title={`Удалить «${confirmCat}»?`}
          message="Посты и заготовки этой тематики перейдут в «Другое»."
          onCancel={() => setConfirmCat(null)}
          onConfirm={() => remove(confirmCat)}
        />
      )}
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [posts, setPosts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [planPosts, setPlanPosts] = useState([]);
  const [activePanel, setActivePanel] = useState('main');
  const [dayFocus, setDayFocus] = useState(null);
  const [draft, setDraft] = useState(null);
  const [tplDraft, setTplDraft] = useState(null);
  const [tplCategory, setTplCategory] = useState('Все');
  const [tplSelectMode, setTplSelectMode] = useState(false);
  const [categories, setCategories] = useState(() => [...DEFAULT_CATEGORIES]);
  const [history, setHistory] = useState([]);
  const [snack, setSnack] = useState(null);
  const [movePost, setMovePost] = useState(null);
  const [historyFocus, setHistoryFocus] = useState(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [confirmTpl, setConfirmTpl] = useState(null);
  const planPostsRef = useRef(planPosts);

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

  const loadPlanPosts = useCallback(async () => {
    try {
      const data = await api(
        `/api/posts?from=${encodeURIComponent(PLAN_POSTS_FROM)}&to=${encodeURIComponent(PLAN_POSTS_TO)}`
      );
      setPlanPosts(data);
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

  const loadCategories = useCallback(async () => {
    try {
      const data = await api('/api/categories');
      if (Array.isArray(data) && data.length) {
        setCategories(data);
        setTplCategory((cur) =>
          cur === 'Все' || data.includes(cur) ? cur : 'Все'
        );
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    loadTemplates();
    loadPlanPosts();
    loadCategories();
  }, [loadTemplates, loadPlanPosts, loadCategories]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    planPostsRef.current = planPosts;
  }, [planPosts]);

  useEffect(() => {
    return startReminderLoop(() => planPostsRef.current);
  }, []);

  // Live updates: Firebase (all devices) or storage event (other tabs)
  useEffect(() => {
    const STATIC = import.meta.env.VITE_STATIC === 'true';
    if (STATIC) {
      return subscribeStore(() => {
        loadPosts();
        loadPlanPosts();
        loadTemplates();
        loadHistory();
        loadCategories();
      });
    }
    // Local Express API: poll so another open client sees changes
    const id = setInterval(() => {
      loadPosts();
      loadPlanPosts();
      if (activePanel === 'history' || activePanel === 'history-detail') {
        loadHistory();
      }
      if (
        activePanel === 'templates' ||
        activePanel === 'template-edit' ||
        activePanel === 'categories'
      ) {
        loadTemplates();
        loadCategories();
      }
    }, 4000);
    return () => clearInterval(id);
  }, [
    loadPosts,
    loadPlanPosts,
    loadTemplates,
    loadHistory,
    loadCategories,
    activePanel,
  ]);

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
    loadPlanPosts();
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
      await loadPlanPosts();
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

  const openTemplates = (selectMode = false) => {
    setTplSelectMode(selectMode);
    setTplCategory('Все');
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
    loadPlanPosts();
    loadHistory();
    setSnack('Сохранено');
  };

  const afterDelete = () => {
    loadPosts();
    loadPlanPosts();
    loadHistory();
    setSnack('Удалено');
  };

  const deletePostFromDay = async (p) => {
    try {
      await api(`/api/posts/${p.id}`, { method: 'DELETE' });
      afterDelete();
    } catch (e) {
      console.error(e);
      setSnack('Не удалось удалить');
    }
  };

  const quickDeleteTemplate = async (t) => {
    setConfirmTpl(t);
  };

  const confirmQuickDeleteTemplate = async () => {
    const t = confirmTpl;
    setConfirmTpl(null);
    if (!t) return;
    try {
      await api(`/api/templates/${t.id}`, { method: 'DELETE' });
      await loadTemplates();
      setSnack('Заготовка удалена');
    } catch (e) {
      console.error(e);
      setSnack('Не удалось удалить');
    }
  };

  const openFromUpcoming = (p) => {
    const d = new Date(p.publish_at);
    setCursor(startOfMonth(d));
    setDayFocus({
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getDate(),
    });
    setDraft({ post: p, returnTo: 'day' });
    setActivePanel('edit');
  };

  const openDayByOffset = (offsetDays) => {
    const base = new Date();
    const d = addDaysDate(
      new Date(base.getFullYear(), base.getMonth(), base.getDate()),
      offsetDays
    );
    setCursor(startOfMonth(d));
    setDayFocus({
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getDate(),
    });
    setActivePanel('day');
  };

  const openWeek = () => {
    setWeekStart(startOfWeek(new Date()));
    setActivePanel('week');
  };

  const deleteHistoryEntry = async (h) => {
    try {
      await api(`/api/history/${h.id}`, { method: 'DELETE' });
      await loadHistory();
      if (historyFocus?.id === h.id) {
        setHistoryFocus(null);
        setActivePanel('history');
      }
      setSnack('Удалено из истории');
    } catch (e) {
      console.error(e);
      setSnack('Не удалось удалить');
    }
  };

  const editTitle = draft?.post?.id ? 'Редактировать' : 'Новая публикация';

  const story =
    activePanel === 'history' || activePanel === 'history-detail'
      ? 'history'
      : activePanel === 'templates' ||
          activePanel === 'template-edit' ||
          activePanel === 'categories'
        ? 'templates'
        : 'main';

  const showTabbar =
    (activePanel === 'main' ||
      activePanel === 'history' ||
      (activePanel === 'templates' && !tplSelectMode)) &&
    !tplSelectMode;

  const mainPanel = ['main', 'day', 'edit', 'move', 'week'].includes(activePanel)
    ? activePanel
    : 'main';
  const historyPanel =
    activePanel === 'history-detail' ? 'history-detail' : 'history';
  const templatesPanel =
    activePanel === 'template-edit'
      ? 'template-edit'
      : activePanel === 'categories'
        ? 'categories'
        : 'templates';

  const afterCategoriesChanged = () => {
    loadCategories();
    loadTemplates();
    loadPlanPosts();
    loadPosts();
    loadHistory();
  };

  const goTab = (id) => {
    if (id === 'history') {
      setHistoryFocus(null);
      loadHistory();
    }
    if (id === 'templates') {
      setTplSelectMode(false);
      loadTemplates();
      loadCategories();
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
    <>
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
          <UpcomingStrip
            posts={planPosts}
            onOpenToday={() => openDayByOffset(0)}
            onOpenTomorrow={() => openDayByOffset(1)}
            onOpenWeek={openWeek}
          />
          <NotifyBanner onEnabled={() => setSnack('Напоминания включены')} />
          {snack && activePanel === 'main' && (
            <Snackbar onClose={() => setSnack(null)}>{snack}</Snackbar>
          )}
        </Panel>

        <Panel id="week">
          <PanelHeader
            before={<PanelHeaderBack onClick={() => setActivePanel('main')} />}
          >
            Неделя
          </PanelHeader>
          <WeekPanelBody
            weekStart={weekStart}
            posts={planPosts}
            onOpenPost={openFromUpcoming}
            onShiftWeek={(dir) =>
              setWeekStart((w) => addDaysDate(w, dir * 7))
            }
          />
          {snack && activePanel === 'week' && (
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
            onDelete={deletePostFromDay}
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
              categories={categories}
              onBack={backFromEdit}
              onSaved={afterSave}
              onDeleted={afterDelete}
              onPickTemplate={() => openTemplates(true)}
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
                  <div key={h.id} className="cp-tpl-card cp-history-card">
                    <button
                      type="button"
                      className="cp-tpl-card__main"
                      onClick={() => openHistoryDetail(h)}
                    >
                      <div className="cp-tpl-card__cat">
                        {meta.label} · {net.label} · {h.category || 'Другое'}
                      </div>
                      <div className="cp-tpl-card__text">
                        {h.text?.trim() || '(без текста)'}
                      </div>
                      <div className="cp-tpl-card__more">
                        {formatDateTime(h.placed_at)} · Открыть →
                      </div>
                    </button>
                    <button
                      type="button"
                      className="cp-icon-btn cp-icon-btn--danger"
                      aria-label="Удалить из истории"
                      title="Удалить из истории"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteHistoryEntry(h);
                      }}
                    >
                      <IconTrash />
                    </button>
                  </div>
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
              onDeleted={() => {
                loadHistory();
                setHistoryFocus(null);
                setActivePanel('history');
                setSnack('Удалено из истории');
              }}
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
            onAdd={() => openTplEdit(null)}
            onQuickDelete={quickDeleteTemplate}
            onManageCategories={() => setActivePanel('categories')}
            categories={categories}
            posts={planPosts}
            history={history}
          />
          {snack && activePanel === 'templates' && (
            <Snackbar onClose={() => setSnack(null)}>{snack}</Snackbar>
          )}
        </Panel>

        <Panel id="categories">
          <PanelHeader
            before={
              <PanelHeaderBack onClick={() => setActivePanel('templates')} />
            }
          >
            Тематики
          </PanelHeader>
          <CategoriesManageBody
            categories={categories}
            onChanged={afterCategoriesChanged}
            onSnack={setSnack}
          />
          {snack && activePanel === 'categories' && (
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
              categories={categories}
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
    {confirmTpl && (
      <ConfirmDialog
        title="Удалить заготовку?"
        message="Текст будет удалён безвозвратно."
        onCancel={() => setConfirmTpl(null)}
        onConfirm={confirmQuickDeleteTemplate}
      />
    )}
    </>
  );
}
