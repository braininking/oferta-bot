import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const repo = "https://github.com/braininking/oferta-bot.git";
const work = path.join(process.env.TEMP || "C:\\Temp", "ofertabot-github-trigger");

function git(args) {
  return execFileSync("git", args, {
    cwd: work,
    stdio: "pipe",
    encoding: "utf8"
  });
}

if (!fs.existsSync(path.join(work, ".git"))) {
  fs.mkdirSync(path.dirname(work), { recursive: true });
  execFileSync("git", ["clone", "--filter=blob:none", "--no-checkout", repo, work], {
    stdio: "inherit"
  });
}

git(["fetch", "origin", "main"]);
git(["checkout", "-B", "main", "origin/main"]);

const heartbeat = path.join(work, "data", "scheduler-heartbeat.txt");
fs.mkdirSync(path.dirname(heartbeat), { recursive: true });
fs.writeFileSync(heartbeat, new Date().toISOString() + "\n", "utf8");

git(["add", "data/scheduler-heartbeat.txt"]);

try {
  git(["-c", "user.name=OfertaBot-Scheduler", "-c", "user.email=bot@users.noreply.github.com",
    "commit", "-m", "chore: acionar garimpo automatico"
  ]);
} catch {
  process.exit(0);
}

git(["push", "origin", "HEAD:main"]);
console.log("[TRIGGER] GitHub acionado:", new Date().toISOString());
