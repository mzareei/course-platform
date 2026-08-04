import { callFn } from "./client";

export type PresentationPhase =
  | "lecture"
  | "pulse"
  | "quiz"
  | "podium"
  | "reflection"
  | "closed";

export interface PresentationCheckpoint {
  key: string;
  after_slide: number;
}

export interface PresentationOption {
  key: string;
  text: string;
  text_es: string | null;
}

interface PresentationPulseBase {
  round_id: string;
  prompt: string;
  prompt_es: string | null;
  options: PresentationOption[];
  submitted: number;
  eligible: number;
}

export interface ProjectorOpenPulse extends PresentationPulseBase {
  state: "open";
}

export interface ProjectorRevealedPulse extends PresentationPulseBase {
  state: "revealed";
  correct_option: PresentationOption | null;
  explanation: string | null;
  explanation_es: string | null;
}

export type ProjectorPulse = ProjectorOpenPulse | ProjectorRevealedPulse;

export interface ControllerPulse extends PresentationPulseBase {
  state: "open" | "revealed";
  correct_key: string | null;
  explanation: string | null;
  explanation_es: string | null;
}

interface PresentationStateBase {
  session_id: string;
  revision: number;
  requested_slide: number;
  phase: PresentationPhase;
  checkpoint: PresentationCheckpoint | null;
}

export interface ProjectorPresentationState extends PresentationStateBase {
  pulse: ProjectorPulse | null;
}

export interface ControllerPresentationState extends PresentationStateBase {
  acknowledged_slide: number;
  projector_seen_at: string | null;
  controller_seen_at: string | null;
  pulse: ControllerPulse | null;
}

export function controllerCurrent(classSessionId: string) {
  return callFn<ControllerPresentationState>("course-presentation", {
    action: "controller_current",
    class_session_id: classSessionId
  });
}

export function projectorCurrent(classSessionId: string) {
  return callFn<ProjectorPresentationState>("course-presentation", {
    action: "projector_current",
    class_session_id: classSessionId
  });
}

export function requestSlide(
  classSessionId: string,
  revision: number,
  requestedSlide: number
): Promise<ControllerPresentationState>;
export function requestSlide(
  classSessionId: string,
  revision: number,
  requestedSlide: number,
  surface: "projector"
): Promise<ProjectorPresentationState>;
export function requestSlide(
  classSessionId: string,
  revision: number,
  requestedSlide: number,
  surface: "controller" | "projector" = "controller"
) {
  return callFn<ControllerPresentationState | ProjectorPresentationState>("course-presentation", {
    action: "request_slide",
    class_session_id: classSessionId,
    revision,
    requested_slide: requestedSlide,
    surface
  });
}

export function acknowledgeSlide(
  classSessionId: string,
  revision: number,
  acknowledgedSlide: number
) {
  return callFn<ProjectorPresentationState>("course-presentation", {
    action: "acknowledge_slide",
    class_session_id: classSessionId,
    revision,
    acknowledged_slide: acknowledgedSlide
  });
}

export function checkpointReached(
  classSessionId: string,
  revision: number,
  checkpointKey: string,
  checkpointAfterSlide: number
) {
  return callFn<ProjectorPresentationState>("course-presentation", {
    action: "checkpoint_reached",
    class_session_id: classSessionId,
    revision,
    checkpoint_key: checkpointKey,
    checkpoint_after_slide: checkpointAfterSlide
  });
}

export function setPresentationPhase(
  classSessionId: string,
  revision: number,
  phase: PresentationPhase
) {
  return callFn<ControllerPresentationState>("course-presentation", {
    action: "set_phase",
    class_session_id: classSessionId,
    revision,
    phase
  });
}

export function presentationHeartbeat(
  classSessionId: string,
  revision: number,
  surface: "controller"
): Promise<ControllerPresentationState>;
export function presentationHeartbeat(
  classSessionId: string,
  revision: number,
  surface: "projector"
): Promise<ProjectorPresentationState>;
export function presentationHeartbeat(
  classSessionId: string,
  revision: number,
  surface: "controller" | "projector"
) {
  return callFn<ControllerPresentationState | ProjectorPresentationState>("course-presentation", {
    action: "heartbeat",
    class_session_id: classSessionId,
    revision,
    surface
  });
}
