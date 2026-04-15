import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(import.meta.dir, "..", "styles", "command.css"), "utf8");

describe("command layout css", () => {
  it("uses a wider flatter unified shell without nested boxes", () => {
    expect(css).toContain('.zenbar[data-position="center"] {');
    expect(css).toContain('--zenbar-shell-offset: calc(50vh - 132px);');
    expect(css).toContain('--zenbar-shell-offset: calc(50vh - 104px);');
    expect(css).toContain('backdrop-filter: blur(14px) saturate(112%);');
    expect(css).toContain('backdrop-filter: blur(20px) saturate(118%);');
    expect(css).toContain('width: min(100%, 760px);');
    expect(css).toContain('border-radius: 16px;');
    expect(css).toContain('display: none;');
    expect(css).toContain('border: 1px solid rgba(255, 255, 255, 0.14);');
    expect(css).toContain('linear-gradient(180deg, rgba(22, 23, 27, 0.62), rgba(15, 16, 20, 0.58))');
    expect(css).toContain('border-bottom: 1px solid rgba(255, 255, 255, 0.1);');
    expect(css).toContain('background: rgba(255, 255, 255, 0.075);');
    expect(css).toContain('background: rgba(255, 255, 255, 0.018);');
    expect(css).toContain('scrollbar-width: none;');
    expect(css).toContain('-ms-overflow-style: none;');

    const panelBlock = css.match(/\.zenbar__panel \{[^}]*\}/s)?.[0] ?? "";
    const resultsBlock = css.match(/\.zenbar__results \{[^}]*\}/s)?.[0] ?? "";
    const emptyBlock = css.match(/\.zenbar__empty \{[^}]*\}/s)?.[0] ?? "";
    const inputShellBlock = css.match(/\.zenbar__input-shell \{[^}]*\}/s)?.[0] ?? "";
    const activeRowBlock = css.match(/\.zenbar-result-row--active \{[^}]*\}/s)?.[0] ?? "";
    const hoverRowBlock = css.match(/\.zenbar-result-row:hover \{[^}]*\}/s)?.[0] ?? "";
    const scrollbarBlock = css.match(/\.zenbar__results::\-webkit-scrollbar \{[^}]*\}/s)?.[0] ?? "";

    expect(panelBlock).toContain('width: min(100%, 760px);');
    expect(panelBlock).toContain('border-radius: 16px;');
    expect(resultsBlock).toContain('border: 0;');
    expect(resultsBlock).toContain('background: transparent;');
    expect(emptyBlock).toContain('border: 0;');
    expect(emptyBlock).toContain('background: transparent;');
    expect(inputShellBlock).toContain('border: 0;');
    expect(inputShellBlock).toContain('border-bottom: 1px solid rgba(255, 255, 255, 0.1);');
    expect(activeRowBlock).toContain('background: rgba(255, 255, 255, 0.075);');
    expect(hoverRowBlock).toContain('background: rgba(255, 255, 255, 0.018);');
    expect(scrollbarBlock).toContain('display: none;');
  });
});
