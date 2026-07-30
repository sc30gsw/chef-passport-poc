import { Schema } from "effect";
import { useEffect, useState } from "react";

import { PipelineEvent } from "~/features/passport/types/pipeline-event";
import { derivePipelineRunState } from "~/features/passport/utils/pipeline-run-state";

/** Decoded, not cast: the wire is a boundary like any other. See .claude/rules/typescript/effect-schema.md. */
const decodeEvent = Schema.decodeUnknownSync(PipelineEvent);

type StreamRun<Request> = {
  readonly events: readonly PipelineEvent[];
  readonly request: Request | undefined;
  readonly transportFailed: boolean;
};

function idleRun<Request>(request: Request | undefined): StreamRun<Request> {
  return { events: [], request, transportFailed: false };
}

/**
 * Kept outside the hook deliberately: `for await` is not lowerable by the React Compiler, and a
 * component that the compiler bails out of loses its automatic memoisation. Nothing here touches
 * React, so moving it up is free.
 */
async function consumeStream(
  open: () => Promise<AsyncIterable<unknown>>,
  onEvent: (event: PipelineEvent) => void,
  isCancelled: () => boolean,
): Promise<boolean> {
  try {
    const stream = await open();

    for await (const chunk of stream) {
      if (isCancelled()) return true;
      onEvent(decodeEvent(chunk));
    }

    return true;
  } catch {
    return false;
  }
}

type PipelineStreamOptions<Request> = {
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
 * happened. The only failure this hook owns is the transport itself dying, which the server by
 * definition cannot report.
 */
export function usePipelineStream<Request>({
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
      ).then((ok) => {
        if (!ok && !cancelled) {
          setRun((previous) =>
            previous.request === request ? { ...previous, transportFailed: true } : previous,
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

  return run.transportFailed ? { ...state, failureJa: transportFailureJa } : state;
}
