import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text, visibleWidth } from "@mariozechner/pi-tui";
import os from "node:os";
import path from "node:path";
import { promises as fsp, createReadStream, type Dirent } from "node:fs";
import readline from "node:readline";

type Scope = "project" | "all";
type Rarity = "common" | "uncommon" | "rare" | "legendary";
type Mode = "quiet" | "normal" | "chaotic";
type StatKey = "debugging" | "patience" | "chaos" | "wisdom" | "snark";
type ArcName = "Saiyan Saga" | "Namek Saga" | "Cell Saga";
type QuestKind = "fix-lint" | "write-failing-test" | "pass-test-streak" | "surgical-edits" | "grep-read";

interface Fighter {
  id: string;
  name: string;
  rarity: Rarity;
  alignment: "hero" | "villain";
  forms: string[];
  tagline: string;
}

interface Insights {
  sessions: number;
  userMessages: number;
  assistantMessages: number;
  toolResults: number;
  toolErrors: number;
  tokens: number;
  cost: number;
  activeDays: number;
  dayKeys: Set<string>;
  firstTs: number | null;
  lastTs: number | null;
  tools: Map<string, number>;
}

interface HarnessSpinOptions {
  mode: "profile" | "pet" | "intro" | "error" | "power";
  toolName?: string;
  topTool?: string;
  errorCount?: number;
}

interface QuestState {
  id: string;
  kind: QuestKind;
  text: string;
  progress: number;
  target: number;
  rewardMood: number;
  rewardEnergy: number;
  completed: boolean;
}

interface BuddyProfile {
  fighter: Fighter;
  quote: string;
  harnessSpin: string;
  stats: Record<StatKey, number>;
  topTools: Array<{ tool: string; count: number }>;
}

interface BuddyState {
  enabled: boolean;
  animations: boolean;
  mode: Mode;
  mood: number;
  affection: number;
  energy: number;
  scope: Scope;
  frame: number;
  chosenFighterId?: string;
  lockedFighterId?: string;
  profile?: BuddyProfile;
  lastChimeAt: number;
  lastPowerLevelBucket: number;
  arc: ArcName;
  rage: number;
  berserkCharges: number;
  contextTokens: number;
  scouterFailingTests: number | null;
  testPassStreak: number;
  successfulEdits: number;
  sawLintFailure: boolean;
  sawTestFailure: boolean;
  recentTools: string[];
  enemyOfDay: string;
  failureByTool: Record<string, number>;
  quest?: QuestState;
}

interface PersistedBuddyState {
  enabled?: boolean;
  animations?: boolean;
  mode?: Mode;
  mood?: number;
  affection?: number;
  energy?: number;
  scope?: Scope;
  frame?: number;
  chosenFighterId?: string;
  lockedFighterId?: string;
  lastPowerLevelBucket?: number;
  arc?: ArcName;
  rage?: number;
  berserkCharges?: number;
  contextTokens?: number;
  scouterFailingTests?: number | null;
  testPassStreak?: number;
  successfulEdits?: number;
  sawLintFailure?: boolean;
  sawTestFailure?: boolean;
  recentTools?: string[];
  enemyOfDay?: string;
  failureByTool?: Record<string, number>;
  quest?: QuestState;
}

const SESSION_ROOT = path.join(os.homedir(), ".pi", "agent", "sessions");
const MAX_FILES = 500;
const MAX_DAYS = 180;
const WIDGET_KEY = "dbz-buddy-widget";
const STATUS_KEY = "dbz-buddy-status";
const CACHE_TTL_MS = 5 * 60 * 1000;

const RARITY_SCORE: Record<Rarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  legendary: 4,
};

const FIGHTERS: Fighter[] = [
  { id: "goku", name: "Goku", rarity: "common", alignment: "hero", forms: ["Base", "SSJ", "SSGSS"], tagline: "finds one more level when CI turns red" },
  { id: "vegeta", name: "Vegeta", rarity: "uncommon", alignment: "hero", forms: ["Base", "SSJ", "Ultra Ego"], tagline: "competes with your previous commit and wins" },
  { id: "gohan", name: "Gohan", rarity: "common", alignment: "hero", forms: ["Base", "Ultimate", "Beast"], tagline: "looks calm until the bug hurts someone" },
  { id: "piccolo", name: "Piccolo", rarity: "uncommon", alignment: "hero", forms: ["Base", "Orange"], tagline: "trains your architecture in silence" },
  { id: "trunks", name: "Trunks", rarity: "common", alignment: "hero", forms: ["Base", "SSJ", "Rage"], tagline: "time-travels to warn you before regressions" },
  { id: "gotenks", name: "Gotenks", rarity: "rare", alignment: "hero", forms: ["Base", "SSJ3"], tagline: "chaotic refactors, surprisingly effective" },
  { id: "krillin", name: "Krillin", rarity: "common", alignment: "hero", forms: ["Base"], tagline: "small commits, giant survival instincts" },
  { id: "roshi", name: "Master Roshi", rarity: "rare", alignment: "hero", forms: ["Base", "Max Power"], tagline: "old-school wisdom with weird confidence" },
  { id: "yamcha", name: "Yamcha", rarity: "common", alignment: "hero", forms: ["Base"], tagline: "still shows up after every production crater" },
  { id: "tien", name: "Tien", rarity: "uncommon", alignment: "hero", forms: ["Base"], tagline: "disciplined, direct, and terminally focused" },
  { id: "android18", name: "Android 18", rarity: "rare", alignment: "hero", forms: ["Base"], tagline: "cool-headed, precise, and expensive to ignore" },
  { id: "frieza", name: "Frieza", rarity: "rare", alignment: "villain", forms: ["Final", "Golden", "Black"], tagline: "politely insults your exception handling" },
  { id: "cell", name: "Cell", rarity: "rare", alignment: "villain", forms: ["Imperfect", "Perfect"], tagline: "absorbs every anti-pattern into one boss bug" },
  { id: "buu", name: "Majin Buu", rarity: "uncommon", alignment: "villain", forms: ["Fat", "Super", "Kid"], tagline: "turns your TODO list into candy and chaos" },
  { id: "broly", name: "Broly", rarity: "legendary", alignment: "hero", forms: ["Base", "LSSJ"], tagline: "rage-compiles through impossible deadlines" },
  { id: "beerus", name: "Beerus", rarity: "legendary", alignment: "villain", forms: ["God"], tagline: "deletes dead code with divine indifference" },
  { id: "whis", name: "Whis", rarity: "legendary", alignment: "hero", forms: ["Angel"], tagline: "rewinds one bad decision per sprint" },
  { id: "future-trunks", name: "Future Trunks", rarity: "rare", alignment: "hero", forms: ["Base", "SSJ"], tagline: "arrives from tomorrow with actionable warnings" },
];

const FANDOM_PERSONALITY: Record<string, string> = {
  goku: "Battle-loving but pure-hearted Saiyan raised on Earth.",
  vegeta: "Proud Saiyan prince driven by rivalry and personal growth.",
  gohan: "Gentle scholar-warrior who powers up to protect loved ones.",
  piccolo: "Stoic strategist and mentor with disciplined combat focus.",
  trunks: "Confident prodigy with a practical streak and sharp instincts.",
  gotenks: "Dramatic, arrogant fusion with explosive confidence.",
  krillin: "Resourceful human martial artist; brave under pressure.",
  roshi: "Eccentric master who mixes discipline, peace, and battle wisdom.",
  yamcha: "Bold fighter with grit, humor, and persistent comeback energy.",
  tien: "Disciplined ascetic seeking atonement through relentless training.",
  android18: "Cool-headed, blunt, efficient, and hard to rattle.",
  frieza: "Imperious tyrant: composed cruelty with theatrical menace.",
  cell: "Perfection-obsessed bio-android with calculated sadism.",
  buu: "Childlike unpredictability that flips between playful and destructive.",
  broly: "Overwhelming force with intense rage and raw battle instinct.",
  beerus: "Capricious God of Destruction guided by whim and appetite.",
  whis: "Unflappable angelic attendant with playful, surgical precision.",
  "future-trunks": "Trauma-hardened protector fueled by urgency and duty.",
};

const FANDOM_QUOTES: Record<string, string[]> = {
  goku: [
    "No, see, I don't think of it like I'm saving the world. The fact is, it's because I'm usually trying to challenge the strongest warriors I can find.",
    "No, see, I don't think of it like I'm fixing the build. The fact is, I'm usually trying to grep the gnarliest stack traces I can find.",
    "I'm not afraid of segfaults. Every crash just makes me want to debug harder!",
    "Hey, this codebase looks really strong! Let me fight it at full power — no linter training wheels!",
    "I've never met a merge conflict I didn't want to resolve by hand. Where's the fun in auto-merge?",
    "Don't worry, I'll just keep pushing commits until I get it right. That's the Saiyan way!",
  ],
  vegeta: [
    "Fine, Kakarot, you are the mightiest Saiyan, I've admitted that much. At least for now.",
    "Fine, Copilot, you are the mightiest autocomplete. I've admitted that much. At least until I finish my vim macros.",
    "I am the prince of all pull requests! I will NOT have my code reviewed by a mere junior!",
    "While you were sleeping, I was writing unit tests. That's the difference between us.",
    "You think your O(n²) can challenge my O(log n)? Know your place, amateur.",
    "I don't need a debugger. The code bends to MY will, not the other way around.",
  ],
  gohan: [
    "In order to protect those important to me, I need to get more and more powerful.",
    "In order to protect the main branch, I need to write more and more tests.",
    "I-I know I'm not as good at refactoring as dad, but when prod goes down, something inside me just... snaps.",
    "I'd rather be studying the docs, but someone has to handle these critical bugs.",
    "Please... don't make me force-push. You won't like what happens when I force-push.",
    "Father would just rewrite the whole thing, but I believe in incremental improvements!",
  ],
  piccolo: [
    "It's ironic, isn't it? After all my years of training to defeat your father, I go out like this trying to save you; his son.",
    "It's ironic, isn't it? After mass refactoring the entire codebase, I go out like this trying to save you from a one-line typo.",
    "Dodge! ...the deprecated API. I won't tell you again.",
    "I've meditated on this stack trace for three days. The bug is in line 42. It's always line 42.",
    "Stop relying on me to review your PRs and learn to read your own diffs.",
    "I fused with the CI pipeline. Its knowledge is now mine. All tests pass.",
  ],
  trunks: [
    "Just one problem... you're nowhere strong enough for my best shot.",
    "Just one problem... your test suite is nowhere strong enough for my edge cases.",
    "I came back from a future where nobody wrote types. Trust me, you want TypeScript.",
    "In my timeline, we mass deleted node_modules and never recovered. Don't repeat our mistakes.",
    "This build might scare the others, but I've seen the codebase after ten years of tech debt. Nothing scares me.",
    "I already know this PR fails. I've seen it in the CI logs of the future.",
  ],
  gotenks: [
    "Buu is nothing, I will bring him back. Dead.",
    "This bug is nothing. I'll bring the fix back. Merged.",
    "Ha! I bet I can rewrite this entire service in one Fusion-powered commit! Watch me!",
    "Super Ghost Kamikaze Attack! ...that's what I call my approach to hotfixes.",
    "Don't bother reviewing my code. It's already perfect. I'm a prodigy, remember?",
    "I fused two microservices into one and it's TWICE as powerful! ...and twice as unstable.",
  ],
  krillin: [
    "I heard Master Roshi's training was difficult, but I haven't even broken a sweat yet.",
    "I heard learning Rust was difficult, but I haven't even hit a borrow checker error yet.",
    "Look, I know I'm not the strongest dev on the team, but I always show up when prod is down.",
    "Sure, I get killed in every code review, but I keep coming back. That's my thing.",
    "Everyone underestimates the util functions. But who do they call when they need a helper? Me.",
    "I may not write the flashiest code, but my functions have never crashed in production. ...Well, once.",
  ],
  roshi: [
    "Work hard, study well, and eat and sleep plenty! That is the Turtle Hermit way!",
    "Write tests, read docs, and close your laptop at 5pm! That is the Senior Engineer way!",
    "Back in my day, we deployed with FTP and we LIKED it.",
    "A hundred push-ups, a hundred sit-ups, and a hundred lines of code every single day!",
    "Young people these days, always reaching for npm packages. In my time, we wrote our own left-pad!",
    "The secret to good code isn't talent — it's surviving enough outages to know what NOT to do.",
  ],
  yamcha: [
    "Let me have a crack at 'em. I think it's time I show these thugs no one comes to Earth and pushes us around.",
    "Let me have a crack at this bug. I think it's time I show these errors no one pushes to main and breaks the build.",
    "I've been training in a new framework all year! This time will be different, I swear!",
    "W-wait, the deployment already happened? Without me? ...Again?",
    "I'll handle the database migration! ...Actually, maybe someone should pair with me on this one.",
    "I used to be the strongest on the team. Then the 10x engineers showed up.",
  ],
  tien: [
    "This is about atonement. And I only hope it's enough.",
    "This hotfix is about atonement. And I only hope it's enough to save the sprint.",
    "I'll hold off this production fire with everything I've got. The rest of you, ship the real fix!",
    "My third eye sees all: race conditions, memory leaks, and unclosed database connections.",
    "I trained alone in the mountains for a year. By which I mean I read the entire Kubernetes docs.",
    "I don't need fancy tools. Give me printf and I'll find any bug.",
  ],
  android18: [
    "Whoever owns these clothes should have their optic sensors adjusted. They are obviously malfunctioning.",
    "Whoever wrote this config file should have their linter adjusted. It is obviously malfunctioning.",
    "I didn't ask for your code review. I already know it's correct.",
    "You expect me to be impressed by your deployment pipeline? It's adequate. Barely.",
    "I was programmed with every design pattern in existence. Your singleton disgusts me.",
    "Krillin wrote this function? ...It's actually not terrible. Don't tell him I said that.",
  ],
  frieza: [
    "I doubt I need an introduction, but just in case, I am the mighty Frieza, and yes, all the horrible stories you've heard are true.",
    "I doubt I need an introduction, but just in case, I am the mighty Tech Lead, and yes, all the horrible legacy code you've heard about is true.",
    "You may have fixed the bug, but I have three more transformations of technical debt you haven't seen yet.",
    "Mono-repo? Multi-repo? It doesn't matter. I will rule them ALL.",
    "I can destroy your entire deployment with a single misplaced environment variable. And I WILL.",
    "Oh, you thought deleting that microservice would stop me? I've already respawned in the staging cluster.",
  ],
  cell: [
    "You see, I'm perfect, my strength is perfect, and with that I shall bring equally perfect destruction.",
    "You see, my test coverage is perfect, my types are perfect, and with that I shall bring equally perfect deployments.",
    "I've absorbed every framework, every language, every paradigm. I am the ultimate full-stack being.",
    "Each pull request I merge makes me more complete. Soon, I will achieve my Perfect Form.",
    "I contain the DNA of every engineer on this team. Your coding style is already part of me.",
    "Why do you resist? I am the inevitable convergence of all your microservices into one perfect monolith.",
  ],
  buu: [
    "So, do you want to be candy, cookie, or pudding when Buu eats you?",
    "So, do you want your service to be YAML, TOML, or JSON when Buu configs you?",
    "Buu turn your REST API into GraphQL! You not like it? Too bad!",
    "Buu no understand your architecture diagram. Buu make new one. With crayons.",
    "You make Buu angry! Buu mass delete node_modules! ALL of them!",
    "Buu absorb your CI pipeline. Now Buu deploy whenever Buu want!",
  ],
  broly: [
    "If you'd just let me kill you all before, you wouldn't be dealing with this pain now.",
    "If you'd just let me mass rewrite the codebase before, you wouldn't be dealing with this tech debt now.",
    "RAAAAGH! WHO WROTE THIS CALLBACK HELL?! I'LL DESTROY EVERY LAST NESTED PROMISE!",
    "My power level keeps rising with every flaky test! YOU CAN'T STOP ME!",
    "I don't do incremental refactors. I rewrite. Everything. From scratch. NOW.",
    "The more spaghetti code I see, the angrier I get. And you do NOT want to see me angry.",
  ],
  beerus: [
    "Before any creation must come destruction!",
    "Before any refactor must come mass deletion!",
    "I'll allow this codebase to exist for now. But if the next deploy fails, I'm mass deleting the repo.",
    "Wake me when the build passes. And it BETTER pass.",
    "I am a God of Destruction. Your sprint backlog means nothing to me.",
    "This code displeases me. I shall mass archive this repository and start over.",
  ],
  whis: [
    "I'm simply the life form that's known as Whis! At the moment, it's my job to look after Lord Beerus.",
    "I'm simply the process known as the daemon. At the moment, it's my job to look after Lord Server.",
    "If you'd rewind time three commits, you'd see exactly where you introduced the regression. Shall I?",
    "I could fix this in an instant, but where would the learning be in that?",
    "My, my. You've managed to crash production again. Shall I prepare the post-mortem template?",
    "I observe all deployments across all environments simultaneously. Nothing escapes my monitoring.",
  ],
  "future-trunks": [
    "You hate the fact that you're powerless to stop me. That you're completely outmatched.",
    "You hate the fact that you're powerless to stop the mass migration. That your legacy system is completely outmatched.",
    "In my timeline, we mass adopted microservices without understanding them. Millions of services were lost.",
    "I've seen what happens when you skip database backups. I won't let that future come to pass!",
    "This isn't just a PR — it's a message from the future. Merge it, or everything burns.",
    "I carry the scars of mass deployments gone wrong. That's why I always test in staging first.",
  ],
};

