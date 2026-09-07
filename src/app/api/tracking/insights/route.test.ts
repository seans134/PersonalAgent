import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthenticatedRequestClientMock, getHabitReportMock } = vi.hoisted(() => ({
  getAuthenticatedRequestClientMock: vi.fn(),
  getHabitReportMock: vi.fn(),
}));

vi.mock("@/lib/supabase/request", () => ({
  getAuthenticatedRequestClient: getAuthenticatedRequestClientMock,
}));

vi.mock("@/lib/tracking/habit-report-request", () => ({
  getHabitReport: getHabitReportMock,
}));

function request(body: unknown) {
  return new NextRequest("http://localhost/api/tracking/insights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tracking/insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    getAuthenticatedRequestClientMock.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(request({ period: "daily" }));
    expect(response.status).toBe(401);
    expect(getHabitReportMock).not.toHaveBeenCalled();
  });

  it("returns the report and forwards parsed options", async () => {
    getAuthenticatedRequestClientMock.mockResolvedValue({ supabase: {}, user: { id: "user-1" } });
    getHabitReportMock.mockResolvedValue({
      ok: true,
      report: { period: "weekly", digest: { headline: "Nice week" } },
    });

    const { POST } = await import("./route");
    const response = await POST(
      request({ period: "weekly", referenceDate: "2026-09-07", timezone: "UTC", refresh: true }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.digest.headline).toBe("Nice week");
    expect(getHabitReportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        period: "weekly",
        referenceDate: "2026-09-07",
        timezone: "UTC",
        refresh: true,
      }),
    );
  });

  it("defaults an unknown period to daily", async () => {
    getAuthenticatedRequestClientMock.mockResolvedValue({ supabase: {}, user: { id: "user-1" } });
    getHabitReportMock.mockResolvedValue({ ok: true, report: { period: "daily" } });

    const { POST } = await import("./route");
    await POST(request({ period: "monthly" }));

    expect(getHabitReportMock).toHaveBeenCalledWith(expect.objectContaining({ period: "daily" }));
  });

  it("propagates the failure status from the orchestrator", async () => {
    getAuthenticatedRequestClientMock.mockResolvedValue({ supabase: {}, user: { id: "user-1" } });
    getHabitReportMock.mockResolvedValue({ ok: false, error: "db down", status: 500 });

    const { POST } = await import("./route");
    const response = await POST(request({ period: "daily" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("db down");
  });
});
