/**
 * Centralized state for Mission Control.
 * All mutable state lives here; modules read/write through this object.
 */

export interface ToolActivity {
	name: string;
	startedAt: number;
}

export type SessionStatus = "idle" | "working" | "unknown";

export interface PiSession {
	pid: number;
	cwd: string;
	cwdShort: string;
	sessionFile?: string;
	isActive: boolean;
	lastSeen: number;
	elapsed?: string;
	cpuPercent?: number;
	status: SessionStatus;
	statusDetail?: string; // e.g. "running bash" or "idle 2m"
}

export interface MissionControlState {
	// Session
	sessionStartTime: number;
	isRunning: boolean;
	turnCount: number;

	// Tool tracking
	activeTools: Map<string, ToolActivity>;
	toolCallCount: number;

	// Token tracking
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCost: number;

	// Context
	contextPercent: number | null;
	contextTokens: number | null;
	contextWindow: number;

	// Files
	modifiedFiles: Set<string>;

	// Git
	sawCommit: boolean;
	gitAdded: number;
	gitRemoved: number;
	gitDirty: boolean;

	// Other sessions
	otherSessions: PiSession[];

	// Visibility toggle
	enabled: boolean;

	// Activity panel
	activityPanelVisible: boolean;
}

export function createState(): MissionControlState {
	return {
		sessionStartTime: Date.now(),
		isRunning: false,
		turnCount: 0,
		activeTools: new Map(),
		toolCallCount: 0,
		totalInputTokens: 0,
		totalOutputTokens: 0,
		totalCost: 0,
		contextPercent: null,
		contextTokens: null,
		contextWindow: 0,
		modifiedFiles: new Set(),
		sawCommit: false,
		gitAdded: 0,
		gitRemoved: 0,
		gitDirty: false,
		otherSessions: [],
		enabled: true,
		activityPanelVisible: false,
	};
}