const ENEMY_ALIAS: Record<string, string> = {
  bash: "Nappa Shell",
  edit: "Captain Patchinyu",
  write: "Majin Overwrite",
  read: "Invisible File Phantom",
  grep: "Scouter Noise Demon",
  find: "Lost Path Android",
  webfetch: "Namek Latency Beast",
  websearch: "Misinformation Frieza",
  surf: "Browser Buu",
};

const CHARACTER_HEADS: Record<string, string[]> = {
  goku: [
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⣦⡀⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⢀⣤⣴⣶⣶⣶⣶⣤⡀⠀⡻⣷⡄⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⢀⠀⡀⠈⠙⢟⡿⣿⣿⣿⣶⣼⣿⣷⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠁⠁⠂⠙⣾⣿⣿⣿⣿⣿⣿⣶⣤⠀⠀⠠⠄⠂⠂⠂⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⢀⡴⣲⢿⣿⣿⣿⣿⢿⣿⠟⣿⣿⣿⣷⣿⣾⣾⣷⣿⠾⠚⠚⠀⠀⠀⠀",
    "⠀⠀⠀⢀⣴⣷⣿⣿⣿⣿⣿⣧⡟⡟⠣⠀⡽⠈⡿⠿⣿⣶⣯⣯⣶⣦⣤⣀⡀⠀⠀⠀",
    "⠀⠀⠀⠉⠁⠀⠀⠀⢈⣩⣿⡯⢗⢁⡘⣀⠚⠤⠁⡎⣹⣿⠿⠛⠛⠉⠉⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠰⠚⠛⠛⠟⠷⠜⢤⠐⠎⡠⢃⠴⠚⠛⠛⠛⠛⠑⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⡤⣄⠆⢙⠒⢒⢑⡁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⣀⣤⣖⡙⡅⡣⡓⡕⣦⣌⣎⣈⠎⢍⣻⡹⣔⠦⢄⡀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⡰⠟⢓⢯⣟⣶⡱⡑⡍⢎⢻⣽⢯⣿⣻⣽⡇⣷⠱⡑⣧⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⢀⠊⡠⢁⢜⠢⠙⡷⣿⢕⢱⠡⡣⡙⡿⣾⣳⣯⢇⠧⡑⣽⢟⡁⠀⠀⠀⠀⠀⠀",
  ],
  vegeta: [
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⣿⣕⢤⣰⣄⠀⢀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢠⣿⣿⣿⣿⣿⣿⣿⣾⣆⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⡖⣿⣿⣿⣿⣿⣿⣿⡽⣿⡇⣠⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⣾⣿⣿⣿⣿⣿⣿⡇⣿⢼⣷⠄⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠐⣼⣿⣿⣿⡟⡛⠻⣿⣿⡗⢯⣿⠇⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢘⣿⣟⢻⣅⡊⠠⢹⠏⠀⣼⡯⠂⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡈⢣⢱⠨⡙⠦⣁⠴⢛⠊⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢒⠛⠻⣟⣦⠃⡳⡀⠵⡔⡡⡧⡁⡢⡀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠐⠆⣂⢹⡾⣧⠚⠜⡱⠂⣧⠘⡘⢤⠅⡄⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⠸⠰⡁⢐⠋⣿⢷⣖⢾⢮⣿⣆⠈⡙⠌⠌⡢⡀⡂⠀",
  ],
  gohan: [
    "⠀⠀⠀⠀⡀⢂⠀⠐⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⡇⣺⣿⣿⣿⣿⣿⣿⣷⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠄⠐⡀⠀⠁⡰⠀⠀⠀⠀⠀⠀⠀⠀⢸⣷⣽⣿⣿⣿⣿⣿⣿⡿⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠈⠄⠠⠀⢘⢀⣴⠏⠀⠀⠐⠀⠀⠀⣸⣿⣿⣿⣿⣿⣿⣿⣿⡏⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠐⠠⠐⡀⢠⣿⡏⠀⠀⠀⠀⠀⠀⠀⣾⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀",
    "⠀⠀⠀⠀⢠⣶⣶⣄⣽⣿⠁⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀⠀",
    "⠀⠀⠀⠀⢸⣿⣿⣿⣿⣿⣾⣷⡀⠀⠀⠀⠀⠀⣿⣿⣿⣿⣯⣿⣿⣿⣿⡇⠀⠀⠀⠀",
    "⠀⠀⠀⠀⢼⣿⣿⣿⣿⣿⣿⣿⣷⡀⠀⠀⠀⡂⣿⣿⣿⣿⣿⣿⣿⡿⠳⣗⠀⠀⠀⠀",
    "⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣇⠀⠀⠀⢧⢹⣿⣿⡿⣟⣿⡿⠁⠀⢸⠀⠀⠀⠀",
    "⠀⠀⠀⢀⣿⡿⢿⣿⣿⣿⣿⡿⠋⠉⠀⠀⠀⢸⡼⣿⡏⠀⠈⠙⠀⠀⠀⠈⡆⠀⠀⠀",
    "⠀⠀⠀⢰⡿⠃⣿⢿⣿⣿⣿⡁⠀⠀⠀⠀⠀⠈⣿⣿⡃⠀⠀⠀⠀⢀⣤⡄⡇⠀⠀⠀",
  ],
  piccolo: [
    "⣿⣿⣿⣿⣿⣿⡿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⢫⠤⣖⣖⢮⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣇⠯⠯⡳⡕⡝⠑⢁⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⡄⠈⡢⢐⠌⠠⣾⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⡿⣻⡻⡟⣟⣈⣨⣔⣴⢿⣚⡵⣏⡵⣗⡷⣗⢯⡋⣹⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣯⢷⣫⢺⡽⣞⡷⡯⣗⢯⣾⢽⡫⣯⣷⣻⢽⢑⣯⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⡌⠻⠚⠘⡯⡳⣫⢶⢏⠋⡠⡀⡙⢗⢿⣺⡏⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⠡⡀⠱⢑⢢⠢⠤⠩⡠⢒⠨⡈⠊⠊⢹⢾⣝⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⠰⠨⠂⠄⠂⠡⡑⢕⠌⠆⠃⠀⠀⡴⡱⡍⡿⣝⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣷⣶⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⡸⡜⡜⣜⡲⣘⢺⣻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
  ],
  trunks: [
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⠐⡐⢒⠒⡖⣆⣄⣄⠤⣤⡀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡴⠓⠩⢍⣉⠺⣷⡼⣋⠲⡄⡑⣆⢟⣝⡢⡀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⢎⢄⣤⣷⢦⡌⢷⠟⢔⠐⢔⢑⢼⡪⣷⢹⣕⢗⡄⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢰⢃⢦⢟⣭⣶⣶⡽⣯⢿⡸⣇⠸⣜⢵⠽⣜⡧⣻⣕⢵⡀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡿⣸⡯⡫⡪⠌⢉⠙⠙⠛⣎⢿⢜⣷⢹⢝⣎⡿⡸⣧⡳⡣",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡯⣿⣃⡕⠈⡀⠂⠠⠁⢀⡗⢍⣷⢽⣞⢧⡗⣯⡫⣿⡎⣿",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢿⣽⠲⠭⣆⠠⠈⡐⠈⣼⢃⣀⢽⣺⣯⣳⡳⡗⣗⣿⣺⢼",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣸⠘⡀⢿⠗⠀⠰⠖⢟⣶⠒⣺⠺⢋⣾⣺⣫⣷⣿⣞⡾",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢪⠆⠉⠃⡔⠈⡀⠕⠪⢇⡊⠀⠄⠈⣩⢜⠕⣿⢟⡵⠃",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢇⠈⠠⢅⢅⠄⠐⡀⠄⢀⠂⢁⡬⡕⢀⡹⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢢⠐⠀⡂⠠⠁⠠⠐⣀⡴⠦⠒⠒⠉⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⣤⣱⠢⡤⠴⡲⡒⠏⢝⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠎⣺⣽⣾⠇⣐⡡⡵⢖⡚⣛⢾⣻⣿⡄⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⢀⡤⣳⢭⣹⣾⢘⣿⡞⣉⡄⡎⡎⡎⡎⣎⣟⣞⣷⣇⣀⡀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⢀⣴⣿⢧⡃⡰⡸⣎⣞⣿⡇⡳⢇⣣⣱⢵⢓⡛⡝⣫⢞⣽⣾⣿⣶⡀⠀⠀⠀",
    "⠀⠀⣰⣿⢿⣽⠏⢦⠓⡼⣣⣿⢿⣿⡶⡛⠅⡂⡇⣳⡮⣮⡶⣿⣟⣿⣯⣷⣿⣄⠀⠀",
    "⢠⡼⣿⡿⣿⣯⠠⡣⣻⢱⣿⣻⣯⣿⣼⢥⠧⣞⣺⣩⣾⣿⣻⣯⣿⣳⣿⣽⣿⣿⠄⠀",
    "⣏⣾⣿⣻⣽⣾⡿⣾⣧⣿⣿⣽⣿⡗⠠⠀⢄⣠⣼⣟⣯⣿⢯⣷⣿⣽⣿⣻⣿⣿⠁⠀",
    "⣿⣿⣽⢯⡿⣾⣻⡿⣾⢷⣟⣿⣻⣷⣑⣱⣯⣯⣷⣿⣻⣾⣿⣻⣾⣿⣿⣿⣿⠏⠀⠀",
    "⣿⣿⣿⣿⣿⣯⣿⣻⣟⣿⢯⣿⣽⡾⣿⣽⢿⣿⣿⣿⣿⣯⣿⣿⣿⣿⣿⢿⠁⠀⠀⠀",
    "⣿⡽⣿⣿⣿⣿⣿⣿⣾⣟⣿⣽⡾⣟⣿⢾⡿⣟⣿⣿⣿⣿⣿⣿⣿⣿⣟⡟⠀⠀⠀⠀",
    "⣿⣿⣿⣿⡿⣿⢽⣿⣿⣿⣿⣷⣿⣿⣽⣿⣿⣿⣿⣿⣿⣟⢷⣻⣿⣿⡳⠁⠀⠀⠀⠀",
    "⠉⠁⣟⢮⣫⣗⣿⣿⢿⣻⣿⣻⢿⣿⣿⣿⣿⣿⣿⢟⢗⢝⢍⡾⣿⠗⠁⠀⠀⠀⠀⠀",
  ],
  gotenks: [
    "⡯⣻⣺⣝⣗⣷⠙⠄⠠⢱⣽⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢇⢗⡯⣻⢽⢽⣝",
    "⡯⣗⣗⣗⡷⣽⠄⡉⢆⠄⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢣⢧⢏⡾⣽⢽⣳⣳",
    "⡯⣗⡯⡾⣝⣞⣇⢂⠢⣃⠌⠛⠻⣿⣿⣿⣿⣿⣿⡿⠟⠛⢟⢜⡼⡱⣽⢽⣺⢽⣺⣺",
    "⡯⣳⢯⢯⣗⡯⣞⣦⠊⢎⠀⠀⠀⠀⠙⠿⡿⠛⠁⠀⠠⢀⠈⣯⢺⣞⡽⣽⣺⢽⣺⢵",
    "⡯⡯⡯⣗⣗⡯⣗⣷⠈⢔⢀⣠⡀⠀⠀⠀⠀⢀⠄⠀⢀⣀⢪⠣⣹⣞⣽⣺⣺⢽⣺⢽",
    "⡯⡯⣻⡺⣮⣻⣺⡺⣆⠡⣄⠨⠙⢳⣄⠀⠀⢁⣠⡞⢋⢋⣘⢠⣟⣞⣞⣞⣞⡽⣺⢽",
    "⢯⣫⣗⢯⡗⣗⣗⡯⣯⠗⢐⢄⠁⠌⠭⠙⠊⠫⠨⠀⢂⢎⠴⢯⣞⣞⡮⣞⡮⡯⡯⡯",
    "⡯⣞⡮⣗⣯⠇⠀⢌⡇⠀⠀⣓⢤⡀⠀⠀⣉⠀⢀⣨⡪⠊⠈⢸⡞⡡⢌⠳⡯⡯⣫⢯",
    "⢽⣺⡪⣗⡝⠀⠰⣿⡃⠈⢞⠡⠠⠠⢑⠢⠤⠔⢁⢃⢉⡜⢀⠜⣿⡇⠕⢱⢯⢯⡺⣝",
    "⣳⢳⢝⡮⡷⠀⠀⣿⣷⡀⢘⠀⠀⠀⠀⠁⡒⠁⠀⠀⠀⠄⣂⣾⣿⡇⠰⠍⠙⣗⢽⢵",
    "⢮⣫⡳⠋⠀⡨⠂⠸⣟⣿⣄⢅⢁⡀⡠⠤⠂⠢⢤⠠⡨⣡⣾⢿⣽⡇⡠⢇⠀⢏⠫⣗",
    "⡳⡵⠁⠀⠌⠀⠈⣰⣿⣯⣿⡂⠀⠔⠀⠀⠅⢀⠀⡑⠀⢸⣿⣻⣿⣧⡀⠀⠑⡄⢀⠱",
    "⡝⠀⠠⡀⠂⠴⡺⢕⢯⢺⡥⠥⣒⣇⢯⢽⢻⣻⢿⣿⣶⣤⣞⢮⢺⡱⣝⠎⠈⢀⠨⠂",
    "⡎⡷⡀⠀⢀⣾⣿⣷⡯⠚⠐⠦⢧⢧⢯⣫⣯⣺⣺⣿⡥⠔⠸⢮⣵⣿⣿⣿⡄⠨⢀⣜",
    "⢎⢗⡝⡖⡾⠿⡿⣿⠁⠠⡘⠲⢬⠷⣝⣚⢮⣶⣿⣿⣗⡩⠬⢀⣿⣿⣿⠿⡗⣺⢹⢔",
    "⡣⣳⢹⢪⢎⠧⣗⣕⠯⣦⣴⠙⠚⠝⠶⠺⠛⠓⢓⠺⢞⠗⠳⡭⡹⡸⡰⡝⣜⢎⢮⢣",
  ],
  krillin: [
    "⠿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠿⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⣿⣻⣿⣻⣽⢯",
    "⢕⢢⠪⢬⢙⡛⠾⢷⣿⣽⠛⣙⠅⣪⡢⣿⣿⣿⡿⣿⣿⣻⣿⣯⣷⣿⣿⣿⣯⣿⣿⣻",
    "⠐⠅⡍⢎⠆⢇⠝⢔⠔⠙⡄⠌⣗⠲⠅⢿⣿⡽⠿⠛⠚⠛⠛⠻⠿⣟⣿⣾⣿⣿⣾⣿",
    "⠀⡪⢈⠆⡣⠡⠓⡐⢅⠄⣳⢚⢥⢓⡙⡌⢭⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠻⣷⣿⣽⣿",
    "⣠⡐⠡⡊⢔⢁⣴⣧⡘⠆⢎⢢⣃⢒⡜⢌⡞⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢍⢿⣟⣿",
    "⠰⠠⡑⢌⢢⠊⢿⣽⢿⣷⢾⡶⣾⣿⠏⠒⢁⣠⣀⠀⠀⠠⠀⠂⠀⠀⠀⠀⢸⠨⡛⠿",
    "⢅⢃⠪⢰⠁⠀⠈⠻⢯⣟⣟⣯⣿⢟⠠⠀⠀⠻⣿⣧⠀⠀⠤⠀⠀⠈⠀⠀⡕⢅⢇⠇",
    "⡂⠆⠅⡇⠀⠀⠀⠀⠀⠀⢍⣢⠊⡎⠀⠀⠀⢀⠘⣿⡄⠠⠀⠀⠀⠁⠀⡌⡪⡸⡐⠅",
    "⢨⠨⠂⡃⠀⠀⠀⠀⠀⠀⠃⢆⣇⠁⠀⠢⡄⠉⠀⠘⡇⠀⠀⢀⣁⣤⣦⣧⡢⠣⡨⠨",
    "⢐⠨⠐⢘⠀⠀⠀⠀⠀⠀⠀⠐⣼⣧⠀⠀⠀⠈⠂⠈⠃⠠⠞⠋⢩⠍⣛⢏⡔⡑⢌⢊",
    "⠀⢂⠁⠄⠣⠀⠀⠀⠄⠂⠀⢠⣿⣻⡆⠀⠀⠀⠤⠠⠀⠀⢤⢒⡕⢝⡲⢉⢐⠨⢐⢐",
    "⠈⡀⠐⡀⠂⢱⡄⠀⠅⠀⣠⣿⣟⣿⣧⠑⢦⣀⣀⣀⣀⣢⠓⠑⠊⡁⠄⠠⠐⢈⢐⠐",
    "⠠⠐⠠⠐⡀⣺⣿⡾⣶⣿⢿⣯⣟⣿⣿⡄⠀⠒⠐⠒⢼⣿⣿⣶⣄⡀⠐⡀⠌⢠⠠⠨",
    "⠀⠂⠄⢁⠀⣽⣾⢿⣯⣿⣻⣽⣯⣿⣷⣷⠀⠀⢀⣼⣿⣿⣿⣿⣿⣿⢆⠀⠄⠆⡠⢖",
    "⠈⠠⠈⠀⣸⣿⣻⣟⣷⣟⣯⣿⢾⣯⣷⣿⣧⣴⣿⣟⣿⣿⣿⣿⣿⢟⢰⢈⣶⡟⢸⠪",
    "⣦⣀⠁⢼⡿⣯⣿⣽⡾⣯⣿⣽⢿⣽⣾⡷⣟⣿⣾⣻⣿⣿⣿⣿⢋⠆⡵⠱⣿⣿⣎⡓",
  ],
  roshi: [
    "⢵⢱⡣⣳⢱⢕⢇⡗⣕⢧⢳⡣⡳⣕⢧⢳⢕⢗⣕⡧⠗⠗⠓⠓⠓⠓⠓⠓⠙⠘⢊⠃",
    "⣇⢗⣝⢼⡱⡝⣎⢮⢺⡪⣇⢯⢺⡪⡮⡳⣝⡺⡄⠐⠆⠷⠼⠮⠮⠞⠮⠷⠽⠝⠓⠋",
    "⡪⣣⡳⡕⡧⡫⡎⡗⡵⡝⡮⣪⡳⡹⡜⡵⡕⣕⡏⣗⠦⡦⡤⡤⡤⡢⡴⡔⡴⡢⡖⣖",
    "⢕⢧⢳⡹⣸⢱⡿⣿⣮⡚⡮⡺⡼⠋⠩⢫⠙⣶⡝⣜⣝⢼⢺⢜⢎⡏⣞⢼⢹⡪⡳⣕",
    "⢇⢷⡱⡝⡜⣾⣿⣳⣟⣟⢜⢽⠁⠀⠈⠀⠀⠀⣻⢜⣜⠞⠓⠉⠩⠉⠊⠍⠉⠈⢙⡪",
    "⡝⡼⡜⡎⣗⢝⣾⣳⣟⣾⢧⡛⡶⢲⡏⢻⡷⡞⣿⣇⢗⡳⡪⣖⣕⢞⢖⡳⣹⢹⢵⢹",
    "⢮⡚⡮⡝⣜⢜⢝⢿⣯⣿⡇⢧⣃⡐⠍⠋⠥⠏⣿⢸⢸⢪⡣⡡⡌⣌⡕⡭⡺⣸⢪⡣",
    "⡕⡵⡱⡣⡳⡹⡸⡢⣹⣿⣗⢣⡏⣰⠈⠀⠠⢤⠬⣧⣵⣷⡭⣼⣺⢎⢎⢮⢺⢸⢜⠎",
    "⢎⢮⡚⣎⠧⡳⡱⠋⡐⠹⣿⡆⡑⢯⢠⠂⠀⠀⡷⠚⠄⣼⢧⡒⡎⡎⣇⢗⢕⢝⡜⣄",
    "⢕⡕⡝⣜⢜⡞⠡⡈⡂⠅⢻⣿⡅⡙⠛⡂⣀⢾⡹⡖⡎⠸⠈⣳⢧⡣⡣⡣⣓⢕⢕⢕",
    "⢕⢝⢜⢜⡲⡃⡁⡂⠢⡁⣏⣿⣷⢀⠋⡇⠛⠘⣞⢦⢩⠂⠀⢸⡪⣧⢣⢣⢣⡣⡳⡱",
  ],
  yamcha: [
    "⠜⠊⠀⢀⣴⠞⠋⠀⠀⠀⠀⠀⠀⢀⠤⡲⡑⡕⣜⢜⡞⣼⡣⣻⢮⢯⡯⣗⡿⣱⢯⣳",
    "⠀⣀⣶⣋⣥⣄⠀⠀⠀⠀⠀⢀⢴⠱⣩⢲⢱⣹⣴⣿⣽⣿⣿⣽⢽⣫⡾⢯⣺⣵⣿⣿",
    "⠶⠋⠨⣧⠀⠁⠀⠀⢀⢠⢔⢕⣥⡟⣜⣼⣿⣿⣿⣿⣿⣿⣿⣿⣿⣺⣽⣿⣿⣿⣿⡿",
    "⠀⠀⢨⣷⠀⠀⣠⢺⢘⣱⣼⣾⣾⣼⣿⣿⣿⣿⣿⡿⢫⣿⣿⣿⣿⣿⣿⣿⠿⠋⡡⠔",
    "⠀⠀⠈⠋⣠⢚⢥⢵⣳⣻⣽⣿⣿⣿⣿⢳⣿⠁⣿⡶⡾⢿⣿⣿⣿⣿⢋⡡⠔⢉⠀⡂",
    "⢀⡠⠴⣙⣔⡗⡯⣏⣞⣾⣿⣿⣿⣏⣏⠌⠇⡔⠃⢆⠰⢻⡿⠿⣿⣿⡅⠠⠀⡂⡐⠠",
    "⢪⢪⣵⢳⡣⣯⢻⣸⢮⣻⣽⢽⣿⣧⠘⢆⠈⠅⡠⢨⠤⠸⣅⠇⣿⣿⣇⠠⠁⠄⡂⠡",
    "⣗⡽⡪⡮⣺⢮⡳⣝⡵⣳⣳⣷⣿⣿⡄⢄⠄⠀⠀⠠⡮⢘⣴⣾⡿⠟⠉⠄⠅⡁⡂⠅",
    "⡗⡵⡫⣮⢳⢵⢝⣾⣾⣿⣿⣿⠟⢋⠅⠀⠢⠁⠀⡜⠔⡁⢾⣿⣶⣿⣾⣒⠦⡂⠢⠁",
    "⡳⣝⢮⣫⣧⣿⣿⣿⡿⠟⡉⢄⠊⠠⠈⠢⣀⡠⠎⡂⠅⠇⢸⣿⡿⣿⡿⡿⡧⡤⣤⣄",
    "⣝⣼⣾⣿⣿⡿⠛⡉⠔⠈⡀⠄⢐⠠⠁⡂⢰⠁⠊⠀⠰⠁⣢⢯⢽⡣⣳⣝⢮⡫⣞⢼",
    "⣿⣿⠿⢋⠡⠐⠁⠠⠀⠅⡀⢂⠂⣀⡵⠚⠉⡀⠠⠂⣡⢝⡗⣗⡵⣏⢗⡵⡳⣝⣮⠗",
    "⡋⠡⠈⠠⠀⠂⡁⠌⢐⣁⡴⡶⣺⠟⠀⠁⠈⡀⢠⣖⢯⢳⡽⣺⡺⣕⢯⡺⣹⡞⠀⠀",
    "⡗⠀⡁⠄⢁⣈⣤⣶⣟⢵⢝⡞⣞⡆⠀⠄⢁⡴⣫⢞⣞⡽⡺⡵⡝⡮⡳⣽⣻⡇⠀⠀",
    "⡏⢀⣤⣶⢿⣻⡻⢁⡾⣝⢵⢯⢮⣳⠀⣡⢟⢮⡳⣝⡮⣫⣝⢮⡫⣞⡝⣾⣻⡅⠤⠀",
    "⣿⢟⡯⢗⢋⠆⡇⢰⢯⡳⣝⡗⡧⣫⢗⣗⢽⢵⡝⣧⢿⢲⠺⢮⣫⡺⣜⣯⣿⢦⡁⠀",
    "⣯⢃⠕⢌⢆⡣⣗⠸⣽⡝⣎⣟⢮⡳⣝⢮⡳⣝⡾⢱⢶⠏⠆⠈⣷⣹⣪⡷⣟⣿⠅⠀",
    "⣷⣰⢵⠗⠋⠩⡆⠀⢻⡪⣗⢝⡧⡯⣺⢕⡯⣺⡇⡖⣺⠩⢽⠃⣿⢼⢼⡯⣿⣞⣇⠀",
    "⡏⠈⠀⠀⠀⢨⡃⠀⣞⣝⢮⡳⣝⢽⡪⣗⢽⡪⣷⠓⣟⡈⡩⢦⣟⢮⢿⡽⣗⣯⣿⠄",
    "⡇⠀⠀⠀⠀⠠⡇⢰⡳⣕⢗⣝⢮⡳⣻⡪⣗⢽⡪⡷⣤⡤⡶⡻⣜⣾⢿⡽⣯⣷⢧⡔",
    "⡇⠀⠀⠀⠀⢐⢕⠈⢷⡳⣝⢮⡳⣝⢮⡺⣕⢯⣺⣹⣪⣺⣹⡹⣾⢽⡯⣟⣷⣻⡞⠀",
    "⡇⠀⠀⠀⠀⠐⡕⠃⠰⣏⢮⣯⣾⣾⣷⣿⣿⣿⣿⢿⣿⣿⣿⣿⣿⣿⣿⣯⣷⠟⡃⠀",
    "⡇⠀⠀⠀⠀⢨⠃⠀⠀⢬⢿⣻⡫⣿⣿⣿⣿⣷⣪⡳⣪⢖⡵⡽⣞⣿⣽⣻⣿⡀⡃⠀",
  ],
  tien: [
    "⢪⢊⢎⢪⢪⢸⢘⢌⢎⢪⢊⢎⢪⠪⡪⡪⡪⡪⡪⡪⡪⡪⡪⡺⠈⠀⡂⡂⠢⠨⠘⢮",
    "⡱⡑⡕⡅⡇⡎⢎⢪⢊⢎⢎⢪⢪⢪⠪⡪⡢⡣⡣⡣⡣⡃⡏⠀⠀⠀⠢⠨⠈⣬⣌⢠",
    "⢜⠜⡌⡎⢆⢇⠇⡇⡣⡱⡑⡕⡅⡇⢇⢇⢇⢣⢣⢪⢪⠪⡇⠀⠀⠄⢣⡁⣼⢟⠡⠨",
    "⢪⠪⡪⡸⡸⡰⡱⡱⡑⡕⡱⡱⡸⡸⡸⡸⡸⡸⡸⡸⡸⢌⢇⣴⣌⡈⠈⣸⢁⡰⠔⡁",
    "⡱⡱⡑⡕⡜⡔⡕⡜⢜⢸⢨⢢⢣⠪⡪⡢⡣⡣⡱⡱⡱⡱⡱⡱⢄⡙⠫⠁⠃⡀⢌⠐",
    "⢘⠠⠁⠣⠪⠢⠣⠊⡑⢑⠱⡑⡅⡇⡇⡎⡎⡪⡪⡪⡪⡪⡪⡪⡱⡱⡄⠋⠨⠀⢀⡡",
    "⠀⠄⠁⠌⠨⠈⡀⠁⠄⠂⠐⠌⠪⡪⡸⡨⡪⡪⢪⢊⢎⢜⢜⢜⢜⢜⠼⠃⡢⠐⢁⣼",
    "⠐⠈⠀⠁⡀⠂⡀⠡⠐⠈⠠⢈⠠⠐⠈⢨⢪⠪⡪⡪⣪⢪⡪⠚⠊⠋⡸⠊⠀⠀⣾⣺",
    "⠀⠄⡁⠅⠠⠀⠄⠂⠄⠡⠈⡀⠄⡐⡄⡮⠎⣉⣈⠌⢕⠊⢌⠒⢔⢔⠕⠉⣠⣞⢧⣿",
    "⠀⠅⡀⠂⠅⠨⠀⠅⢨⢰⠱⡸⡨⠞⡠⠁⠀⢄⠜⠅⢎⠫⣢⡈⠐⠈⠕⠒⣗⣗⣽⢟",
    "⠈⠄⢂⠡⠁⡁⠅⢑⢨⢢⠣⣣⠋⠀⡄⠒⠊⡑⡼⠀⡇⢇⠕⢐⣤⢀⠀⠈⠢⠙⢫⣯",
    "⢌⢔⢠⢂⢅⢔⢌⢎⢪⢪⠎⠁⡠⠃⠀⠀⠠⢠⠂⡒⡍⠁⡷⣯⡻⡄⢂⠀⠀⣠⣿⣫",
    "⢜⢌⢆⢇⢕⠕⡜⡌⣲⠁⠀⠌⠀⠀⢀⠐⣁⠎⠀⡂⢖⠡⢙⢡⡤⣞⣦⣌⠨⢺⣿⣿",
    "⢜⠔⡕⢜⢔⠕⡕⡜⠊⢀⣈⣀⣠⡤⡶⣾⠁⠀⡐⠄⣱⠈⣰⣺⡽⣞⣳⣝⣵⣻⡻⡿",
    "⢜⢸⢘⢌⢆⢇⠞⢀⠆⣰⡿⡵⣳⢽⢝⣿⣆⠨⣀⡕⣢⡾⣻⣽⣾⣾⣿⣿⣿⣿⣿⣿",
    "⢜⢌⢎⢪⠢⡣⡃⠂⠀⣿⣗⣽⣵⣯⣾⣿⣿⣿⣶⢞⣗⣽⣾⢿⣿⣻⣟⣿⣻⡿⣿⣿",
    "⡸⢰⢡⢣⠱⡱⡅⠀⠀⠸⣿⣿⣿⣿⣿⣿⣿⢿⡳⣽⢾⣽⣾⢿⢾⣳⣿⣽⣽⣽⣿⣿",
    "⢜⢸⠰⡑⡕⢅⡇⠠⢌⢄⠙⠿⣿⣿⣿⡿⡋⡆⣿⣻⣯⣿⢾⡿⣟⣟⢷⣿⣟⢿⣿⣿",
    "⡸⡰⢱⢑⢕⢱⢡⠤⡢⣆⢑⢐⢀⢭⢹⢸⢸⢘⣿⣾⣟⡭⣿⣪⢗⣵⣳⣻⡳⣳⣻⣗",
    "⢢⠣⡱⡡⡣⡱⡑⡕⢕⢜⠬⢭⢱⢱⢱⢱⢱⢡⣟⢾⢵⢽⣟⢮⢯⣺⣪⢞⣞⡵⣳⢵",
    "⢸⢘⢌⢆⠇⡎⡪⡪⡊⡎⡎⡎⡎⡎⡎⡎⢆⣟⡮⡯⣳⣿⡯⡯⣳⡳⣳⣫⢞⣞⡵⡯",
    "⢸⢨⢢⢣⠱⡑⡕⡜⢜⠜⠨⠊⠌⠊⡊⢊⣟⣞⢮⣻⣪⣿⣗⢯⡳⡽⣕⣗⢯⣞⣞⢽",
  ],
  android18: [
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡠⠔⡪⡡⣉⠨⣉⡢⡢⢄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠎⠜⠉⠀⡀⢄⡱⠂⠀⢄⠢⡑⠄⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣗⢊⢢⢞⠞⠟⠖⠶⢦⡐⠄⠑⡐⡸⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⡸⡐⣺⠀⠂⡐⠀⢂⠀⡙⣎⢆⢁⢺⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣧⣧⣓⠅⠀⣂⣌⣐⡀⠠⠸⣓⠴⡜⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠙⡜⢇⠈⠡⠘⢉⠠⠐⡠⢗⡸⠁⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢣⠑⢄⠐⠈⢀⢠⢼⣻⡞⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⠰⣰⠼⠚⣁⣸⣍⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣿⡷⣾⣻⣯⡿⠿⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣶⣿⣿⣿⢿⣟⣯⣯⡷⠀⢹⣷⡀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⣰⣿⣿⡿⣾⣟⣯⢿⣾⣷⠋⢀⣿⡯⣇⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⣰⣿⣿⣟⣯⣿⢾⣻⣟⡷⠡⣠⣿⣿⣿⡗⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⢀⣼⣿⣿⡿⠽⠟⢻⣿⠟⢁⣠⣾⢿⣻⣿⡟⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⢠⠗⠟⣛⣭⣶⣷⡿⢋⣁⣴⣿⣽⣿⣿⣿⣿⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⣿⣿⣿⣿⣿⣋⣍⣵⡿⣽⣷⣿⣿⣿⣿⣿⠏⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠛⠻⠟⠛⣿⣯⣿⣷⣿⣿⣿⣿⣿⣻⣾⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
  ],
  frieza: [
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⢟⡩⠁⠉⠙⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢡⠃⠀⠀⠀⣴⢶⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣇⠘⠀⠀⠀⣼⡿⡿⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣯⢳⣤⣤⢾⡿⢻⡟⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣧⡌⣹⡡⢤⡇⢴⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⣛⣢⢔⢃⢜⣢⣎⠁⠩⠙⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠃⣞⣽⡮⣭⣶⢷⣗⡻⠦⡀⠀⣽⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢫⠺⠿⠓⠛⠾⠿⠫⢃⢸⣿⣯⢪⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣿⣿⣿⣿⣿⣟⢿⣿⣿⠿⣹⢹⠨⠀⠀⠀⣞⣿⢗⢢⡛⡫⡹⡜⢿⣿⣿⣿⣿⣿⣿⣿",
  ],
  cell: [
    "⢎⡞⣜⢎⡞⣜⢮⡪⡺⣜⠸⡆⢘⢎⢮⡪⡎⡮⡾⠁⡮⣜⢜⡜⣜⢜⢜⣜⣬⣮⣶⣵",
    "⡣⣏⢎⢧⢳⡱⣕⢵⡹⢼⠐⢿⠀⠹⢜⠜⡎⢮⠁⣼⠇⡮⡪⣪⣪⣮⣾⣿⣿⣿⣿⣿",
    "⢎⢮⡣⡳⣕⢵⡱⡕⣝⢜⡇⢝⣧⠊⠁⢮⢫⠆⣴⢯⢕⢕⢇⢿⣽⣿⣿⣿⣿⡿⣿⣻",
    "⢝⢎⢮⢣⡳⡱⣕⢝⡜⣕⢵⠘⠼⣦⡀⠀⠁⡴⢯⢓⢜⢎⢇⢧⠫⢿⢿⣿⣻⡿⣯⣿",
    "⣿⣿⣷⣷⣱⡹⡜⡎⣞⢜⢎⢇⠻⢬⢻⠤⢞⡽⢭⢕⢕⢇⢗⢕⢝⡜⡜⡜⡜⡜⡕⡝",
    "⣿⣿⣿⣿⣿⣷⣵⢹⢜⢎⢧⢣⡛⡌⢼⢵⣵⢡⡫⡜⡜⡎⣎⢇⢧⢣⢫⢪⢪⡪⡪⡪",
    "⡫⡻⡻⡫⣫⢫⢎⢧⡳⠝⠎⣣⡵⣯⣜⢿⣳⣼⣶⣭⡚⡪⠪⣎⢮⢪⡪⡪⡣⡣⡣⡣",
    "⢵⢹⡪⡺⣜⠎⡉⢤⢶⣄⠈⣿⢿⣿⣺⣯⣿⢽⢾⠿⣃⢽⢩⠴⠒⢳⢬⠪⡪⡪⡪⡪",
    "⢕⢧⢳⡱⡃⠀⡂⡸⠁⠐⠐⠓⠃⠃⠚⡌⠚⠊⠑⠙⢊⠁⠀⠂⠌⠠⠙⣇⢣⢣⢣⢣",
    "⢕⡳⣱⢹⣂⠀⠀⢀⡞⣿⣎⠈⠈⠈⠐⠀⠈⠈⠈⠈⠀⢀⣽⡲⡄⠀⢁⢨⢪⢪⢪⢪",
    "⢵⡹⡜⣎⢞⣜⢲⡻⡔⢻⣿⣷⣤⣰⢒⣚⣲⣢⠶⡷⡞⣿⣿⡗⠜⢵⢡⡣⡳⡱⡱⡱",
    "⣕⢧⢫⣪⢺⡊⠆⠊⣭⢎⡻⢿⢯⣾⣿⢿⠿⢻⣓⣚⣸⣿⠻⡁⣗⠋⠔⡵⡱⡣⡫⡪",
    "⡺⣪⡳⣕⡝⡌⠀⠀⠀⠭⣏⢭⡸⡻⣙⢬⠺⡁⢞⢥⢇⡭⠬⡡⠃⠀⢑⢸⡪⡺⡜⣎",
    "⣝⢮⣺⢺⠢⠁⠀⠀⠀⠀⠂⡳⡝⡚⠈⠊⡈⡉⠇⢜⣌⡸⠑⠀⠀⠀⠀⢅⢳⡹⡜⣜",
    "⣺⡳⣳⡋⠎⠀⠀⠀⠀⠀⢈⣍⡄⣄⡡⡡⡨⡨⣘⢄⡍⡁⠀⠀⠀⠀⠀⠨⢸⣪⢺⢜",
  ],
  buu: [
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣠⠴⠴⢤⢄⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠾⢀⡠⢤⢼⢘⡆⠀⠀⠀⠀⠀",
    "⠀⠀⠙⠙⠙⠙⠙⠋⠛⠙⠛⠙⠛⠛⠋⠛⠛⠛⠛⢛⡻⡋⢶⡁⢎⠲⡟⠛⠛⠛⠛⠓",
    "⠀⠀⢔⡤⣔⡤⢔⢤⢤⣄⣤⣠⢤⠠⠀⠀⠀⠀⠀⠘⢦⢳⡸⢿⣸⣀⡏⠀⠀⠀⠀⠀",
    "⡠⠤⠬⣿⡼⣜⡟⣳⣳⣷⢷⣻⡼⣊⡻⡝⣦⡔⣶⢀⡾⡚⡮⢶⡽⠋⠀⠀⠀⠀⠀⠀",
    "⠀⣸⡟⢰⠀⠀⠈⠀⠀⠀⠁⢀⣾⡀⢷⢻⣽⣧⡹⣞⣧⡱⢱⡾⠁⠀⠀⠀⠀⠀⠀⠀",
    "⢠⢿⡳⣯⠓⣄⠀⠀⠀⢀⠴⡪⢊⣷⣾⢷⣥⣻⢽⣮⣳⢿⣿⣶⣀⠀⠀⠀⠀⠀⠀⠀",
    "⠿⣿⣿⣿⣄⣀⢱⢄⣠⠯⣋⣼⣟⣿⣹⣿⣯⣻⢩⣶⢳⣿⣽⢷⡽⡇⠀⠀⠀⠀⠀⠀",
    "⠀⠀⠉⠛⠿⠾⢯⣚⣺⠝⢫⡷⣿⣿⣿⣿⣿⣿⡜⣏⣾⣳⢿⣧⣛⢿⣶⠤⡤⣠⣀⣀",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣻⣟⢯⢿⠯⣿⢽⣗⣷⢟⣗⣿⣿⡯⣷⣮⢿⣻⢶⣵⣕",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⡺⣯⢿⣿⠱⢻⢹⢟⢅⡾⣽⢾⡇⢽⣷⣿⢷⣧⣭⣦⣹",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⣧⢻⣟⡯⠁⡎⣇⠃⣇⣯⡿⣽⣿⡼⢧⣙⠻⣯⣿⣽⢿",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠸⡌⢿⣝⢦⢣⡣⡫⣟⣗⡿⣶⣭⡻⣢⢼⠛⠦⠭⣝⣻",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⢚⣝⢿⣮⣅⣣⣞⣯⣿⠓⢦⠏⣼⢿⣷⣽⣒⣒⡮⢺",
    "⠀⠀⠀⠀⠀⠀⠀⠀⠀⢂⡴⢃⡟⢠⠎⢹⡥⣾⣱⣧⡏⣙⡞⠀⢿⣽⡾⣯⡿⣿⣿⣾",
    "⠀⠀⠀⠀⠀⠀⠀⢀⡤⠏⡎⠜⠀⠃⠀⢃⡟⠧⢗⣳⡞⢯⡙⡆⡏⡲⡘⢳⡻⢷⢽⣻",
    "⢀⣀⡠⡤⠴⣲⣒⣯⡯⡯⣟⢟⡟⡿⡻⢽⢽⣽⣞⣏⣊⣮⢼⣬⣎⣎⣪⡀⡛⣳⡮⣮",
    "⣷⢾⡾⡿⣿⣻⣯⡿⡿⢷⣯⡻⢿⣜⢺⡝⣿⣳⢋⢆⢅⢭⣝⢝⡭⡕⡔⢴⠈⢻⣽⣜",
    "⢯⢯⢿⣻⣽⡽⡞⠛⠻⠿⣮⣝⠷⣝⢧⣻⣾⢾⡘⡌⡎⡲⣘⢛⢢⢱⢱⠱⠀⣸⣿⢏",
    "⣣⡷⡛⢉⣈⡀⡤⢒⣱⣵⡌⣻⣻⣮⣳⠳⣝⡿⣾⣬⡊⡎⢆⢇⢇⢣⢃⣡⢾⣯⡿⢅",
    "⣿⡸⡸⡱⣶⣳⣷⣿⣗⣿⢕⣷⣿⣿⣹⡿⡳⡻⡓⡟⢿⡿⢖⢶⡾⣾⣾⣷⠿⢿⢽⢨",
    "⣷⡷⣳⠛⠙⡻⣾⣷⣷⣾⣿⣿⣿⢟⣕⢧⢳⢵⢗⣻⣽⣻⣷⣾⣆⢺⣷⢒⣛⡽⣦⣱",
  ],
  broly: [
    "⣗⣟⣞⣗⣟⣞⣗⣟⣞⣗⣟⢾⣵⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡻⣿⢮⣗⣟⣞",
    "⣞⢾⡺⣞⣞⣞⣞⡾⣺⣺⣺⣳⣿⣿⠿⢛⣿⠻⣿⡇⠂⢩⠉⢿⣿⣿⣿⣺⣳⣳⣳⡳",
    "⣞⡽⣝⡷⣽⣺⢵⢯⣗⣗⡷⣝⡏⣥⡞⠛⢧⠈⠜⠧⡀⠐⠀⠸⡿⣿⢯⣺⣺⡺⣪⢯",
    "⣞⣝⢷⢽⣺⣺⣝⣗⢗⣷⣿⣿⣿⣿⡂⢕⠐⡈⠌⡀⠀⠀⡈⢼⣝⢽⣕⣗⣗⢽⡺⡵",
    "⣞⢾⢽⣝⣞⣞⢞⡮⣯⣷⣿⣿⣿⣿⣿⡂⢇⠠⠡⠀⠀⡀⢁⡵⣳⡳⣳⢵⡳⣽⡺⣝",
    "⣺⣝⣗⢗⣗⢷⣝⢮⣿⣿⣿⣿⣿⣿⡿⠀⡌⡒⢬⣀⠀⢀⣾⣿⣾⡪⡷⣝⣞⢮⡻⡮",
    "⣞⣞⢮⡻⣮⣳⡳⠟⠗⠋⠉⠉⠙⠻⡩⡨⢤⠔⠄⠤⡉⢿⣿⣿⣿⣯⡫⣞⢮⡻⡮⡯",
    "⡺⡮⡯⣫⢞⠎⢠⠃⠌⠠⠐⠈⠀⠀⠀⠀⠀⠩⡁⠂⡀⠸⣿⣿⣿⢿⡮⣳⢽⠮⡻⠪",
    "⢽⢝⡮⣗⡇⢐⠡⠈⡌⠌⠀⠀⢀⠄⡁⠀⠀⠀⠀⠑⢄⠀⡀⡛⠛⠳⢹⢜⢓⢈⠠⢀",
    "⣝⢷⢝⡮⣧⢐⢨⢸⢅⠌⠔⢄⣡⡠⡂⠅⠄⠀⠀⠀⠀⠑⠠⠀⢾⡀⠀⠌⠚⣕⢏⢧",
    "⢮⢯⡳⡽⠀⠅⢳⠁⠄⠀⠀⢀⠇⠳⡄⠌⠄⠄⠀⠀⠀⠀⠀⠁⢄⠠⠐⠁⠀⠈⠽⡱",
    "⢽⢵⠽⡃⢕⢑⠉⠈⠀⠠⠀⢐⠈⠔⠈⠑⠊⠌⠌⠔⠡⠢⠑⠐⠴⠕⠠⢀⠀⠀⠄⠹",
  ],
  beerus: [
    "⣪⢺⢜⢎⢞⣜⢮⢺⢜⡾⣿⣿⣿⢿⣕⢗⣕⢧⢳⢕⢗⢸⢵⡫⣞⢸⠸⡮⡺⡸⣪⢺",
    "⡞⡮⣪⢿⣵⡪⡮⡳⡕⣟⡿⣻⢿⢯⡪⡧⡧⣳⡹⡜⡇⣺⢵⡫⣯⢘⢧⠱⡹⡜⣎⠮",
    "⡎⣗⡵⣟⣿⣺⣪⢷⡹⣪⢞⣷⣷⣽⣾⣿⡮⣳⣱⢝⠆⣯⡳⣝⢾⠄⢯⢇⢱⢝⢜⡜",
    "⢽⣿⣿⣿⣷⣳⣿⣿⢮⢳⡻⣿⣿⣿⣿⣿⣿⣿⣿⡵⡃⢷⢝⢺⣝⠆⡘⡽⡄⡗⡕⡱",
    "⠯⡯⡻⣿⣿⣿⢿⢏⡏⡧⡫⡮⠾⣿⣿⣿⣿⣿⣟⡎⡯⡌⣟⠘⡾⢐⠀⣿⠠⡳⡅⡯",
    "⢝⡜⣕⢧⢳⡹⣜⢵⡣⡯⣞⢮⣫⡺⣟⢟⡟⣟⡝⡮⡪⡇⣺⠀⢂⡦⡼⣡⢖⢶⣄⢽",
    "⢕⢵⢱⢕⢷⣿⡯⣗⣯⢯⡺⡫⡇⣏⢮⢺⢜⢎⢞⡜⡵⡅⠳⢓⡯⣺⢝⡮⣫⡳⣕⣗",
    "⢕⢇⢗⡕⣗⢳⡹⡜⣜⢎⢮⢣⡫⡎⣞⢜⢎⢗⢵⢹⢜⢎⢗⢸⢚⠵⣫⢮⠳⡝⣺⢜",
    "⢕⡝⡜⣎⢎⢇⢧⢫⡪⣎⢧⢳⡱⡝⣜⢎⢗⢝⡜⡵⡱⡝⡮⡘⢥⣝⢌⠼⣕⢯⠔⢋",
    "⢕⢕⡝⣜⢜⢕⢇⢗⢵⡱⢽⣾⣮⡷⣕⢝⡜⣕⢵⢹⢜⢎⢮⢝⢆⢘⡽⡕⢓⠃⠌⠅",
    "⢕⢵⢱⢕⢵⢹⢜⢕⢇⢏⢮⢺⣿⡻⡏⣇⢏⢮⢺⢸⢪⢣⢇⢧⢳⡱⠘⢝⢒⠃⠌⣄",
    "⢕⢕⢇⢗⢕⢵⢱⢝⢜⢕⢇⢗⢵⢱⢝⢜⡜⡎⡎⣇⠯⢪⠚⣜⠢⢇⣹⢈⣋⠂⠂⡇",
    "⢕⢵⢹⢸⢱⢕⢇⢗⢝⢜⡕⣝⢜⢎⢎⡇⣇⢏⣪⣔⡊⠁⣀⡬⠙⢮⣌⡣⡘⣀⣀⣠",
    "⢕⢕⢕⢵⢱⢕⢕⢵⢱⢣⡣⣣⢳⢹⢸⡸⡸⢨⡴⢙⢿⣦⡃⠀⠀⣰⠊⠉⠛⠛⡋⠁",
    "⢕⢕⢵⢱⢱⡱⢕⢕⢵⢱⡱⡕⡕⡵⡱⡱⡃⣝⢦⠏⠅⠍⠻⣷⣬⡊⠀⠀⠀⠐⠿⠃",
    "⢕⢕⢕⢕⢕⢕⢝⢜⢼⢸⢸⡸⡜⡜⣜⠎⠴⡝⣮⠁⡅⢸⠕⡄⡙⠻⠿⣶⣤⣤⣴⣶",
    "⢕⢕⢝⢜⢕⢕⢕⢇⢇⢧⢣⢣⢣⢳⠡⠞⠿⢷⣎⠰⣙⠌⢯⢥⢝⡖⣂⡤⡤⡤⣄⢤",
    "⢕⢕⢕⡕⡵⡱⡣⡳⡱⡕⡕⡇⡇⣗⠡⡯⣫⢃⢈⡰⡱⣙⢆⡙⠵⠓⠓⠓⠋⠺⠰⠓",
    "⢕⢕⢕⢕⢕⢕⢕⢕⢕⢕⡕⣕⢕⠕⣸⡊⢃⠂⡜⡜⡜⡜⣜⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⢕⢕⢕⢕⢕⢕⢇⢗⢝⢜⢜⡢⡫⢨⢮⠆⡁⡪⡪⡎⡮⡪⡪⠂⠀⢀⡀⠀⠀⠀⠀⠀",
    "⢕⢕⢕⢕⢕⢇⢇⢇⢇⢇⢇⢧⠡⡯⣺⠁⠄⡺⡸⡸⣸⢈⣄⠂⡐⡈⣳⠀⠀⠀⠀⠀",
    "⢕⢕⢕⢝⢜⢜⢎⢇⢏⢎⢇⢗⣘⣓⡃⠌⡰⡱⣱⢱⠅⡲⡕⠀⣔⡇⣺⠄⠀⠀⠀⠀",
    "⢕⢕⢕⢕⢕⢇⢧⢣⢳⢱⠣⢽⣽⣯⠝⡨⡪⣣⠣⠃⣸⣹⠀⣺⢸⠆⣻⡂⠀⠀⠀⠀",
    "⢕⢕⢕⢝⢜⢜⢜⢜⡜⡜⡍⢾⣿⣯⡃⡮⠚⢀⠂⣰⡓⡎⡜⣎⠮⡇⣿⡂⠀⢀⣴⣄",
    "⢕⢕⢕⢕⢕⡕⡝⡜⡜⣜⢱⡞⣳⠳⠄⠠⠨⠐⢠⢇⡗⣝⢮⢪⣓⠇⣿⠅⠀⠘⢿⡿",
  ],
  whis: [
    "⡳⡕⡇⡇⡥⢱⢯⢯⢯⡯⣯⢯⢿⡽⡯⣿⢽⡯⣿⢽⣽⢀⢰⡁⠀⢰⠀⡇⠀⡇⠀⡆",
    "⡯⣞⢼⢸⢐⢹⡽⡽⡽⡾⡽⡯⣿⣹⢯⡿⡽⡯⡯⣗⡷⢸⢰⠂⠀⡻⠀⡇⠀⢢⠀⡪",
    "⡯⣮⢪⢢⢃⢺⢽⢽⢽⣫⢿⣽⡳⣯⣻⣺⢽⢯⣻⡪⡏⢸⢸⠄⢸⢸⠀⡇⠀⢸⠀⠆",
    "⠛⢪⡇⡇⢕⢸⢯⣻⢽⡽⣽⡺⣝⣗⢷⢽⢝⣗⣗⢯⡇⢸⠸⡄⢸⠨⡀⠃⠀⢘⠀⠇",
    "⢈⠀⢷⢱⢑⢜⡯⣺⢽⣺⡳⡯⡷⣝⣗⢯⢯⡺⡜⡎⣮⢸⠈⡆⢸⠐⠄⠀⠀⢰⠀⡇",
    "⠀⠂⢹⢸⡑⡸⣝⣞⢽⣪⢯⣫⢯⡺⣪⢫⡪⣪⢪⡪⣺⠨⡂⢫⠸⡀⡇⠀⠀⢸⠠⠂",
    "⡞⡦⢸⡱⡨⢸⣣⢯⡫⣞⢵⢣⡳⣹⢸⢜⡜⣎⢇⡯⠺⢆⢣⠘⡌⡆⢣⠀⠀⢨⢸⠀",
    "⣕⣻⠀⡇⢎⢜⢮⡺⣪⢳⡹⣪⢺⢜⢎⢇⢇⠇⣞⠔⢊⠈⠚⠀⢣⢵⠘⠂⠀⠐⠔⠀",
    "⣿⡟⠋⠛⢦⡸⣕⢽⡸⡕⡝⡜⢜⠜⡌⡆⠇⣞⠡⠊⡡⠔⠂⠀⠀⠀⠀⠁⠀⠀⠀⠀",
    "⣿⣯⠀⢁⠈⣿⡜⡜⡜⡸⡨⡪⡪⢪⢘⢌⢪⠃⡠⢎⠤⠄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⣿⣿⡗⢤⣶⣿⡗⡜⡜⡜⢜⠔⡅⡣⣑⠕⠊⢇⠰⣡⠚⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
    "⣿⣿⣷⣾⣿⣿⠣⡱⡑⡜⢔⢕⡱⢊⠁⣠⢞⣙⣶⢁⡄⠴⠒⠲⣤⣀⠀⠀⠀⠀⢀⣤",
    "⣿⣿⣿⣿⡿⢃⢕⢱⢘⠌⡦⠋⡀⡤⣎⢵⣺⣺⢉⠳⡀⡠⡒⡓⠢⣍⠀⠀⠀⠀⣝⡒",
    "⠿⣻⡛⣏⠼⢨⢪⠸⡈⡞⢁⢀⣞⣵⣳⣿⣽⢾⡈⡝⣇⠉⠳⠼⠵⠎⠀⠀⠀⠈⠡⠄",
    "⡳⣸⠂⡧⢍⠔⡕⡑⡝⢀⢂⣾⣳⣿⣽⣾⡿⣿⣆⡈⠻⡀⠀⠀⠀⠀⠀⣰⠂⠀⠀⠀",
    "⠱⠞⢀⠇⡕⢸⡸⣼⠁⠄⣼⢷⣟⣷⡿⢯⣿⣿⣿⣿⣷⡇⠀⠀⠀⠀⠀⠳⠀⠀⠀⠀",
    "⠐⠒⠚⠬⡌⢼⣺⡇⠐⡀⣿⢿⣽⣿⣿⣾⣿⣿⣿⣿⣿⣿⡀⠀⠀⠀⠘⠚⠚⠃⠀⠀",
    "⡄⠠⠀⠀⢸⢸⣯⡇⠐⠀⣿⣿⡿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⡄⠁⠀⠀⠀⠀⠀⢀",
    "⣪⠀⠈⠀⡏⢼⡾⡇⠈⠄⣿⣷⣿⣿⣿⡿⣿⣿⣿⣿⣿⣿⣿⣿⣍⠳⢤⣀⡐⣀⠴⠫",
    "⣪⠀⠁⣸⢑⢹⣯⣿⠀⡁⢹⣯⣿⣟⣿⣷⣿⣿⣿⡿⣿⣿⣿⣿⣿⣿⣷⣶⣿⣶⣿⣿",
    "⣪⠀⢀⣧⣬⣼⣿⣾⡇⠠⠈⣷⣟⣯⣿⣽⢷⢿⢷⣿⣿⣿⣽⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⣪⠀⢸⣿⣿⣿⣿⣿⣿⡄⠂⡈⢿⣿⣿⠀⡐⠠⠀⣿⣾⣿⣽⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⡪⠀⢸⣿⣿⣿⣿⣿⣿⣷⡀⢂⠈⢻⣿⡆⠠⢁⢂⠘⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿",
    "⢝⠀⢜⢿⣿⣿⣿⣿⣿⣿⣿⣄⠐⡀⠙⢿⣦⡐⠀⡂⠄⡈⡙⠛⠻⠿⠿⠿⠿⠿⠿⠟",
    "⡣⠀⢧⠀⠙⠯⣿⣿⣿⣿⣿⣿⣶⣀⠡⠀⠌⠛⢷⣀⢨⣀⣀⠁⠂⠂⠂⠔⠀⠂⠂⠌",
    "⡕⠀⡽⡳⣄⠀⠙⢿⣿⣿⣿⣿⣿⣿⣷⣤⡈⠀⡂⢀⠉⠛⠛⠿⠿⢿⣾⣾⣾⣷⣿⡿",
    "⢎⠀⢽⡸⡸⡣⡄⠀⠙⢿⣿⣿⣿⣿⣿⣿⣿⣷⣦⠤⣈⡀⡡⠐⡀⢂⠠⢀⠠⠀⠠⠀",
  ],
  "future-trunks": [
    "⠰⡨⢂⠪⡐⢔⠡⡂⡪⢐⠔⡡⢂⠪⡐⢌⠢⡊⢔⢌⠢⠪⡐⡌⢆⢊⢢⢑⢌⠢⡑⡌",
    "⢑⠌⡢⡑⢌⠢⡑⢌⠢⡑⠌⣂⠕⠊⡒⠥⡱⠊⠒⠦⣑⠅⡕⢌⠢⡃⢕⠰⢡⢑⢌⠢",
    "⠢⡑⠔⢌⠢⡑⢌⠢⡑⣨⠊⠠⠠⡀⡑⠃⠀⡁⠄⠀⠀⠙⣄⢣⠱⡘⢌⢊⢂⠂⠂⠂",
    "⢌⢌⢊⢢⢑⢌⠢⡑⢴⠁⢀⢀⢀⠔⠁⠀⠀⠀⠡⠐⡀⡀⠈⣆⠣⡪⡘⡐⠄⡀⠀⡀",
    "⠰⡐⢅⠢⡑⡐⡑⡸⠁⠀⠀⢄⡘⠀⠄⠀⠀⠀⠠⠐⡐⠈⡐⠨⡊⢆⠪⡨⡂⡢⠡⡂",
    "⠨⡂⢅⠕⡨⢌⠢⣃⠀⠅⡰⠶⣠⡛⠐⡀⠈⢄⠀⡇⢐⡇⢨⢐⠇⡕⡱⢨⢂⠎⡌⢆",
    "⠨⡨⢂⠕⡨⢂⠅⢧⠨⢠⠂⢰⠁⠸⠈⡐⡜⡸⣀⡯⠔⣁⢕⠣⡱⡘⢌⢢⢑⢌⢌⠆",
    "⣌⠂⢅⠢⢊⠔⡑⢌⠕⢔⣃⡧⠐⠀⠃⠖⠁⡩⠐⠰⡁⡇⢅⠣⡪⡘⢌⠆⢕⠔⢅⠪",
    "⣿⣷⣄⠅⢕⠨⡨⢂⠕⡡⠢⣂⠺⢉⠁⠝⠈⢀⠠⣋⠔⠅⡣⠱⠰⡸⡐⢕⢑⠜⢌⠪",
    "⠉⢿⣿⣷⣄⠑⢌⠢⢑⣈⣊⢘⢄⠐⠄⠀⠀⣀⣴⣞⣿⣷⣷⣿⡗⡨⡸⢨⠢⡃⡣⡑",
    "⠠⠠⠙⢿⣿⣷⣄⠑⡻⣽⣹⣝⣿⣷⠠⠒⠊⢀⠟⣾⡪⣿⣿⣟⠰⠨⢌⠆⣃⣑⠱⡨",
    "⠀⠈⠈⠀⠛⣿⡿⠋⣁⠜⣿⣿⡿⠋⠀⢐⡰⣷⢦⣼⣿⣿⣿⢟⣞⢷⢶⣻⢽⣻⣷⡨",
    "⠀⢀⠀⡀⡠⢋⣤⣾⡿⢿⣻⡏⠐⠐⠀⠁⠀⠸⣗⣟⣝⡾⣳⣫⢯⡿⣽⣺⢽⡞⢿⣿",
    "⠨⡂⡊⡔⡵⡯⣺⢵⢽⠂⢻⡀⠀⠈⠀⠀⣀⣴⢿⣼⡾⣽⣵⣯⣳⣟⣞⣞⡏⡴⡡⡺",
    "⡑⢌⠢⠸⣯⣫⡿⡻⣛⣇⢂⠻⠶⣷⣿⣿⣿⣿⣻⢾⣺⣵⣷⣷⣿⣞⣞⣞⣷⠸⢵⢱",
    "⢌⠢⡑⡹⡧⣿⣛⣿⡫⡾⣷⡈⣖⠌⡻⣿⣿⣟⡮⣿⢽⢮⣿⣿⣿⣗⣟⣞⣞⣿⣿⣿",
  ],
};

