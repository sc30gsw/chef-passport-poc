import { Schema } from "effect";
import { useEffect, useState } from "react";

import { PipelineEvent } from "~/features/passport/types/pipeline-event";
import { derivePipelineRunState } from "~/features/passport/utils/pipeline-run-state";

/** Decoded, not cast: the wire is a boundary like any other. See .claude/rules/typescript/effect-schema.md. */
const decodeEvent = Schema.decodeUnknownSync(PipelineEvent);

/**
 * How a run ended, from the transport's point of view. `"decode-failed"` is deliberately not folded
 * into `"transport-failed"`: a chunk the client cannot decode means the server's
 * `encodePipelineEvent` and this module's `PipelineEvent` have drifted apart, which is a contract
 * bug, and telling the user the connection failed would point at the wrong thing entirely.
 */
type StreamOutcome = "completed" | "decode-failed" | "transport-failed";

type StreamRun<Request> = {
  readonly events: readonly PipelineEvent[];
  readonly failedAs: Exclude<StreamOutcome, "completed"> | undefined;
  readonly request: Request | undefined;
};

function idleRun<Request>(request: Request | undefined): StreamRun<Request> {
  return { events: [], failedAs: undefined, request };
}

/** The two variants that mean "this run is over and the server said so". */
function isTerminal(event: PipelineEvent): boolean {
  return event._tag === "Completed" || event._tag === "Failed";
}

/**
 * Kept outside the hook deliberately: `for await` is not lowerable by the React Compiler, and a
 * component that the compiler bails out of loses its automatic memoisation. Nothing here touches
 * React, so moving it up is free.
 *
 * Success is a terminal event, **not** the loop running out. Both server paths always finish with
 * `Completed` or `Failed`, so an exhausted body that carried neither means the response was cut off
 * mid-flight — a dropped connection or a serverless invocation limit. Treating that as success is
 * what left the timeline spinning forever with nothing to report (#21).
 */
async function consumeStream(
  open: () => Promise<AsyncIterable<unknown>>,
  onEvent: (event: PipelineEvent) => void,
  isCancelled: () => boolean,
): Promise<StreamOutcome> {
  let sawTerminal = false;

  try {
    // 1マイクロタスクの遅延がStrictMode耐性の要: devの mount→cleanup→remount は同期で走るので、
    // ここが再開する頃には1回目のマウントは取り消し済みで、リクエストを開かずに消える。遅延なしだと
    // 1本目がサーバーの single-flight スロットを先取りし、ユーザーが見ている2本目が in-flight 拒否
    // でキャッシュ再生に降格する（自由入力は拒否で終わる）。
    await Promise.resolve();
    if (isCancelled()) return "completed";

    const stream = await open();

    for await (const chunk of stream) {
      if (isCancelled()) return "completed";

      let event: PipelineEvent;
      try {
        event = decodeEvent(chunk);
      } catch {
        return "decode-failed";
      }

      sawTerminal = sawTerminal || isTerminal(event);
      onEvent(event);
    }
  } catch {
    return "transport-failed";
  }

  return sawTerminal ? "completed" : "transport-failed";
}

type PipelineStreamOptions<Request> = {
  /**
   * What to say when a chunk does not decode. Separate from `transportFailureJa` because the two
   * failures have different owners: this one is a schema drift between the two sides of the wire,
   * and only the caller knows what the user can do about it on that screen.
   */
  readonly decodeFailureJa: string;
  /** Module-level in every caller, so its identity is stable and the effect keys on the request. */
  readonly open: (request: Request) => Promise<AsyncIterable<unknown>>;
  /** `undefined` means there is nothing to run yet — free input before the form is submitted. */
  readonly request: Request | undefined;
  /**
   * What to say when the request never lands. Per-caller because the honest sentence differs: a
   * preset falls back to its committed cache, and free input has no cache to fall back to.
   */
  readonly transportFailureJa: string;
};

/**
 * Live generation, consumed one event at a time. The server function yields events as it produces
 * them, so the timeline advances during the run rather than after it.
 *
 * Generic over the request because preset generation and free input are the same problem once the
 * request is opaque: both return `Stream<PipelineEvent>` and both fold into `PipelineRunState`, which
 * is also what `usePipelineReplay` produces. That is the whole one-interface claim — the timeline
 * cannot tell the three apart, so it has nothing to branch on.
 *
 * Model failure and key absence are *not* handled here — the server already answers those, as a
 * cache replay carrying `degraded` for presets and as a typed `Failed` refusal for free input.
 * Duplicating that judgement client-side is how the two sides would start disagreeing about what
 * happened. The failures this hook owns are the two the server by definition cannot report: the
 * response never arriving or dying mid-flight, and a chunk that arrives but does not decode.
 */
export function usePipelineStream<Request>({
  decodeFailureJa,
  open,
  request,
  transportFailureJa,
}: PipelineStreamOptions<Request>) {
  const [run, setRun] = useState<StreamRun<Request>>(() => idleRun(request));

  // Adjusted during render rather than in an effect, so there is no frame showing the previous
  // run's timeline. https://react.dev/learn/you-might-not-need-an-effect
  if (run.request !== request) setRun(idleRun(request));

  useEffect(() => {
    let cancelled = false;

    if (request !== undefined) {
      void consumeStream(
        () => open(request),
        (event) =>
          setRun((previous) =>
            previous.request === request
              ? { ...previous, events: [...previous.events, event] }
              : previous,
          ),
        () => cancelled,
      ).then((outcome) => {
        if (outcome !== "completed" && !cancelled) {
          setRun((previous) =>
            previous.request === request ? { ...previous, failedAs: outcome } : previous,
          );
        }
      });
    }

    // Declared before the branch and returned unconditionally, so no code path can leave a run
    // uncancelled.
    return () => {
      cancelled = true;
    };
  }, [open, request]);

  const state = derivePipelineRunState(run.events);

  if (run.failedAs === undefined) return state;

  const failureJa = run.failedAs === "decode-failed" ? decodeFailureJa : transportFailureJa;

  return { ...state, failureJa };
}
