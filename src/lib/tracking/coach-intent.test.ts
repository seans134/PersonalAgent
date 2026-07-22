import { describe, expect, it } from "vitest";
import { classifyCoachIntent, heuristicCoachIntent } from "./coach-intent";

describe("heuristicCoachIntent", () => {
  it("routes past-tense meal statements to log", () => {
    expect(heuristicCoachIntent("meal", "I had a chicken rice bowl for lunch")).toBe("log");
    expect(heuristicCoachIntent("meal", "ate two eggs and toast this morning")).toBe("log");
  });

  it("routes reusable-meal phrasing to saved", () => {
    expect(heuristicCoachIntent("meal", "Save my usual overnight oats")).toBe("saved");
    expect(heuristicCoachIntent("meal", "add this as a reusable meal")).toBe("saved");
  });

  it("routes questions to suggest", () => {
    expect(heuristicCoachIntent("meal", "What should I eat before the gym?")).toBe("suggest");
    expect(heuristicCoachIntent("workout", "any ideas for today")).toBe("suggest");
  });

  it("routes past-tense workout statements to log", () => {
    expect(heuristicCoachIntent("workout", "Ran 5k this morning in 27 minutes")).toBe("log");
  });

  it("never returns saved for the workout domain", () => {
    expect(heuristicCoachIntent("workout", "save my usual leg day")).not.toBe("saved");
  });
});

describe("classifyCoachIntent", () => {
  it("uses the model intent when it is valid for the domain", async () => {
    const result = await classifyCoachIntent({
      domain: "meal",
      text: "grabbed a burrito after class",
      generateOutput: async () => ({ intent: "log", reason: "Past tense report." }),
    });

    expect(result.intent).toBe("log");
    expect(result.source).toBe("model");
    expect(result.reason).toBe("Past tense report.");
  });

  it("falls back to the heuristic when the model returns an unknown intent", async () => {
    const result = await classifyCoachIntent({
      domain: "meal",
      text: "What should I have for dinner?",
      generateOutput: async () => ({ intent: "banana" }),
    });

    expect(result.intent).toBe("suggest");
    expect(result.source).toBe("heuristic");
  });

  it("falls back to the heuristic when the model returns an intent outside the domain", async () => {
    const result = await classifyCoachIntent({
      domain: "workout",
      text: "Ran 5k this morning",
      generateOutput: async () => ({ intent: "saved", reason: "n/a" }),
    });

    expect(result.intent).toBe("log");
    expect(result.source).toBe("heuristic");
  });

  it("falls back to the heuristic when the classifier throws", async () => {
    const result = await classifyCoachIntent({
      domain: "workout",
      text: "what should I train today?",
      generateOutput: async () => {
        throw new Error("Gemini unavailable");
      },
    });

    expect(result.intent).toBe("suggest");
    expect(result.source).toBe("heuristic");
  });

  it("rejects empty messages", async () => {
    await expect(
      classifyCoachIntent({
        domain: "meal",
        text: "   ",
        generateOutput: async () => ({ intent: "log" }),
      }),
    ).rejects.toThrow(/add a message/i);
  });

  it("truncates an overlong reason", async () => {
    const result = await classifyCoachIntent({
      domain: "meal",
      text: "had a salad",
      generateOutput: async () => ({ intent: "log", reason: "x".repeat(400) }),
    });

    expect(result.reason.length).toBe(120);
  });
});