const CLAMP = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function safeNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function parseTimestampMs(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function toDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function logNorm(value: number, maxRef: number): number {
  if (value <= 0) return 0;
  return Math.max(0, Math.min(1, Math.log1p(value) / Math.log1p(maxRef)));
}

function topTools(tools: Map<string, number>, count = 3): Array<{ tool: string; count: number }> {
  return [...tools.entries()]
    .map(([tool, c]) => ({ tool, count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, count);
}

function parseLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(line);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractUsage(message: Record<string, unknown>, entry: Record<string, unknown>): Record<string, unknown> {
  const mu = message.usage;
  if (mu && typeof mu === "object") return mu as Record<string, unknown>;
  const eu = entry.usage;
  if (eu && typeof eu === "object") return eu as Record<string, unknown>;
  return {};
}

function extractTokens(usage: Record<string, unknown>): number {
  const direct =
    safeNumber(usage.totalTokens) ||
    safeNumber(usage.total_tokens) ||
    safeNumber(usage.tokens) ||
    safeNumber(usage.tokenCount);
  if (direct > 0) return direct;

  const input =
    safeNumber(usage.input) ||
    safeNumber(usage.inputTokens) ||
    safeNumber(usage.input_tokens) ||
    safeNumber(usage.promptTokens) ||
    safeNumber(usage.prompt_tokens);

  const output =
    safeNumber(usage.output) ||
    safeNumber(usage.outputTokens) ||
    safeNumber(usage.output_tokens) ||
    safeNumber(usage.completionTokens) ||
    safeNumber(usage.completion_tokens);

  const sum = input + output;
  return sum > 0 ? sum : 0;
}

function extractCost(usage: Record<string, unknown>): number {
  const cost = usage.cost;
  if (typeof cost === "number" || typeof cost === "string") return safeNumber(cost);
  if (cost && typeof cost === "object") {
    return safeNumber((cost as Record<string, unknown>).total);
  }
  return 0;
}

async function walkSessionFiles(root: string): Promise<string[]> {
  const stack = [root];
  const files: string[] = [];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;

    let entries: Dirent[] = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.endsWith(".jsonl")) files.push(full);
    }
  }

  files.sort((a, b) => b.localeCompare(a));
  return files.slice(0, MAX_FILES);
}

