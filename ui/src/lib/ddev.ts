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
  https: boolean; // page preference: which of the two URLs to show
}

export interface SiteDetails {
  phpVersion: string;
  database: string; // "mariadb 11.8 (db)"
  webserver: string;
  web: SiteStatus;
  db: SiteStatus;
}

export interface Settings {
  startOnLaunch: boolean;
  stopOnQuit: boolean;
  verbose: boolean;
  terminal: "Terminal" | "iTerm2" | "Warp";
  httpPort: number;
  httpsPort: number;
  defaultPhp: string;
  tld: string;
}

export type Action = "start" | "stop" | "restart";

export interface JobResult {
  ok: boolean;
  error: string;
}

export const PHP_VERSIONS = ["8.1", "8.2", "8.3", "8.4", "8.5"];
export const PROJECT_TYPES = ["drupal11", "drupal10", "drupal7", "backdrop", "wordpress", "php"];

export const DEFAULT_SETTINGS: Settings = {
  startOnLaunch: true,
  stopOnQuit: true,
  verbose: false,
  terminal: "Terminal",
  httpPort: 80,
  httpsPort: 443,
  defaultPhp: "8.3",
  tld: "ddev.site",
};

const KEY_SETTINGS = "ddev-desktop.settings";
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
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

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
}

interface ApiDetails extends ApiProject {
  php_version: string;
  webserver_type: string;
  dbinfo: { database_type: string; database_version: string; dbname: string };
  services: Record<string, { status: string }>;
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
      https: https[p.name] ?? p.primary_url.startsWith("https"),
    }));
  },

  async describe(name: string): Promise<SiteDetails> {
    const d = await api<ApiDetails>(`/api/projects/${encodeURIComponent(name)}`);
    const db = d.dbinfo ?? { database_type: "", database_version: "", dbname: "" };
    return {
      phpVersion: d.php_version,
      database: db.database_type ? `${db.database_type} ${db.database_version} (${db.dbname})` : "none (db container omitted)",
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
    return { ...DEFAULT_SETTINGS, ...read(KEY_SETTINGS, {}) };
  },
  async saveSettings(s: Settings) {
    write(KEY_SETTINGS, s);
  },

  /**
   * Runs `ddev <action> <name>` on the daemon. Each output line is passed to
   * onLine as it arrives; the promise resolves when ddev exits.
   */
  async run(name: string, action: Action, onLine: (line: string) => void): Promise<JobResult> {
    const { job } = await api<{ job: string }>(
      `/api/projects/${encodeURIComponent(name)}/${action}`,
      { method: "POST" },
    );
    return new Promise((resolve) => {
      const es = new EventSource(`/api/jobs/${job}/events`);
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
  },
};
