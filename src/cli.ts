import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Command, CommanderError, InvalidArgumentError, Option } from "commander";
import { EXPORT_FORMATS, exportBacklog, type ExportFormat } from "./export/index.js";
import { createGenerator, GENERATORS, type GeneratorName } from "./generate/index.js";
import { readBacklog } from "./io.js";
import { formatReport, lintBacklog } from "./lint/index.js";
import { generateFromMarkdown } from "./pipeline.js";

export interface CliIo {
  out: (text: string) => void;
  err: (text: string) => void;
  env: Record<string, string | undefined>;
}

const defaultIo: CliIo = {
  out: (t) => process.stdout.write(t),
  err: (t) => process.stderr.write(t),
  env: process.env,
};

function integer(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new InvalidArgumentError("expected a whole number");
  return n;
}

export function buildProgram(io: CliIo = defaultIo): Command {
  const program = new Command("prd2backlog")
    .description("Turn a PRD into a traceable, linted backlog and export it to trackers.")
    .version("0.1.0")
    .configureOutput({ writeOut: io.out, writeErr: io.err })
    .exitOverride();

  program
    .command("generate")
    .description("Generate backlog.json and backlog.md from a markdown PRD")
    .argument("<prd>", "path to the PRD markdown file")
    .option("-o, --out <dir>", "output directory", "out")
    .addOption(
      new Option("-p, --provider <name>", "generator").choices(GENERATORS).default("heuristic"),
    )
    .option("-m, --model <model>", "model override for LLM providers")
    .option("--max-attempts <n>", "LLM validation/repair attempts", integer, 3)
    .action(
      async (
        prdPath: string,
        opts: { out: string; provider: GeneratorName; model?: string; maxAttempts: number },
      ) => {
        const markdown = await readFile(prdPath, "utf8");
        const generator = createGenerator(opts.provider, {
          env: io.env,
          maxAttempts: opts.maxAttempts,
          ...(opts.model ? { model: opts.model } : {}),
        });
        const { backlog, warnings } = await generateFromMarkdown(markdown, generator, prdPath);
        await mkdir(opts.out, { recursive: true });
        const jsonPath = join(opts.out, "backlog.json");
        const mdPath = join(opts.out, "backlog.md");
        await writeFile(jsonPath, `${JSON.stringify(backlog, null, 2)}\n`);
        await writeFile(mdPath, exportBacklog(backlog, "markdown"));

        const report = lintBacklog(backlog);
        const points = backlog.stories.reduce((s, x) => s + (x.estimate?.points ?? 0), 0);
        for (const w of warnings) io.err(`warning: ${w}\n`);
        io.out(
          [
            `Parsed ${backlog.requirements.length} requirements from ${prdPath} (${backlog.outOfScope.length} out-of-scope items)`,
            `Generated ${backlog.epics.length} epics, ${backlog.stories.length} stories (${points} pts), ${backlog.dependencies.length} dependencies, ${backlog.risks.length} risks with ${generator.name}`,
            `Lint score ${report.score}/100 (${report.grade}), traceability ${report.coverage.percent}%, ${report.counts.error} errors, ${report.counts.warning} warnings`,
            `Wrote ${jsonPath} and ${mdPath}`,
          ].join("\n") + "\n",
        );
      },
    );

  program
    .command("lint")
    .description("Check backlog quality and print a scored report")
    .argument("<backlog>", "path to backlog.json")
    .addOption(
      new Option("-f, --format <format>", "report format")
        .choices(["text", "json"])
        .default("text"),
    )
    .option("--show-info", "include info-level findings in text output", false)
    .option("--min-score <n>", "exit with code 1 when the score is below this", integer)
    .action(
      async (
        file: string,
        opts: { format: "text" | "json"; showInfo: boolean; minScore?: number },
      ) => {
        const report = lintBacklog(await readBacklog(file));
        io.out(
          opts.format === "json"
            ? `${JSON.stringify(report, null, 2)}\n`
            : `${formatReport(report, { showInfo: opts.showInfo })}\n`,
        );
        if (opts.minScore !== undefined && report.score < opts.minScore) {
          throw new CommanderError(
            1,
            "prd2backlog.minScore",
            `Score ${report.score} is below ${opts.minScore}`,
          );
        }
      },
    );

  program
    .command("export")
    .description("Export a backlog to a tracker import format")
    .argument("<backlog>", "path to backlog.json")
    .addOption(
      new Option("-f, --format <format>", "target format")
        .choices(EXPORT_FORMATS)
        .makeOptionMandatory(),
    )
    .option("-o, --out <file>", "write to a file instead of stdout")
    .action(async (file: string, opts: { format: ExportFormat; out?: string }) => {
      const content = exportBacklog(await readBacklog(file), opts.format);
      if (opts.out) {
        await writeFile(opts.out, content);
        io.err(`Wrote ${opts.out}\n`);
      } else {
        io.out(content);
      }
    });

  program
    .command("serve")
    .description("Start the HTTP API (POST /generate, /lint, /export)")
    .option("--port <n>", "port", integer, 8787)
    .option("--host <host>", "interface to bind; use 0.0.0.0 to listen on all", "127.0.0.1")
    .action(async (opts: { port: number; host: string }) => {
      const [{ serve }, { createApp }] = await Promise.all([
        import("@hono/node-server"),
        import("./server.js"),
      ]);
      serve({ fetch: createApp({ env: io.env }).fetch, port: opts.port, hostname: opts.host });
      io.err(`prd2backlog API listening on http://${opts.host}:${opts.port}\n`);
    });

  return program;
}

/** Runs the CLI and resolves to a process exit code instead of exiting. */
export async function run(argv: string[], io: CliIo = defaultIo): Promise<number> {
  try {
    await buildProgram(io).parseAsync(argv, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "prd2backlog.minScore") io.err(`${error.message}\n`);
      return error.exitCode;
    }
    io.err(`error: ${(error as Error).message}\n`);
    return 2;
  }
}