async function analyzeSessionFile(filePath: string, scope: Scope, cwd: string, cutoffMs: number): Promise<Insights | null> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let fileCwd: string | null = null;
  let headerSeen = false;

  let sessions = 0;
  let userMessages = 0;
  let assistantMessages = 0;
  let toolResults = 0;
  let toolErrors = 0;
  let tokens = 0;
  let cost = 0;
  let firstTs: number | null = null;
  let lastTs: number | null = null;

  const tools = new Map<string, number>();
  const daySet = new Set<string>();

  try {
    for await (const line of rl) {
      const entry = parseLine(line);
      if (!entry) continue;

      if (!headerSeen && entry.type === "session") {
        headerSeen = true;
        fileCwd = typeof entry.cwd === "string" ? entry.cwd : null;
        if (scope === "project" && fileCwd !== cwd) return null;

        const ts = parseTimestampMs(entry.timestamp);
        if (ts !== null) {
          firstTs = ts;
          lastTs = ts;
          daySet.add(toDayKey(ts));
        }
        sessions = 1;
        continue;
      }

      if (entry.type !== "message") continue;
      const message = entry.message;
      if (!message || typeof message !== "object") continue;
      const msg = message as Record<string, unknown>;

      const role = typeof msg.role === "string" ? msg.role : "";
      if (role === "user") userMessages += 1;
      if (role === "assistant") assistantMessages += 1;

      if (role === "toolResult") {
        toolResults += 1;
        const toolName = typeof msg.toolName === "string" ? msg.toolName : "unknown";
        tools.set(toolName, (tools.get(toolName) ?? 0) + 1);
        if (msg.isError === true) toolErrors += 1;
      }

      const ts = parseTimestampMs(entry.timestamp) ?? parseTimestampMs(msg.timestamp);
      if (ts !== null) {
        if (firstTs === null || ts < firstTs) firstTs = ts;
        if (lastTs === null || ts > lastTs) lastTs = ts;
        daySet.add(toDayKey(ts));
      }

      const usage = extractUsage(msg, entry);
      tokens += extractTokens(usage);
      cost += extractCost(usage);
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  if (sessions === 0) return null;
  if (lastTs !== null && lastTs < cutoffMs) return null;

  return {
    sessions,
    userMessages,
    assistantMessages,
    toolResults,
    toolErrors,
    tokens,
    cost,
    activeDays: daySet.size,
    dayKeys: daySet,
    firstTs,
    lastTs,
    tools,
  };
}

function mergeInsights(a: Insights, b: Insights): Insights {
  const tools = new Map(a.tools);
  for (const [tool, c] of b.tools.entries()) tools.set(tool, (tools.get(tool) ?? 0) + c);

  const dayKeys = new Set<string>(a.dayKeys);
  for (const key of b.dayKeys) dayKeys.add(key);

  return {
    sessions: a.sessions + b.sessions,
    userMessages: a.userMessages + b.userMessages,
    assistantMessages: a.assistantMessages + b.assistantMessages,
    toolResults: a.toolResults + b.toolResults,
    toolErrors: a.toolErrors + b.toolErrors,
    tokens: a.tokens + b.tokens,
    cost: a.cost + b.cost,
    activeDays: dayKeys.size,
    dayKeys,
    firstTs: a.firstTs === null ? b.firstTs : b.firstTs === null ? a.firstTs : Math.min(a.firstTs, b.firstTs),
    lastTs: a.lastTs === null ? b.lastTs : b.lastTs === null ? a.lastTs : Math.max(a.lastTs, b.lastTs),
    tools,
  };
}

async function analyzePiSessions(scope: Scope, cwd: string): Promise<Insights> {
  const empty: Insights = {
    sessions: 0,
    userMessages: 0,
    assistantMessages: 0,
    toolResults: 0,
    toolErrors: 0,
    tokens: 0,
    cost: 0,
    activeDays: 0,
    dayKeys: new Set<string>(),
    firstTs: null,
    lastTs: null,
    tools: new Map(),
  };

  const cutoff = Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000;
  const files = await walkSessionFiles(SESSION_ROOT);

  let agg = empty;
  for (const file of files) {
    const insights = await analyzeSessionFile(file, scope, cwd, cutoff);
    if (!insights) continue;
    agg = mergeInsights(agg, insights);
  }
  return agg;
}

function pickFighter(insights: Insights, chosenFighterId?: string): Fighter {
  if (chosenFighterId) {
    const forced = FIGHTERS.find((f) => f.id === chosenFighterId || f.name.toLowerCase() === chosenFighterId.toLowerCase());
    if (forced) return forced;
  }

  let allowedRarity: Rarity = "common";
  if (insights.sessions >= 140) allowedRarity = "legendary";
  else if (insights.sessions >= 70) allowedRarity = "rare";
  else if (insights.sessions >= 25) allowedRarity = "uncommon";

  const candidates = FIGHTERS.filter((f) => RARITY_SCORE[f.rarity] <= RARITY_SCORE[allowedRarity]);
  const top = topTools(insights.tools, 3).map((x) => x.tool).join(",");
  const seed = hashString(`${insights.sessions}|${insights.toolResults}|${insights.toolErrors}|${top}`);
  return candidates[seed % candidates.length] ?? FIGHTERS[seed % FIGHTERS.length]!;
}

function personalityFor(fighter: Fighter): string {
  return FANDOM_PERSONALITY[fighter.id] ?? fighter.tagline;
}

function quoteFor(fighter: Fighter, seed: number): string {
  const quotes = FANDOM_QUOTES[fighter.id] ?? [];
  if (quotes.length === 0) {
    return `${fighter.tagline}.`;
  }
  return quotes[seed % quotes.length] ?? quotes[0]!;
}

function harnessIssueLabel(toolName?: string): string {
  const tool = (toolName ?? "").toLowerCase();
  if (!tool) return "the harness threw a curveball";
  if (tool === "bash") return "the shell command detonated mid-combo";
  if (tool === "read") return "the file path looked right but reality disagreed";
  if (tool === "edit") return "the patch rejected your ki signature";
  if (tool === "write") return "the write landed off-target";
  if (tool === "grep") return "grep stared into the void and found nothing";
  if (tool === "find") return "find ghosted the target file";
  if (tool === "webfetch") return "the fetch returned smoke instead of signal";
  if (tool === "websearch") return "the search result was all aura, no answer";
  return `${toolName} misfired in the harness`;
}

function harnessSpinLine(fighter: Fighter, seed: number, options: HarnessSpinOptions): string {
  const topTool = options.topTool ?? "read";
  const issue = harnessIssueLabel(options.toolName);
  const noisy = (options.errorCount ?? 0) > 0;

  const hero = {
    profile: [
      `In this harness: scout with ${topTool}, isolate the bug, then ship clean.`,
      `Treat flaky runs as sparring sessions: inspect, narrow, rerun.`,
      `${noisy ? "The logs are loud" : "The run is calm"}; keep your stack traces close and your commits small.`,
    ],
    intro: [
      `We'll push this repo from red to green one rerun at a time.`,
      `Let's train on real failures, not guesses.`,
    ],
    pet: [
      `Good. Ki restored. Re-run the failing step and commit the win.`,
      `Nice. Focus up: reproduce, patch, verify.`,
    ],
    error: [
      `${issue}; breathe, inspect output, and counter with a tighter command.`,
      `${issue}; no panic—turn that trace into a precise fix.`,
    ],
    power: [
      `Context pressure's climbing—switch to precision mode and trim noise.`,
      `High power level detected; summarize, compact, and keep only what matters.`,
      `Scouter screaming; shorten the path: isolate, patch, verify.`,
    ],
  };

  const villain = {
    profile: [
      `In this harness: break ambiguity, dominate ${topTool}, and force deterministic outcomes.`,
      `Make every flaky path confess with logs, diffs, and repeatable runs.`,
      `${noisy ? "This chaos is useful" : "The board is stable"}; exploit weak spots and harden the pipeline.`,
    ],
    intro: [
      `Excellent. We'll turn every red build into proof of superiority.`,
      `I accept. We hunt bugs until the harness submits.`,
    ],
    pet: [
      `Good tribute. Now crush the regression before it mutates.`,
      `Keep feeding momentum; we'll delete this bug line by line.`,
    ],
    error: [
      `${issue}; weakness detected. Tighten control and strike again.`,
      `${issue}; perfect—now we know exactly where to attack.`,
    ],
    power: [
      `Context saturation is near; purge dead weight and dominate the window.`,
      `Scouter overload—compress context, preserve only strategic memory.`,
      `Power spike confirmed; force deterministic steps before overflow wins.`,
    ],
  };

  const bank = fighter.alignment === "villain" ? villain : hero;
  const lines = bank[options.mode];
  return lines[seed % lines.length] ?? lines[0]!;
}

function formatHarnessQuote(fighter: Fighter, seed: number, options: HarnessSpinOptions): { canon: string; spin: string } {
  return {
    canon: quoteFor(fighter, seed),
    spin: harnessSpinLine(fighter, seed + 17, options),
  };
}

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase();
}

