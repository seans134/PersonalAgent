import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAtlasProfile } from "@personal-agent/core";

const { getAuthMock } = vi.hoisted(() => ({ getAuthMock: vi.fn() }));
vi.mock("@/lib/supabase/request", () => ({ getAuthenticatedRequestClient: getAuthMock }));

function fakeProfileClient(row: Record<string, unknown> | null) {
  const upserts: unknown[] = [];
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: async () => ({ data: row, error: null }),
    upsert: async (value: unknown) => {
      upserts.push(value);
      return { error: null };
    },
  };
  return { supabase: { from: () => builder }, upserts };
}

function request(method: "GET" | "PATCH", body?: unknown) {
  return new Request("http://localhost/api/mobile/profile", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/mobile/profile GPA scale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the saved scale, and the default when the stored value is unknown", async () => {
    const { GET } = await import("./route");
    getAuthMock.mockResolvedValue({ ...fakeProfileClient({ gpa_scale: "us_4_3" }), user: { id: "u1", email: "s@example.com" } });
    expect((await (await GET(request("GET"))).json()).profile.gpa_scale).toBe("us_4_3");
    getAuthMock.mockResolvedValue({ ...fakeProfileClient({ gpa_scale: "weird" }), user: { id: "u1", email: "s@example.com" } });
    expect((await (await GET(request("GET"))).json()).profile.gpa_scale).toBe("us_4_0");
    getAuthMock.mockResolvedValue({ ...fakeProfileClient(null), user: { id: "u1", email: "s@example.com" } });
    expect((await (await GET(request("GET"))).json()).profile.gpa_scale).toBe("us_4_0");
  });

  it("saves a chosen scale", async () => {
    const { PATCH } = await import("./route");
    const client = fakeProfileClient(null);
    getAuthMock.mockResolvedValue({ ...client, user: { id: "u1" } });
    const response = await PATCH(request("PATCH", { profile: { ...defaultAtlasProfile, gpa_scale: "us_4_3" } }));
    expect(response.status).toBe(200);
    expect(client.upserts[0]).toMatchObject({ user_id: "u1", gpa_scale: "us_4_3" });
  });

  it("leaves the scale alone when an older client omits it", async () => {
    const { PATCH } = await import("./route");
    const client = fakeProfileClient(null);
    getAuthMock.mockResolvedValue({ ...client, user: { id: "u1" } });
    const legacy: Record<string, unknown> = { ...defaultAtlasProfile };
    delete legacy.gpa_scale;
    expect((await PATCH(request("PATCH", { profile: legacy }))).status).toBe(200);
    expect(client.upserts[0]).not.toHaveProperty("gpa_scale");
  });

  it("rejects an unknown scale", async () => {
    const { PATCH } = await import("./route");
    const client = fakeProfileClient(null);
    getAuthMock.mockResolvedValue({ ...client, user: { id: "u1" } });
    const response = await PATCH(request("PATCH", { profile: { ...defaultAtlasProfile, gpa_scale: "us_5_0" } }));
    expect(response.status).toBe(400);
    expect(client.upserts).toHaveLength(0);
  });
});
