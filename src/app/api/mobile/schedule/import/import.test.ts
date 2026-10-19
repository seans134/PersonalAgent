import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyScheduleEntry, SCHEDULE_UPLOAD_BYTES } from "@personal-agent/core";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), parse: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/request", () => ({ getAuthenticatedRequestClient: mocks.auth }));
vi.mock("@/lib/schedule/import", () => ({ parseScheduleFile: mocks.parse }));
const draft = { entries: [{ ...emptyScheduleEntry("America/Toronto"), title: "Night shift", kind: "dated", date: "2026-10-19", startTime: "22:00", endTime: "06:00", endDayOffset: 1, include: true }], warnings: [] };
const req = (body: unknown) => new Request("http://localhost/api/mobile/schedule/import/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
describe("schedule import contracts", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ data: { eventsCreated: 1, scheduleBlocksCreated: 0, skippedDuplicates: 0 }, error: null }); });
  function signIn() { mocks.auth.mockResolvedValue({ user: { id: "user-1" }, supabase: { rpc: mocks.rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: "America/Toronto" }, error: null }) }) }) }) } }); }
  it("requires authentication for parsing and applying", async () => {
    mocks.auth.mockResolvedValue(null); const parse = await import("./parse/route"); const apply = await import("./apply/route");
    expect((await parse.POST(req({}))).status).toBe(401); expect((await apply.POST(req({}))).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects oversized uploads before extraction", async () => {
    signIn(); const { POST } = await import("./parse/route");
    expect((await POST(new Request("http://localhost/parse", { method: "POST", headers: { "content-length": String(SCHEDULE_UPLOAD_BYTES + 65537) }, body: "x" }))).status).toBe(413);
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  it("requires review confirmation and valid included entries", async () => {
    signIn(); const { POST } = await import("./apply/route");
    expect((await POST(req({ draft }))).status).toBe(400);
    expect((await POST(req({ draft: { entries: [{ ...draft.entries[0], date: "2026-02-30" }] }, confirmed: true }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses the authenticated transaction, excludes unchecked rows, and returns counts", async () => {
    signIn(); const { POST } = await import("./apply/route");
    const response = await POST(req({ draft: { ...draft, entries: [...draft.entries, { ...draft.entries[0], include: false }] }, confirmed: true, allowOverlaps: true, user_id: "attacker" }));
    expect(response.status).toBe(200); expect(mocks.rpc.mock.calls[0][1].entries).toHaveLength(1);
    expect(mocks.rpc.mock.calls[0][1].entries[0]).not.toHaveProperty("user_id");
    expect(await response.json()).toMatchObject({ applied: { eventsCreated: 1 } });
  });
  it("reports transactional overlap failures without success", async () => {
    signIn(); mocks.rpc.mockResolvedValue({ data: null, error: { message: "Schedule overlap found" } });
    const { POST } = await import("./apply/route"); expect((await POST(req({ draft, confirmed: true }))).status).toBe(409);
  });
});