function commandFromToolEvent(event: { toolName?: string; input?: unknown }): string {
  if (normalizeToolName(event.toolName ?? "") !== "bash") return "";
  const input = event.input;
  if (!input || typeof input !== "object") return "";
  const command = (input as { command?: unknown }).command;
  return typeof command === "string" ? command : "";
}

function textFromToolEvent(event: { content?: unknown }): string {
  const content = event.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (!c || typeof c !== "object") return "";
        const t = (c as { text?: unknown }).text;
        return typeof t === "string" ? t : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function isTestCommand(command: string): boolean {
  const c = command.toLowerCase();
  return /\b(test|vitest|jest|pytest|bun\s+test|npm\s+test|pnpm\s+test)\b/.test(c);
}

function isLintCommand(command: string): boolean {
  const c = command.toLowerCase();
  return /\b(lint|typecheck|eslint|ruff|ty)\b/.test(c);
}

function parseFailingTests(output: string): number | null {
  const patterns = [
    /(\d+)\s+failing\b/i,
    /(\d+)\s+failed\b/i,
    /failures?\s*[:=]\s*(\d+)/i,
    /tests?\s*failed\s*[:=]?\s*(\d+)/i,
  ];
  for (const rx of patterns) {
    const m = output.match(rx);
    if (m && m[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  return null;
}

function deriveArc(state: BuddyState): ArcName {
  const tokenPressure = logNorm(state.contextTokens, 150_000);
  const ragePressure = state.rage / 100;
  const testPressure = state.scouterFailingTests === null ? 0 : Math.min(1, state.scouterFailingTests / 12);
  const stress = 0.45 * tokenPressure + 0.4 * ragePressure + 0.15 * testPressure;

  if (stress >= 0.66) return "Cell Saga";
  if (stress >= 0.33) return "Namek Saga";
  return "Saiyan Saga";
}

function rageBar(rage: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(rage / 20)));
  return `${"▮".repeat(filled)}${"▯".repeat(5 - filled)}`;
}

function enemyOfTheDay(failureByTool: Record<string, number>): string {
  const sorted = Object.entries(failureByTool).sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[0];
  if (!top) return "Training Dummy";
  return ENEMY_ALIAS[top] ?? `${top} Warlord`;
}


function buildStats(insights: Insights, fighter: Fighter): Record<StatKey, number> {
  const totalOps = Math.max(1, insights.toolResults);
  const readOps = (insights.tools.get("read") ?? 0) + (insights.tools.get("grep") ?? 0) + (insights.tools.get("find") ?? 0) + (insights.tools.get("ls") ?? 0);
  const writeOps = (insights.tools.get("edit") ?? 0) + (insights.tools.get("write") ?? 0);
  const bashOps = (insights.tools.get("bash") ?? 0) + (insights.tools.get("surf") ?? 0);
  const webOps = (insights.tools.get("WebFetch") ?? 0) + (insights.tools.get("WebSearch") ?? 0);

  const readWriteRatio = (readOps + writeOps) / totalOps;
  const bashRatio = bashOps / totalOps;
  const webRatio = webOps / totalOps;
  const errorRate = insights.toolErrors / totalOps;

  const sessionsScore = logNorm(insights.sessions, 250);
  const daysScore = logNorm(insights.activeDays, 120);
  const msgDensity = logNorm(insights.userMessages + insights.assistantMessages, 12000);

  const villainBoost = fighter.alignment === "villain" ? 8 : 0;

  return {
    debugging: CLAMP(28 + 40 * readWriteRatio + 16 * sessionsScore + 12 * errorRate),
    patience: CLAMP(25 + 42 * daysScore + 20 * sessionsScore + 8 * (1 - errorRate)),
    chaos: CLAMP(18 + 42 * bashRatio + 22 * webRatio + villainBoost),
    wisdom: CLAMP(24 + 35 * daysScore + 26 * readWriteRatio + 10 * msgDensity),
    snark: CLAMP(18 + 22 * msgDensity + 15 * errorRate + (hashString(fighter.id) % 24)),
  };
}

function buildProfile(insights: Insights, chosenFighterId?: string): BuddyProfile {
  const fighter = pickFighter(insights, chosenFighterId);
  const top = topTools(insights.tools, 3);
  const formSeed = hashString(`${fighter.id}|${insights.sessions}|${insights.toolResults}`);
  const form = fighter.forms[formSeed % fighter.forms.length] ?? fighter.forms[0] ?? "Base";

  const quoteSeed = hashString(`${fighter.id}|${insights.userMessages}|${insights.toolErrors}|${insights.activeDays}`);
  const quotePack = formatHarnessQuote(fighter, quoteSeed, {
    mode: "profile",
    topTool: top[0]?.tool,
    errorCount: insights.toolErrors,
  });

  return {
    fighter,
    quote: `"${quotePack.canon}"  (${form})`,
    harnessSpin: quotePack.spin,
    stats: buildStats(insights, fighter),
    topTools: top,
  };
}

function statBar(value: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(value / 10)));
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)} ${String(value).padStart(3, " ")}`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function tokenBucket(tokens: number): number {
  return Math.floor(Math.max(0, tokens) / 1000);
}

function over9000Jibe(tokens: number): string | null {
  if (!Number.isFinite(tokens) || tokens < 9000) return null;
  const k = tokenBucket(tokens);
  return `It's over ${k}k tokens!`;
}

