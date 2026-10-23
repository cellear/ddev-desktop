// Client for the ddev-desktop daemon. Every call here is an HTTP request to
// the Go process that serves this page; it is the only thing that runs
// `ddev`. Settings that DDEV has no notion of stay in localStorage.

export type SiteStatus = "running" | "stopped" | "paused" | string;

export interface Site {
  name: string;
  type: string; // drupal11, backdrop, php, ...
  status: SiteStatus;
  statusDesc: string;
  approot: string;
  shortroot: string;
  httpurl: string;
  httpsurl: string;
  primaryUrl: string;
  mailpitUrl: string;
  lastUsed: string; // ISO time of the last `ddev start`, or "" when unknown
  https: boolean; // page preference: which of the two URLs to show
}

export interface SiteDetails {
  phpVersion: string;
  database: string; // "mariadb 11.8 (db)"
  hasDatabase: boolean;
  webserver: string;
  web: SiteStatus;
  db: SiteStatus;
}

export type TerminalApp = "Terminal" | "iTerm2" | "Warp";

/**
 * Settings as the page sees them. The first group is the panel's own
 * (kept by the daemon in ~/.ddev-desktop/settings.json); the second is
 * DDEV's global config, read from and written through `ddev config global`.
 */
export interface Settings {
  startOnLaunch: boolean;
  stopOnQuit: boolean;
  verbose: boolean;
  terminal: TerminalApp;
  defaultPhp: string; // preselected for new sites; "" = DDEV's default
  httpPort: string;
  httpsPort: string;
  tld: string;
  activeHttpPort: string; // what the router listens on now ("" = nothing running)
  activeHttpsPort: string;
  globalConfigPath: string;
}

export interface SaveResult {
  settings: Settings;
  applied: string[]; // ddev config global flags that were run
  output: string[];
}

export interface JobInfo {
  id: string;
  title: string;
  name: string;
  label: string;
}

export interface JobResult {
  ok: boolean;
  error: string;
}

export type OnLine = (line: string) => void;

/** What the daemon reports about a folder and name before anything runs. */
export interface Check {
  approot: string;
  exists: boolean;
  is_dir: boolean;
  empty: boolean;
  has_ddev: boolean;
  ddev_name: string;
  ddev_type: string;
  name_taken: boolean;
  suggested_name: string;
  docroot: string;
  error?: string;
}

export interface CreateSpec {
  approot: string;
  name: string;
  type: string; // "" = let ddev detect
  php: string; // "" = DDEV default
  docroot: string;
  dump: string; // "" = none
  create: boolean; // fresh Drupal codebase with Composer
}

export interface Features {
  chooser: boolean;
  os: string;
}

/** PHP versions DDEV 1.25 offers. */
export const PHP_VERSIONS = ["7.4", "8.0", "8.1", "8.2", "8.3", "8.4", "8.5"];
/** Project types offered in the dialog (ddev config --project-type accepts more). */
export const PROJECT_TYPES = [
  "drupal11", "drupal10", "drupal7", "backdrop", "wordpress", "joomla", "php", "generic",
  "laravel", "symfony", "typo3", "craftcms",
];

/** Types "New site…" can build from scratch in an empty folder, and how (mirrors internal/api/recipes.go). */
export const CREATE_RECIPES: Record<string, string> = {
  drupal11: "a fresh Drupal 11 codebase installed with Composer (a few minutes)",
  drupal10: "a fresh Drupal 10 codebase installed with Composer (a few minutes)",
  wordpress: "the latest WordPress downloaded with WP-CLI (about a minute)",
  joomla: "the latest Joomla downloaded from joomla.org and unpacked",
};

export const DEFAULT_SETTINGS: Settings = {
  startOnLaunch: true,
  stopOnQuit: true,
  verbose: false,
  terminal: "Terminal",
  defaultPhp: "",
  httpPort: "80",
  httpsPort: "443",
  tld: "ddev.site",
  activeHttpPort: "",
  activeHttpsPort: "",
  globalConfigPath: "",
};

/** DDEV's own defaults for the Ports tab's "Revert to defaults". */
export const DDEV_DEFAULT_PORTS = { httpPort: "80", httpsPort: "443", tld: "ddev.site" };

