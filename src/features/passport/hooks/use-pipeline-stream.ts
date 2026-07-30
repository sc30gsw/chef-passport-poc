import { Schema } from "effect";
import { useEffect, useState } from "react";

import { generatePassportServer } from "~/features/passport/api/generate-passport-server";
import { PipelineEvent } from "~/features/passport/types/pipeline-event";
import { derivePipelineRunState } from "~/features/passport/utils/pipeline-run-state";

/** Decoded, not cast: the wire is a boundary like any other. See .claude/rules/typescript/effect-schema.md. */
const decodeEvent = Schema.decodeUnknownSync(PipelineEvent);

const TRANSPORT_FAILURE_JA = "ライブ生成に接続できませんでした。事前生成キャッシュを表示します。";

type StreamRun = {
  readonly events: readonly PipelineEvent[];
  readonly personaId: string;
  readonly transportFailed: boolean;
};

function emptyRun(personaId: string): StreamRun {
  return { events: [], personaId, transportFailed: false };
}

/**
 * Kept outside the hook deliberately: `for await` is not lowerable by the React Compiler, and a
 * component that the compiler bails out of loses its automatic memoisation. Nothing here touches
 * React, so moving it up is free.
 */
async function consumeStream(
  personaId: string,
  onEvent: (event: PipelineEvent) => void,
  isCancelled: () => boolean,
): Promise<boolean> {
  try {
    const stream = await generatePassportServer({ data: { live: true, personaId } });

    for await (const chunk of stream) {
      if (isCancelled()) return true;
      onEvent(decodeEvent(chunk));
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Live generation, consumed one event at a time. The server function yields events as it produces
 * them, so the timeline advances during the run rather than after it.
 *
 * Model failure and key absence are *not* handled here — the server already answers those with a
 * cache replay carrying `degraded`, and duplicating that judgement client-side is how the two sides
 * would start disagreeing about what happened. The only failure this hook owns is the transport
 * itself dying, which the server by definition cannot report.
 */
export function usePipelineStream({ personaId }: Record<"personaId", string>) {
  const [run, setRun] = useState<StreamRun>(() => emptyRun(personaId));

  // Adjusted during render rather than in an effect, so there is no frame showing the previous
  // chef's timeline. https://react.dev/learn/you-might-not-need-an-effect
  if (run.personaId !== personaId) setRun(emptyRun(personaId));

  useEffect(() => {
    let cancelled = false;

    void consumeStream(
      personaId,
      (event) =>
        setRun((previous) =>
          previous.personaId === personaId
            ? { ...previous, events: [...previous.events, event] }
            : previous,
        ),
      () => cancelled,
    ).then((ok) => {
      if (!ok && !cancelled) {
        setRun((previous) =>
          previous.personaId === personaId ? { ...previous, transportFailed: true } : previous,
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [personaId]);

  const state = derivePipelineRunState(run.events);

  return run.transportFailed ? { ...state, failureJa: TRANSPORT_FAILURE_JA } : state;
}