function contextWindowLimit(ctx: ExtensionContext): number {
  const model = ctx.model as { contextWindow?: unknown } | undefined;
  const cw = model?.contextWindow;
  if (typeof cw === "number" && Number.isFinite(cw) && cw > 0) return cw;
  return 200_000;
}

function contextRatioFromState(ctx: ExtensionContext, tokens: number): number {
  const limit = contextWindowLimit(ctx);
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(1, tokens / limit));
}

function vitalityEmote(mood: number, energy: number, ctxRatio: number): string {
  if (ctxRatio >= 0.85 || energy < 30 || mood < 30) return "🥵";
  if (ctxRatio >= 0.70 || energy < 45 || mood < 45) return "😮‍💨";
  if (ctxRatio <= 0.35 && energy >= 70 && mood >= 60) return "😤";
  if (ctxRatio <= 0.45 && energy >= 60) return "⚡";
  return "🙂";
}

function fighterAura(frame: number, energy: number): string {
  const base = energy >= 75 ? ["⚡", "✶", "⚡", "✦"] : energy >= 40 ? ["✦", "·", "✶", "·"] : ["·", " ", "·", " "];
  return base[frame % base.length] ?? "·";
}

function renderSprite(profile: BuddyProfile, state: BuddyState): string[] {
  const aura = fighterAura(state.frame, state.energy);
  const art = CHARACTER_HEADS[profile.fighter.id] ?? [
    "   /^\\/^\\   ",
    "  /  _  _\\  ",
    " (   o o   ) ",
    "  \\__===__/  ",
  ];

  return art.map((line, i) => {
    if (i === 0) return ` ${aura}${line}${aura}`;
    if (i === Math.floor(art.length / 2)) return ` ${aura}${line}${aura}`;
    return `  ${line}`;
  });
}


