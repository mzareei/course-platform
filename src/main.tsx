import { render } from "preact";
import { App } from "./app";
import { boot } from "./state/session";
import { captureTestAccessFromUrl } from "./auth/auth";
// The design tokens have always named Inter; this ships it. Self-hosted so the
// CSP's default-src 'self' covers it and classroom Wi-Fi never blocks a CDN.
import "@fontsource-variable/inter/index.css";
import "./styles/app.css";

captureTestAccessFromUrl();
void boot();

render(<App />, document.getElementById("app")!);
