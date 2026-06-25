import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAdminClientMock, getAuthenticatedRequestClientMock, deleteUserMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  getAuthenticatedRequestClientMock: vi.fn(),
  deleteUserMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/supabase/request", () => ({
  getAuthenticatedRequestClient: getAuthenticatedRequestClientMock,
}));

function request(confirmation?: string) {
  return new NextRequest("http://localhost/api/mobile/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation }),
  });
}

describe("DELETE /api/mobile/account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const tokenQuery = {
      select: vi.fn(() => tokenQuery),
      eq: vi.fn(() => tokenQuery),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    createAdminClientMock.mockReturnValue({
      auth: { admin: { deleteUser: deleteUserMock } },
      from: vi.fn(() => tokenQuery),
    });
    deleteUserMock.mockResolvedValue({ error: null });
  });

  it("returns 401 when unauthenticated", async () => {
    getAuthenticatedRequestClientMock.mockResolvedValue(null);
    const { DELETE } = await import("./route");
    const response = await DELETE(request("DELETE"));
    expect(response.status).toBe(401);
  });

  it("requires explicit deletion confirmation", async () => {
    getAuthenticatedRequestClientMock.mockResolvedValue({ user: { id: "user-1" } });
    const { DELETE } = await import("./route");
    const response = await DELETE(request());
    expect(response.status).toBe(400);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("permanently deletes the authenticated user", async () => {
    getAuthenticatedRequestClientMock.mockResolvedValue({ user: { id: "user-1" } });
    const { DELETE } = await import("./route");
    const response = await DELETE(request("DELETE"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(deleteUserMock).toHaveBeenCalledWith("user-1", false);
  });

  it("does not report success when Supabase rejects deletion", async () => {
    getAuthenticatedRequestClientMock.mockResolvedValue({ user: { id: "user-1" } });
    deleteUserMock.mockResolvedValue({ error: { message: "Deletion failed" } });
    const { DELETE } = await import("./route");
    const response = await DELETE(request("DELETE"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Deletion failed" });
  });
});
