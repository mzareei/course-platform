import { render } from "preact";
import { App } from "./app";
import { boot } from "./state/session";
import { captureTestAccessFromUrl } from "./auth/auth";
import "./styles/app.css";

captureTestAccessFromUrl();
void boot();

render(<App />, document.getElementById("app")!);
