import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppUsageCards, type AppUsageSummary } from "./AppUsageCards";

const summary: AppUsageSummary = {
  foregroundSeconds: 65 * 60,
  backgroundSeconds: 25 * 60,
  inferredSeconds: 0,
  sessionCount: 3,
  deviceCount: 1,
  daysWithData: 1,
};

describe("AppUsageCards", () => {
  it("shows both cards at 00:00 when nothing has been recorded yet", () => {
    render(<AppUsageCards summary={null} />);
    expect(screen.getByText("Total foreground time")).toBeInTheDocument();
    expect(screen.getByText("Total background time")).toBeInTheDocument();
    expect(screen.getAllByText("00:00")).toHaveLength(2);
    expect(screen.getByText("no usage recorded yet")).toBeInTheDocument();
  });

  it("still shows both cards when the summary could not be loaded", () => {
    render(<AppUsageCards summary={null} error />);
    expect(screen.getByText("Total foreground time")).toBeInTheDocument();
    expect(screen.getByText("Total background time")).toBeInTheDocument();
    expect(screen.getByText("usage data unavailable")).toBeInTheDocument();
  });

  it("renders the worked example as 01:05 foreground and 00:25 background", () => {
    render(<AppUsageCards summary={summary} />);
    expect(screen.getByText("01:05")).toBeInTheDocument();
    expect(screen.getByText("00:25")).toBeInTheDocument();
    expect(screen.getByText("3 sessions")).toBeInTheDocument();
  });

  it("singularises a lone session", () => {
    render(<AppUsageCards summary={{ ...summary, sessionCount: 1 }} />);
    expect(screen.getByText("1 session")).toBeInTheDocument();
  });

  it("warns when the totals span more than one device", () => {
    render(<AppUsageCards summary={{ ...summary, deviceCount: 2 }} />);
    expect(screen.getByText("across 2 devices")).toBeInTheDocument();
  });

  it("flags time that was reconciled rather than observed", () => {
    render(<AppUsageCards summary={{ ...summary, inferredSeconds: 15 * 60 }} />);
    expect(screen.getByText(/incl\. 00:15 reconciled after a kill/)).toBeInTheDocument();
  });
});