const KEY_HTTPS = "ddev-desktop.https"; // { [name]: true }

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window etc.: the preference is simply not kept */
  }
}

export function siteUrl(site: Site, _settings?: Settings) {
  return site.https && site.httpsurl ? site.httpsurl : site.httpurl || site.primaryUrl;
}

/** Hostname shown in the sidebar, e.g. "dropsuite.ddev.site". */
export function siteHost(site: Site) {
  try {
    return new URL(site.primaryUrl || site.httpurl).hostname;
  } catch {
    return site.name;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const text = await res.text();
      try {
        const body = JSON.parse(text) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        if (text.trim()) message = text.trim();
      }
    } catch {
      /* keep the status text */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function post(path: string, body?: unknown): RequestInit & { method: string } {
  return body === undefined
    ? { method: "POST" }
    : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

const project = (name: string) => `/api/projects/${encodeURIComponent(name)}`;

interface ApiProject {
  name: string;
  status: string;
  status_desc: string;
  type: string;
  approot: string;
  shortroot: string;
  httpurl: string;
  httpsurl: string;
  primary_url: string;
  mailpit_url: string;
  last_used: string;
}

interface ApiDetails extends ApiProject {
  php_version: string;
  webserver_type: string;
  dbinfo: { database_type: string; database_version: string; dbname: string };
  services: Record<string, { status: string }>;
}

interface ApiSettings {
  panel: { default_php: string; terminal: TerminalApp; start_on_launch: boolean; stop_on_quit: boolean; verbose: boolean };
  global: { router_http_port: string; router_https_port: string; project_tld: string; active_http_port: string; active_https_port: string };
  files: { global_config: string };
}

function fromApiSettings(a: ApiSettings): Settings {
  return {
    startOnLaunch: a.panel.start_on_launch,
    stopOnQuit: a.panel.stop_on_quit,
    verbose: a.panel.verbose,
    terminal: a.panel.terminal,
    defaultPhp: a.panel.default_php,
    httpPort: a.global.router_http_port,
    httpsPort: a.global.router_https_port,
    tld: a.global.project_tld,
    activeHttpPort: a.global.active_http_port,
    activeHttpsPort: a.global.active_https_port,
    globalConfigPath: a.files.global_config,
  };
}

function toApiSettings(s: Settings): Omit<ApiSettings, "files"> {
  return {
    panel: { default_php: s.defaultPhp, terminal: s.terminal, start_on_launch: s.startOnLaunch, stop_on_quit: s.stopOnQuit, verbose: s.verbose },
    global: { router_http_port: s.httpPort, router_https_port: s.httpsPort, project_tld: s.tld, active_http_port: "", active_https_port: "" },
  };
}

/** Follows a job already running on the daemon until ddev exits; the whole log so far is replayed first. */
function attach(id: string, onLine: OnLine): Promise<JobResult> {
  return new Promise((resolve) => {
    const es = new EventSource(`/api/jobs/${id}/events`);
    es.addEventListener("line", (e) => onLine((e as MessageEvent<string>).data));
    es.addEventListener("exit", (e) => {
      es.close();
      resolve(JSON.parse((e as MessageEvent<string>).data) as JobResult);
    });
    es.onerror = () => {
      es.close();
      resolve({ ok: false, error: "lost the connection to ddev-desktop" });
    };
  });
}

/**
 * Starts a job on the daemon and follows its output until ddev exits. Each
 * output line is passed to onLine as it arrives.
 */
async function job(path: string, body: unknown, onLine: OnLine): Promise<JobResult> {
  let id: string;
  try {
    ({ job: id } = await api<{ job: string }>(path, post(path, body)));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  return attach(id, onLine);
}

export const ddev = {
  async list(): Promise<Site[]> {
    const { projects } = await api<{ projects: ApiProject[] }>("/api/projects");
    const https = read<Record<string, boolean>>(KEY_HTTPS, {});
    return projects.map((p) => ({
      name: p.name,
      type: p.type,
      status: p.status,
      statusDesc: p.status_desc,
      approot: p.approot,
      shortroot: p.shortroot,
      httpurl: p.httpurl,
      httpsurl: p.httpsurl,
      primaryUrl: p.primary_url,
      mailpitUrl: p.mailpit_url,
      lastUsed: p.last_used?.startsWith("0001") ? "" : p.last_used,
      https: https[p.name] ?? p.primary_url.startsWith("https"),
    }));
  },

  async describe(name: string): Promise<SiteDetails> {
    const d = await api<ApiDetails>(project(name));
    const db = d.dbinfo ?? { database_type: "", database_version: "", dbname: "" };
    return {
      phpVersion: d.php_version,
      hasDatabase: !!db.database_type,
      database: db.database_type
        ? `${db.database_type} ${db.database_version} (${db.dbname})`
        : "none (db container omitted)",
      webserver: d.webserver_type,
      web: d.services?.["web"]?.status ?? "stopped",
      db: d.services?.["db"]?.status ?? "stopped",
    };
  },

  setHttps(name: string, on: boolean) {
    const https = read<Record<string, boolean>>(KEY_HTTPS, {});
    https[name] = on;
    write(KEY_HTTPS, https);
  },

  async getSettings(): Promise<Settings> {
    return fromApiSettings(await api<ApiSettings>("/api/settings"));
  },
  /** Saves panel settings and runs `ddev config global` for changed global values. */
  async saveSettings(s: Settings): Promise<SaveResult> {
    const r = await api<{ settings: ApiSettings; applied: string[]; output: string[] }>("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toApiSettings(s)),
    });
    return { settings: fromApiSettings(r.settings), applied: r.applied ?? [], output: r.output ?? [] };
  },

  /** Jobs still running on the daemon (e.g. after a reload, or started at launch). */
  jobs: () => api<{ jobs: JobInfo[] }>("/api/jobs").then((r) => r.jobs),
  attach,

  /** Opens a configuration file in the default editor, or a configuration folder in the file manager. */
  edit: (what: "config" | "php" | "mysql" | "global", projectName = "") =>
    api<{ path: string }>("/api/edit", post("", { project: projectName, what })),

  /**
   * Follows `ddev logs -f` for a service. Returns a function that stops
   * following (which also ends the ddev process on the daemon).
   */
  followLogs(name: string, service: string, onLine: OnLine, onExit: (r: JobResult) => void): () => void {
    const es = new EventSource(`${project(name)}/logs?service=${encodeURIComponent(service)}&tail=200`);
    es.addEventListener("line", (e) => onLine((e as MessageEvent<string>).data));
    es.addEventListener("exit", (e) => {
      es.close();
      onExit(JSON.parse((e as MessageEvent<string>).data) as JobResult);
    });
    es.onerror = () => {
      es.close();
      onExit({ ok: false, error: "lost the connection to ddev-desktop" });
    };
    return () => es.close();
  },

  // Long-running commands: each returns when ddev exits.
  start: (name: string, onLine: OnLine) => job(`${project(name)}/start`, undefined, onLine),
  stop: (name: string, onLine: OnLine) => job(`${project(name)}/stop`, undefined, onLine),
  restart: (name: string, onLine: OnLine) => job(`${project(name)}/restart`, undefined, onLine),
  setPhp: (name: string, version: string, onLine: OnLine) =>
    job(`${project(name)}/php`, { version }, onLine),
  remove: (name: string, snapshot: boolean, onLine: OnLine) =>
    job(`${project(name)}/delete`, { snapshot }, onLine),

  // Creating and importing (sprint 3).
  features: () => api<Features>("/api/features"),
  check: (approot: string, name: string) =>
    api<Check>(`/api/check?approot=${encodeURIComponent(approot)}&name=${encodeURIComponent(name)}`),
  create: (spec: CreateSpec, onLine: OnLine) => job("/api/projects", spec, onLine),
  /** Native folder/file chooser (macOS); resolves to undefined when cancelled. */
  choose: (kind: "folder" | "file") => api<{ path: string } | undefined>("/api/choose", post("", { kind })),

  // Quick ones.
  revealCode: (name: string) => api<void>(`${project(name)}/reveal`, post("")),
  openTerminal: (name: string, app: TerminalApp) => api<void>(`${project(name)}/terminal`, post("", { app })),
  /** Download URL for a plain SQL dump; the project must be running. */
  exportUrl: (name: string) => `${project(name)}/export-db`,
};