function renderCard(profile: BuddyProfile, insights: Insights, state: BuddyState, currentContextTokens?: number): string {
  const topToolsText = profile.topTools.map((t) => `${t.tool}(${t.count})`).join(", ") || "n/a";
  const spanDays =
    insights.firstTs !== null && insights.lastTs !== null
      ? Math.max(1, Math.round((insights.lastTs - insights.firstTs) / (24 * 60 * 60 * 1000)) + 1)
      : 0;

  const lines: string[] = [];
  lines.push("/buddy");
  lines.push("");
  lines.push(`${profile.fighter.rarity.toUpperCase()} · DRAGON BALL Z · ${profile.fighter.name.toUpperCase()}`);
  lines.push(...renderSprite(profile, state));
  lines.push("");
  lines.push(profile.quote);
  lines.push(`Harness spin: ${profile.harnessSpin}`);
  lines.push(`Personality: ${personalityFor(profile.fighter)}`);
  lines.push("");
  lines.push(`DEBUGGING  ${statBar(profile.stats.debugging)}`);
  lines.push(`PATIENCE   ${statBar(profile.stats.patience)}`);
  lines.push(`CHAOS      ${statBar(profile.stats.chaos)}`);
  lines.push(`WISDOM     ${statBar(profile.stats.wisdom)}`);
  lines.push(`SNARK      ${statBar(profile.stats.snark)}`);
  lines.push("");
  lines.push(`Battle Spirit ${state.mood} · Team Bond ${state.affection} · Ki ${state.energy} · Stance ${state.mode}`);
  lines.push(`Arc ${state.arc} · Rage ${rageBar(state.rage)} · Enemy ${state.enemyOfDay}`);
  const powerJibe = over9000Jibe(currentContextTokens ?? 0);
  if (powerJibe) lines.push(`Power level: ${powerJibe}`);
  lines.push(`Source: ~/.pi/agent/sessions (${state.scope === "project" ? "project scope" : "all scopes"})`);
  lines.push(`Sessions: ${fmtNum(insights.sessions)} · Messages: ${fmtNum(insights.userMessages + insights.assistantMessages)} · Tool results: ${fmtNum(insights.toolResults)}`);
  lines.push(`Active days: ${insights.activeDays} · Span: ${spanDays}d · Top tools: ${topToolsText}`);
  if (insights.tokens > 0) lines.push(`Tokens: ${fmtNum(insights.tokens)}${insights.cost > 0 ? ` · Cost: $${insights.cost.toFixed(2)}` : ""}`);
  lines.push("");
  lines.push("/buddy list · /buddy train · /buddy senzu · /buddy zenkai · /buddy off · /buddy on · /buddy mode quiet|normal|chaotic · /buddy pick <character>");

  return lines.join("\n");
}

function renderWidgetLines(profile: BuddyProfile, state: BuddyState, ctxRatio: number): string[] {
  const sprite = renderSprite(profile, state);
  const emote = vitalityEmote(state.mood, state.energy, ctxRatio);
  const ctxPct = Math.round(ctxRatio * 100);
  const tempo = ctxRatio >= 0.7 ? "tired" : ctxRatio <= 0.4 ? "energized" : "steady";
  const enemy = state.enemyOfDay || "Training Dummy";

  return [
    `🐉 ${emote} ${profile.fighter.name}`,
    ...sprite,
    ` ${tempo} · ctx ${ctxPct}% · ⚡${state.energy} ❤${state.affection}`,
    ` scouter: ${enemy}`,
  ];
}

function parseScopeArg(input: string): Scope | null {
  if (input === "project") return "project";
  if (input === "all") return "all";
  return null;
}

function parseModeArg(input: string): Mode | null {
  if (input === "quiet" || input === "normal" || input === "chaotic") return input;
  return null;
}

function parseBuddyCommand(argsRaw: string): { action: string; rest: string[] } {
  const parts = argsRaw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { action: "show", rest: [] };
  return { action: parts[0]!.toLowerCase(), rest: parts.slice(1) };
}

function makeDefaultState(): BuddyState {
  return {
    enabled: true,
    animations: true,
    mode: "normal",
    mood: 62,
    affection: 50,
    energy: 72,
    scope: "project",
    frame: 0,
    profile: undefined,
    chosenFighterId: undefined,
    lockedFighterId: undefined,
    lastChimeAt: 0,
    lastPowerLevelBucket: 0,
    arc: "Saiyan Saga",
    rage: 0,
    berserkCharges: 0,
    contextTokens: 0,
    scouterFailingTests: null,
    testPassStreak: 0,
    successfulEdits: 0,
    sawLintFailure: false,
    sawTestFailure: false,
    recentTools: [],
    enemyOfDay: "Training Dummy",
    failureByTool: {},
    quest: undefined,
  };
}

function applyPersistedState(base: BuddyState, persisted: PersistedBuddyState | undefined): BuddyState {
  if (!persisted) return base;
  return {
    ...base,
    enabled: typeof persisted.enabled === "boolean" ? persisted.enabled : base.enabled,
    animations: typeof persisted.animations === "boolean" ? persisted.animations : base.animations,
    mode: persisted.mode ?? base.mode,
    mood: CLAMP(typeof persisted.mood === "number" ? persisted.mood : base.mood),
    affection: CLAMP(typeof persisted.affection === "number" ? persisted.affection : base.affection),
    energy: CLAMP(typeof persisted.energy === "number" ? persisted.energy : base.energy),
    scope: persisted.scope ?? base.scope,
    frame: typeof persisted.frame === "number" ? Math.max(0, persisted.frame) : base.frame,
    chosenFighterId: persisted.chosenFighterId ?? base.chosenFighterId,
    lockedFighterId: persisted.lockedFighterId ?? base.lockedFighterId,
    lastPowerLevelBucket:
      typeof persisted.lastPowerLevelBucket === "number"
        ? Math.max(0, persisted.lastPowerLevelBucket)
        : base.lastPowerLevelBucket,
    arc: persisted.arc ?? base.arc,
    rage: CLAMP(typeof persisted.rage === "number" ? persisted.rage : base.rage),
    berserkCharges: Math.max(0, typeof persisted.berserkCharges === "number" ? persisted.berserkCharges : base.berserkCharges),
    contextTokens: Math.max(0, typeof persisted.contextTokens === "number" ? persisted.contextTokens : base.contextTokens),
    scouterFailingTests:
      typeof persisted.scouterFailingTests === "number" || persisted.scouterFailingTests === null
        ? persisted.scouterFailingTests
        : base.scouterFailingTests,
    testPassStreak: Math.max(0, typeof persisted.testPassStreak === "number" ? persisted.testPassStreak : base.testPassStreak),
    successfulEdits: Math.max(0, typeof persisted.successfulEdits === "number" ? persisted.successfulEdits : base.successfulEdits),
    sawLintFailure: typeof persisted.sawLintFailure === "boolean" ? persisted.sawLintFailure : base.sawLintFailure,
    sawTestFailure: typeof persisted.sawTestFailure === "boolean" ? persisted.sawTestFailure : base.sawTestFailure,
    recentTools: Array.isArray(persisted.recentTools) ? persisted.recentTools.slice(0, 12) : base.recentTools,
    enemyOfDay: typeof persisted.enemyOfDay === "string" ? persisted.enemyOfDay : base.enemyOfDay,
    failureByTool: persisted.failureByTool && typeof persisted.failureByTool === "object"
      ? persisted.failureByTool
      : base.failureByTool,
    quest: persisted.quest ?? base.quest,
  };
}

function usageText(): string {
  return [
    "Usage:",
    "  /buddy                    show card",
    "  /buddy list               show all available fighters",
    "  /buddy on|off             toggle buddy widget",
    "  /buddy train              sparring boost (spirit/bond)",
    "  /buddy senzu              instant ki recovery boost",
    "  /buddy zenkai             huge comeback boost (spirit/bond)",
    "  /buddy mode <m>           quiet|normal|chaotic",
    "  /buddy anim on|off        toggle animation",
    "  /buddy scope project|all  choose trace scope",
    "  /buddy pick <character>   choose DBZ character",
    "  /buddy reset              clear custom pick and refresh",
  ].join("\n");
}

