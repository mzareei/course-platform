import type { RefObject } from "preact";
import { useCallback, useEffect, useState } from "preact/hooks";
import {
  isDeckMessage,
  type ParentToDeckMessage
} from "./protocol";
import { t } from "../../i18n";

type ActiveCheckpoint = {
  key: string;
  afterSlide: number;
};

type CheckpointAction = {
  key: string;
  sequence: number;
};

export function useDeckBridge(iframeRef: RefObject<HTMLIFrameElement>) {
  const [deckReady, setDeckReady] = useState(false);
  const [slide, setSlide] = useState<number | null>(null);
  const [teachingSlide, setTeachingSlide] = useState<number | null>(null);
  const [checkpoint, setCheckpoint] = useState<ActiveCheckpoint | null>(null);
  const [checkpointAction, setCheckpointAction] = useState<CheckpointAction | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      const deckWindow = iframeRef.current?.contentWindow;
      if (!deckWindow || event.source !== deckWindow) return;
      if (!isDeckMessage(event.data, event.origin)) {
        setBridgeError(t("deck.bridgeInvalid"));
        return;
      }

      const message = event.data;
      setBridgeError(null);
      switch (message.type) {
        case "deck.ready":
          setDeckReady(true);
          setSlide(message.slide);
          setCheckpointAction(null);
          break;
        case "deck.slide_changed":
          setSlide(message.slide);
          setTeachingSlide(message.teaching_slide);
          if (message.teaching_slide !== null) setCheckpoint(null);
          break;
        case "deck.checkpoint_entered":
          setCheckpoint({
            key: message.checkpoint_key,
            afterSlide: message.after_slide
          });
          break;
        case "deck.checkpoint_skipped":
          setCheckpoint((current) =>
            current?.key === message.checkpoint_key ? null : current
          );
          break;
        case "deck.checkpoint_action":
          setCheckpointAction((current) => ({
            key: message.checkpoint_key,
            sequence: (current?.sequence || 0) + 1
          }));
          break;
      }
    };

    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [iframeRef]);

  const send = useCallback((message: ParentToDeckMessage) => {
    const deckWindow = iframeRef.current?.contentWindow;
    if (!deckWindow) {
      setBridgeError(t("deck.bridgeUnavailable"));
      return;
    }
    deckWindow.postMessage(message, window.location.origin);
    setBridgeError(null);
  }, [iframeRef]);

  return {
    deckReady,
    slide,
    teachingSlide,
    checkpoint,
    checkpointAction,
    send,
    bridgeError
  };
}
