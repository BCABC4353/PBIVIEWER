// ============================================
// USER & AUTH TYPES
// ============================================

export interface UserInfo {
  id: string;
  displayName: string;
  email: string;
  profilePicture?: string;
}

export interface AuthResult {
  success: boolean;
  user?: UserInfo;
  error?: string;
}

// ============================================
// POWER BI TYPES
// ============================================

export interface Workspace {
  id: string;
  name: string;
  isReadOnly: boolean;
  type: 'Workspace' | 'PersonalGroup';
}

export interface Report {
  id: string;
  name: string;
  workspaceId: string;
  embedUrl: string;
  datasetId: string;
  reportType: 'PowerBIReport' | 'PaginatedReport';
}

export interface Dashboard {
  id: string;
  name: string;
  workspaceId: string;
  embedUrl: string;
  isReadOnly: boolean;
}

export interface App {
  id: string;
  name: string;
  description?: string;
  publishedBy: string;
  lastUpdate: string;
  workspaceId?: string;
}

export interface ContentItem {
  id: string;
  name: string;
  type: 'report' | 'dashboard';
  workspaceId: string;
  workspaceName: string;
  thumbnailUrl?: string;
  lastAccessed?: string;
  lastOpened?: string; // ISO date string
  openCount?: number;
}

export interface EmbedToken {
  token: string;
  tokenId: string;
  expiration: string;
}

export interface DatasetRefreshInfo {
  lastRefreshTime?: string; // ISO date string
  lastRefreshStatus?: 'Unknown' | 'Completed' | 'Failed' | 'Disabled';
}

// ============================================
// PRESENTATION TYPES
// ============================================

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface Stroke {
  points: Point[];
  color: string;
  size: number;
}

export interface Annotation {
  id: string;
  pageIndex: number;
  strokes: Stroke[];
  createdAt: string;
}

// ============================================
// IPC TYPES
// ============================================

export interface IPCResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// ============================================
// APP SETTINGS TYPES
// ============================================

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  slideshowInterval: number;
  slideshowMode: 'pages' | 'bookmarks' | 'both';
  autoStartSlideshow: boolean;
  autoStartReportId?: string;
  autoRefreshEnabled: boolean;
  autoRefreshInterval: number; // in minutes (1-60)
}