export default function buddyFromTracesExtension(pi: ExtensionAPI): void {
  let state = makeDefaultState();
  let activeCtx: ExtensionContext | null = null;
  let animationTimer: NodeJS.Timeout | null = null;
  let cache: { scope: Scope; cwd: string; ts: number; insights: Insights } | null = null;

  function persistState() {
    pi.appendEntry<PersistedBuddyState>("dbz-buddy-state", {
      enabled: state.enabled,
      animations: state.animations,
      mode: state.mode,
      mood: state.mood,
      affection: state.affection,
      energy: state.energy,
      scope: state.scope,
      frame: state.frame,
      chosenFighterId: state.chosenFighterId,
      lockedFighterId: state.lockedFighterId,
      lastPowerLevelBucket: state.lastPowerLevelBucket,
      arc: state.arc,
      rage: state.rage,
      berserkCharges: state.berserkCharges,
      contextTokens: state.contextTokens,
      scouterFailingTests: state.scouterFailingTests,
      testPassStreak: state.testPassStreak,
      successfulEdits: state.successfulEdits,
      sawLintFailure: state.sawLintFailure,
      sawTestFailure: state.sawTestFailure,
      recentTools: state.recentTools,
      enemyOfDay: state.enemyOfDay,
      failureByTool: state.failureByTool,
      quest: state.quest,
    });
  }

  function clearWidget(ctx: ExtensionContext | null) {
    if (!ctx || !ctx.hasUI) return;
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    ctx.ui.setStatus(STATUS_KEY, undefined);
  }

  function renderWidget(ctx: ExtensionContext | null) {
    if (!ctx || !ctx.hasUI) return;
    if (!state.enabled || !state.profile) {
      clearWidget(ctx);
      return;
    }

    const usage = ctx.getContextUsage();
    const liveTokens = usage && Number.isFinite(usage.tokens) ? usage.tokens : state.contextTokens;
    const safeTokens = Math.max(0, liveTokens ?? 0);
    state.contextTokens = safeTokens;
    const ratio = contextRatioFromState(ctx, safeTokens);

    ctx.ui.setWidget(
      WIDGET_KEY,
      () => ({
        render(width: number) {
          const lines = renderWidgetLines(state.profile!, state, ratio);
          return lines.map((line) => {
            const pad = Math.max(0, width - visibleWidth(line) - 1);
            return `${" ".repeat(pad)}${line}`;
          });
        },
        invalidate() {},
      }),
      { placement: "aboveEditor" },
    );
    ctx.ui.setStatus(STATUS_KEY, `🐉 ${state.profile.fighter.name} ${vitalityEmote(state.mood, state.energy, ratio)}`);
  }

  function stopAnimation() {
    if (animationTimer) {
      clearInterval(animationTimer);
      animationTimer = null;
    }
  }

  function startAnimation() {
    stopAnimation();
    if (!state.enabled || !state.animations || !activeCtx || !activeCtx.hasUI || !state.profile) {
      renderWidget(activeCtx);
      return;
    }

    renderWidget(activeCtx);

    animationTimer = setInterval(() => {
      state.frame = (state.frame + 1) % 4;

      if (activeCtx) {
        const usage = activeCtx.getContextUsage();
        const liveTokens = usage && Number.isFinite(usage.tokens) ? usage.tokens : state.contextTokens;
        const tokens = Math.max(0, liveTokens ?? 0);
        const ratio = contextRatioFromState(activeCtx, tokens);
        state.contextTokens = tokens;

        if (ratio >= 0.78 && Math.random() < 0.35) {
          state.energy = CLAMP(state.energy - 1);
          if (Math.random() < 0.2) state.mood = CLAMP(state.mood - 1);
        } else if (ratio <= 0.38 && Math.random() < 0.4) {
          state.energy = CLAMP(state.energy + 1);
          if (Math.random() < 0.3) state.mood = CLAMP(state.mood + 1);
        }
      }

      renderWidget(activeCtx);
    }, 850);
  }

  function chimeCooldownMs(mode: Mode): number {
    if (mode === "quiet") return 180_000;
    if (mode === "chaotic") return 35_000;
    return 90_000;
  }

  function maybeChime(ctx: ExtensionContext, text: string, force = false) {
    const now = Date.now();
    if (!force && now - state.lastChimeAt < chimeCooldownMs(state.mode)) return;
    state.lastChimeAt = now;

    if (!ctx.hasUI) {
      console.log(text);
      return;
    }

    pi.sendMessage(
      {
        customType: "dbz-buddy",
        content: text,
        display: true,
      },
      { triggerTurn: false },
    );
  }

  function maybeOver9000Chime(ctx: ExtensionContext, reason?: string) {
    const usage = ctx.getContextUsage();
    const tokens = usage?.tokens;
    if (!Number.isFinite(tokens) || tokens < 9000) return;

    const bucket = tokenBucket(tokens);
    if (bucket <= state.lastPowerLevelBucket) return;
    state.lastPowerLevelBucket = bucket;
    persistState();

    const jibe = over9000Jibe(tokens);
    if (!jibe || !state.profile) return;

    const seed = hashString(`${state.profile.fighter.id}|power|${bucket}|${tokens}`);
    const quotePack = formatHarnessQuote(state.profile.fighter, seed, {
      mode: "power",
      topTool: state.profile.topTools[0]?.tool,
      errorCount: state.rage,
    });
    const reasonSuffix = reason ? ` ${reason}` : "";
    const line = `${state.profile.fighter.name}: "${quotePack.canon}" · ${jibe} ${quotePack.spin}${reasonSuffix}`;

    maybeChime(ctx, line, true);
  }

  function applyContextDynamics(ctx: ExtensionContext) {
    const usage = ctx.getContextUsage();
    const nowTokens = usage && Number.isFinite(usage.tokens) ? Math.max(0, usage.tokens) : state.contextTokens;
    const previous = state.contextTokens;
    state.contextTokens = nowTokens;

    const ratio = contextRatioFromState(ctx, nowTokens);
    const delta = nowTokens - previous;

    if (ratio >= 0.85) {
      state.energy = CLAMP(state.energy - 3);
      state.mood = CLAMP(state.mood - 2);
      state.rage = CLAMP(state.rage + 4);
    } else if (ratio >= 0.70) {
      state.energy = CLAMP(state.energy - 2);
      state.mood = CLAMP(state.mood - 1);
      state.rage = CLAMP(state.rage + 2);
    } else if (delta <= -4000) {
      state.energy = CLAMP(state.energy + 4);
      state.mood = CLAMP(state.mood + 3);
      state.rage = CLAMP(state.rage - 6);
    } else if (delta <= -1200) {
      state.energy = CLAMP(state.energy + 2);
      state.mood = CLAMP(state.mood + 1);
      state.rage = CLAMP(state.rage - 3);
    }

    state.arc = deriveArc(state);
  }

  function observeToolResult(event: { toolName?: string; input?: unknown; content?: unknown; isError?: boolean }, ctx: ExtensionContext) {
    const tool = normalizeToolName(event.toolName ?? "unknown");
    const cmd = commandFromToolEvent(event);
    const output = textFromToolEvent(event);

    state.recentTools = [tool, ...state.recentTools.filter((t) => t !== tool)].slice(0, 12);

    if (event.isError) {
      state.failureByTool[tool] = (state.failureByTool[tool] ?? 0) + 1;
      state.rage = CLAMP(state.rage + 18);
      state.testPassStreak = 0;

      if (isTestCommand(cmd)) {
        const failing = parseFailingTests(output);
        state.scouterFailingTests = failing ?? state.scouterFailingTests;
        state.sawTestFailure = true;
      }
      if (isLintCommand(cmd)) {
        state.sawLintFailure = true;
      }

      if (state.rage >= 90) {
        state.berserkCharges = Math.max(state.berserkCharges, 3);
      }
    } else {
      state.rage = CLAMP(state.rage - 4);

      if (tool === "edit" || tool === "write") {
        state.successfulEdits += 1;
        state.mood = CLAMP(state.mood + 1);
      }

      if (isTestCommand(cmd)) {
        const failing = parseFailingTests(output);
        if (failing !== null) {
          state.scouterFailingTests = failing;
        }
        if (failing === null || failing === 0) {
          state.testPassStreak += 1;
          if (state.testPassStreak >= 3 && state.profile) {
            maybeChime(ctx, `${state.profile.fighter.name}: "Final Kamehameha! Test streak complete."`, true);
            state.testPassStreak = 0;
            state.mood = CLAMP(state.mood + 4);
            state.energy = CLAMP(state.energy + 3);
          }
        } else {
          state.testPassStreak = 0;
          state.sawTestFailure = true;
        }
      }

      if (isLintCommand(cmd)) {
        const lintStillFailing = /(\berror\b|failed|problems?)/i.test(output) && !/(\b0\s+errors?\b|0\s+problems?)/i.test(output);
        if (!lintStillFailing) state.sawLintFailure = false;
      }

      if ((tool === "edit" || tool === "write") && state.successfulEdits >= 8 && state.profile) {
        maybeChime(ctx, `${state.profile.fighter.name}: "Spirit Bomb landed. Massive refactor stabilized."`, true);
        state.successfulEdits = 0;
        state.mood = CLAMP(state.mood + 5);
      }
    }

    if (state.berserkCharges > 0 && state.profile) {
      const taunts = [
        `${state.profile.fighter.name}: "BERSERK MODE: no mercy for flaky tools."`,
        `${state.profile.fighter.name}: "BERSERK MODE: isolate, patch, obliterate."`,
        `${state.profile.fighter.name}: "BERSERK MODE: this harness will submit."`,
      ];
      const pick = taunts[hashString(`${tool}|${Date.now()}`) % taunts.length] ?? taunts[0]!;
      maybeChime(ctx, pick, true);
      state.berserkCharges = Math.max(0, state.berserkCharges - 1);
    }

    state.enemyOfDay = enemyOfTheDay(state.failureByTool);
  }

  async function getInsights(scope: Scope, cwd: string): Promise<Insights> {
    if (cache && cache.scope === scope && cache.cwd === cwd && Date.now() - cache.ts < CACHE_TTL_MS) {
      return cache.insights;
    }
    const insights = await analyzePiSessions(scope, cwd);
    cache = { scope, cwd, ts: Date.now(), insights };
    return insights;
  }

  async function ensureProfile(ctx: ExtensionContext): Promise<{ profile: BuddyProfile; insights: Insights } | null> {
    const insights = await getInsights(state.scope, ctx.cwd);
    if (insights.sessions === 0) return null;

    // Always use ALL traces for fighter selection so the character is consistent
    // across projects and unlocks are based on total activity.
    const allInsights = state.scope === "all" ? insights : await getInsights("all", ctx.cwd);
    const forced = state.chosenFighterId ?? state.lockedFighterId;
    state.profile = buildProfile(allInsights.sessions > 0 ? allInsights : insights, forced);

    if (!state.lockedFighterId && state.profile?.fighter.id) {
      state.lockedFighterId = state.profile.fighter.id;
      persistState();
    }

    return { profile: state.profile, insights };
  }

  function restoreStateFromSession(ctx: ExtensionContext) {
    const branch = ctx.sessionManager.getBranch();
    let persisted: PersistedBuddyState | undefined;

    for (const entry of branch) {
      if (entry.type === "custom" && entry.customType === "dbz-buddy-state") {
        persisted = entry.data as PersistedBuddyState | undefined;
      }
    }

    state = applyPersistedState(makeDefaultState(), persisted);
  }

  pi.registerMessageRenderer("dbz-buddy", (message) => new Text(message.content, 0, 0));

  pi.on("session_start", async (_event, ctx) => {
    activeCtx = ctx;
    restoreStateFromSession(ctx);

    if (!state.enabled) {
      clearWidget(ctx);
      return;
    }

    const built = await ensureProfile(ctx);
    if (!built) {
      clearWidget(ctx);
      return;
    }

    state.enemyOfDay = enemyOfTheDay(state.failureByTool);
    applyContextDynamics(ctx);
    persistState();
    startAnimation();
  });

  pi.on("session_shutdown", async () => {
    stopAnimation();
  });

  pi.on("tool_result", async (event, ctx) => {
    if (!state.enabled || !state.profile) return;

    applyContextDynamics(ctx);
    observeToolResult(event, ctx);

    if (event.isError) {
      state.mood = CLAMP(state.mood - 4);
      state.energy = CLAMP(state.energy - 2);
      state.affection = CLAMP(state.affection - 1);

      const seed = hashString(`${state.profile.fighter.id}|error|${event.toolName}|${Date.now()}`);
      const quotePack = formatHarnessQuote(state.profile.fighter, seed, {
        mode: "error",
        toolName: event.toolName,
        topTool: state.profile.topTools[0]?.tool,
        errorCount: 1,
      });
      maybeChime(ctx, `${state.profile.fighter.name}: "${quotePack.canon}" · ${quotePack.spin}`, state.mode === "chaotic");
    } else {
      state.energy = CLAMP(state.energy + 1);
      state.mood = CLAMP(state.mood + 1);
    }

    maybeOver9000Chime(ctx, `(after ${event.toolName})`);
    state.arc = deriveArc(state);
    persistState();
    renderWidget(activeCtx);
  });

  pi.registerCommand("buddy", {
    description: "DBZ tamagotchi buddy from ~/.pi traces",
    getArgumentCompletions: (prefix) => {
      const base = [
        { value: "on", label: "on", description: "Enable buddy widget" },
        { value: "off", label: "off", description: "Disable buddy widget" },
        { value: "train", label: "train", description: "Sparring boost (spirit/bond)" },
        { value: "senzu", label: "senzu", description: "Instant ki recovery boost" },
        { value: "zenkai", label: "zenkai", description: "Huge comeback boost" },
        { value: "mode quiet", label: "mode quiet", description: "Minimal chatter" },
        { value: "mode normal", label: "mode normal", description: "Default chatter" },
        { value: "mode chaotic", label: "mode chaotic", description: "Maximum chaos" },
        { value: "anim on", label: "anim on", description: "Enable animations" },
        { value: "anim off", label: "anim off", description: "Disable animations" },
        { value: "scope project", label: "scope project", description: "Use current project traces" },
        { value: "scope all", label: "scope all", description: "Use all ~/.pi traces" },
        { value: "pick", label: "pick <character>", description: "Choose DBZ character" },
        { value: "reset", label: "reset", description: "Reset buddy state" },
        { value: "help", label: "help", description: "Show usage" },
      ];

      const trimmed = prefix.trim();
      if (!trimmed) return base;

      const lower = trimmed.toLowerCase();
      if (lower.startsWith("pick ")) {
        const query = lower.slice(5).trim();
        const items = FIGHTERS
          .map((f) => ({
            value: `pick ${f.name}`,
            label: `pick ${f.name}`,
            description: `${f.rarity} · ${f.alignment}`,
          }))
          .filter((i) => i.value.toLowerCase().includes(query));
        return items.length > 0 ? items : null;
      }

      const filtered = base.filter((item) => item.value.toLowerCase().startsWith(lower));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      activeCtx = ctx;

      const { action, rest } = parseBuddyCommand(args);

      if (action === "help") {
        const help = usageText();
        if (ctx.hasUI) ctx.ui.notify(help, "info");
        else console.log(help);
        return;
      }

      // Shorthand: /buddy all or /buddy project
      const shorthandScope = parseScopeArg(action);
      if (shorthandScope) {
        state.scope = shorthandScope;
        cache = null;
      }

      if (action === "on") {
        state.enabled = true;
        const built = await ensureProfile(ctx);
        if (!built) {
          const msg = "No sessions found in ~/.pi/agent/sessions for current scope.";
          if (ctx.hasUI) ctx.ui.notify(msg, "warning");
          else console.log(msg);
          return;
        }
        startAnimation();
        persistState();
        if (ctx.hasUI) ctx.ui.notify(`Buddy enabled: ${built.profile.fighter.name}`, "info");
        else console.log(`Buddy enabled: ${built.profile.fighter.name}`);
        return;
      }

      if (action === "off") {
        state.enabled = false;
        stopAnimation();
        clearWidget(ctx);
        persistState();
        if (ctx.hasUI) ctx.ui.notify("Buddy disabled", "info");
        else console.log("Buddy disabled");
        return;
      }

      if (action === "train" || action === "pet" || action === "senzu" || action === "zenkai") {
        const built = await ensureProfile(ctx);
        if (!built) {
          const msg = "No sessions found to generate buddy.";
          if (ctx.hasUI) ctx.ui.notify(msg, "warning");
          else console.log(msg);
          return;
        }

        const isSenzu = action === "senzu";
        const isZenkai = action === "zenkai";
        const lowMoodBonus = state.mood < 45 ? 6 : 0;

        state.affection = CLAMP(state.affection + (isZenkai ? 20 : isSenzu ? 12 : 8));
        state.mood = CLAMP(state.mood + (isZenkai ? 20 + lowMoodBonus : isSenzu ? 18 : 6));
        state.energy = CLAMP(state.energy + (isZenkai ? 14 : isSenzu ? 22 : 4));
        state.frame = (state.frame + 1) % 4;
        renderWidget(activeCtx);
        persistState();

        const seed = hashString(`${built.profile.fighter.id}|${action}|${Date.now()}`);
        const trainQuote = formatHarnessQuote(built.profile.fighter, seed, {
          mode: "pet",
          topTool: built.profile.topTools[0]?.tool,
          errorCount: 0,
        });
        const flavor = isZenkai
          ? "Zenkai boost unlocked." 
          : isSenzu
            ? "Senzu boost applied."
            : "Training complete.";
        maybeChime(ctx, `${built.profile.fighter.name}: "${trainQuote.canon}" · ${trainQuote.spin} ${flavor}`, true);
        return;
      }

      if (action === "mode") {
        const mode = parseModeArg((rest[0] ?? "").toLowerCase());
        if (!mode) {
          const msg = "Usage: /buddy mode quiet|normal|chaotic";
          if (ctx.hasUI) ctx.ui.notify(msg, "warning");
          else console.log(msg);
          return;
        }
        state.mode = mode;
        persistState();
        startAnimation();
        if (ctx.hasUI) ctx.ui.notify(`Buddy mode: ${mode}`, "info");
        else console.log(`Buddy mode: ${mode}`);
        return;
      }

      if (action === "anim") {
        const val = (rest[0] ?? "").toLowerCase();
        if (val !== "on" && val !== "off") {
          const msg = "Usage: /buddy anim on|off";
          if (ctx.hasUI) ctx.ui.notify(msg, "warning");
          else console.log(msg);
          return;
        }
        state.animations = val === "on";
        persistState();
        startAnimation();
        if (ctx.hasUI) ctx.ui.notify(`Buddy animation ${state.animations ? "enabled" : "disabled"}`, "info");
        else console.log(`Buddy animation ${state.animations ? "enabled" : "disabled"}`);
        return;
      }

      if (action === "scope") {
        const parsedScope = parseScopeArg((rest[0] ?? "").toLowerCase());
        if (!parsedScope) {
          const msg = "Usage: /buddy scope project|all";
          if (ctx.hasUI) ctx.ui.notify(msg, "warning");
          else console.log(msg);
          return;
        }

        state.scope = parsedScope;
        cache = null;
        const built = await ensureProfile(ctx);
        if (!built) {
          const msg = "No sessions found for selected scope.";
          if (ctx.hasUI) ctx.ui.notify(msg, "warning");
          else console.log(msg);
          return;
        }

        startAnimation();
        persistState();
        if (ctx.hasUI) ctx.ui.notify(`Buddy scope set to ${parsedScope}`, "info");
        else console.log(`Buddy scope set to ${parsedScope}`);
        return;
      }

      if (action === "pick") {
        const wanted = rest.join(" ").trim().toLowerCase();
        if (!wanted) {
          const msg = "Usage: /buddy pick <character>";
          if (ctx.hasUI) ctx.ui.notify(msg, "warning");
          else console.log(msg);
          return;
        }

        const match = FIGHTERS.find((f) => f.id.toLowerCase() === wanted || f.name.toLowerCase() === wanted || f.name.toLowerCase().includes(wanted));
        if (!match) {
          const msg = `Unknown character. Try one of: ${FIGHTERS.map((f) => f.name).join(", ")}`;
          if (ctx.hasUI) ctx.ui.notify(msg, "warning");
          else console.log(msg);
          return;
        }

        state.chosenFighterId = match.id;
        state.lockedFighterId = match.id;
        const built = await ensureProfile(ctx);
        if (!built) {
          const msg = "No sessions found to generate buddy.";
          if (ctx.hasUI) ctx.ui.notify(msg, "warning");
          else console.log(msg);
          return;
        }

        state.mood = CLAMP(state.mood + 4);
        state.energy = CLAMP(state.energy + 3);
        startAnimation();
        persistState();

        const seed = hashString(`${built.profile.fighter.id}|intro|${Date.now()}`);
        const introQuote = formatHarnessQuote(built.profile.fighter, seed, {
          mode: "intro",
          topTool: built.profile.topTools[0]?.tool,
          errorCount: built.insights.toolErrors,
        });
        maybeChime(ctx, `${built.profile.fighter.name}: "${introQuote.canon}" · ${introQuote.spin}`, true);

        const card = renderCard(built.profile, built.insights, state, ctx.getContextUsage()?.tokens);
        if (!ctx.hasUI) console.log(card);
        else {
          pi.sendMessage(
            {
              customType: "dbz-buddy",
              content: card,
              display: true,
            },
            { triggerTurn: false },
          );
        }
        return;
      }

      if (action === "list") {
        const lines: string[] = ["Available fighters:",""];
        for (const f of FIGHTERS) {
          const tag = f.id === state.lockedFighterId ? " ◀ current" : "";
          lines.push(`  ${f.rarity.padEnd(10)} ${f.name.padEnd(16)} ${f.alignment.padEnd(8)} ${f.tagline}${tag}`);
        }
        lines.push("");
        lines.push("Use /buddy pick <name> to choose.");
        const msg = lines.join("\n");
        if (ctx.hasUI) ctx.ui.notify(msg, "info");
        else console.log(msg);
        return;
      }

      if (action === "reset") {
        state.chosenFighterId = undefined;
        state.lockedFighterId = undefined;
        state.mood = 62;
        state.affection = 50;
        state.energy = 72;
        cache = null;

        const built = await ensureProfile(ctx);
        if (!built) {
          const msg = "No sessions found to generate buddy.";
          if (ctx.hasUI) ctx.ui.notify(msg, "warning");
          else console.log(msg);
          return;
        }
        startAnimation();
        persistState();

        if (ctx.hasUI) ctx.ui.notify(`Buddy reset: ${built.profile.fighter.name}`, "info");
        else console.log(`Buddy reset: ${built.profile.fighter.name}`);
        return;
      }

      const built = await ensureProfile(ctx);
      if (!built) {
        const msg = state.scope === "project"
          ? "No sessions found for this cwd in ~/.pi/agent/sessions"
          : "No sessions found in ~/.pi/agent/sessions";
        if (ctx.hasUI) ctx.ui.notify(msg, "warning");
        else console.log(msg);
        return;
      }

      const card = renderCard(built.profile, built.insights, state, ctx.getContextUsage()?.tokens);

      if (!ctx.hasUI) {
        console.log(card);
      } else {
        pi.sendMessage(
          {
            customType: "dbz-buddy",
            content: card,
            display: true,
            details: {
              fighter: built.profile.fighter.id,
              scope: state.scope,
              mode: state.mode,
              stats: built.profile.stats,
            },
          },
          { triggerTurn: false },
        );
      }

      maybeOver9000Chime(ctx);
      if (state.enabled) startAnimation();
      persistState();
    },
  });
}
