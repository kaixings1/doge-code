// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const answerMock = vi.fn();
const cancelMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const toastInfoMock = vi.fn();

vi.mock("@/server/actions/questions", () => ({
  answerQuestionAction: (...a: unknown[]) => answerMock(...a),
  cancelQuestionAction: (...a: unknown[]) => cancelMock(...a),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccessMock(...a),
    error: (...a: unknown[]) => toastErrorMock(...a),
    info: (...a: unknown[]) => toastInfoMock(...a),
  },
}));

import { QuestionCard } from "./question-card";
import type { Question } from "@/types";

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q-1",
    project_slug: "demo",
    agent_id: "demo-cmo",
    task_id: "t-1",
    prompt: "Which channel should we test first?",
    options_json: JSON.stringify(["Google Ads", "Meta", "TikTok"]),
    status: "pending",
    answer_option_index: null,
    answer_text: null,
    resolved_by_kind: null,
    created_at: new Date(Date.now() - 60_000).toISOString(),
    resolved_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  answerMock.mockReset();
  cancelMock.mockReset();
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
  toastInfoMock.mockReset();
});

describe("QuestionCard — pending state", () => {
  it("renders prompt, agent, status badge, and each option as a radio button", () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        options={["Google Ads", "Meta", "TikTok"]}
      />,
    );
    expect(screen.getByText("Which channel should we test first?")).toBeInTheDocument();
    expect(screen.getByText("Question")).toBeInTheDocument();
    expect(screen.getByText("Needs answer")).toBeInTheDocument();
    expect(screen.getByText("demo-cmo")).toBeInTheDocument();

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveTextContent("Google Ads");
    expect(radios[2]).toHaveTextContent("TikTok");
  });

  it("Send is disabled until an option is picked or text is typed", () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        options={["Google Ads", "Meta"]}
      />,
    );
    const send = screen.getByRole("button", { name: /send answer/i });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Meta/ }));
    expect(send).not.toBeDisabled();
  });

  it("clicking a selected option deselects it", () => {
    render(
      <QuestionCard
        question={makeQuestion()}
        options={["Google Ads", "Meta"]}
      />,
    );
    const metaRadio = screen.getByRole("radio", { name: /Meta/ });
    fireEvent.click(metaRadio);
    expect(metaRadio).toHaveAttribute("aria-checked", "true");
    fireEvent.click(metaRadio);
    expect(metaRadio).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: /send answer/i })).toBeDisabled();
  });

  it("submitting calls answerQuestionAction with the chosen index + text", async () => {
    answerMock.mockResolvedValue({ ok: true });
    render(
      <QuestionCard
        question={makeQuestion()}
        options={["Google Ads", "Meta", "TikTok"]}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Meta/ }));
    fireEvent.change(screen.getByPlaceholderText(/add nuance|Type your answer/), {
      target: { value: "Start lean — $200 daily" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send answer/i }));
    await waitFor(() => {
      expect(answerMock).toHaveBeenCalledWith("q-1", {
        option_index: 1,
        text: "Start lean — $200 daily",
      });
      expect(toastSuccessMock).toHaveBeenCalled();
    });
  });

  it("surfaces server errors via toast and does not show success", async () => {
    answerMock.mockResolvedValue({ ok: false, error: "boom" });
    render(
      <QuestionCard
        question={makeQuestion()}
        options={["Google Ads"]}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Google Ads/ }));
    fireEvent.click(screen.getByRole("button", { name: /send answer/i }));
    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("boom");
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("Dismiss calls cancelQuestionAction and shows the info toast", async () => {
    cancelMock.mockResolvedValue({ ok: true });
    render(
      <QuestionCard
        question={makeQuestion()}
        options={["Google Ads"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/ }));
    await waitFor(() => {
      expect(cancelMock).toHaveBeenCalledWith("q-1");
      expect(toastInfoMock).toHaveBeenCalled();
    });
  });

  it("renders a free-text only mode when no options are supplied", () => {
    render(
      <QuestionCard
        question={makeQuestion({ options_json: "[]" })}
        options={[]}
      />,
    );
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByPlaceholderText(/Type your answer/)).toBeInTheDocument();
  });
});

describe("QuestionCard — resolved state", () => {
  it("renders the chosen option + free-text on an answered row", () => {
    render(
      <QuestionCard
        question={makeQuestion({
          status: "answered",
          answer_option_index: 1,
          answer_text: "with $200/day cap",
          resolved_by_kind: "user",
          resolved_at: new Date().toISOString(),
        })}
        options={["Google Ads", "Meta"]}
      />,
    );
    expect(screen.getByText("Answered")).toBeInTheDocument();
    expect(screen.getByText("Meta")).toBeInTheDocument();
    expect(screen.getByText("with $200/day cap")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send answer/i })).not.toBeInTheDocument();
  });

  it("renders 'Dismissed without answer.' on a cancelled row", () => {
    render(
      <QuestionCard
        question={makeQuestion({
          status: "cancelled",
          resolved_by_kind: "user",
          resolved_at: new Date().toISOString(),
        })}
        options={["Google Ads"]}
      />,
    );
    expect(screen.getByText("Dismissed")).toBeInTheDocument();
    expect(screen.getByText(/Dismissed without answer/)).toBeInTheDocument();
  });
});
