import { Tabs } from '@base-ui/react/tabs';
import { Button } from '@base-ui/react/button';
import { useRef } from 'react';
import { APP } from './constants.js';

const STAT_ICON_OUTLINE = 'M12 4.99805C9.48178 4.99805 7.283 5.12616 5.73089 5.25202C4.65221 5.33949 3.81611 6.16352 3.72 7.23254C3.60607 8.4998 3.5 10.171 3.5 11.998C3.5 13.8251 3.60607 15.4963 3.72 16.76355C3.81611 17.83255 4.65221 18.6566 5.73089 18.7441C7.283 18.8699 9.48178 18.998 12 18.998C14.5185 18.998 16.7174 18.8699 18.2696 18.74405C19.3481 18.65655 20.184 17.8328 20.2801 16.76405C20.394 15.4973 20.5 13.82645 20.5 11.998C20.5 10.16965 20.394 8.49877 20.2801 7.23205C20.184 6.1633 19.3481 5.33952 18.2696 5.25205C16.7174 5.12618 14.5185 4.99805 12 4.99805zM5.60965 3.75693C7.19232 3.62859 9.43258 3.49805 12 3.49805C14.5677 3.49805 16.8081 3.62861 18.3908 3.75696C20.1881 3.90272 21.6118 5.29278 21.7741 7.09773C21.8909 8.3969 22 10.11405 22 11.998C22 13.88205 21.8909 15.5992 21.7741 16.8984C21.6118 18.7033 20.1881 20.09335 18.3908 20.23915C16.8081 20.3675 14.5677 20.498 12 20.498C9.43258 20.498 7.19232 20.3675 5.60965 20.2392C3.81206 20.0934 2.38831 18.70295 2.22603 16.8979C2.10918 15.5982 2 13.8808 2 11.998C2 10.1153 2.10918 8.39787 2.22603 7.09823C2.38831 5.29312 3.81206 3.90269 5.60965 3.75693z';
const STAT_ICON_DETAILS = {
  view: ["M14.7138 10.96875C15.50765 11.4271 15.50765 12.573 14.71375 13.0313L11.5362 14.8659C10.74235 15.3242 9.75 14.7513 9.75001 13.8346L9.75001 10.1655C9.75001 9.24881 10.74235 8.67587 11.5362 9.13422L14.7138 10.96875z"],
  danmaku: ["M15.875 10.75L9.875 10.75C9.46079 10.75 9.125 10.4142 9.125 10C9.125 9.58579 9.46079 9.25 9.875 9.25L15.875 9.25C16.2892 9.25 16.625 9.58579 16.625 10C16.625 10.4142 16.2892 10.75 15.875 10.75z","M17.375 14.75L11.375 14.75C10.9608 14.75 10.625 14.4142 10.625 14C10.625 13.5858 10.9608 13.25 11.375 13.25L17.375 13.25C17.7892 13.25 18.125 13.5858 18.125 14C18.125 14.4142 17.7892 14.75 17.375 14.75z","M7.875 10C7.875 10.4142 7.53921 10.75 7.125 10.75L6.625 10.75C6.21079 10.75 5.875 10.4142 5.875 10C5.875 9.58579 6.21079 9.25 6.625 9.25L7.125 9.25C7.53921 9.25 7.875 9.58579 7.875 10z","M9.375 14C9.375 14.4142 9.03921 14.75 8.625 14.75L8.125 14.75C7.71079 14.75 7.375 14.4142 7.375 14C7.375 13.5858 7.71079 13.25 8.125 13.25L8.625 13.25C9.03921 13.25 9.375 13.5858 9.375 14z"],
};

export function ContentSidebar({ kind, sections, active, onActivate, layout }) {
  const id = name => kind === 'home' ? `${APP}-${name}` : name;
  const pressedActiveTab = useRef(null);
  const watchLayout = layout === 'bottom';
  const panel = ({ key, label, hidden }) => {
    const visible = !hidden && (watchLayout || active === key);
    return <Tabs.Panel key={key} value={key} id={id(`${key}-panel`)} keepMounted hidden={!visible} inert={!visible} tabIndex={visible ? 0 : -1}
      role={watchLayout ? 'region' : 'tabpanel'} aria-label={watchLayout ? label : undefined} aria-labelledby={watchLayout ? undefined : id(`tab-${key}`)}
      data-active-panel={visible} className={`${APP}__comments-panel${key === 'comments' ? '' : ` ${APP}__comments-panel--list`}`}>
      {key === 'comments' ? <><div id={id('video-intro')} /><div id={id('comments-mount')} /></> : <>
        <h2 className={`${APP}__list-heading`}>{label}</h2>
        <div id={id(`${key}-list`)} className={`${APP}__playlist`} />
        <div id={id(`${key}-empty`)} className={`${APP}__playlist-empty`}>正在加载…</div>
      </>}
    </Tabs.Panel>;
  };
  return <Tabs.Root className={`${APP}__sidebar`} data-watch-layout={watchLayout} data-has-comments={!sections.find(section => section.key === 'comments')?.hidden} value={active} onValueChange={onActivate}>
    <div className={`${APP}__sidebar-heading`}>
    <Tabs.List className={`${APP}__comments-tabs`} aria-label="播放器内容" activateOnFocus>
      {sections.filter(section => !section.hidden).map(({ key, label }) => <Tabs.Tab key={key} value={key} id={id(`tab-${key}`)} className={`${APP}__comments-tab`} data-tab={key}
        onPointerDownCapture={() => { pressedActiveTab.current = active === key ? key : null; }}
        onKeyDownCapture={event => { if (event.key === 'Enter' || event.key === ' ') pressedActiveTab.current = active === key ? key : null; }}
        onClick={() => { if (pressedActiveTab.current === key) onActivate(key); pressedActiveTab.current = null; }}>{label}</Tabs.Tab>)}
    </Tabs.List>
    {kind === 'home' && <div id={id('sidebar-window-controls')} className={`${APP}__sidebar-window-controls`} />}
    </div>
    {panel(sections.find(section => section.key === 'comments'))}
    <div className={`${APP}__sidebar-lists`}>{sections.filter(section => section.key !== 'comments').map(panel)}</div>
  </Tabs.Root>;
}

