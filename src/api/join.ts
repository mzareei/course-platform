import { callFn } from "./client";

export type JoinClassResult = {
  session_id: string;
  title: string;
  section_code: string;
  state: string;
  joined: true;
};

export function resolveJoinCode(joinCode: string): Promise<JoinClassResult> {
  return callFn<JoinClassResult>("course-session-join", {
    action: "join",
    join_code: joinCode
  });
}