export function Playlist({ rows, loading, appendLoading, onPlay, onToggle }) {
  if (loading) return <Skeletons count={6} />;
  return <>{rows.map((row) => row.section
    ? <div key={row.key} className={`${APP}__playlist-section-title`}>{row.section}</div>
    : <PlaylistCard key={row.key} {...row} onPlay={onPlay} onToggle={onToggle} />)}{appendLoading && <Skeletons count={3} />}</>;
}

function PlaylistCard({ card, source, selected, containsSelected, lastPlayed, expanded, hasChildren, depth = 0, stats, onPlay, onToggle }) {
  const classes = [`${APP}__playlist-card`];
  const compact = card.pageType === 'part';
  if (compact) classes.push(`${APP}__playlist-card--compact`);
  if (selected) classes.push(`${APP}--selected`);
  if (containsSelected) classes.push(`${APP}--contains-selected`);
  if (expanded) classes.push(`${APP}--expanded`);
  if (depth) classes.push(`${APP}__playlist-card--child`);
  if (hasChildren) classes.push(`${APP}__playlist-card--collapsible`);
  if (source === 'pages' && card.pageType) classes.push(`${APP}__playlist-card--${card.pageType}`);
  return <Button className={classes.join(' ')} title={card.title} aria-label={`${hasChildren ? (expanded ? '收起' : '展开') : '播放'}：${card.title}`} aria-current={selected ? 'true' : undefined} aria-expanded={hasChildren ? expanded : undefined}
    data-bvid={card.bvid || ''} data-aid={card.aid || ''} data-cid={card.cid || ''} data-page={card.page || ''} data-room-id={card.roomId || ''} data-page-key={card.pageKey || ''} data-key={card.playableKey || card.pageKey || card.bvid || ''} data-source={source}
    onClick={() => hasChildren ? onToggle(card) : onPlay(card)}>
    {!depth && !compact && <span className={`${APP}__playlist-cover`}>
      {card.cover && <img src={card.cover} alt="" loading="lazy" />}
      {lastPlayed && <span className={`${APP}__playlist-last-played`}>上次播放</span>}
      {card.duration && <span className={`${APP}__playlist-duration`}>{card.duration}</span>}
    </span>}
    <span className={`${APP}__playlist-info`}>
      <span className={`${APP}__playlist-title`}><span className={`${APP}__playlist-title-text`}>{(selected || containsSelected) && <PlayingIndicator />}{card.title || 'Bilibili 视频'}</span></span>
      {card.subtitle && !compact && <span className={`${APP}__playlist-subtitle`}>{card.subtitle}</span>}
      {(stats.view || stats.danmaku) && <span className={`${APP}__playlist-stats`}>{stats.view && <PlaylistStat type="view" value={stats.view} />}{stats.danmaku && <PlaylistStat type="danmaku" value={stats.danmaku} />}</span>}
    </span>
    {(depth > 0 || compact) && card.duration && <span className={`${APP}__playlist-inline-duration`}>{card.duration}</span>}
    {hasChildren && <span className={`${APP}__playlist-toggle`}><span className={`${APP}__playlist-toggle-icon`} /></span>}
  </Button>;
}

function PlaylistStat({ type, value }) {
  const label = type === 'danmaku' ? '弹幕' : '播放';
  return <span className={`${APP}__playlist-stat ${APP}__playlist-stat--${type}`} title={`${label}：${value}`}>
    <svg className={`${APP}__playlist-stat-icon`} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={STAT_ICON_OUTLINE} />
      {STAT_ICON_DETAILS[type].map((path, index) => <path key={index} d={path} />)}
    </svg>
    {value}
  </span>;
}

function PlayingIndicator() {
  return <svg className={`${APP}__playing-bars`} width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <rect x="1" y="5" width="3" height="10" rx="1" />
    <rect x="6.5" y="1" width="3" height="14" rx="1" />
    <rect x="12" y="7" width="3" height="8" rx="1" />
  </svg>;
}

function Skeletons({ count }) {
  return Array.from({ length: count }, (_, index) => <div key={index} className={`${APP}__playlist-card ${APP}__playlist-card--skeleton`} aria-hidden="true"><div className={`${APP}__playlist-skeleton-cover`} /><div className={`${APP}__playlist-skeleton-info`}>{[92, 72, 45].map((width, i) => <span key={width} className={`${APP}__playlist-skeleton-line ${i === 0 ? `${APP}__playlist-skeleton-line--title` : ''}`} style={{ width: `${width}%` }} />)}</div></div>);
}
